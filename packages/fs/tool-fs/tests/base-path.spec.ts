/**
 * `basePath` confines every tool path to one configured directory. These suites
 * drive the registered tools against the real local backend and assert both the
 * accepted spellings and the refusals, for reads and mutations alike.
 */
import { Context } from '@deepseek-ai/cordis'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished, vi } from 'vitest'
import { provideWorkingDirectoryFixture } from '@deepseek-ai/dsh-agent-loop-testkit'
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local'
import { LlmAdapter, LlmRuntime, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmModelInfo, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { SandboxedFileSystem } from '@deepseek-ai/dsh-fs-sandbox'
import * as FsPolicy from '@deepseek-ai/dsh-fs-observation-policy'
import SandboxPolicyService from '@deepseek-ai/dsh-sandbox-policy'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as ToolFs from '@deepseek-ai/dsh-tool-fs'
import { add, move, patch, remove, update } from './patch/harness.ts'

/** 1x1 red PNG (valid signature, IHDR, IDAT). */
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64')

const signal = new AbortController().signal

/** Exact-route fake adapter; image reads only need the declared modalities. */
class CatalogAdapter extends LlmAdapter {
  override listModels(_provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve([{ provider: 'visual', id: 'vision-model', name: 'Vision', inputModalities: ['text', 'image'] }])
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: model, inputModalities: ['text', 'image'] })
  }

  override stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    throw new Error('basePath tests never stream')
  }
}

interface SetupOptions {
  /** The configured `basePath`; omitted leaves the tools unrestricted. */
  basePath?: string
  /** Mount the observation policy. Defaults to true. */
  policy?: boolean
  /** Mount an attachment store and an image-capable route for `read_image`. */
  images?: boolean
  /** Mount the sandbox-enforcing backend instead of the bare local one. */
  confining?: boolean
}

let callCounter = 0

/**
 * Build the tool suite over a real backend with the fixture tree below.
 *
 *     <root>/outside.txt
 *     <root>/workspace/                  (Session current directory)
 *     <root>/workspace/outside.txt
 *     <root>/workspace/sub/              (basePath 'sub' resolves here)
 *     <root>/workspace/sub/file.txt
 *     <root>/workspace/sub/moved.txt
 *     <root>/workspace/sub/nested/deep.txt
 *     <root>/workspace/sub-other/x.txt
 * @param options - the deployment switches this suite varies.
 * @returns the context and the directories the assertions name.
 */
