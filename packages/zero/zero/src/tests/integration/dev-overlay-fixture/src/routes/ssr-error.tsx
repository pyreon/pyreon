export default function Viewport() {
  // Reads a browser global while the server renders the page.
  const width = window.innerWidth
  return <p>Viewport is {width}px wide</p>
}
