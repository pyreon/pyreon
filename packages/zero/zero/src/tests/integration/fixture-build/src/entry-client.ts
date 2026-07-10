// Intentionally inert client entry — the zero plugin auto-injects
// `<script type="module" src="/src/entry-client.ts">` into index.html,
// so the file must exist for the client build to resolve it. The build
// tests never execute the app in a browser.
export {}
