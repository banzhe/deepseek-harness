/**
 * Assemble the personal `@banzhe/dsh-banzhe` npm packages from the single executable that
 * `scripts/build-exe-for-python-sdk.ts` writes to `dist-exe/`. The upstream pipeline keeps the
 * `@yao-pkg/pkg --sea` route, the deployed plugin closure, and the sidecar layout; this script
 * renames those products into one thin entry package plus one OS/CPU-selected platform package
 * per target, generates their manifests, packs them, and records one manifest per tarball for
 * `scripts/publish-npm-exe.ts`.
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chmod, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pnpmInvocation } from './executable-packaging.ts'

const root = resolve(import.meta.dirname, '..')

/** npm scope, including its leading `@`, and package stem; platform packages append `-<os>-<arch>`. */
const SCOPE = '@banzhe'
const NAME = 'dsh-banzhe'
const UPSTREAM_SCRIPT = join(root, 'scripts', 'build-exe-for-python-sdk.ts')
/** Product basename the upstream pipeline writes under `dist-exe/`. */
const UPSTREAM_BASENAME = 'deepseek-harness-sdk-runtime'
const UPSTREAM_OUT = join(root, 'dist-exe')
const DEFAULT_OUT = join(UPSTREAM_OUT, 'npm')
const LAUNCHER_TEMPLATE = join(root, 'scripts', 'npm-exe', 'launcher.js')
/** Legal files every published package carries. */
const DOCUMENTS = ['LICENSE', 'THIRD_PARTY_NOTICES.md'] as const
const DEFAULT_MAX_MB = 100

/** One published target: an upstream pkg triple and the npm platform package it becomes. */
interface Target {
  /** Upstream pkg triple, e.g. `node24-linux-x64`. */
  readonly triple: string
  /** Product suffix the upstream pipeline writes, e.g. `macos-arm64`. */
  readonly sourceSuffix: string
  /** Platform package suffix, e.g. `darwin-arm64`. */
  readonly packageSuffix: string
  /** npm `os` field. */
  readonly os: 'linux' | 'darwin' | 'win32'
  /** npm `cpu` field. */
  readonly cpu: 'x64' | 'arm64'
}

const TARGETS: readonly Target[] = [
  { triple: 'node24-linux-x64', sourceSuffix: 'linux-x64', packageSuffix: 'linux-x64', os: 'linux', cpu: 'x64' },
  { triple: 'node24-macos-arm64', sourceSuffix: 'macos-arm64', packageSuffix: 'darwin-arm64', os: 'darwin', cpu: 'arm64' },
  { triple: 'node24-win-x64', sourceSuffix: 'win-x64', packageSuffix: 'win32-x64', os: 'win32', cpu: 'x64' },
]

/** One assembled package and the tarball it produced. */
interface Assembled {
  /** Registry name. */
  readonly name: string
  /** Published version. */
  readonly version: string
  /** Absolute package directory that `npm pack` runs in. */
  readonly directory: string
  /** `entry` for the launcher package, `platform` for an executable carrier. */
  readonly kind: 'entry' | 'platform'
  /** os/cpu selection for platform packages. */
  readonly selectors?: { readonly os: Target['os']; readonly cpu: Target['cpu'] }
  /** Tarball basename once packed. */
  readonly file: string
}

