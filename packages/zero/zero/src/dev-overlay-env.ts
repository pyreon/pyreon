/**
 * Whether the hydration-mismatch overlay is switched off for this dev server.
 * Node-only (read by the vite plugin while it serves HTML); never reachable from
 * the client bundle, which is why the `no-private-env-in-client` rule exempts it.
 *
 * The e2e web servers set `PYREON_DEV_OVERLAY=off`: the overlay is a modal, and a
 * suite that clicks through a page with a known mismatch would be blocked by it.
 */
export function devOverlayDisabled(): boolean {
  return process.env.PYREON_DEV_OVERLAY === 'off'
}
