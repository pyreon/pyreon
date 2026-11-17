/** A loader that throws — the server must answer 500 (and log it), not hang or crash the isolate. */
export const loader = () => {
  throw new Error('EDGE_BOOM_loader_failed')
}

export default function Boom() {
  return <p>unreachable</p>
}
