/**
 * Startup/memory entry — Octane.
 *
 * GENERATED-SHAPE FILE: every one of the eight entries is byte-identical apart
 * from the import and the mount call, so no framework can gain or lose from
 * entry-side differences. See `app-handle.ts` for the contract.
 *
 * This module MUST stay this small. It is loaded by the isolated per-framework
 * build that `bench-startup.ts` measures, so anything added here is charged to
 * the framework's script-bootup and main-thread numbers.
 */
import { mountOctane } from '../impl/octane.tsrx'
import { publishApp } from './app-handle'

const container = document.getElementById('app')
if (!container) throw new Error('#app missing')

void mountOctane(container).then(publishApp)
