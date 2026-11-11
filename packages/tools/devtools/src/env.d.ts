// Vite `?raw` imports (the browser test loads panel.css as text).
declare module '*.css?raw' {
  const css: string
  export default css
}
