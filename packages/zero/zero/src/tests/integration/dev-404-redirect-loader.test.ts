/**
 * Regression test: dev 404 in `mode: 'ssg'` when the parent layout's
 * loader throws `redirect()`.
 *
 * The fix delegates `handle404` to `renderSsr`, which calls
 * `router.preload(pathname)`. preload runs parent-layout loaders for the
 * matched (synthetic 404) chain. If the loader throws `redirect()`, the
 * error must propagate cleanly — same as the existing `mode: 'ssr'`
 * dev path, same as production runtime SSR.
 *
 * Behavior expected (matching `mode: 'ssr'` dev today):
 *   - The redirect-throwing loader fires on the unmatched URL.
 *   - The thrown `RedirectError` propagates up through `router.preload`.
 *   - handle404's try/catch swallows it → falls through to bare HTML
 *     fallback. The dev server does NOT currently convert dev-mode
 *     redirect errors to HTTP 302/307 (that's an existing dev-SSR
 *     behavior, NOT this PR's scope).
 *
 * What this test locks in: the user's `_404` component MUST NOT render
 * (the loader's redirect must short-circuit before the synthetic leaf
 * gets a chance). If a future change accidentally suppressed the
 * loader execution, the `_404` would render and the test would fail
 * with `expected '...should NOT be visible...' to not appear`.
 *
 * This documents the current contract: dev `ssg`/`spa` 404 paths run
 * parent-layout loaders, matching `ssr` dev + production SSR.
 */
import { resolve } from "node:path";
import pyreon from "@pyreon/vite-plugin";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { zeroPlugin } from "../../vite-plugin";

const FIXTURE_DIR = resolve(import.meta.dirname, "fixture-redirect-loader-404");

let server: ViteDevServer;
let baseUrl: string;

beforeAll(async () => {
	server = await createServer({
		root: FIXTURE_DIR,
		configFile: false,
		plugins: [pyreon(), zeroPlugin({ mode: "ssg" })],
		resolve: { conditions: ["bun"] },
		ssr: { resolve: { conditions: ["bun"] } },
		optimizeDeps: {
			exclude: [
				"@pyreon/core",
				"@pyreon/reactivity",
				"@pyreon/router",
				"@pyreon/runtime-dom",
				"@pyreon/runtime-server",
				"@pyreon/head",
				"@pyreon/server",
				"@pyreon/vite-plugin",
			],
		},
		server: { port: 0 },
		logLevel: "silent",
	});
	await server.listen();
	const address = server.httpServer?.address();
	if (address && typeof address === "object") {
		baseUrl = `http://localhost:${address.port}`;
	}
}, 30_000);

afterAll(async () => {
	await server?.close();
});

describe("dev 404 — parent layout loader throws redirect()", () => {
	it("layout loader fires on unmatched URL — _404 component never renders", async () => {
		const res = await fetch(`${baseUrl}/this-doesnt-exist`, {
			redirect: "manual", // we want to see the raw response, not follow
		});
		const html = await res.text();
		// Critical anti-assertion: if the layout loader's `throw redirect()`
		// was suppressed, the synthetic _404 chain would render and this
		// content would appear. It MUST NOT.
		expect(html).not.toContain("should NOT be visible (loader redirects first)");
	});

	it("dev server handles the thrown redirect without exposing the _404 body", async () => {
		// The redirect surfaces as either:
		//   (a) a 302/307 redirect with Location: /login (if dev path
		//       converts redirects, matching production createHandler), OR
		//   (b) a 404 with the bare static fallback body (if dev path
		//       lets the error propagate to handle404's try/catch, which
		//       swallows and falls through to the static fallback).
		//
		// Either is acceptable — the LOAD-BEARING contract is that the
		// user's `_404.tsx` body is NOT shown (since the loader said
		// "you're not allowed here, redirect away"). Pre-fix in
		// `mode: 'ssg'` the loader never even ran, so this contract was
		// unreachable; the test locks the post-fix correctness.
		const res = await fetch(`${baseUrl}/protected-page-that-doesnt-exist`, {
			redirect: "manual",
		});
		const html = await res.text();
		expect(html).not.toContain("should NOT be visible");
		// The response was handled somehow (not crashed / hung).
		expect([200, 302, 307, 404, 500]).toContain(res.status);
	});
});
