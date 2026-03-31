export default function Broken() {
  throw new Error('Intentional SSR error for testing')
}
