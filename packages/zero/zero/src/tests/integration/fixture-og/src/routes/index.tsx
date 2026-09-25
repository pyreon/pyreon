export default function Home() {
  return <h1>Home</h1>
}

// Card from params only (no loader).
export const og = () => (
  <svg width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="#123456" />
    <text x="60" y="320" font-size="64" fill="#ffffff">Home</text>
  </svg>
)
