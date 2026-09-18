/** Host-independent binding tests for the Win32 DACL and replacement helpers. */

import { toNamespacedPath } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

type GetFileSecurityW = (
  path: string,
  requestedInformation: number,
  descriptor: Buffer | null,
  length: number,
  needed: [number],
) => number
type SetFileSecurityW = (path: string, securityInformation: number, descriptor: Buffer) => number
type ReplaceFileW = (
  replaced: string,
  replacement: string,
  backup: null,
  flags: number,
  exclude: null,
  reserved: null,
) => number

interface NativeMock {
  getFileSecurityW: GetFileSecurityW
  setFileSecurityW: SetFileSecurityW
  replaceFileW: ReplaceFileW
  getLastError: () => number
}

async function importWithNative(native: NativeMock): Promise<typeof import('../src/win32.ts')> {
  vi.resetModules()
  vi.doMock('koffi', () => ({
    default: {
      load: () => ({
        func: (definition: string) => {
          if (definition.includes('GetFileSecurityW')) return native.getFileSecurityW
          if (definition.includes('SetFileSecurityW')) return native.setFileSecurityW
          if (definition.includes('ReplaceFileW')) return native.replaceFileW
          if (definition.includes('GetLastError')) return native.getLastError
          throw new Error(`unexpected native function: ${definition}`)
        },
      }),
    },
  }))
  return import('../src/win32.ts')
}

function successfulNative(descriptor: Buffer): NativeMock & { installed: Buffer[]; replacements: string[][] } {
  let lastError = 0
  const installed: Buffer[] = []
  const replacements: string[][] = []
  return {
    installed,
    replacements,
    getLastError: () => lastError,
    getFileSecurityW: (_path, _requested, output, _length, needed) => {
      needed[0] = descriptor.length
      if (output === null) {
        lastError = 122
        return 0
      }
      descriptor.copy(output)
      lastError = 0
      return 1
    },
    setFileSecurityW: (_path, information, value) => {
      expect(information).toBe(0x80000004)
      installed.push(Buffer.from(value))
      lastError = 0
      return 1
    },
    replaceFileW: (replaced, replacement, backup, flags, exclude, reserved) => {
      expect([backup, flags, exclude, reserved]).toEqual([null, 0, null, null])
      replacements.push([replaced, replacement])
      lastError = 0
      return 1
    },
  }
}

afterEach(() => {
  vi.doUnmock('koffi')
  vi.resetModules()
})

describe('Windows file-security helpers', () => {
  it('reads and installs a protected DACL before replacing the destination', async () => {
    const descriptor = Buffer.from([1, 2, 3, 4])
    const native = successfulNative(descriptor)
    const { copyFileDaclWin32, readFileDaclWin32, replaceFileWin32 } = await importWithNative(native)

    expect(await readFileDaclWin32('source')).toEqual(descriptor)
    await copyFileDaclWin32('source', 'temp')
    expect(native.installed).toEqual([descriptor])
    await replaceFileWin32('target', 'temp')
    expect(native.replacements).toEqual([[toNamespacedPath('target'), toNamespacedPath('temp')]])
  })

  it('maps descriptor-size probe failures to Node-style codes', async () => {
    const cases = [[2, 'ENOENT'], [3, 'ENOENT'], [5, 'EACCES'], [32, 'EBUSY'], [33, 'EBUSY'], [1175, 'EBUSY'], [9999, 'EIO']] as const
    for (const [win32Code, code] of cases) {
      const native = successfulNative(Buffer.from([1]))
      native.getFileSecurityW = (_path, _requested, _output, _length, needed) => {
        needed[0] = 0
        return 0
      }
      native.getLastError = () => win32Code
      const { readFileDaclWin32 } = await importWithNative(native)
      await expect(readFileDaclWin32('source')).rejects.toMatchObject({ code, win32Code, path: 'source' })
    }
  })

  it('surfaces a descriptor read failure after the size probe', async () => {
    const native = successfulNative(Buffer.from([1, 2]))
    native.getFileSecurityW = (_path, _requested, _output, _length, needed) => {
      needed[0] = 2
      return 0
    }
    native.getLastError = () => 5
    const { readFileDaclWin32 } = await importWithNative(native)

    await expect(readFileDaclWin32('source')).rejects.toMatchObject({ code: 'EACCES', syscall: 'GetFileSecurityW' })
  })

  it('surfaces DACL installation and replacement failures', async () => {
    const setFailure = successfulNative(Buffer.from([1]))
    setFailure.setFileSecurityW = () => 0
    setFailure.getLastError = () => 5
    const setModule = await importWithNative(setFailure)
    await expect(setModule.copyFileDaclWin32('source', 'temp')).rejects.toMatchObject({
      code: 'EACCES',
      syscall: 'SetFileSecurityW',
      path: 'temp',
    })

    const replaceFailure = successfulNative(Buffer.from([1]))
    replaceFailure.replaceFileW = (replaced, replacement) => {
      replaceFailure.replacements.push([replaced, replacement])
      return 0
    }
    replaceFailure.getLastError = () => 1176
    const replaceModule = await importWithNative(replaceFailure)
    await expect(replaceModule.replaceFileWin32('target', 'temp')).rejects.toMatchObject({
      code: 'EIO',
      syscall: 'ReplaceFileW',
      win32Code: 1176,
      path: 'target',
    })
    expect(replaceFailure.replacements).toHaveLength(1)
  })

  it('retries transient sharing, lock, and delete conflicts before replacing', async () => {
    const native = successfulNative(Buffer.from([1]))
    const failures = [32, 1175, 33]
    native.replaceFileW = (replaced, replacement) => {
      native.replacements.push([replaced, replacement])
      return failures.length === 0 ? 1 : 0
    }
    native.getLastError = () => failures.shift() ?? 0
    const { replaceFileWin32 } = await importWithNative(native)

    await replaceFileWin32('target', 'temp')

    expect(native.replacements).toEqual(Array.from({ length: 4 }, () => [
      toNamespacedPath('target'),
      toNamespacedPath('temp'),
    ]))
  })

  it('reports a persistent sharing or delete conflict after the bounded retries', async () => {
    for (const win32Code of [32, 1175]) {
      const native = successfulNative(Buffer.from([1]))
      native.replaceFileW = (replaced, replacement) => {
        native.replacements.push([replaced, replacement])
        return 0
      }
      native.getLastError = () => win32Code
      const { replaceFileWin32 } = await importWithNative(native)

      await expect(replaceFileWin32('target', 'temp')).rejects.toMatchObject({
        code: 'EBUSY',
        syscall: 'ReplaceFileW',
        win32Code,
        path: 'target',
      })
      expect(native.replacements).toHaveLength(4)
    }
  })

  it('stops before another replacement attempt when the retry wait is aborted', async () => {
    const native = successfulNative(Buffer.from([1]))
    const controller = new AbortController()
    native.replaceFileW = (replaced, replacement) => {
      native.replacements.push([replaced, replacement])
      controller.abort()
      return 0
    }
    native.getLastError = () => 32
    const { replaceFileWin32 } = await importWithNative(native)

    await expect(replaceFileWin32('target', 'temp', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(native.replacements).toHaveLength(1)
  })
})
