/**
 * Route matching benchmark — measures ops/sec for resolveRoute() against
 * route tables of varying sizes, compared to popular routers.
 *
 * Routers compared:
 *   - @pyreon/router   — compiled segments + static Map
 *   - find-my-way      — radix tree (Fastify)
 *   - hono             — SmartRouter (RegExp + Trie)
 *   - radix3           — radix tree (unjs / Nitro / H3)
 *   - react-router     — matchRoutes (React Router v7)
 *   - @tanstack/router — tree-based matching (TanStack Router)
 *   - vue-router       — router.resolve (Vue Router v4)
 *   - path-to-regexp   — regex matcher (used by Next.js internally)
 *   - radix3           — also used by Nuxt (via Nitro/H3)
 *
 * Usage: bun scripts/bench/core/router.ts
 */

import {
  createRootRoute,
  createRoute,
  createMemoryHistory as createTanStackHistory,
  createRouter as createTanStackRouter,
} from "@tanstack/react-router";
import FindMyWay from "find-my-way";
import { Hono } from "hono";
import { match as ptrMatch } from "next/dist/compiled/path-to-regexp";
import { createRouter as createRadix3 } from "radix3";
import { matchRoutes } from "react-router";
import { createMemoryHistory, createRouter as createVueRouter } from "vue-router";
import { resolveRoute } from "../../../packages/core/router/src/match";
import type { RouteRecord } from "../../../packages/core/router/src/types";

// ─── Noop component (satisfies RouteRecord.component) ────────────────────────

const Noop = () => null;
const VueNoop = { template: "<div/>" };

// ─── Route definitions (shared across all routers) ───────────────────────────

interface RouteDef {
  /** Pattern for Pyreon/find-my-way/radix3 */
  pattern: string;
  /** Flat pattern for routers that don't support nesting (find-my-way, hono, radix3) */
  flat: string;
}

/**
 * Generate a set of route patterns at the given scale.
 * Returns both Pyreon RouteRecords (with nesting) and flat patterns for other routers.
 */
function generateRoutes(count: number): {
  pyreonRoutes: RouteRecord[];
  flatDefs: RouteDef[];
  urls: TestUrl[];
} {
  const pyreonRoutes: RouteRecord[] = [];
  const flatDefs: RouteDef[] = [];
  const urls: TestUrl[] = [];

  // Fixed core routes
  const coreStatic = ["/about", "/pricing", "/contact", "/terms"];
  pyreonRoutes.push({ path: "/", component: Noop });
  flatDefs.push({ pattern: "/", flat: "/" });
  for (const p of coreStatic) {
    pyreonRoutes.push({ path: p, component: Noop });
    flatDefs.push({ pattern: p, flat: p });
  }

  // Dynamic routes
  const coreDynamic: RouteDef[] = [
    { pattern: "/user/:id", flat: "/user/:id" },
    { pattern: "/post/:id", flat: "/post/:id" },
    { pattern: "/post/:id/comment/:commentId", flat: "/post/:id/comment/:commentId" },
  ];
  for (const d of coreDynamic) {
    pyreonRoutes.push({ path: d.pattern, component: Noop });
    flatDefs.push(d);
  }

  // Nested routes (Pyreon-specific nesting, flattened for others)
  pyreonRoutes.push({
    path: "/admin",
    component: Noop,
    children: [
      { path: "dashboard", component: Noop },
      {
        path: "users",
        component: Noop,
        children: [
          { path: ":id", component: Noop },
          { path: ":id/settings", component: Noop },
        ],
      },
    ],
  });
  flatDefs.push(
    { pattern: "/admin/dashboard", flat: "/admin/dashboard" },
    { pattern: "/admin/users/:id", flat: "/admin/users/:id" },
    { pattern: "/admin/users/:id/settings", flat: "/admin/users/:id/settings" },
  );

  // Wildcard
  pyreonRoutes.push({ path: "/files/:path*", component: Noop });
  flatDefs.push({ pattern: "/files/:path*", flat: "/files/*" });

  // Pad to desired count
  let i = pyreonRoutes.length;
  while (i < count) {
    if (i % 3 === 0) {
      const p = `/page-${i}`;
      pyreonRoutes.push({ path: p, component: Noop });
      flatDefs.push({ pattern: p, flat: p });
    } else if (i % 3 === 1) {
      const p = `/entity-${i}/:id`;
      pyreonRoutes.push({ path: p, component: Noop });
      flatDefs.push({ pattern: p, flat: p });
    } else {
      pyreonRoutes.push({
        path: `/group-${i}`,
        component: Noop,
        children: [
          { path: "list", component: Noop },
          { path: ":id", component: Noop },
        ],
      });
      flatDefs.push(
        { pattern: `/group-${i}/list`, flat: `/group-${i}/list` },
        { pattern: `/group-${i}/:id`, flat: `/group-${i}/:id` },
      );
    }
    i++;
  }

  // Wildcard fallback
  pyreonRoutes.push({ path: "(.*)", component: Noop });

  // Test URLs
  urls.push(
    { label: "static (root)", path: "/" },
    { label: "static (early)", path: "/about" },
    { label: "static (mid)", path: "/pricing" },
    { label: "dynamic (1 param)", path: "/user/42" },
    { label: "dynamic (2 params)", path: "/post/123/comment/456" },
    { label: "nested (2 deep)", path: "/admin/dashboard" },
    { label: "nested (3 deep)", path: "/admin/users/99/settings" },
    { label: "wildcard", path: "/files/docs/2024/report.pdf" },
  );

  if (count >= 50) {
    const lateIdx = Math.floor(count * 0.8);
    const lateRoute = pyreonRoutes[lateIdx];
    if (lateRoute && !lateRoute.path.includes(":") && !lateRoute.path.includes("*")) {
      urls.push({ label: "static (late)", path: lateRoute.path });
    }
  }

  return { pyreonRoutes, flatDefs, urls };
}

