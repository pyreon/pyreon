// Route form actions under `vite dev` — the SAME createRequestPipeline code
// production runs: a no-JS form post re-renders the page (with the POST's
// middleware locals/headers, middleware run ONCE), an enhanced (fetch)
// submission answers JSON, and the route's middleware gates the action.
import { resolve } from "node:path";
import pyreon from "@pyreon/vite-plugin";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { actionId } from "../../actions-transform";
import { zeroPlugin } from "../../vite-plugin";
import { DEV_SERVER_BOOT_TIMEOUT_MS, DEV_SERVER_TEST_TIMEOUT_MS, devFetch } from "./dev-server-budget";

const FIXTURE_DIR = resolve(import.meta.dirname, "fixture-dev-form-actions");
const ID = actionId("src/routes/guest.ts", "action");
let server: ViteDevServer;
let baseUrl: string;
const state = () => `baseUrl=${baseUrl} listening=${Boolean(server?.httpServer?.listening)}`;
const counts = () =>
	((globalThis as Record<string, unknown>).__zfCounts ??= { app: 0, route: 0 }) as { app: number; route: number };

beforeAll(async () => {
	server = await createServer({
		root: FIXTURE_DIR,
		configFile: false,
		plugins: [pyreon(), zeroPlugin({ mode: "ssr" })],
		resolve: { conditions: ["bun"] },
		ssr: { resolve: { conditions: ["bun"] } },
		optimizeDeps: { noDiscovery: true, include: [] },
		server: { port: 0 },
		logLevel: "silent",
	});
	await server.listen();
	const address = server.httpServer?.address();
	if (address && typeof address === "object") baseUrl = `http://localhost:${address.port}`;
}, DEV_SERVER_BOOT_TIMEOUT_MS);

afterAll(async () => {
	await server?.close();
});

beforeEach(() => {
	counts().app = 0;
	counts().route = 0;
});

const form = { "content-type": "application/x-www-form-urlencoded", "x-auth": "ok" };

describe("zero dev runs route form actions", { timeout: DEV_SERVER_TEST_TIMEOUT_MS }, () => {
	it("no-JS: a plain page POST runs the route action and re-renders, middleware once", async () => {
		const res = await devFetch(`${baseUrl}/guest?tab=1`, "no-JS form post", {
			observe: state,
			method: "POST",
			headers: { ...form, accept: "text/html" },
			body: "name=ann",
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("x-entry-mw")).toBe("1");
		const html = await res.text();
		expect(html).toContain('<p id="result">added:ann</p>');
		// Locals from the entry middleware reach the re-render…
		expect(html).toContain('<p id="user">alice</p>');
		// …the page query is kept on the re-rendered form…
		expect(html).toContain(`action="?tab=1&amp;_action=${ID}"`);
		// …and neither middleware ran twice.
		expect(counts()).toEqual({ app: 1, route: 1 });
	});

	it("no-JS: fail() re-renders under its status", async () => {
		const res = await devFetch(`${baseUrl}/guest?_action=${ID}`, "no-JS fail", {
			observe: state,
			method: "POST",
			headers: { ...form, accept: "text/html" },
			body: "name=",
		});
		expect(res.status).toBe(422);
		expect(await res.text()).toContain('<p id="result">error:name required</p>');
	});

	it("enhanced: a fetch submission answers JSON", async () => {
		const res = await devFetch(`${baseUrl}/guest?_action=${ID}`, "enhanced submit", {
			observe: state,
			method: "POST",
			headers: { ...form, "x-zero-action": "1", accept: "application/json" },
			body: "name=bea",
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ kind: "data", status: 200, data: { added: "bea" } });
	});

	it("the route middleware gates the action", async () => {
		const res = await devFetch(`${baseUrl}/guest?_action=${ID}`, "gated submit", {
			observe: state,
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded", "x-zero-action": "1" },
			body: "name=mallory",
		});
		expect(res.status).toBe(401);
	});

	it("a cross-origin post is refused", async () => {
		const res = await devFetch(`${baseUrl}/guest?_action=${ID}`, "cross-origin submit", {
			observe: state,
			method: "POST",
			headers: { ...form, origin: "https://evil.example" },
			body: "name=eve",
		});
		expect(res.status).toBe(403);
	});
});
