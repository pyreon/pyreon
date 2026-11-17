/** Server-only data behind `guarded.ts`'s middleware (see that file). */
export async function serverLoader() {
  return { secret: 'GUARDED_SENTINEL_m4k2' }
}