async function setup(options: SetupOptions = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-tool-fs-base-'))
  const home = await mkdtemp(join(tmpdir(), 'dsh-tool-fs-base-home-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  onTestFinished(() => rm(home, { recursive: true, force: true }))
  const workspace = join(root, 'workspace')
  const base = join(workspace, 'sub')
  await mkdir(join(base, 'nested'), { recursive: true })
  await mkdir(join(workspace, 'sub-other'), { recursive: true })
  await writeFile(join(base, 'file.txt'), 'alpha\nbeta\n')
  await writeFile(join(base, 'moved.txt'), 'old\n')
  await writeFile(join(base, 'nested', 'deep.txt'), 'deep\n')
  await writeFile(join(base, 'pic.png'), PNG_1X1)
  await writeFile(join(workspace, 'sub-other', 'x.txt'), 'sibling\n')
  await writeFile(join(workspace, 'outside.txt'), 'outside\n')
  await writeFile(join(workspace, 'outside.png'), PNG_1X1)
  await writeFile(join(root, 'outside.txt'), 'root outside\n')

  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  provideWorkingDirectoryFixture(ctx, workspace)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  if (options.confining === true) {
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SandboxPolicyService, { mode: 'workspace-write', workspaceRoot: workspace })
    await ctx.plugin(SandboxedFileSystem, { cwd: workspace })
  } else await ctx.plugin(LocalFileSystem, { cwd: workspace })
  if (options.policy !== false) await ctx.plugin(FsPolicy)
  if (options.images === true) {
    await ctx.plugin(LocalAttachmentStore, { dshHome: home })
    await ctx.plugin(LlmRuntime)
    ctx.llm.registerAdapter(['visual'], new CatalogAdapter())
  }
  await ctx.plugin(ToolFs, {
    applyPatch: true,
    ...options.basePath === undefined ? {} : { basePath: options.basePath },
  })
  return { ctx, root, workspace, base }
}

/** The calling agent: one Session directory, plus an image-capable route for `read_image`. */
function agentOn(workspace: string): object {
  return {
    options: { provider: 'visual', model: 'vision-model' },
    session: {
      header: { cwd: workspace },
      requestHeader: () => ({ config: { provider: 'visual', model: 'vision-model' } }),
    },
  }
}

function call(ctx: Context, name: string, args: unknown, agent?: object) {
  return executeToolFixture(ctx, {
    signal,
    callId: ToolCallId('base-path-' + String(++callCounter)),
    name,
    arguments: args,
    ...agent === undefined ? {} : { agent: agent as never },
  })
}

function text(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(block => block.type === 'text').map(block => block.text).join('')
}

function refusal(path: string, basePath = 'sub'): string {
  return 'Path "' + path + '" is outside the configured basePath "' + basePath + '".'
}

it('read accepts a basePath-relative path, a Session path carrying the prefix, and an absolute path', async () => {
  const { ctx, workspace, base } = await setup({ basePath: 'sub' })
  const agent = agentOn(workspace)
  const inside = await realpath(join(base, 'file.txt'))
  for (const spelling of ['file.txt', 'sub/file.txt', './sub/file.txt', join(base, 'file.txt')]) {
    const result = await call(ctx, 'read', { file_path: spelling }, agent)
    expect(result.isError, spelling).toBe(false)
    expect(text(result)).toContain('1: alpha')
    expect(result.meta).toMatchObject({ path: inside })
  }
  const nested = await call(ctx, 'read', { file_path: 'nested/deep.txt' }, agent)
  expect(nested.isError).toBe(false)
  expect(text(nested)).toContain('1: deep')
})

it('write and edit reach files inside the configured basePath', async () => {
  const { ctx, workspace, base } = await setup({ basePath: 'sub' })
  const agent = agentOn(workspace)
  expect((await call(ctx, 'write', { file_path: 'created.txt', content: 'fresh' }, agent)).isError).toBe(false)
  expect(await readFile(join(base, 'created.txt'), 'utf8')).toBe('fresh')
  await expect(readFile(join(workspace, 'created.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })

  expect((await call(ctx, 'write', { file_path: 'sub/second.txt', content: 'second' }, agent)).isError).toBe(false)
  expect(await readFile(join(base, 'second.txt'), 'utf8')).toBe('second')

  expect((await call(ctx, 'read', { file_path: 'file.txt' }, agent)).isError).toBe(false)
  const edit = await call(ctx, 'edit', { file_path: 'file.txt', old_string: 'beta', new_string: 'BETA' }, agent)
  expect(edit.isError).toBe(false)
  expect(await readFile(join(base, 'file.txt'), 'utf8')).toBe('alpha\nBETA\n')
})

it('read_image reads an image inside the configured basePath', async () => {
  const { ctx, workspace } = await setup({ basePath: 'sub', images: true })
  const agent = agentOn(workspace)
  for (const spelling of ['pic.png', 'sub/pic.png']) {
    const result = await call(ctx, 'read_image', { file_path: spelling }, agent)
    expect(result.isError, spelling).toBe(false)
    expect(result.content).toHaveLength(2)
  }
})

it('apply_patch adds, updates, moves, and deletes inside the configured basePath', async () => {
  const { ctx, workspace, base } = await setup({ basePath: 'sub', policy: false })
  const agent = agentOn(workspace)
  const result = await call(ctx, 'apply_patch', {
    input: patch(
      add('added.txt', 'body'),
      update('sub/file.txt', 'alpha', 'rotated'),
      move('sub/moved.txt', 'sub/target.txt'),
      remove('sub/nested/deep.txt'),
    ),
  }, agent)
  expect(result.isError).toBe(false)
  expect(await readFile(join(base, 'added.txt'), 'utf8')).toBe('body\n')
  expect(await readFile(join(base, 'file.txt'), 'utf8')).toBe('rotated\nbeta\n')
  expect(await readFile(join(base, 'target.txt'), 'utf8')).toBe('new\n')
  await expect(readFile(join(base, 'moved.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(readFile(join(base, 'nested', 'deep.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
})

it('read refuses a .. escape and an absolute path outside', async () => {
  const { ctx, workspace, root } = await setup({ basePath: 'sub' })
  const agent = agentOn(workspace)
  const readText = vi.spyOn(ctx.fs, 'readText')
  for (const spelling of ['../outside.txt', join(root, 'outside.txt'), join(workspace, 'outside.txt')]) {
    const result = await call(ctx, 'read', { file_path: spelling }, agent)
    expect(result.isError, spelling).toBe(true)
    expect(text(result)).toContain(refusal(spelling))
    expect(result.error).toMatchObject({ info: { name: 'FsError', code: 'FS_PERMISSION_DENIED' } })
  }
  // A refused path never reaches the provider.
  expect(readText).not.toHaveBeenCalled()
})

it('never treats a sibling directory sharing the prefix as inside the scope', async () => {
  const { ctx, workspace } = await setup({ basePath: 'sub' })
  const agent = agentOn(workspace)
  // A plain relative spelling is read against the configured directory, so it
  // names <basePath>/sub-other/x.txt and never the sibling directory.
  const relative = await call(ctx, 'read', { file_path: 'sub-other/x.txt' }, agent)
  expect(relative.isError).toBe(true)
  expect(text(relative)).not.toContain('sibling')
  expect(text(relative)).toContain(join('sub', 'sub-other', 'x.txt'))
  const absolute = await call(ctx, 'read', { file_path: join(workspace, 'sub-other', 'x.txt') }, agent)
  expect(absolute.isError).toBe(true)
  expect(text(absolute)).toContain(refusal(join(workspace, 'sub-other', 'x.txt')))
})

it('refuses a .. spelling that a second reading would fold back inside the scope', async () => {
  const { ctx, workspace } = await setup({ basePath: 'sub' })
  const agent = agentOn(workspace)
  for (const spelling of ['../sub/file.txt', './nested/../../outside.txt', 'nested//../../sub/file.txt']) {
    const result = await call(ctx, 'read', { file_path: spelling }, agent)
    expect(result.isError, spelling).toBe(true)
    expect(text(result)).toContain(refusal(spelling))
  }
  const stayedInside = await call(ctx, 'read', { file_path: 'nested/../file.txt' }, agent)
  expect(stayedInside.isError).toBe(false)
  expect(text(stayedInside)).toContain('1: alpha')
})

it('refuses rooted POSIX, UNC, drive, and home spellings', async () => {
  const { ctx, workspace } = await setup({ basePath: 'sub' })
  const agent = agentOn(workspace)
  for (const spelling of ['/outside.txt', '\\outside.txt', 'C:/outside.txt', '~', '~/outside.txt', '~\\outside.txt']) {
    const result = await call(ctx, 'read', { file_path: spelling }, agent)
    expect(result.isError, spelling).toBe(true)
    expect(text(result)).toContain(refusal(spelling))
  }
})

it('refuses a relative target that resolves outside basePath after anchoring to baseRoot', async () => {
  const { ctx, workspace, base } = await setup({ basePath: 'sub' })
  const realBase = await realpath(base)
  const outside = await ctx.fs.resolve('outside.txt', { cwd: workspace })
  const origResolve = ctx.fs.resolve.bind(ctx.fs)
  vi.spyOn(ctx.fs, 'resolve').mockImplementation(async (targetPath, opts) => (
    targetPath === 'escape-link.txt' && opts?.cwd === realBase ? outside : origResolve(targetPath, opts)
  ))
  const result = await call(ctx, 'read', { file_path: 'escape-link.txt' }, agentOn(workspace))
  expect(result.isError).toBe(true)
  expect(text(result)).toContain(refusal('escape-link.txt'))
})

it.skipIf(process.platform === 'win32')('refuses a real symlink inside basePath pointing outside', async () => {
  const { ctx, workspace, base } = await setup({ basePath: 'sub' })
  await symlink(join(workspace, 'outside.txt'), join(base, 'escape-link.txt'))
  const result = await call(ctx, 'read', { file_path: 'escape-link.txt' }, agentOn(workspace))
  expect(result.isError).toBe(true)
  expect(text(result)).toContain(refusal('escape-link.txt'))
})

it('creates a not-yet-existing basePath directory on first write', async () => {
  const { ctx, workspace } = await setup({ basePath: './new-dir' })
  const agent = agentOn(workspace)
  const first = await call(ctx, 'write', { file_path: 'note.txt', content: 'first' }, agent)
  expect(first.isError).toBe(false)
  expect(await readFile(join(workspace, 'new-dir', 'note.txt'), 'utf8')).toBe('first')

  const second = await call(ctx, 'write', { file_path: 'new-dir/second.txt', content: 'second' }, agent)
  expect(second.isError).toBe(false)
  expect(await readFile(join(workspace, 'new-dir', 'second.txt'), 'utf8')).toBe('second')

  const escaped = await call(ctx, 'write', { file_path: '../outside.txt', content: 'nope' }, agent)
  expect(escaped.isError).toBe(true)
  expect(text(escaped)).toContain(refusal('../outside.txt', './new-dir'))
})

it('read_image refuses an image outside the configured basePath', async () => {
  const { ctx, workspace, root } = await setup({ basePath: 'sub', images: true })
  const agent = agentOn(workspace)
  for (const spelling of ['../outside.png', join(root, 'outside.png')]) {
    const result = await call(ctx, 'read_image', { file_path: spelling }, agent)
    expect(result.isError, spelling).toBe(true)
    expect(text(result)).toContain(refusal(spelling))
  }
})

it('write and edit refuse paths outside the configured basePath and change nothing', async () => {
  const { ctx, workspace, base } = await setup({ basePath: 'sub' })
  const agent = agentOn(workspace)
  const writeText = vi.spyOn(ctx.fs, 'writeText')
  const write = await call(ctx, 'write', { file_path: '../outside.txt', content: 'clobbered' }, agent)
  expect(write.isError).toBe(true)
  expect(text(write)).toContain(refusal('../outside.txt'))
  const edit = await call(ctx, 'edit', { file_path: '../sub-other/x.txt', old_string: 'sibling', new_string: 'changed' }, agent)
  expect(edit.isError).toBe(true)
  expect(text(edit)).toContain(refusal('../sub-other/x.txt'))
  expect(writeText).not.toHaveBeenCalled()
  expect(await readFile(join(base, 'file.txt'), 'utf8')).toBe('alpha\nbeta\n')
  expect(await readFile(join(workspace, 'outside.txt'), 'utf8')).toBe('outside\n')
  expect(await readFile(join(workspace, 'sub-other', 'x.txt'), 'utf8')).toBe('sibling\n')
})

it('apply_patch refuses an out-of-range path and a move destination outside', async () => {
  const { ctx, workspace, base } = await setup({ basePath: 'sub', policy: false })
  const agent = agentOn(workspace)
  const added = await call(ctx, 'apply_patch', { input: patch(add('../escaped.txt', 'body')) }, agent)
  expect(added.isError).toBe(true)
  expect(text(added)).toContain(refusal('../escaped.txt'))
  await expect(readFile(join(base, 'escaped.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })

  const moved = await call(ctx, 'apply_patch', { input: patch(move('sub/moved.txt', '../escaped.txt')) }, agent)
  expect(moved.isError).toBe(true)
  expect(text(moved)).toContain(refusal('../escaped.txt'))
  expect(await readFile(join(base, 'moved.txt'), 'utf8')).toBe('old\n')
  await expect(readFile(join(workspace, 'escaped.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
})

it('an out-of-range write is refused even when the call asks for wider sandbox permissions', async () => {
  const { ctx, workspace } = await setup({ basePath: 'sub', confining: true })
  const writeText = vi.spyOn(ctx.fs, 'writeText')
  // No approval service is mounted, so any escalation attempt fails closed with
  // its own text: the basePath refusal proves the configuration boundary ran
  // first and is not an escalation target.
  const result = await call(ctx, 'write', {
    file_path: '../outside.txt',
    content: 'clobbered',
    sandbox_permissions: 'danger-full-access',
    justification: 'the task needs the file beside the workspace',
  })
  expect(result.isError).toBe(true)
  expect(text(result)).toContain(refusal('../outside.txt'))
  expect(text(result)).not.toContain('approval')
  expect(writeText).not.toHaveBeenCalled()
  expect(await readFile(join(workspace, 'outside.txt'), 'utf8')).toBe('outside\n')
})

it.each([{}, { basePath: '   ' }])('an unset or blank basePath leaves paths unrestricted (%j)', async (config) => {
  const { ctx, workspace } = await setup(config)
  const result = await call(ctx, 'read', { file_path: '../outside.txt' }, agentOn(workspace))
  expect(result.isError).toBe(false)
  expect(text(result)).toContain('1: root outside')
})
