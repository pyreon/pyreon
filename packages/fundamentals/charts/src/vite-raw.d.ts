// Vite `?raw` imports resolve a file's contents as a string (used by the
// webview browser test to inline the real ECharts UMD into the hosted page).
declare module '*?raw' {
  const content: string
  export default content
}
