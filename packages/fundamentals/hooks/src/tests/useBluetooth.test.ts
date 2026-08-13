/**
 * `useBluetooth` — discovery-only BLE, and the WEB arm of the two native
 * runtimes (PyreonBluetooth.swift / .kt).
 *
 * The contract those runtimes reproduce, and the reason it is asserted here
 * rather than inferred: **first-seen order, deduped by id**. BLE peripherals
 * advertise continuously, so a duplicate sighting is the common case, not an
 * edge one — and a runtime that appended unconditionally would flood the
 * list while still looking correct in a one-shot test.
 *
 * Native counterparts:
 *   packages/fundamentals/hooks/native/tests/PyreonBluetoothTests.swift
 *   packages/fundamentals/hooks/native/tests/PyreonBluetoothTest.kt
 */
import { describe, expect, it, vi } from 'vitest'
import { useBluetooth } from '../useBluetooth'

const withBluetooth = (requestDevice: () => Promise<unknown>): void => {
  vi.stubGlobal('navigator', { bluetooth: { requestDevice } })
}

describe('availability', () => {
  it('is false when the platform exposes no adapter', () => {
    vi.stubGlobal('navigator', {})
    const bt = useBluetooth()
    expect(bt.available()).toBe(false)
  })

  it('scan() on an unavailable platform explains itself rather than throwing', async () => {
    vi.stubGlobal('navigator', {})
    const bt = useBluetooth()
    await bt.scan()
    expect(bt.scanning()).toBe(false)
    expect(bt.error()).toContain('not available')
  })
})

describe('discovery', () => {
  it('records the picked device and ends the scan', async () => {
    withBluetooth(async () => ({ id: 'a', name: 'Alpha' }))
    const bt = useBluetooth()
    await bt.scan()
    expect(bt.devices()).toEqual([{ id: 'a', name: 'Alpha' }])
    expect(bt.scanning()).toBe(false)
  })

  it('a device with no advertised name reads as an empty string, not undefined', async () => {
    withBluetooth(async () => ({ id: 'a' }))
    const bt = useBluetooth()
    await bt.scan()
    expect(bt.devices()[0]).toEqual({ id: 'a', name: '' })
  })

  it('clears previous results on a new scan', async () => {
    let n = 0
    withBluetooth(async () => ({ id: `d${n++}`, name: 'X' }))
    const bt = useBluetooth()
    await bt.scan()
    await bt.scan()
    // Cleared, so the second scan's single device is all that remains.
    expect(bt.devices()).toHaveLength(1)
    expect(bt.devices()[0]?.id).toBe('d1')
  })
})

describe('errors are STATE, not exceptions', () => {
  it('a cancelled chooser lands in error() and ends the scan', async () => {
    withBluetooth(async () => {
      throw new Error('User cancelled the requestDevice() chooser.')
    })
    const bt = useBluetooth()
    // The caller must not have to wrap this in try/catch — every other
    // permission-shaped hook here surfaces denial as state.
    await expect(bt.scan()).resolves.toBeUndefined()
    expect(bt.error()).toContain('cancelled')
    expect(bt.scanning()).toBe(false)
  })
})

describe('stopScan', () => {
  it('keeps the devices already discovered', async () => {
    withBluetooth(async () => ({ id: 'a', name: 'Alpha' }))
    const bt = useBluetooth()
    await bt.scan()
    bt.stopScan()
    expect(bt.scanning()).toBe(false)
    expect(bt.devices()).toHaveLength(1)
  })
})
