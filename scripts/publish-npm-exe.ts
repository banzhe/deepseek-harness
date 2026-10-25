/**
 * Publish the `@banzhe/dsh-banzhe` tarballs produced by `scripts/build-npm-exe.ts`, platform
 * packages first and the launcher package last, so an `npm install` never resolves an entry
 * version whose optional platform packages are not on the registry yet. Publication is
 * idempotent: a version whose published tarball carries the same content is skipped, so reruns
 * after a partial failure finish the remaining packages.
 */

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const root = resolve(import.meta.dirname, '..')
const DEFAULT_DIR = join(root, 'dist-exe', 'npm')
const DEFAULT_REGISTRY = 'https://registry.npmjs.org'
const PLATFORM_SUFFIXES = ['linux-x64', 'linux-arm64', 'darwin-arm64', 'darwin-x64', 'win32-x64'] as const
/** Bounded registry wait between the platform publications and the entry publication. */
const PROPAGATION_TIMEOUT_MS = 600_000
const PROPAGATION_INTERVAL_MS = 10_000

/** One artifact recorded by the build script beside its tarball. */
interface Artifact {
  /** Registry name. */
  readonly name: string
  /** Published version. */
  readonly version: string
  /** Tarball basename inside the artifact directory. */
  readonly file: string
  /** `entry` for the launcher package, `platform` for an executable carrier. */
  readonly kind: 'entry' | 'platform'
}

/** Parsed command line. */
interface PublishCli {
  /** Directory holding tarballs and their manifests. */
  readonly dir: string
  /** npm dist-tag applied to the published version. */
  readonly distTag: string
  /** Registry to publish to. */
  readonly registry: string
  /** Print the commands instead of running them. */
  readonly dryRun: boolean
  /** Fail when a version exists with different content instead of skipping it. */
  readonly strict: boolean
  /** Publish the entry package without every platform package present. */
  readonly allowPartial: boolean
  /** Ask npm to attach a provenance attestation (requires an OIDC-capable runner). */
  readonly provenance: boolean
}

function usage(): string {
  return [
    'Usage: node scripts/publish-npm-exe.ts [flags]',
    '',
    '  --dir=<dir>        Directory holding the tarballs and npm-exe-manifest-*.json.',
    '  --dist-tag=<tag>   npm dist-tag to publish under (default: latest).',
    '  --registry=<url>   Registry to publish to (default: https://registry.npmjs.org).',
    '  --strict           Fail when the version exists with different content instead of skipping.',
    '  --allow-partial    Publish the entry package even when platform packages are missing.',
    '  --provenance       Pass --provenance to npm publish.',
    '  --dry-run          Print the commands instead of running them.',
    '  --help             Print this help.',
  ].join('\n')
}

function fail(message: string): never {
  throw new Error(`publish-npm-exe: ${message}`)
}

function quoteWindowsArgument(argument: string): string {
  return /^[A-Za-z0-9_./:=+@-]+$/u.test(argument) ? argument : `"${argument.replaceAll('"', '""')}"`
}

/** The npm executable for this host; `npm.cmd` needs the shell on Windows. */
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

/** One npm command's outcome. */
interface NpmResult {
  /** Process exit code. */
  readonly code: number
  /** Captured stdout. */
  readonly stdout: string
  /** Captured stderr. */
  readonly stderr: string
}

/**
 * Run one npm command and capture both streams.
 * @param args - npm arguments.
 * @param cwd - working directory.
 * @returns Exit code and captured output.
 */
