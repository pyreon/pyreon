// Dev must run the PRODUCTION request pipeline (createRequestPipeline):
// app middleware (the entry's own) → route middleware → framework endpoints
// (`/_pyreon/data`, `/_zero/actions/*`) → page. Pre-fix `vite dev` dispatched
// only fs API routes: the data endpoint and actions answered with the SPA
// shell / 404, route middleware never gated anything, and the entry's own
// middleware (security headers) existed only in production.
import { resolve } from "node:path";
import pyreon from "@pyreon/vite-plugin";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actionId } from "../../actions-transform";
import { zeroPlugin } from "../../vite-plugin";
import { DEV_SERVER_BOOT_TIMEOUT_MS, DEV_SERVER_TEST_TIMEOUT_MS, devFetch } from "./dev-server-budget";

const FIXTURE_DIR = resolve(import.meta.dirname, "fixture-dev-pipeline");
let server: ViteDevServer;
let baseUrl: string;
const state = () => `baseUrl=${baseUrl} listening=${Boolean(server?.httpServer?.listening)}`;

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

describe("zero dev runs the production request pipeline", { timeout: DEV_SERVER_TEST_TIMEOUT_MS }, () => {
	it("route middleware gates the /_pyreon/data endpoint for its page", async () => {
		const denied = await devFetch(`${baseUrl}/_pyreon/data?path=/secret`, "data endpoint, no auth", {
			observe: state,
		});
		expect(denied.status).toBe(401);
		const ok = await devFetch(`${baseUrl}/_pyreon/data?path=/secret`, "data endpoint, authed", {
			observe: state,
			headers: { "x-auth": "ok" },
		});
		expect(ok.status).toBe(200);
		expect(JSON.stringify(await ok.json())).toContain("s3cret");
	});

	it("the entry's own middleware sets page headers and route middleware gates the page", async () => {
		const denied = await devFetch(`${baseUrl}/secret`, "page, no auth", {
			observe: state,
			headers: { accept: "text/html" },
		});
		expect(denied.status).toBe(401);
		const ok = await devFetch(`${baseUrl}/secret`, "page, authed", {
			observe: state,
			headers: { accept: "text/html", "x-auth": "ok" },
		});
		expect(ok.status).toBe(200);
		expect(ok.headers.get("x-entry-mw")).toBe("1");
		expect(await ok.text()).toContain("secret page");
	});

	it("a server action answers at /_zero/actions/* — after the entry middleware", async () => {
		// Actions register when their module evaluates; the home page imports it.
		await devFetch(`${baseUrl}/`, "home (registers the action)", {
			observe: state,
			headers: { accept: "text/html" },
		});
		const id = actionId("src/actions.ts", "echo");
		const res = await devFetch(`${baseUrl}/_zero/actions/${id}`, "action call", {
			observe: state,
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ msg: "hi" }),
		});
		expect(res.status).toBe(200);
		expect(JSON.stringify(await res.json())).toContain('"echoed":"hi"');
		const blocked = await devFetch(`${baseUrl}/_zero/actions/${id}`, "action call, gated", {
			observe: state,
			method: "POST",
			headers: { "content-type": "application/json", "x-block": "1" },
			body: JSON.stringify({ msg: "hi" }),
		});
		expect(blocked.status).toBe(403);
	});
});