// ─── Router setup helpers ────────────────────────────────────────────────────

function setupFindMyWay(flatDefs: RouteDef[]): FindMyWay.Instance<FindMyWay.HTTPVersion.V1> {
  const router = FindMyWay();
  for (const d of flatDefs) {
    router.on("GET", d.flat, () => null);
  }
  router.on("GET", "/*", () => null);
  return router;
}

function setupHono(flatDefs: RouteDef[]): Hono {
  const app = new Hono();
  for (const d of flatDefs) {
    app.get(d.flat, (c) => c.text(""));
  }
  app.get("/*", (c) => c.text(""));
  return app;
}

function setupRadix3(flatDefs: RouteDef[]) {
  const router = createRadix3();
  for (const d of flatDefs) {
    const path = d.flat.endsWith("/*") ? `${d.flat.slice(0, -1)}**` : d.flat;
    router.insert(path, { handler: d.pattern });
  }
  router.insert("/**", { handler: "catch-all" });
  return router;
}

function setupReactRouter(flatDefs: RouteDef[]) {
  // React Router supports nested routes but we use flat for fair comparison
  const routes = flatDefs.map((d) => ({
    path: d.flat === "/*" ? "*" : d.flat,
    element: null,
  }));
  // Add catch-all
  routes.push({ path: "*", element: null });
  return routes;
}

/**
 * Convert `:param` to `$param` and `:param*` splat to `$` for TanStack Router syntax.
 */
function toTanStackPath(flat: string): string {
  if (flat === "/*" || flat === "/files/*") return flat.replace("/*", "/$");
  // Replace :param* with $ (splat) and :param with $param
  return flat.replace(/:(\w+)\*/g, "$").replace(/:(\w+)/g, (_m, name) => `$${name}`);
}

function setupTanStack(flatDefs: RouteDef[]) {
  const rootRoute = createRootRoute();

  const childRoutes = flatDefs.map((d) => {
    const tsPath = toTanStackPath(d.flat);
    return createRoute({ getParentRoute: () => rootRoute, path: tsPath });
  });

  const routeTree = rootRoute.addChildren(childRoutes);
  const router = createTanStackRouter({
    routeTree,
    history: createTanStackHistory({ initialEntries: ["/"] }),
  });
  return router;
}

function setupVueRouter(flatDefs: RouteDef[]) {
  const routes = flatDefs.map((d) => ({
    path: d.flat === "/*" ? "/:pathMatch(.*)*" : d.flat,
    component: VueNoop,
  }));
  routes.push({ path: "/:pathMatch(.*)*", component: VueNoop });
  return createVueRouter({ history: createMemoryHistory(), routes });
}

function toPtrPattern(flat: string): string {
  if (flat === "/*" || flat === "/files/*") return "/(.*)";
  return flat;
}

