/** Not-found page — the response must carry status 404, not 200. */
export default function NotFound() {
  return <h1 data-testid="not-found">EDGE_NOT_FOUND_SENTINEL</h1>
}
