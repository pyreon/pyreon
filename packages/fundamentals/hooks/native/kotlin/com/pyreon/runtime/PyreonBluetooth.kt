// PyreonBluetooth — the Compose side of `@pyreon/hooks`' useBluetooth.
// Mirror of PyreonBluetooth.swift; see that file's header for why this is
// discovery-only and why the ordering contract is asserted rather than
// inherited from the platform.

package com.pyreon.runtime

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf

/** One device seen during a scan. */
public data class PyreonBluetoothDevice(val id: String, val name: String)

/**
 * The platform half of a scan. Swapped for a fake in tests, so the ordering
 * and state logic below runs with no Android SDK and no radio — an
 * approximated stub of a radio would prove nothing, so the real scanner is
 * verified on hardware instead.
 */
public interface BluetoothScanner {
    /** True when the platform has a usable adapter. */
    public val isAvailable: Boolean

    /** Begin discovery. Each device found calls [onDevice]. */
    public fun startScan(
        onDevice: (PyreonBluetoothDevice) -> Unit,
        onError: (String) -> Unit,
    )

    /** End discovery. Safe to call when not scanning. */
    public fun stopScan()
}

/** Reactive Bluetooth discovery — the Compose half of `useBluetooth`. */
public class PyreonBluetooth(private val scanner: BluetoothScanner) {
    public val scanning: MutableState<Boolean> = mutableStateOf(false)
    public val devices: MutableState<List<PyreonBluetoothDevice>> = mutableStateOf(emptyList())
    public val error: MutableState<String> = mutableStateOf("")

    public val available: Boolean get() = scanner.isAvailable

    /** Begin discovery, clearing any previous results. */
    public fun scan() {
        if (!scanner.isAvailable) {
            error.value = "Bluetooth is not available on this platform"
            return
        }
        error.value = ""
        devices.value = emptyList()
        scanning.value = true
        scanner.startScan(
            onDevice = { device ->
                // First-seen order, deduped by id — BLE peripherals advertise
                // continuously, so appending unconditionally would flood the
                // list rather than being an edge case.
                if (devices.value.none { it.id == device.id }) {
                    devices.value = devices.value + device
                }
            },
            onError = { message ->
                error.value = message
                scanning.value = false
            },
        )
    }

    /** End discovery. Discovered devices are kept, as on the web. */
    public fun stopScan() {
        if (!scanning.value) return
        scanning.value = false
        scanner.stopScan()
    }
}
