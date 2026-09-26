/** Main-process system notifications whose activation reliably reaches the renderer. */

import type { DesktopNotificationActivationSink } from './ipc.ts'

/** One renderer-requested notification, keyed by its renderer-chosen id. */
export interface DesktopNotificationRequest {
  /** Renderer-chosen identity, echoed back on activation; opaque to the shell. */
  readonly id: string
  readonly title: string
  readonly body: string
}

/**
 * Windows toast launch argument routed through the `dsh` protocol. The
 * protocol registration is conditional (`main.ts`), so the launch value stays
 * inert where `dsh` was not registered.
 */
const LAUNCH_PREFIX = 'dsh://open?notification='

/**
 * Windows toast XML for one notification. A toast `launch` protocol activation
 * is the only path whose click reaches the application from the Windows
 * notification center (plain `Notification` clicks there do not); the shell
 * routes the echoed id back to the renderer as a
 * {@link DesktopNotificationActivation}.
 * @param request - notification copy and renderer id.
 * @returns the `toastXml` property value for Electron's Windows notification.
 */
function windowsToastXml(request: DesktopNotificationRequest): string {
  return `<toast launch="${LAUNCH_PREFIX}${encodeURIComponent(request.id)}" activationType="protocol">`
    + '<visual><binding template="ToastGeneric">'
    + `<text>${escapeToast(request.title)}</text>`
    + `<text>${escapeToast(request.body)}</text>`
    + '</binding></visual></toast>'
}

/** XML-escape toast text content: the five named entities are the full set. */
function escapeToast(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}

/** Minimal notification surface the shell needs; replaceable in tests. */
export interface DesktopNotificationPlatform {
  isSupported(): boolean
  new (options: Electron.NotificationConstructorOptions): Electron.Notification
}

/**
 * Owns displayed notifications per renderer id and routes every activation —
 * native `click` and Windows toast protocol launch — to the single sink the
 * shell registers. Activations that arrive with no sink are dropped: a toast
 * click already refocused the application, and replaying a stale session
 * switch behind the user's later navigation would be wrong.
 */
export class DesktopNotificationRouter {
  private readonly notifications = new Map<string, Electron.Notification>()
  private sink: DesktopNotificationActivationSink | undefined

  /**
   * @param platform - Electron notification surface.
   * @param launchPrefix - Windows toast launch prefix; overridable for tests.
   */
  constructor(
    private readonly platform: DesktopNotificationPlatform,
    private readonly launchPrefix: string = LAUNCH_PREFIX,
  ) {}

  /**
   * Display one notification. On Windows the toast launch protocol carries the
   * id so activation from the notification center still reaches the renderer;
   * elsewhere the native `click` event echoes it.
   * @param request - notification copy and renderer id, replacing a same-id toast.
   * @returns whether the platform accepted the request; the renderer owns the retry policy.
   */
  show(request: DesktopNotificationRequest): boolean {
    if (!this.platform.isSupported()) return false
    try {
      const options: Electron.NotificationConstructorOptions
        & { readonly toastXml?: string; readonly id?: string } = {
          title: request.title, body: request.body,
          ...(process.platform === 'win32'
            ? { toastXml: windowsToastXml(request).replaceAll(LAUNCH_PREFIX, this.launchPrefix) }
            : { id: request.id }),
        }
      const notification = new this.platform(options)
      notification.on('click', () => { this.deliver(request.id) })
      notification.on('failed', () => { this.notifications.delete(request.id) })
      // A Windows toast carries no renderer-visible tag, so a same-id request
      // must explicitly close the previous toast instead of stacking.
      const previous = this.notifications.get(request.id)
      if (previous !== undefined) {
        this.notifications.delete(request.id)
        try { previous.close() } catch (error) { console.warn('desktop notifications: close refused', error) }
      }
      notification.show()
      this.notifications.set(request.id, notification)
      return true
    } catch (error) { console.warn('desktop notifications: show refused', error); return false }
  }

  /**
   * Remove one displayed notification so a renderer replacement closes the
   * old toast instead of stacking.
   */
  close(id: string): void {
    const notification = this.notifications.get(id)
    if (notification === undefined) return
    this.notifications.delete(id)
    try { notification.close() } catch (error) { console.warn('desktop notifications: close refused', error) }
  }

  /**
   * Install or replace the single activation sink. The shell wires one per
   * application; the last subscription wins.
   */
  subscribe(sink: DesktopNotificationActivationSink): void { this.sink = sink }

  /**
   * Deliver a native `click` activation. Activations for ids this router never
   * displayed (a stale toast from a previous run) are refused so the caller
   * falls back to a bare refocus — no renderer listener could route them.
   */
  deliver(id: string): boolean {
    if (this.sink === undefined || !this.notifications.has(id)) return false
    this.sink({ id })
    return true
  }

  /**
   * Parse one Windows toast launch argument (a second-instance `dsh://open`
   * argv entry) into its renderer id. Non-notification launches return
   * undefined so the caller falls back to bare focus.
   * @param argument - one launch argv entry or protocol-open URL.
   */
  static launchNotificationId(argument: string): string | undefined {
    if (!argument.startsWith(LAUNCH_PREFIX)) return undefined
    const raw = argument.slice(LAUNCH_PREFIX.length).split(/[&/]/)[0] ?? ''
    return raw === '' ? undefined : decodeURIComponent(raw)
  }
}
