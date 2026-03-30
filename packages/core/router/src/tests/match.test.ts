import {
  buildNameIndex,
  buildPath,
  findRouteByName,
  matchPath,
  parseQuery,
  parseQueryMulti,
  resolveRoute,
  stringifyQuery,
} from "../match";
import type { RouteRecord } from "../types";

const Home = () => null;
const About = () => null;
const User = () => null;
const NotFound = () => null;

// ─── parseQuery — edge cases ─────────────────────────────────────────────────

describe("parseQuery — edge cases", () => {
  test("handles URI-encoded keys", () => {
    expect(parseQuery("hello%20world=value")).toEqual({ "hello world": "value" });
  });

  test("handles multiple equals signs in value", () => {
    // Only the first `=` is the delimiter
    expect(parseQuery("expr=a=b")).toEqual({ expr: "a=b" });
  });

  test("last value wins for duplicate keys", () => {
    expect(parseQuery("a=1&a=2")).toEqual({ a: "2" });
  });

  test("handles empty key (skipped)", () => {
    // "=value" has empty key, should be skipped
    expect(parseQuery("=value")).toEqual({});
  });

  test("handles key-only entry with no equals", () => {
    expect(parseQuery("active")).toEqual({ active: "" });
  });

  test("handles mixed entries", () => {
    expect(parseQuery("a=1&flag&b=2")).toEqual({ a: "1", flag: "", b: "2" });
  });

  test("decodes both keys and values", () => {
    expect(parseQuery("na%2Fme=val%26ue")).toEqual({ "na/me": "val&ue" });
  });
});

// ─── parseQueryMulti ─────────────────────────────────────────────────────────

describe("parseQueryMulti", () => {
  test("returns empty object for empty string", () => {
    expect(parseQueryMulti("")).toEqual({});
  });

  test("single value stays as string", () => {
    expect(parseQueryMulti("color=red")).toEqual({ color: "red" });
  });

  test("duplicate keys become arrays", () => {
    expect(parseQueryMulti("color=red&color=blue")).toEqual({ color: ["red", "blue"] });
  });

  test("triple duplicate keys become array of three", () => {
    expect(parseQueryMulti("a=1&a=2&a=3")).toEqual({ a: ["1", "2", "3"] });
  });

  test("mixed single and multi values", () => {
    expect(parseQueryMulti("color=red&color=blue&size=lg")).toEqual({
      color: ["red", "blue"],
      size: "lg",
    });
  });

  test("key without value", () => {
    expect(parseQueryMulti("flag")).toEqual({ flag: "" });
  });

  test("key without value duplicated", () => {
    expect(parseQueryMulti("flag&flag")).toEqual({ flag: ["", ""] });
  });

  test("empty key is skipped", () => {
    expect(parseQueryMulti("=value")).toEqual({});
  });

  test("decodes URI-encoded keys and values", () => {
    expect(parseQueryMulti("na%2Fme=val%26ue")).toEqual({ "na/me": "val&ue" });
  });
});

// ─── stringifyQuery — edge cases ─────────────────────────────────────────────

describe("stringifyQuery — edge cases", () => {
  test("encodes special characters", () => {
    const result = stringifyQuery({ "key with space": "value&more" });
    expect(result).toBe("?key%20with%20space=value%26more");
  });

  test("handles single key-value pair", () => {
    expect(stringifyQuery({ page: "1" })).toBe("?page=1");
  });

  test("handles key with empty value", () => {
    expect(stringifyQuery({ debug: "" })).toBe("?debug");
  });
});

// ─── matchPath — edge cases ──────────────────────────────────────────────────

describe("matchPath — edge cases", () => {
  test("splat param captures remaining path", () => {
    const result = matchPath("/files/:path*", "/files/a/b/c");
    expect(result).toEqual({ path: "a/b/c" });
  });

  test("splat param captures single segment", () => {
    const result = matchPath("/files/:path*", "/files/readme.txt");
    expect(result).toEqual({ path: "readme.txt" });
  });

  test("optional param matches with value", () => {
    const result = matchPath("/user/:id?", "/user/42");
    expect(result).toEqual({ id: "42" });
  });

  test("optional param matches without value", () => {
    const result = matchPath("/user/:id?", "/user");
    expect(result).toEqual({});
  });

  test("returns null for too many path segments", () => {
    expect(matchPath("/a/b", "/a/b/c")).toBeNull();
  });

  test("exact static match returns empty params", () => {
    expect(matchPath("/about", "/about")).toEqual({});
  });

  test("root path matches root pattern", () => {
    expect(matchPath("/", "/")).toEqual({});
  });

  test("mismatched static segment returns null", () => {
    expect(matchPath("/foo", "/bar")).toBeNull();
  });

  test("decodes URI-encoded segments", () => {
    const result = matchPath("/user/:name", "/user/hello%20world");
    expect(result).toEqual({ name: "hello world" });
  });

  test("multiple params in a row", () => {
    const result = matchPath("/:a/:b/:c", "/x/y/z");
    expect(result).toEqual({ a: "x", b: "y", c: "z" });
  });
});

