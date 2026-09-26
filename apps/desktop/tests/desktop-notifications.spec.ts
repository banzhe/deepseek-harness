import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DesktopNotificationRouter, type DesktopNotificationPlatform } from '../src/desktop-notifications.ts'

vi.stubGlobal('process', { ...process, platform: 'win32' })

class FakeNotification extends EventEmitter {
  static isSupported(): boolean { return true }
  readonly shown = vi.fn()
  readonly closed = vi.fn()
  constructor(readonly options: Electron.NotificationConstructorOptions) { super() }
  show(): void { this.shown() }
  close(): void {
    this.closed()
    this.emit('close')
  }
}

function buildPlatform(): { platform: DesktopNotificationPlatform; constructed: FakeNotification[] } {
  const constructed: FakeNotification[] = []
  const platform = function (options: Electron.NotificationConstructorOptions) {
    const notification = new FakeNotification(options)
    constructed.push(notification)
    return notification
  } as unknown as DesktopNotificationPlatform
  platform.isSupported = () => true
  return { platform, constructed }
}

afterEach(() => { vi.unstubAllGlobals() })

describe('desktop notification router', () => {
  it('refuses to show when the platform is unsupported', () => {
    const platform = buildPlatform().platform
    platform.isSupported = () => false
    const router = new DesktopNotificationRouter(platform)
    expect(router.show({ id: 'a', title: 'T', body: '' })).toBe(false)
  })

  it('builds a Windows toast launch carrying the encoded id and delivers protocol activations', () => {
    const { platform, constructed } = buildPlatform()
    const router = new DesktopNotificationRouter(platform)
    const sinks = [vi.fn(), vi.fn()]
    router.subscribe(sinks[0]!)
    expect(router.show({ id: 'session one', title: 'T<i>tle & "q"', body: 'B>' })).toBe(true)
    const toast = constructed[0]!
    expect(toast.options.toastXml).toContain('launch="dsh://open?notification=session%20one"')
    expect(toast.options.toastXml).toContain('activationType="protocol"')
    expect(toast.options.toastXml).toContain('T&lt;i&gt;tle &amp; &quot;q&quot;')
    expect(toast.options.toastXml).toContain('B&gt;')
    expect(toast.options.toastXml).not.toContain('session one<')
    // A protocol activation the router displayed routes to the current sink.
    expect(router.deliver('session one')).toBe(true)
    expect(sinks[0]).toHaveBeenCalledExactlyOnceWith({ id: 'session one' })
    // The latest subscription wins.
    router.subscribe(sinks[1]!)
    expect(router.deliver('session one')).toBe(true)
    expect(sinks[1]).toHaveBeenCalledOnce()
    expect(sinks[0]).toHaveBeenCalledOnce()
  })

  it('delivers a native click for the displayed notification and refuses foreign ids', () => {
    const { platform, constructed } = buildPlatform()
    const router = new DesktopNotificationRouter(platform)
    const sink = vi.fn()
    router.subscribe(sink)
    router.show({ id: 'native-1', title: 'T', body: '' })
    constructed[0]!.emit('click')
    expect(sink).toHaveBeenCalledExactlyOnceWith({ id: 'native-1' })
    // An id the router never displayed drops (stale toast from a previous run).
    expect(router.deliver('foreign')).toBe(false)
    expect(sink).toHaveBeenCalledOnce()
  })

  it('respects a custom launch prefix and parses launch arguments', () => {
    const { platform, constructed } = buildPlatform()
    const router = new DesktopNotificationRouter(platform, 'dshx://open?notification=')
    router.show({ id: 'a', title: 'T', body: '' })
    expect(constructed[0]!.options.toastXml).toContain('launch="dshx://open?notification=a"')
    expect(DesktopNotificationRouter.launchNotificationId('dsh://open?notification=abc')).toBe('abc')
    expect(DesktopNotificationRouter.launchNotificationId('dsh://open?notification=a%2Fb&extra')).toBe('a/b')
    expect(DesktopNotificationRouter.launchNotificationId('dsh://open?notification=')).toBeUndefined()
    expect(DesktopNotificationRouter.launchNotificationId('dsh://open')).toBeUndefined()
    expect(DesktopNotificationRouter.launchNotificationId('https://example.com/')).toBeUndefined()
  })

  it('closes only its own displayed notifications and drops failed ones', () => {
    const { platform, constructed } = buildPlatform()
    const router = new DesktopNotificationRouter(platform)
    router.show({ id: 'c1', title: 'T', body: '' })
    // A replacement for the same id closes the old toast.
    router.show({ id: 'c1', title: 'T2', body: '' })
    router.close('c1')
    router.close('never-shown')
    expect(constructed.map(notification => notification.closed.mock.calls.length)).toEqual([1, 1])
    // A failed display cannot be activated later.
    const sink = vi.fn()
    router.subscribe(sink)
    router.show({ id: 'f1', title: '', body: '' })
    constructed.at(-1)!.emit('failed')
    expect(router.deliver('f1')).toBe(false)
    expect(sink).not.toHaveBeenCalled()
  })

  it('treats an activation with no subscriber as refused', () => {
    const { platform } = buildPlatform()
    const router = new DesktopNotificationRouter(platform)
    router.show({ id: 's', title: '', body: '' })
    expect(router.deliver('s')).toBe(false)
  })
})
