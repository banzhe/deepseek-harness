#!/usr/bin/env node
/**
 * `bin` entry of the personal single-executable npm package: resolve this host's
 * platform package, then hand the complete argv to the packaged `dsh` executable.
 * The scope and package stem below are replaced when `scripts/build-npm-exe.ts`
 * assembles the package; the placeholder check there keeps them in step.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { constants } from 'node:os'
import { dirname, join } from 'node:path'

const SCOPE = '__SCOPE__'
const NAME = '__NAME__'

const require = createRequire(import.meta.url)

/** Report one launch failure and exit; the executable never ran. */
function fail(message) {
  console.error(`${NAME}: ${message}`)
  process.exit(1)
}

/** Absolute path of the executable for this host, or the `DSHX_BINARY` override. */
function resolveExecutable() {
  const override = process.env.DSHX_BINARY
  if (override !== undefined && override !== '') return override
  const platformKey = `${process.platform}-${process.arch}`
  let manifest
  try {
    manifest = require.resolve(`${SCOPE}/${NAME}-${platformKey}/package.json`)
  } catch {
    fail(`no prebuilt executable for ${platformKey}. Reinstall with: npm install -g ${SCOPE}/${NAME}@latest`)
  }
  return join(dirname(manifest), 'bin', process.platform === 'win32' ? `${NAME}.exe` : NAME)
}

const executable = resolveExecutable()
const child = spawn(executable, process.argv.slice(2), { stdio: 'inherit' })

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => { child.kill(signal) })
}

child.once('error', error => fail(`cannot start ${executable}: ${error.message}`))
child.once('exit', (code, signal) => {
  if (signal !== null) process.exit(128 + (constants.signals[signal] ?? 0))
  process.exit(code ?? 1)
})