function setupPathToRegexp(flatDefs: RouteDef[]) {
  // Pre-compile all matchers (same as Next.js does at build time)
  const matchers = flatDefs.map((d) => ({
    pattern: d.flat,
    match: ptrMatch(toPtrPattern(d.flat)),
  }));
  matchers.push({ pattern: "/(.*)", match: ptrMatch("/(.*)") });

  // Return a function that tries each matcher in order (linear, like Next.js pages router)
  return (path: string) => {
    for (const m of matchers) {
      const result = m.match(path);
      if (result) return result;
    }
    return false;
  };
}

// ─── Benchmark harness ───────────────────────────────────────────────────────

interface TestUrl {
  label: string;
  path: string;
}

interface BenchResult {
  label: string;
  opsPerSec: number;
  avgNs: number;
}

function benchOps(label: string, fn: () => void, durationMs = 2000): BenchResult {
  // Warmup
  const warmEnd = performance.now() + 500;
  while (performance.now() < warmEnd) fn();

  // Timed
  let ops = 0;
  const start = performance.now();
  const end = start + durationMs;
  while (performance.now() < end) {
    fn();
    ops++;
  }
  const elapsed = performance.now() - start;
  return {
    label,
    opsPerSec: Math.round((ops / elapsed) * 1000),
    avgNs: Math.round((elapsed / ops) * 1e6),
  };
}

function fmtOps(n: number): string {
  return n.toLocaleString();
}

// ─── Run comparison ──────────────────────────────────────────────────────────

interface RouterEntry {
  name: string;
  matchFn: (path: string) => unknown;
}

const SIZES = [10, 50, 200];
const COL_W = 14;
const LABEL_W = 24;

console.log("Router Matching Benchmark (Bun)");
console.log(
  "Pyreon · find-my-way · Hono · radix3 (Nuxt) · React Router · TanStack · Vue Router · Next.js*",
);
console.log("* Next.js uses path-to-regexp internally (pre-compiled, linear scan)");
console.log(`${"=".repeat(LABEL_W + COL_W * 8 + 2)}\n`);

for (const size of SIZES) {
  const { pyreonRoutes, flatDefs, urls } = generateRoutes(size);

  // Setup all routers
  const fmw = setupFindMyWay(flatDefs);
  const hono = setupHono(flatDefs);
  const honoRouter = hono.router;
  const radix3 = setupRadix3(flatDefs);
  const reactRoutes = setupReactRouter(flatDefs);
  const tanstack = setupTanStack(flatDefs);
  const vueRouter = setupVueRouter(flatDefs);

  const ptr = setupPathToRegexp(flatDefs);

  const routers: RouterEntry[] = [
    { name: "Pyreon", matchFn: (p) => resolveRoute(p, pyreonRoutes) },
    { name: "find-my-way", matchFn: (p) => fmw.find("GET", p) },
    { name: "Hono", matchFn: (p) => honoRouter.match("GET", p) },
    { name: "radix3 (Nuxt)", matchFn: (p) => radix3.lookup(p) },
    { name: "React Router", matchFn: (p) => matchRoutes(reactRoutes, p) },
    { name: "TanStack", matchFn: (p) => tanstack.matchRoutes(p) },
    { name: "Vue Router", matchFn: (p) => vueRouter.resolve(p) },
    { name: "Next.js*", matchFn: (p) => ptr(p) },
  ];

  console.log(`Route table: ${size} routes`);
  const header = `  ${"test".padEnd(LABEL_W)}${routers.map((r) => r.name.padStart(COL_W)).join("")}`;
  console.log(header);
  console.log(`  ${"-".repeat(LABEL_W + COL_W * routers.length)}`);

  const totals: number[] = routers.map(() => 0);

  for (const url of urls) {
    const results: BenchResult[] = routers.map((r) =>
      benchOps(url.label, () => r.matchFn(url.path)),
    );

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r) totals[j] += r.opsPerSec;
    }

    const line = `  ${url.label.padEnd(LABEL_W)}${results.map((r) => fmtOps(r.opsPerSec).padStart(COL_W)).join("")}`;
    console.log(line);
  }

  // Averages
  const count = urls.length;
  const averages = totals.map((t) => Math.round(t / count));
  console.log(`  ${"-".repeat(LABEL_W + COL_W * routers.length)}`);
  console.log(
    `  ${"average".padEnd(LABEL_W)}${averages.map((a) => fmtOps(a).padStart(COL_W)).join("")}`,
  );

  // Slowdown vs best
  const best = Math.max(...averages);
  console.log(
    `  ${"vs best".padEnd(LABEL_W)}${averages.map((a) => `${(best / a).toFixed(2)}x`.padStart(COL_W)).join("")}`,
  );
  console.log();
}