/** Parsed command line. */
interface BuildCli {
  /** Release version shared with the GitHub Release. */
  readonly version: string | undefined
  /** Targets to assemble; `undefined` assembles only the entry package. */
  readonly targets: readonly Target[] | undefined
  /** Output directory for package directories and tarballs. */
  readonly out: string
  /** Run the upstream executable build first. */
  readonly build: boolean
  /** Forward `--build-artifacts` to the upstream build. */
  readonly buildArtifacts: boolean
  /** Forward `--skip-build` to the upstream build, reusing the current `lib/` artifacts. */
  readonly skipBuild: boolean
  /** Print commands and intended writes without performing them. */
  readonly dryRun: boolean
  /** Reject a tarball above this size. */
  readonly maxMb: number
}

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/build-npm-exe.ts [flags]',
    '',
    '  --version=<v>          Published version; defaults to the root package.json version.',
    '  --targets=<t1,t2,...>  pkg triples to assemble, e.g. node24-linux-x64,node24-win-x64.',
    '                         Default: the host target. Ignored with --entry-only.',
    '  --entry-only           Assemble only the platform-independent launcher package.',
    '  --assemble-only        Skip the upstream executable build and use existing dist-exe/ products.',
    '  --build-artifacts      Forward `--build-artifacts` to the upstream build.',
    '  --skip-build           Forward `--skip-build` to the upstream build (existing lib/ artifacts).',
    '  --out=<dir>            Output directory (default: dist-exe/npm).',
    '  --max-mb=<n>           Reject a tarball above this size (default: 100).',
    '  --dry-run              Print commands and intended writes without performing them.',
    '  --help                 Print this help.',
    '',
    'The executables themselves come from scripts/build-exe-for-python-sdk.ts; this script only',
    'renames them into npm packages and never changes the packaging route.',
  ].join('\n')
}

function fail(message: string): never {
  throw new Error(`build-npm-exe: ${message}`)
}

function resolveTarget(spec: string): Target {
  const found = TARGETS.find(target => target.triple === spec)
  if (found === undefined) {
    fail(`unknown target ${JSON.stringify(spec)}; supported: ${TARGETS.map(target => target.triple).join(', ')}`)
  }
  return found
}

function hostTarget(): Target {
  const platform = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'win' : 'linux'
  return resolveTarget(`node24-${platform}-${process.arch}`)
}

/** Quote one argument for the Windows `cmd.exe` command line a `.cmd` shim needs. */
function quoteWindowsArgument(argument: string): string {
  return /^[A-Za-z0-9_./:=+@-]+$/u.test(argument) ? argument : `"${argument.replaceAll('"', '""')}"`
}

/**
 * Run one command with inherited stdio, optionally capturing stdout.
 * @param command - executable to run.
 * @param args - its arguments.
 * @param options - working directory and whether stdout is captured.
 * @returns Captured stdout, or an empty string when not captured.
 */
async function run(
  command: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly capture: boolean },
): Promise<string> {
  const shell = process.platform === 'win32'
  const line = [command, ...args].map(quoteWindowsArgument).join(' ')
  const child = spawn(shell ? line : command, shell ? [] : [...args], {
    cwd: options.cwd,
    shell,
    stdio: ['ignore', options.capture ? 'pipe' : 'inherit', 'inherit'],
  })
  let stdout = ''
  child.stdout?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => { stdout += chunk })
  await new Promise<void>((settle, reject) => {
    child.once('error', (error) => { reject(new Error(`build-npm-exe: failed to spawn ${line}: ${error.message}`)) })
    child.once('exit', (code, signal) => {
      if (code === 0) {
        settle()
        return
      }
      const cause = code === null ? `signal ${signal ?? 'unknown'}` : `exit code ${code}`
      reject(new Error(`build-npm-exe: ${line} failed (${cause})`))
    })
  })
  return stdout
}

/** The npm executable for this host; `npm.cmd` needs the shell on Windows. */
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

async function readRootVersion(): Promise<string> {
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as { version: string }
  return manifest.version
}

function entryPackageName(): string {
  return `${SCOPE}/${NAME}`
}

function platformPackageName(target: Target): string {
  return `${SCOPE}/${NAME}-${target.packageSuffix}`
}

function packageDirectoryName(target: Target): string {
  return `${NAME}-${target.packageSuffix}`
}

/** Absolute path of one upstream product or sidecar beside the executable. */
function upstreamProduct(target: Target, suffix: string): string {
  const extension = target.os === 'win32' ? '.exe' : ''
  return join(UPSTREAM_OUT, `${UPSTREAM_BASENAME}-${target.sourceSuffix}${suffix}${extension}`)
}

