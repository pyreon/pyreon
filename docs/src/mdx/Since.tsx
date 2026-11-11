type SinceProps = { version: string; status?: undefined } | { status: 'next release' | 'new on main'; version?: undefined }

/**
 * Inline marker for when a feature arrived: `<Since version="0.27" />` prints
 * "0.27+"; in selling contexts `<Since status="next release" />` (or
 * "new on main") prints the cyan chip instead of a version number.
 */
export function Since(props: SinceProps) {
  return <span class="since-badge">{props.status ?? `${props.version}+`}</span>
}
