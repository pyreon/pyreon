// PZ-11 regression — `zero dev`'s middlewares must honor Vite's
// `server.proxy` instead of shadowing it.
//
// zero's dev middlewares register directly in `configureServer`, which
// lands them BEFORE Vite's internal proxy middleware. Pre-fix:
//
//   1. The mode:'ssr' SSR catch-all accepted any request whose Accept
//      includes `text/html` OR `*/*` (fetch's DEFAULT) with no extension —
//      no /api/ skip, no proxy awareness. With a reachable `_404.tsx`,
//      renderSsr terminates unmatched paths with 404 HTML, so a proxied
//      `GET /api/proxied/hello` (wildcard Accept) returned zero's 404 page
//      instead of reaching the backend.
//   2. The 404 handler skips /api/* (W24) but swallowed every OTHER
//      unmatched HTML-ish proxy prefix (/backend, /graphql, …) in ALL modes.
//
// These specs boot a REAL Vite dev server (zeroPlugin, mode:'ssr') with
// `server.proxy` pointing at a real local HTTP backend, and assert the
// verified matrix end-to-end.
//
// Bisect-verified: reverting the two `matchesProxyContext` guards + the SSR
// middleware's /api/ skip in vite-plugin.ts makes the proxy specs fail with
// 404 HTML instead of backend JSON (exact failures recorded in the PR).
// (Line comments throughout — a literal `*/*` inside a block comment would
// close it.)
import { createServer as createHttpServer, type Server } from "node:http";
import { resolve } from "node:path";
import pyreon from "@pyreon/vite-plugin";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { zeroPlugin } from "../../vite-plugin";
import {
	DEV_SERVER_BOOT_TIMEOUT_MS,
	DEV_SERVER_TEST_TIMEOUT_MS,
	devFetch,
} from "./dev-server-budget";

const FIXTURE_DIR = resolve(import.meta.dirname, "fixture");

let backend: Server;
let backendPort: number;
let server: ViteDevServer;
let baseUrl: string;

// Snapshot for `devFetch`'s failure message — a thunk, so it costs nothing on
// the passing path and only runs when a request has already failed.
const state = () =>
	`baseUrl=${baseUrl} listening=${Boolean(server?.httpServer?.listening)} ` +
	`backendPort=${backendPort}`;

beforeAll(async () => {
	// Tiny real backend — answers EVERYTHING with JSON + a marker header so
	// specs can tell "reached the backend" from "swallowed by zero" apart.
	backend = createHttpServer((req, res) => {
		res.statusCode = 200;
		res.setHeader("Content-Type", "application/json");
		res.setHeader("x-proxied-backend", "hit");
		res.end(JSON.stringify({ proxied: true, url: req.url }));
	});
	await new Promise<void>((resolveListen) => {
		backend.listen(0, "127.0.0.1", resolveListen);
	});
	const addr = backend.address();
	if (addr && typeof addr === "object") backendPort = addr.port;
	const target = `http://127.0.0.1:${backendPort}`;

	server = await createServer({
		root: FIXTURE_DIR,
		configFile: false,
		plugins: [pyreon(), zeroPlugin({ mode: "ssr" })],
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
		server: {
			port: 0,
			proxy: {
				// The reporter's exact case — an /api/ prefix owned by a backend.
				"/api/proxied": { target },
				// /api/health is ALSO an fs api route (src/routes/api/health.ts)
				// — locks the precedence: fs api routes WIN over server.proxy.
				"/api/health": { target },
				// Non-/api prefix — pre-fix swallowed by the 404 handler in ALL
				// modes (the W24 skip only covers /api/*).
				"/backend": { target },
				// ^-prefixed context — Vite treats it as a RegExp on req.url.
				"^/rx/\\d+": { target },
			},
		},
		logLevel: "silent",
	});
	await server.listen();
	const address = server.httpServer?.address();
	if (address && typeof address === "object") {
		baseUrl = `http://localhost:${address.port}`;
	}
}, DEV_SERVER_BOOT_TIMEOUT_MS);

afterAll(async () => {
	await server?.close();
	await new Promise<void>((resolveClose) => {
		backend?.close(() => resolveClose());
	});
});