// ─── resolveRoute — edge cases ───────────────────────────────────────────────

describe("resolveRoute — edge cases", () => {
  const routes: RouteRecord[] = [
    { path: "/", component: Home },
    { path: "/about", component: About },
    { path: "/user/:id", component: User },
    {
      path: "/admin",
      component: Home,
      meta: { requiresAuth: true },
      children: [
        { path: "users", component: User },
        { path: "settings", component: About },
      ],
    },
    { path: "*", component: NotFound },
  ];

  test("resolves root path with empty query", () => {
    const r = resolveRoute("/", routes);
    expect(r.path).toBe("/");
    expect(r.params).toEqual({});
    expect(r.query).toEqual({});
    expect(r.hash).toBe("");
  });

  test("resolves path with query and hash in path portion", () => {
    // Hash in the path portion (before ?) is extracted from pathAndHash
    const r = resolveRoute("/about#section?key=val", routes);
    expect(r.path).toBe("/about");
    expect(r.hash).toBe("section");
    expect(r.query).toEqual({ key: "val" });
  });

  test("resolves path with query containing hash (hash after query)", () => {
    // When hash follows query: /about?key=val#section
    // The # is part of the query value since ? comes first
    const r = resolveRoute("/about?key=val#section", routes);
    expect(r.path).toBe("/about");
    // The hash ends up in the query value since it's after the ?
    expect(r.query.key).toContain("val");
  });

  test("resolves nested route with merged meta", () => {
    const r = resolveRoute("/admin/users", routes);
    expect(r.matched.length).toBe(2);
    expect(r.meta.requiresAuth).toBe(true);
  });

  test("resolves dynamic param route", () => {
    const r = resolveRoute("/user/123", routes);
    expect(r.params.id).toBe("123");
    expect(r.matched.length).toBeGreaterThan(0);
  });

  test("wildcard catches unmatched paths", () => {
    const r = resolveRoute("/totally/unknown/path", routes);
    expect(r.matched.length).toBeGreaterThan(0);
    expect(r.matched[r.matched.length - 1]?.component).toBe(NotFound);
  });

  test("returns empty matched for no match without wildcard", () => {
    const simpleRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      { path: "/about", component: About },
    ];
    const r = resolveRoute("/nonexistent", simpleRoutes);
    expect(r.matched).toHaveLength(0);
  });

  test("resolves path with hash before query (edge case)", () => {
    // hash in the path portion (before ?), query is separate
    const r = resolveRoute("/#anchor?key=val", routes);
    expect(r.hash).toBe("anchor");
  });

  test("resolves deeply nested routes", () => {
    const deepRoutes: RouteRecord[] = [
      {
        path: "/a",
        component: Home,
        children: [
          {
            path: "b",
            component: About,
            children: [{ path: "c", component: User }],
          },
        ],
      },
    ];
    const r = resolveRoute("/a/b/c", deepRoutes);
    expect(r.matched.length).toBe(3);
  });

  test("optional param route matches with and without param", () => {
    const optRoutes: RouteRecord[] = [{ path: "/page/:slug?", component: Home }];
    const withParam = resolveRoute("/page/about", optRoutes);
    expect(withParam.params.slug).toBe("about");

    const withoutParam = resolveRoute("/page", optRoutes);
    expect(withoutParam.matched.length).toBeGreaterThan(0);
  });

  test("splat route captures all remaining segments", () => {
    const splatRoutes: RouteRecord[] = [{ path: "/docs/:rest*", component: Home }];
    const r = resolveRoute("/docs/api/reference/types", splatRoutes);
    expect(r.params.rest).toBe("api/reference/types");
  });

  test("caches compiled routes (same reference gives same result)", () => {
    const r1 = resolveRoute("/about", routes);
    const r2 = resolveRoute("/about", routes);
    expect(r1.path).toBe(r2.path);
    expect(r1.matched.length).toBe(r2.matched.length);
  });
});

// ─── resolveRoute — alias support ────────────────────────────────────────────

describe("resolveRoute — alias", () => {
  test("alias string resolves to same component", () => {
    const aliasRoutes: RouteRecord[] = [
      { path: "/user/:id", alias: "/profile/:id", component: User },
    ];
    const r = resolveRoute("/profile/42", aliasRoutes);
    expect(r.matched.length).toBeGreaterThan(0);
    expect(r.matched[0]?.component).toBe(User);
    expect(r.params.id).toBe("42");
  });

  test("alias array resolves multiple paths to same component", () => {
    const aliasRoutes: RouteRecord[] = [
      { path: "/home", alias: ["/index", "/main"], component: Home },
    ];
    const r1 = resolveRoute("/index", aliasRoutes);
    const r2 = resolveRoute("/main", aliasRoutes);
    expect(r1.matched[0]?.component).toBe(Home);
    expect(r2.matched[0]?.component).toBe(Home);
  });

  test("primary path still works with alias defined", () => {
    const aliasRoutes: RouteRecord[] = [{ path: "/home", alias: "/index", component: Home }];
    const r = resolveRoute("/home", aliasRoutes);
    expect(r.matched[0]?.component).toBe(Home);
  });
});

