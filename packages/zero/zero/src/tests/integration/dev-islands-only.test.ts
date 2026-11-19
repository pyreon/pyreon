// Islands-only pages (#4371) under zero's DEV server: dev SSR renders through
// the same `renderPage` as production, so a marked page must arrive marked,
// with its loader output and no loader-data blob, and `routeRules` `hydrate`
// must mark a page exactly as the route export does. Then HMR: the browser
// never loads an islands-only page's route code, so when a module the server
// rendered with changes there is no client module for Vite to update; zero
// sends a custom event instead, which the page's client reloads on
// (`client-marker.ts`; the browser half is in e2e/zero-islands-only.spec.ts).
import { resolve } from "node:path";
import pyreon from "@pyreon/vite-plugin";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ISLANDS_ONLY_SSR_UPDATE_EVENT, zeroPlugin } from "../../vite-plugin";
import { SSR_UPDATE_EVENT } from "../../client-marker";
import { DEV_SERVER_BOOT_TIMEOUT_MS, DEV_SERVER_TEST_TIMEOUT_MS, devFetch } from "./dev-server-budget";

const FIXTURE_DIR = resolve(import.meta.dirname, "fixture-islands-only");
const MARKER = '<meta name="pyreon-hydrate" content="islands">';
let server: ViteDevServer;
let baseUrl: string;
const sent: unknown[] = [];
const state = () => `baseUrl=${baseUrl} listening=${Boolean(server?.httpServer?.listening)}`;

beforeAll(async () => {
	server = await createServer({
		root: FIXTURE_DIR,
		configFile: false,
		plugins: [
			pyreon(),
			// `/about` has no `hydrate` export: the rule alone makes it islands-only.
			zeroPlugin({ mode: "ssr", routeRules: { "/about": { hydrate: "islands" } } }),
		],
		resolve: { conditions: ["bun"] },
		ssr: { resolve: { conditions: ["bun"] } },
		optimizeDeps: { noDiscovery: true, include: [] },
		// The test triggers HMR itself (below); the OS watcher would only add noise.
		server: { port: 0, watch: null },
		logLevel: "silent",
	});
	await server.listen();
	const address = server.httpServer?.address();
	if (address && typeof address === "object") baseUrl = `http://localhost:${address.port}`;
	const hot = server.environments.client.hot;
	const send = hot.send.bind(hot) as (...args: unknown[]) => void;
	(hot as { send: (...args: unknown[]) => void }).send = (...args) => {
		sent.push(args[0]);
		send(...args);
	};
}, DEV_SERVER_BOOT_TIMEOUT_MS);

afterAll(async () => {
	await server?.close();
});

const page = async (path: string) =>
	(await devFetch(`${baseUrl}${path}`, `GET ${path}`, { observe: state })).text();

describe("islands-only pages under the dev server", { timeout: DEV_SERVER_TEST_TIMEOUT_MS }, () => {
	it("an islands-only page is marked, keeps its loader output and ships no loader data", async () => {
		const html = await page("/static");
		expect(html).toContain(MARKER);
		expect(html).toContain("STATIC_LOADER_TITLE");
		expect(html).toContain('<pyreon-island data-component="Counter"');
		expect(html).not.toContain("__PYREON_LOADER_DATA__");
	});

	it("an app page is unchanged: loader data, no marker", async () => {
		const html = await page("/");
		expect(html).toContain("APP_LOADER_TITLE");
		expect(html).toContain("__PYREON_LOADER_DATA__");
		expect(html).not.toContain(MARKER);
	});

	it("a routeRules hydrate marks the page it matches", async () => {
		const html = await page("/about");
		expect(html).toContain('data-testid="about-page"');
		expect(html).toContain(MARKER);
	});

	it("an edit to a module the server rendered sends the reload event the client listens for", async () => {
		expect(ISLANDS_ONLY_SSR_UPDATE_EVENT).toBe(SSR_UPDATE_EVENT);
		await page("/static");
		sent.length = 0;
		// What Vite's file watcher does on a save, without touching the committed file.
		server.watcher.emit("change", resolve(FIXTURE_DIR, "src/routes/static.tsx"));
		await expect
			.poll(() => sent.some((p) => (p as { event?: string }).event === SSR_UPDATE_EVENT), { timeout: 10_000 })
			.toBe(true);
		const event = sent.find((p) => (p as { event?: string }).event === SSR_UPDATE_EVENT) as {
			type: string;
			data: { file: string };
		};
		expect(event.type).toBe("custom");
		expect(event.data.file).toBe(resolve(FIXTURE_DIR, "src/routes/static.tsx"));
		// And the page still renders afterwards.
		expect(await page("/static")).toContain(MARKER);
	});

	it("an edit to a file the server never loaded sends nothing", async () => {
		sent.length = 0;
		server.watcher.emit("change", resolve(FIXTURE_DIR, "index.html.unused.ts"));
		await new Promise((r) => setTimeout(r, 300));
		expect(sent.filter((p) => (p as { event?: string }).event === SSR_UPDATE_EVENT)).toEqual([]);
	});
});