async function runNpm(args: readonly string[], cwd: string): Promise<NpmResult> {
  const shell = process.platform === 'win32'
  const line = [npmCommand, ...args].map(quoteWindowsArgument).join(' ')
  const child = spawn(shell ? line : npmCommand, shell ? [] : [...args], {
    cwd,
    shell,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => { stdout += chunk })
  child.stderr.on('data', (chunk: string) => { stderr += chunk })
  const code = await new Promise<number>((settle, reject) => {
    child.once('error', (error) => { reject(new Error(`publish-npm-exe: failed to spawn npm: ${error.message}`)) })
    child.once('exit', (exitCode) => { settle(exitCode ?? 1) })
  })
  return { code, stdout, stderr }
}

/** ssri integrity of one tarball, in npm's `dist.integrity` form. */
async function localIntegrity(path: string): Promise<string> {
  return `sha512-${createHash('sha512').update(await readFile(path)).digest('base64')}`
}

/** Registry integrity of one published version, or `undefined` when the registry lacks it. */
async function publishedIntegrity(name: string, version: string, registry: string): Promise<string | undefined> {
  // `--prefer-online` defeats the negative cache the pre-publish existence check leaves
  // behind; without it a just-published version stays invisible to this process.
  const result = await runNpm(['view', `${name}@${version}`, 'dist.integrity', '--json', '--prefer-online', `--registry=${registry}`], root)
  if (result.code !== 0) return undefined
  const parsed = JSON.parse(result.stdout) as unknown
  return typeof parsed === 'string' ? parsed : undefined
}

async function readArtifacts(dir: string): Promise<Artifact[]> {
  const entries = await readdir(dir)
  const manifests = entries.filter(entry => entry.startsWith('npm-exe-manifest-') && entry.endsWith('.json'))
  if (manifests.length === 0) fail(`${dir} holds no npm-exe-manifest-*.json; run scripts/build-npm-exe.ts first`)
  const artifacts: Artifact[] = []
  const seen = new Set<string>()
  for (const manifest of manifests.sort()) {
    const parsed = JSON.parse(await readFile(join(dir, manifest), 'utf8')) as Artifact
    if (seen.has(parsed.name)) continue
    seen.add(parsed.name)
    if (!existsSync(join(dir, parsed.file))) fail(`${join(dir, parsed.file)} listed by ${manifest} is missing`)
    artifacts.push(parsed)
  }
  return artifacts
}

/** Platform packages first in a stable order, then the single entry package. */
function publishOrder(artifacts: readonly Artifact[]): Artifact[] {
  const order: Artifact[] = []
  for (const suffix of PLATFORM_SUFFIXES) {
    const found = artifacts.find(artifact => artifact.kind === 'platform' && artifact.name.endsWith(`-${suffix}`))
    if (found !== undefined) order.push(found)
  }
  const entries = artifacts.filter(artifact => artifact.kind === 'entry')
  if (entries.length > 1) fail(`found ${String(entries.length)} entry packages; exactly one is expected`)
  order.push(...entries)
  return order
}

/**
 * Publish one artifact unless the registry already holds that version.
 * @param artifact - artifact to publish.
 * @param cli - parsed command line.
 * @returns `published`, `skipped-identical`, or `skipped-different`.
 */
async function publishOne(artifact: Artifact, cli: PublishCli): Promise<'published' | 'skipped-identical' | 'skipped-different'> {
  const tarball = join(cli.dir, artifact.file)
  const integrity = await localIntegrity(tarball)
  const published = await publishedIntegrity(artifact.name, artifact.version, cli.registry)
  if (published !== undefined) {
    if (published === integrity) {
      console.log(`publish-npm-exe: ${artifact.name}@${artifact.version} is already published with identical content; skipping`)
      return 'skipped-identical'
    }
    if (cli.strict) {
      fail(`${artifact.name}@${artifact.version} is already published with different content; bump the version before publishing again`)
    }
    console.log(`::warning::${artifact.name}@${artifact.version} is already published with different content; skipping this release's build`)
    return 'skipped-different'
  }
  const args = ['publish', tarball, '--access', 'public', `--tag=${cli.distTag}`, `--registry=${cli.registry}`, ...(cli.provenance ? ['--provenance'] : [])]
  if (cli.dryRun) {
    console.log(`publish-npm-exe: [dry-run] ${npmCommand} ${args.join(' ')}`)
    return 'published'
  }
  console.log(`publish-npm-exe: publishing ${artifact.name}@${artifact.version}`)
  const result = await runNpm(args, cli.dir)
  if (result.code !== 0) {
    process.stderr.write(result.stderr)
    fail(`npm publish failed for ${artifact.name}@${artifact.version}`)
  }
  return 'published'
}

/**
 * Wait until every platform package of this version resolves on the registry. A version
 * that is published but not yet visible is a read replica lag, not a missing package, so a
 * timeout warns instead of failing the release: installs happen minutes later, not now.
 */
async function awaitPropagation(platforms: readonly Artifact[], cli: PublishCli): Promise<void> {
  if (cli.dryRun) return
  const deadline = Date.now() + PROPAGATION_TIMEOUT_MS
  for (const platform of platforms) {
    for (;;) {
      if (await publishedIntegrity(platform.name, platform.version, cli.registry) !== undefined) break
      if (Date.now() > deadline) {
        console.log(`::warning::${platform.name}@${platform.version} is published but not visible on ${cli.registry} yet; continuing`)
        break
      }
      await new Promise(settle => setTimeout(settle, PROPAGATION_INTERVAL_MS))
    }
  }
}

function parseCli(argv: string[]): PublishCli {
  const values = parseArgs({
    args: argv,
    options: {
      dir: { type: 'string' },
      'dist-tag': { type: 'string' },
      registry: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      strict: { type: 'boolean', default: false },
      'allow-partial': { type: 'boolean', default: false },
      provenance: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  }).values
  if (values.help) {
    console.log(usage())
    process.exit(0)
  }
  return {
    dir: values.dir === undefined ? DEFAULT_DIR : resolve(values.dir),
    distTag: values['dist-tag'] ?? 'latest',
    registry: values.registry ?? DEFAULT_REGISTRY,
    dryRun: values['dry-run'],
    strict: values.strict,
    allowPartial: values['allow-partial'],
    provenance: values.provenance,
  }
}

async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2))
  const artifacts = await readArtifacts(cli.dir)
  const order = publishOrder(artifacts)
  const platforms = order.filter(artifact => artifact.kind === 'platform')
  const entry = order.find(artifact => artifact.kind === 'entry')
  if (entry === undefined) fail('no entry package manifest found; publish the launcher package too')
  if (platforms.length < PLATFORM_SUFFIXES.length && !cli.allowPartial) {
    fail(`only ${String(platforms.length)} of ${String(PLATFORM_SUFFIXES.length)} platform packages are present; publish every target or pass --allow-partial`)
  }
  for (const artifact of platforms) await publishOne(artifact, cli)
  await awaitPropagation(platforms, cli)
  await publishOne(entry, cli)
  console.log(`publish-npm-exe: done; install with: npm install -g ${entry.name}@${cli.distTag}`)
}

if (import.meta.main) {
  await main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