function requireFile(path: string): void {
  if (!existsSync(path)) fail(`${path} is missing; run the executable build first (or drop --assemble-only)`)
}

async function copyExecutable(source: string, destination: string, dryRun: boolean): Promise<void> {
  if (dryRun) return
  await copyFile(source, destination)
  if (process.platform !== 'win32') await chmod(destination, 0o755)
}

function entryReadme(version: string): string {
  return [
    '# @banzhe/dsh-banzhe',
    '',
    '个人使用的 DeepSeek Harness 单文件命令行：源码来自 `my_dev` 分支的本地修改版本，打包成自带 Node 运行时的可执行文件，安装后不需要系统 Node。',
    '',
    '## 安装',
    '',
    '```sh',
    `npm install -g ${entryPackageName()}@${version}`,
    '```',
    '',
    '## 使用',
    '',
    '```sh',
    'dsh-banzhe web --no-open --port 8080   # 启动 Web GUI',
    'dsh-banzhe --profile headless "task"   # 一次性任务',
    'dsh-banzhe --version                   # 输出的内嵌 dsh 版本（如 0.2.1-rc.3），npm 包版本另带构建序号',
    '```',
    '',
    '首次启动会在 `DSH_HOME` 下初始化 profile；未设置时为 `~/.dsh`。',
    '',
    '## 更新',
    '',
    '```sh',
    `npm install -g ${entryPackageName()}@latest`,
    '```',
    '',
    '## 已知限制',
    '',
    '- 只有随包发布的平台可用（Linux x64、macOS arm64、Windows x64）；其他平台启动会直接报错。',
    '- Linux 需要 glibc 2.28 或更新；受限沙箱需要宿主安装 `bwrap`，否则受限模式按设计拒绝执行。',
    '- 安装或卸载插件（`dsh-banzhe plugin …`）需要宿主存在 `pnpm`。',
    '- Office 文档能力首次使用时按需下载独立的引擎目录。',
    '- 安装包未签名：Windows 会出现 SmartScreen 提示，macOS 为 ad-hoc 签名。',
    '',
    '## 许可',
    '',
    'MIT，版权归 DeepSeek。本包是个人本地修改版本，不是官方发布。随包附带 `THIRD_PARTY_NOTICES.md`，覆盖内嵌的 Node 运行时。',
    '',
  ].join('\n')
}