// ─── buildPath — edge cases ──────────────────────────────────────────────────

describe("buildPath — edge cases", () => {
  test("omits segment for missing optional param", () => {
    const result = buildPath("/user/:id?", {});
    expect(result).toBe("/user");
  });

  test("includes segment for provided optional param", () => {
    const result = buildPath("/user/:id?", { id: "42" });
    expect(result).toBe("/user/42");
  });

  test("splat param preserves slashes", () => {
    // buildPath regex captures the full param name including * via [^/]+
    // so the key in params must match what the regex captures
    const result = buildPath("/docs/:path*", { "path*": "api/reference/types" });
    expect(result).toBe("/docs/api/reference/types");
  });

  test("encodes special characters in params", () => {
    const result = buildPath("/user/:name", { name: "hello world" });
    expect(result).toBe("/user/hello%20world");
  });

  test("handles path with no params", () => {
    const result = buildPath("/about", {});
    expect(result).toBe("/about");
  });

  test("handles root path", () => {
    const result = buildPath("/", {});
    expect(result).toBe("/");
  });

  test("encodes splat param segments individually", () => {
    // buildPath regex captures full param name including * via [^/]+
    const result = buildPath("/files/:path*", { "path*": "dir/my file.txt" });
    expect(result).toBe("/files/dir/my%20file.txt");
  });
});

// ─── findRouteByName — edge cases ────────────────────────────────────────────

describe("findRouteByName — edge cases", () => {
  test("finds deeply nested route", () => {
    const routes: RouteRecord[] = [
      {
        path: "/a",
        component: Home,
        children: [
          {
            path: "b",
            component: About,
            children: [{ path: "c", component: User, name: "deep" }],
          },
        ],
      },
    ];
    const found = findRouteByName("deep", routes);
    expect(found).not.toBeNull();
    expect(found?.path).toBe("c");
  });

  test("returns first match in definition order", () => {
    const routes: RouteRecord[] = [
      { path: "/first", component: Home, name: "dup" },
      { path: "/second", component: About, name: "dup" },
    ];
    const found = findRouteByName("dup", routes);
    expect(found?.path).toBe("/first");
  });

  test("returns null for empty routes array", () => {
    expect(findRouteByName("anything", [])).toBeNull();
  });
});

// ─── buildNameIndex — edge cases ─────────────────────────────────────────────

describe("buildNameIndex — edge cases", () => {
  test("handles empty routes", () => {
    const index = buildNameIndex([]);
    expect(index.size).toBe(0);
  });

  test("does not index routes without names", () => {
    const routes: RouteRecord[] = [
      { path: "/", component: Home },
      { path: "/about", component: About },
    ];
    const index = buildNameIndex(routes);
    expect(index.size).toBe(0);
  });

  test("indexes deeply nested named routes", () => {
    const routes: RouteRecord[] = [
      {
        path: "/a",
        component: Home,
        name: "a",
        children: [
          {
            path: "b",
            component: About,
            name: "b",
            children: [{ path: "c", component: User, name: "c" }],
          },
        ],
      },
    ];
    const index = buildNameIndex(routes);
    expect(index.size).toBe(3);
    expect(index.get("c")?.path).toBe("c");
  });
});

// ─── resolveRoute — dynamic first segment ────────────────────────────────────

describe("resolveRoute — dynamic first segment routing", () => {
  test("matches route where first segment is a param", () => {
    const routes: RouteRecord[] = [{ path: "/:lang/about", component: About }];
    const r = resolveRoute("/en/about", routes);
    expect(r.matched.length).toBeGreaterThan(0);
    expect(r.params.lang).toBe("en");
  });

  test("static routes take priority over dynamic first segment", () => {
    const routes: RouteRecord[] = [
      { path: "/about", component: About },
      { path: "/:slug", component: User },
    ];
    const r = resolveRoute("/about", routes);
    expect(r.matched[0]?.component).toBe(About);
  });
});

// ─── resolveRoute — wildcard children ────────────────────────────────────────

describe("resolveRoute — wildcard patterns", () => {
  test("(.*) catches any path", () => {
    const routes: RouteRecord[] = [
      { path: "/", component: Home },
      { path: "(.*)", component: NotFound },
    ];
    const r = resolveRoute("/any/path/here", routes);
    expect(r.matched[r.matched.length - 1]?.component).toBe(NotFound);
  });

  test("* catches any path", () => {
    const routes: RouteRecord[] = [
      { path: "/", component: Home },
      { path: "*", component: NotFound },
    ];
    const r = resolveRoute("/any/path/here", routes);
    expect(r.matched[r.matched.length - 1]?.component).toBe(NotFound);
  });
});
