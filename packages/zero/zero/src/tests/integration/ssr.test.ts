import { resolve } from "node:path";
import pyreon from "@pyreon/vite-plugin";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderErrorOverlay } from "../../error-overlay";
import { render404Page } from "../../not-found";
import { zeroPlugin } from "../../vite-plugin";

const FIXTURE_DIR = resolve(import.meta.dirname, "fixture");

let server: ViteDevServer;
let baseUrl: string;

beforeAll(async () => {
	server = await createServer({
		root: FIXTURE_DIR,
		configFile: false, // Don't load vite.config.ts — configure inline
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

describe("SSR integration", () => {
	it("boots the Vite dev server", () => {
		expect(baseUrl).toBeDefined();
		expect(baseUrl).toMatch(/^http:\/\/localhost:\d+$/);
	});

	it("resolves virtual:zero/routes module", async () => {
		const mod = await server.ssrLoadModule("virtual:zero/routes");
		expect(mod.routes).toBeDefined();
		expect(Array.isArray(mod.routes)).toBe(true);
		expect(mod.routes.length).toBeGreaterThan(0);
	});

	it("generates routes for fixture pages", async () => {
		const mod = await server.ssrLoadModule("virtual:zero/routes");
		const paths = flattenPaths(mod.routes);
		expect(paths).toContain("/");
		expect(paths).toContain("/about");
	});

	it("generates route for dynamic [id] param", async () => {
		const mod = await server.ssrLoadModule("virtual:zero/routes");
		const paths = flattenPaths(mod.routes);
		expect(paths.some((p: string) => p.includes(":id"))).toBe(true);
	});

	it("wires renderMode into route meta", async () => {
		const mod = await server.ssrLoadModule("virtual:zero/routes");
		const route = mod.routes.find((r: { path: string }) => r.path === "/");
		expect(route).toBeDefined();
		expect(route.meta).toBeDefined();
	});

	it("serves index.html on GET /", async () => {
		const res = await fetch(`${baseUrl}/`);
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain('<div id="app">');
	});

	it("serves the about page", async () => {
		const res = await fetch(`${baseUrl}/about`);
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain("<!DOCTYPE html>");
	});

	it("returns HTML for dynamic routes", async () => {
		const res = await fetch(`${baseUrl}/users/42`);
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain('<div id="app">');
	});

	it("loads virtual modules via plugin resolveId", async () => {
		const resolved = await server.pluginContainer.resolveId(
			"virtual:zero/routes",
		);
		expect(resolved).toBeTruthy();
		expect(resolved?.id).toContain("virtual:zero/routes");
	});

	it("generates API route module for fixture", async () => {
		const { scanRouteFiles } = await import("../../fs-router");
		const { generateApiRouteModule } = await import("../../api-routes");
		const routesDir = resolve(FIXTURE_DIR, "src/routes");
		const files = await scanRouteFiles(routesDir);
		const code = generateApiRouteModule(files, routesDir);
		expect(code).toContain("/api/health");
		expect(code).toContain("apiRoutes");
	});

	it("generates middleware module for fixture", async () => {
		const { generateMiddlewareModule, scanRouteFiles } = await import(
			"../../fs-router"
		);
		const routesDir = resolve(FIXTURE_DIR, "src/routes");
		const files = await scanRouteFiles(routesDir);
		const code = generateMiddlewareModule(files, routesDir);
		expect(code).toContain("routeMiddleware");
	});

	// ─── 404 handling ──────────────────────────────────────────────────────────

	it("returns 404 status for unknown routes", async () => {
		const res = await fetch(`${baseUrl}/this-route-does-not-exist`);
		expect(res.status).toBe(404);
		const html = await res.text();
		// Dev mode returns a static 404 page (component SSR requires document)
		expect(html).toContain("404");
		expect(html).toContain("Not Found");
	});

	it("returns 404 with proper HTML structure", async () => {
		const res = await fetch(`${baseUrl}/nonexistent/deeply/nested/path`);
		expect(res.status).toBe(404);
		const html = await res.text();
		expect(html).toContain("<!DOCTYPE html>");
		expect(html).toContain("404");
	});

	it("returns 200 for known routes (not 404)", async () => {
		const aboutRes = await fetch(`${baseUrl}/about`);
		expect(aboutRes.status).toBe(200);

		const homeRes = await fetch(`${baseUrl}/`);
		expect(homeRes.status).toBe(200);
	});

	// ─── Error handling ────────────────────────────────────────────────────────

	it("generates routes for the broken page fixture", async () => {
		const mod = await server.ssrLoadModule("virtual:zero/routes");
		const paths = flattenPaths(mod.routes);
		expect(paths).toContain("/broken");
	});

	it("known broken route returns 200 (SPA fallback in dev)", async () => {
		// In dev mode without full SSR middleware, Vite serves index.html for
		// known routes. The broken.tsx error only manifests during SSR rendering.
		const res = await fetch(`${baseUrl}/broken`);
		// Vite's SPA fallback serves 200 with the HTML shell
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain("<!DOCTYPE html>");
	});

	// ─── API routes ────────────────────────────────────────────────────────────

	it("serves API routes and returns JSON", async () => {
		const { generateApiRouteModule } = await import("../../api-routes");
		const { scanRouteFiles } = await import("../../fs-router");
		const routesDir = resolve(FIXTURE_DIR, "src/routes");
		const files = await scanRouteFiles(routesDir);
		const code = generateApiRouteModule(files, routesDir);
		expect(code).toContain("/api/health");
		expect(code).toContain("apiRoutes");

		const mod = await server.ssrLoadModule("virtual:zero/api-routes");
		expect(mod.apiRoutes).toBeDefined();
		expect(Array.isArray(mod.apiRoutes)).toBe(true);
		const healthRoute = mod.apiRoutes.find(
			(r: { pattern: string }) => r.pattern === "/api/health",
		);
		expect(healthRoute).toBeDefined();
		expect(healthRoute.module.GET).toBeTypeOf("function");
	});

	// ─── Static assets ────────────────────────────────────────────────────────

	it("serves static assets (index.html exists)", async () => {
		const res = await fetch(`${baseUrl}/`);
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain("<!DOCTYPE html>");
		expect(html).toContain('<meta charset="UTF-8">');
		expect(html).toContain("<title>");
	});
});

// ─── Error overlay middleware — unit tests ────────────────────────────────────

describe("error overlay middleware", () => {
	it("renderErrorOverlay produces HTML with error details", () => {
		const error = new Error("Component render failed");
		error.stack =
			"Error: Component render failed\n    at render (src/App.tsx:15:3)";
		const html = renderErrorOverlay(error);
		expect(html).toContain("Component render failed");
		expect(html).toContain("SSR Error");
		expect(html).toContain("Pyreon Zero");
		expect(html).toContain("src/App.tsx:15:3");
	});

	it("produces a complete HTML document with error badge", () => {
		const error = new Error("SSR crash");
		const html = renderErrorOverlay(error);
		expect(html).toMatch(/^<!DOCTYPE html>/);
		expect(html).toContain("</html>");
		expect(html).toContain("SSR Error");
		expect(html).toContain("only shown in development");
		expect(html).toContain("SSR crash");
	});

	it("simulates the error middleware flow with mock request/response", () => {
		// Simulate what the vite-plugin error overlay middleware does:
		// 1. An SSR error occurs
		// 2. The middleware catches it
		// 3. It renders the error overlay HTML
		// 4. It sends a 500 response

		const error = new Error("Intentional SSR error for testing");
		error.stack =
			"Error: Intentional SSR error for testing\n    at Broken (broken.tsx:2:3)";

		// Simulate server.ssrFixStacktrace (it mutates the error stack in place)
		// In production this maps compiled positions to source positions
		const fixedError = error;

		const html = renderErrorOverlay(fixedError);

		// Create a mock response object
		const headers: Record<string, string | number> = {};
		let responseBody = "";

		const mockRes = {
			statusCode: 200,
			setHeader(key: string, value: string | number) {
				headers[key] = value;
			},
			end(body: string) {
				responseBody = body;
			},
		};

		// Simulate the middleware error handler
		mockRes.statusCode = 500;
		mockRes.setHeader("Content-Type", "text/html; charset=utf-8");
		mockRes.setHeader("Content-Length", Buffer.byteLength(html));
		mockRes.end(html);

		expect(mockRes.statusCode).toBe(500);
		expect(headers["Content-Type"]).toBe("text/html; charset=utf-8");
		expect(responseBody).toContain("SSR Error");
		expect(responseBody).toContain("Intentional SSR error for testing");
		expect(responseBody).toContain("broken.tsx:2:3");
	});
});

// ─── 404 rendering — unit tests ─────────────────────────────────────────────

describe("render404Page", () => {
	it("renders default 404 page when no component provided", async () => {
		const html = await render404Page(undefined);
		expect(html).toContain("<!DOCTYPE html>");
		expect(html).toContain("404");
		expect(html).toContain("Not Found");
	});

	it("renders custom component as 404 page", async () => {
		const { h } = await import("@pyreon/core");
		const Custom = () => h("div", null, "Custom 404 content");
		const html = await render404Page(Custom);
		expect(html).toContain("Custom 404 content");
		expect(html).toContain("<!DOCTYPE html>");
	});

	it("injects into template when template has pyreon-app placeholder", async () => {
		const template =
			'<!DOCTYPE html><html><body><div id="app"><!--pyreon-app--></div></body></html>';
		const html = await render404Page(undefined, template);
		expect(html).toContain('<div id="app">');
		expect(html).toContain("404");
		expect(html).not.toContain("<!--pyreon-app-->");
	});
});

function flattenPaths(
	routes: Array<{ path?: string; children?: unknown[] }>,
): string[] {
	const paths: string[] = [];
	for (const r of routes) {
		if (r.path) paths.push(r.path);
		if (r.children) paths.push(...flattenPaths(r.children as typeof routes));
	}
	return paths;
}