describe("PZ-11 — zero dev honors vite server.proxy", { timeout: DEV_SERVER_TEST_TIMEOUT_MS }, () => {
	it("proxies /api/<context> with Accept: */* (fetch default) to the backend", async () => {
		// Pre-fix: the SSR catch-all swallowed this with 404 _404.tsx HTML.
		const res = await devFetch(
			`${baseUrl}/api/proxied/hello`,
			"proxied /api/ context reaches the backend",
			{ observe: state },
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("x-proxied-backend")).toBe("hit");
		const body = (await res.json()) as { proxied: boolean; url: string };
		expect(body.proxied).toBe(true);
		expect(body.url).toBe("/api/proxied/hello");
	});

	it("proxies a NON-/api prefix even for Accept: text/html requests", async () => {
		// Pre-fix: the 404 handler swallowed /backend/* in ALL modes (its
		// /api/ skip didn't cover other proxy prefixes); in mode:'ssr' the
		// SSR catch-all swallowed it first.
		const res = await devFetch(
			`${baseUrl}/backend/x`,
			"proxied NON-/api prefix with Accept: text/html",
			{ headers: { accept: "text/html" }, observe: state },
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("x-proxied-backend")).toBe("hit");
		const body = (await res.json()) as { url: string };
		expect(body.url).toBe("/backend/x");
	});

	it("matches proxy contexts on the FULL url including the query string", async () => {
		const res = await devFetch(
			`${baseUrl}/backend/data?q=1`,
			"proxy context matched on the full url incl. query",
			{ observe: state },
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("x-proxied-backend")).toBe("hit");
		const body = (await res.json()) as { url: string };
		expect(body.url).toBe("/backend/data?q=1");
	});

	it("honors ^-prefixed RegExp proxy contexts", async () => {
		const res = await devFetch(`${baseUrl}/rx/123`, "^-prefixed RegExp proxy context", {
			observe: state,
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("x-proxied-backend")).toBe("hit");
	});

	it("fs api routes WIN over a same-prefix proxy context", async () => {
		// /api/health is BOTH an fs api route AND a proxy context. The dev
		// API dispatcher runs first — fs wins (matches production, where
		// server.proxy doesn't exist).
		const res = await devFetch(
			`${baseUrl}/api/health`,
			"fs api route wins over a same-prefix proxy context",
			{ observe: state },
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("x-proxied-backend")).toBeNull();
		const body = (await res.json()) as { status: string };
		expect(body.status).toBe("ok");
	});

	it("page routes still SSR (guards don't over-next)", async () => {
		const res = await devFetch(`${baseUrl}/`, "dev SSR render of the index page", {
			headers: { accept: "text/html" },
			observe: state,
		});
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain("Hello from Zero");
	});

	it("unmatched non-proxy paths still render the 404 page", async () => {
		const res = await devFetch(
			`${baseUrl}/definitely-not-a-route`,
			"dev SSR render of the 404 page",
			{ observe: state },
		);
		expect(res.status).toBe(404);
		const html = await res.text();
		expect(html).toContain("404 — Page Not Found");
	});

	// ── PZ-11 companion — the SSR middleware's /api/* skip ────────────────
	//
	// The W24 /api/ skip existed only on the 404 handler; in mode:'ssr' the
	// SSR catch-all ran first and still swallowed /api/*. These two specs
	// exercise the new skip on a path NO proxy context matches — the code
	// path is identical to a proxy-less server (the proxy guard evaluates
	// false either way), so they also cover the reporter's no-proxy case.

	it("unmatched /api/* paths fall through past zero (no 404-HTML swallow)", async () => {
		// Pre-fix: 404 + the _404.tsx HTML. Post-fix: falls through zero's
		// middlewares to Vite (whose html fallback serves the SPA shell for
		// Accept: */*) — the key contract is zero does NOT terminate it.
		const res = await devFetch(
			`${baseUrl}/api/unhandled-by-anyone`,
			"unmatched /api/* falls through past zero",
			{ observe: state },
		);
		const html = await res.text();
		expect(html).not.toContain("404 — Page Not Found");
		expect(res.status).not.toBe(404);
	});

	it("a PAGE route under /api/ (api/page.tsx) keeps dev SSR", async () => {
		// `isApiRoute` only claims `.ts`/`.js` files — an `api/*.tsx` file is
		// a page route. The /api/ skip is gated on pageRouteMatches so this
		// still server-renders (production parity).
		const res = await devFetch(
			`${baseUrl}/api/page`,
			"dev SSR render of a PAGE route under /api/",
			{ headers: { accept: "text/html" }, observe: state },
		);
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain("Page under api prefix");
	});
});
