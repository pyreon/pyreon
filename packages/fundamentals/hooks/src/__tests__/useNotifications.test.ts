import { afterEach, describe, expect, it, vi } from 'vitest'
import { useNotifications } from '../useNotifications'

/**
 * Install a controllable Notification stub. The web Notification API is a
 * constructor with static `permission` + `requestPermission()` — happy-dom's
 * shape varies by version, so tests stub it explicitly for determinism.
 */
function stubNotification(
  permission: NotificationPermission,
  requestResult: NotificationPermission = permission,
) {
  const constructed: Array<{ title: string; options: NotificationOptions | undefined }> = []
  const requestPermission = vi.fn(() => Promise.resolve(requestResult))
  class NotificationStub {
    static permission = permission
    static requestPermission = requestPermission
    constructor(title: string, options?: NotificationOptions) {
      constructed.push({ title, options })
    }
  }
  vi.stubGlobal('Notification', NotificationStub)
  return { constructed, requestPermission }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useNotifications', () => {
  it('requestPermission() prompts ahead of time', () => {
    const { requestPermission } = stubNotification('default')
    useNotifications().requestPermission()
    expect(requestPermission).toHaveBeenCalledTimes(1)
  })

  it('notify() posts immediately when permission is already granted', () => {
    const { constructed, requestPermission } = stubNotification('granted')
    useNotifications().notify('Saved', 'Your changes are saved')
    expect(constructed).toEqual([{ title: 'Saved', options: { body: 'Your changes are saved' } }])
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('notify() auto-requests when undecided and posts on grant', async () => {
    const { constructed, requestPermission } = stubNotification('default', 'granted')
    useNotifications().notify('Hi', 'there')
    expect(requestPermission).toHaveBeenCalledTimes(1)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(constructed).toEqual([{ title: 'Hi', options: { body: 'there' } }])
  })

  it('notify() auto-requests when undecided and stays silent on deny', async () => {
    const { constructed, requestPermission } = stubNotification('default', 'denied')
    useNotifications().notify('Hi', 'there')
    expect(requestPermission).toHaveBeenCalledTimes(1)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(constructed).toEqual([])
  })

  it('notify() never posts or re-prompts when permission is denied', () => {
    const { constructed, requestPermission } = stubNotification('denied')
    useNotifications().notify('Hi', 'there')
    expect(constructed).toEqual([])
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('is a silent no-op when the Notification API is unavailable', () => {
    vi.stubGlobal('Notification', undefined)
    const n = useNotifications()
    expect(() => {
      n.requestPermission()
      n.notify('a', 'b')
    }).not.toThrow()
  })
})
