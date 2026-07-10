// Intentionally empty client entry. The zero plugin auto-injects
// `<script type="module" src="/src/entry-client.ts">` into index.html,
// so the file must exist for the client build to resolve it — but the
// build tests never execute the app, so no hydration wiring is needed
// (and `@pyreon/zero`'s client deps aren't resolvable from this
// fixture's directory anyway — see vite.config.ts).
export {}