async function assemblePlatformPackage(
  target: Target,
  out: string,
  version: string,
  dryRun: boolean,
): Promise<Assembled> {
  const directory = join(out, packageDirectoryName(target))
  const windows = target.os === 'win32'
  const executable = upstreamProduct(target, '')
  const ripgrep = upstreamProduct(target, '-rg')
  const spawnHelper = upstreamProduct(target, '-spawn-helper')
  requireFile(executable)
  requireFile(ripgrep)
  if (target.os === 'darwin') requireFile(spawnHelper)
  if (dryRun) {
    console.log(`build-npm-exe: [dry-run] assemble ${directory}`)
  } else {
    await rm(directory, { recursive: true, force: true })
    await mkdir(join(directory, 'bin'), { recursive: true })
  }
  await copyExecutable(executable, join(directory, 'bin', windows ? `${NAME}.exe` : NAME), dryRun)
  await copyExecutable(ripgrep, join(directory, 'bin', windows ? `${NAME}-rg.exe` : `${NAME}-rg`), dryRun)
  if (target.os === 'darwin') {
    await copyExecutable(spawnHelper, join(directory, 'bin', `${NAME}-spawn-helper`), dryRun)
  }
  if (!dryRun) {
    for (const document of DOCUMENTS) await copyFile(join(root, document), join(directory, document))
  }
  const manifest = {
    name: platformPackageName(target),
    version,
    description: `Single-executable DeepSeek Harness CLI (personal build) for ${target.os} ${target.cpu}`,
    os: [target.os],
    cpu: [target.cpu],
    files: ['bin/', ...DOCUMENTS],
    license: 'MIT',
    publishConfig: { access: 'public' },
  }
  if (dryRun) {
    console.log(`build-npm-exe: [dry-run] write ${join(directory, 'package.json')}`)
  } else {
    await writeFile(join(directory, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  }
  console.log(`build-npm-exe: assembled ${platformPackageName(target)}`)
  return {
    name: platformPackageName(target),
    version,
    directory,
    kind: 'platform',
    selectors: { os: target.os, cpu: target.cpu },
    file: '',
  }
}

async function assembleEntryPackage(out: string, version: string, dryRun: boolean): Promise<Assembled> {
  const directory = join(out, NAME)
  const template = await readFile(LAUNCHER_TEMPLATE, 'utf8')
  const launcher = template.replaceAll('__SCOPE__', SCOPE).replaceAll('__NAME__', NAME)
  if (launcher.includes('__SCOPE__') || launcher.includes('__NAME__')) {
    fail(`launcher template ${LAUNCHER_TEMPLATE} still contains a placeholder after rendering`)
  }
  if (dryRun) {
    console.log(`build-npm-exe: [dry-run] assemble ${directory}`)
  } else {
    await rm(directory, { recursive: true, force: true })
    await mkdir(join(directory, 'bin'), { recursive: true })
    await writeFile(join(directory, 'bin', `${NAME}.js`), launcher)
    await chmod(join(directory, 'bin', `${NAME}.js`), 0o755)
    await writeFile(join(directory, 'README.md'), entryReadme(version))
    for (const document of DOCUMENTS) await copyFile(join(root, document), join(directory, document))
  }
  const optionalDependencies = Object.fromEntries(TARGETS.map(target => [platformPackageName(target), version]))
  const manifest = {
    name: entryPackageName(),
    version,
    description: 'Single-executable DeepSeek Harness CLI (personal build) with the Web, headless, and SDK profiles',
    type: 'module',
    bin: { [NAME]: `bin/${NAME}.js` },
    files: [`bin/${NAME}.js`, 'README.md', ...DOCUMENTS],
    optionalDependencies,
    engines: { node: '>=20' },
    license: 'MIT',
    publishConfig: { access: 'public' },
  }
  if (dryRun) {
    console.log(`build-npm-exe: [dry-run] write ${join(directory, 'package.json')}`)
  } else {
    await writeFile(join(directory, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  }
  console.log(`build-npm-exe: assembled ${entryPackageName()}`)
  return { name: entryPackageName(), version, directory, kind: 'entry', file: '' }
}

/**
 * Pack one assembled package, enforce the size limit, and record its manifest.
 * @param assembled - package produced by assembly.
 * @param out - output directory receiving the tarball and manifest.
 * @param maxMb - largest accepted tarball size in megabytes.
 * @param dryRun - print the command instead of running it.
 * @returns The packed package with its tarball name and size.
 */
async function packPackage(
  assembled: Assembled,
  out: string,
  maxMb: number,
  dryRun: boolean,
): Promise<{ readonly assembled: Assembled & { readonly file: string }; readonly sizeMb: number }> {
  if (dryRun) {
    console.log(`build-npm-exe: [dry-run] ${npmCommand} pack --pack-destination ${out} (in ${assembled.directory})`)
    return { assembled: { ...assembled, file: '<dry-run>.tgz' }, sizeMb: 0 }
  }
  const stdout = await run(npmCommand, ['pack', '--pack-destination', out, '--json'], {
    cwd: assembled.directory,
    capture: true,
  })
  const records = JSON.parse(stdout) as { filename: string; size: number }[]
  const record = records[0]
  if (record === undefined) fail(`${assembled.directory}: npm pack produced no record`)
  const sizeMb = record.size / (1024 * 1024)
  console.log(`build-npm-exe: packed ${record.filename} (${sizeMb.toFixed(1)} MB)`)
  if (sizeMb > maxMb) {
    fail(`${record.filename} is ${sizeMb.toFixed(1)} MB, above the ${String(maxMb)} MB limit; publish it as a GitHub Release asset instead`)
  }
  const manifestPath = join(out, `npm-exe-manifest-${record.filename.replace(/\.tgz$/u, '')}.json`)
  await writeFile(manifestPath, `${JSON.stringify({
    name: assembled.name,
    version: assembled.version,
    file: record.filename,
    kind: assembled.kind,
    ...(assembled.selectors === undefined ? {} : { selectors: assembled.selectors }),
  }, null, 2)}\n`)
  return { assembled: { ...assembled, file: record.filename }, sizeMb }
}

function parseCli(argv: string[]): BuildCli {
  const values = parseArgs({
    args: argv,
    options: {
      version: { type: 'string' },
      targets: { type: 'string' },
      'entry-only': { type: 'boolean', default: false },
      'assemble-only': { type: 'boolean', default: false },
      'build-artifacts': { type: 'boolean', default: false },
      'skip-build': { type: 'boolean', default: false },
      out: { type: 'string' },
      'max-mb': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  }).values
  if (values.help) {
    console.log(usage())
    process.exit(0)
  }
  const maxMb = values['max-mb'] === undefined ? DEFAULT_MAX_MB : Number(values['max-mb'])
  if (!Number.isFinite(maxMb) || maxMb <= 0) fail('--max-mb must be a positive number')
  const targets = values['entry-only']
    ? undefined
    : values.targets === undefined
      ? [hostTarget()]
      : values.targets.split(',').map(part => part.trim()).filter(part => part !== '').map(resolveTarget)
  if (targets !== undefined && targets.length === 0) fail('--targets is empty')
  return {
    version: values.version,
    targets,
    out: values.out === undefined ? DEFAULT_OUT : resolve(values.out),
    build: !values['assemble-only'],
    buildArtifacts: values['build-artifacts'],
    skipBuild: values['skip-build'],
    dryRun: values['dry-run'],
    maxMb,
  }
}

async function buildExecutables(cli: BuildCli): Promise<void> {
  const [command, invocation] = pnpmInvocation([
    'exec',
    'tsx',
    UPSTREAM_SCRIPT,
    `--targets=${(cli.targets ?? []).map(target => target.triple).join(',')}`,
    ...(cli.buildArtifacts ? ['--build-artifacts'] : []),
    ...(cli.skipBuild ? ['--skip-build'] : []),
  ])
  if (cli.dryRun) {
    console.log(`build-npm-exe: [dry-run] ${command} ${invocation.join(' ')}`)
    return
  }
  console.log('build-npm-exe: building executables with scripts/build-exe-for-python-sdk.ts')
  await run(command, invocation, { cwd: root, capture: false })
}

async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2))
  const version = cli.version ?? await readRootVersion()
  console.log(`build-npm-exe: version ${version}`)
  if (cli.dryRun) {
    console.log(`build-npm-exe: [dry-run] output directory ${cli.out}`)
  } else {
    await mkdir(cli.out, { recursive: true })
  }
  if (cli.build) await buildExecutables(cli)
  const assembled: Assembled[] = []
  for (const target of cli.targets ?? []) assembled.push(await assemblePlatformPackage(target, cli.out, version, cli.dryRun))
  assembled.push(await assembleEntryPackage(cli.out, version, cli.dryRun))
  const packed: { readonly assembled: Assembled & { readonly file: string }; readonly sizeMb: number }[] = []
  for (const pkg of assembled) packed.push(await packPackage(pkg, cli.out, cli.maxMb, cli.dryRun))
  console.log('build-npm-exe: artifacts')
  for (const { assembled: pkg, sizeMb } of packed) console.log(`  ${join(cli.out, pkg.file)}  ${sizeMb.toFixed(1)} MB`)
  console.log('build-npm-exe: publish order and installation are handled by scripts/publish-npm-exe.ts')
}

if (import.meta.main) {
  await main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
