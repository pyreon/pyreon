# @pyreon/docs-zero

Pyreon's documentation site, rebuilt on top of `@pyreon/zero` +
`@pyreon/zero-content`. Successor to the VitePress-based `docs/` —
dogfoods the framework end-to-end.

This is PR 8 of the zero-content rollout. The migration ports all 75
markdown pages from `docs/docs/` to `src/content/docs/`, applies the
required conventions (frontmatter normalisation, MDX-safe inline JSX,
escaped `<digit` constructs in prose, etc.), and stubs the two missing
built-in components (`<Playground>`, `<PackageBadge>`) as plain
in-tree `src/mdx/` exports so the build resolves cleanly.

## Layout

| Path                        | What it holds                                          |
| --------------------------- | ------------------------------------------------------ |
| `src/content/docs/`         | 75 migrated markdown pages (`.md`)                     |
| `src/mdx/`                  | Convention-scanned components (Playground, etc.)       |
| `src/components/`           | Layout shells used by `[...slug].tsx`                  |
| `src/routes/`               | fs-router pages — index + catch-all `[...slug].tsx`    |
| `content.config.ts`         | `defineCollection({ schema })` declarations            |
| `scripts/migrate-from-vitepress.ts` | One-shot migration script (idempotent, re-runnable)|

## Run

```bash
# Dev
bun run dev

# Build
bun run build

# Preview the build
bun run preview
```

## What was migrated (and what wasn't)

The migration script handles:

- Frontmatter: adds `title:` from the H1 to pages without frontmatter
- Playground component: `<Playground :height="N">…js…</Playground>` →
  `<Playground height={N} code={`…js…`} />`
- Code-fence titles: ```` ```ts title="filename" ```` → ```` ```ts ````
- VitePress GitHub-style admonitions `> [!TIP]` → `:::tip` directives
- HTML comments `<!--…-->` → JSX comments `{/* … */}`
- `<` followed by digit ("<50ms") → `&lt;` outside fenced code
- YAML-reserved characters at the head of `title:` values → quoted
- Stripping VitePress-specific Vue components (`<PropTable>`,
  `<CompatMatrix>`, `<APICard>`) — they're replaced with a JSX comment
  naming the deferred work. Restoring their content requires porting
  each one to a first-party Pyreon component (PR 9 polish).
- Stripping `<div class="…">` wrappers around inline JSX

## Follow-up (not in this PR)

- Port `<APICard>` to a first-party Pyreon component, then restore
  the API-reference call sites in `core.md` / `reactivity.md` /
  `router.md` (totals: 32 + 12 + 17 stripped invocations).
- Port `<PropTable>` + `<CompatMatrix>` similarly.
- Hook `<Toc>` to a real `IntersectionObserver` + scroll-spy.
- Wire `<Sidebar>` to a frontmatter-driven `sidebar.config.ts`
  (currently lists pages alphabetically).
- Build a Lighthouse comparison gate against the VitePress build
  before flipping the production deploy.
- Real-Chromium e2e covering at least 5 representative pages.

## Why not `docs/`?

`docs/` (the VitePress site) is the production-deployed docs surface
at https://pyreon.github.io/pyreon/. Building both side-by-side gives
us a controlled migration: this app proves the foundation works on the
real 75-page corpus; the VitePress build keeps serving production
until we've completed PR 9's polish and run a parallel-deploy bake
period. The cut-over plan lives in the issue tracker.
