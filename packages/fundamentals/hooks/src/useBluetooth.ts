import { batch, isClient, onCleanup, signal } from '@pyreon/reactivity'

import { warnIfInsecureContext } from './secure-context'

/** A device seen during a scan. */
export interface BluetoothDevice {
  /** Stable per-session identifier — the platform's device id. */
  id: string
  /** Advertised name, or `''` when the device advertises none. */
  name: string
}

export interface UseBluetoothResult {
  /** Whether this platform can scan at all (no adapter → false). */
  available: () => boolean
  /** True between `scan()` and `stopScan()`. */
  scanning: () => boolean
  /** Devices discovered so far, in FIRST-SEEN order, deduped by `id`. */
  devices: () => BluetoothDevice[]
  /** The last error, or `''`. Permission denial lands here, not as a throw. */
  error: () => string
  /** Begin discovery. Clears any previous results. */
  scan: () => Promise<void>
  /** End discovery. Discovered devices are kept. */
  stopScan: () => void
}

/**
 * Reactive Bluetooth device discovery.
 *
 * Deliberately DISCOVERY-ONLY. GATT — services, characteristics, notify —
 * is where the three platforms stop resembling each other (Web Bluetooth
 * requires a user gesture per device and exposes no scan at all on most
 * browsers; CoreBluetooth and Android BLE both scan freely but model
 * connection state differently). Shipping discovery as a real 1:1 surface
 * and leaving connection to a native escape hatch is honest; pretending the
 * whole stack crosses would not be.
 *
 * The web implementation uses `navigator.bluetooth.requestDevice`, which
 * shows the browser's own chooser and resolves with ONE device — so on web
 * `scan()` appends a single device per call and `scanning` is true only
 * while the chooser is open. That difference is real and documented rather
 * than papered over: the reactive SHAPE is identical, the interaction model
 * is the platform's.
 *
 * @example
 * ```tsx
 * const bt = useBluetooth()
 *
 * <Button onPress={() => bt.scan()}>
 *   {() => bt.scanning() ? 'Scanning…' : 'Scan'}
 * </Button>
 * <For each={bt.devices()}>{(d) => <Text>{d.name || d.id}</Text>}</For>
 * ```
 */
export function useBluetooth(): UseBluetoothResult {
  const scanning = signal(false)
  const devices = signal<BluetoothDevice[]>([])
  const error = signal('')

  // `isClient` from @pyreon/reactivity rather than a local typeof — it is
  // the repo's canonical SSR guard, and the one `no-window-in-ssr`
  // recognises. A hand-rolled ternary reads the same to a human and not to
  // the rule, which is how this reached CI.
  const nav = isClient
    ? (navigator as Navigator & {
        bluetooth?: { requestDevice: (o: unknown) => Promise<unknown> }
      })
    : undefined
  const available = signal(nav?.bluetooth !== undefined)

  const scan = async (): Promise<void> => {
    if (!available.peek()) {
      warnIfInsecureContext('useBluetooth')
      error.set('Bluetooth is not available on this platform')
      return
    }
    // One notification, not three — a consumer rendering the device list
    // and the scanning label must not see a frame where the list is already
    // cleared but the label still says idle.
    batch(() => {
      error.set('')
      devices.set([])
      scanning.set(true)
    })
    try {
      const picked = (await nav?.bluetooth?.requestDevice({ acceptAllDevices: true })) as
        | { id?: string; name?: string }
        | undefined
      if (picked) {
        const entry: BluetoothDevice = { id: picked.id ?? '', name: picked.name ?? '' }
        // First-seen order, deduped by id — the contract both native
        // runtimes reproduce.
        if (!devices.peek().some((d) => d.id === entry.id)) {
          devices.set([...devices.peek(), entry])
        }
      }
    } catch (e) {
      // A cancelled chooser is a rejection, not an exception the caller
      // should have to catch — surface it as state, like every other
      // permission-shaped hook here.
      error.set(e instanceof Error ? e.message : String(e))
    } finally {
      scanning.set(false)
    }
  }

  const stopScan = (): void => {
    scanning.set(false)
  }

  onCleanup(() => {
    scanning.set(false)
  })

  return {
    available: () => {
      const ok = available()
      if (!ok) warnIfInsecureContext('useBluetooth')
      return ok
    },
    scanning: () => scanning(),
    devices: () => devices(),
    error: () => error(),
    scan,
    stopScan,
  }
}

export default useBluetooth
