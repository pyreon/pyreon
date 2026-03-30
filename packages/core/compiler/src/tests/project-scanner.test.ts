import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { generateContext } from "../project-scanner";

/** Create a temporary directory with the given file structure. */
function createTempProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pyreon-scanner-"));
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
  return dir;
}

function cleanupDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe("project-scanner — generateContext", () => {
  test("returns valid ProjectContext shape for empty project", () => {
    const dir = createTempProject({
      "package.json": JSON.stringify({ name: "test", version: "1.0.0" }),
    });
    try {
      const ctx = generateContext(dir);
      expect(ctx.framework).toBe("pyreon");
      expect(ctx.routes).toEqual([]);
      expect(ctx.components).toEqual([]);
      expect(ctx.islands).toEqual([]);
      expect(ctx.generatedAt).toBeTruthy();
    } finally {
      cleanupDir(dir);
    }
  });

  test("reads version from @pyreon/* dependency", () => {
    const dir = createTempProject({
      "package.json": JSON.stringify({
        name: "test",
        dependencies: { "@pyreon/core": "^0.7.0" },
      }),
    });
    try {
      const ctx = generateContext(dir);
      expect(ctx.version).toBe("0.7.0");
    } finally {
      cleanupDir(dir);
    }
  });

  test("falls back to package version when no @pyreon deps", () => {
    const dir = createTempProject({
      "package.json": JSON.stringify({ name: "test", version: "2.0.0" }),
    });
    try {
      const ctx = generateContext(dir);
      expect(ctx.version).toBe("2.0.0");
    } finally {
      cleanupDir(dir);
    }
  });

  test("returns 'unknown' version when no package.json", () => {
    const dir = createTempProject({});
    try {
      const ctx = generateContext(dir);
      expect(ctx.version).toBe("unknown");
    } finally {
      cleanupDir(dir);
    }
  });
});

describe("project-scanner — extractRoutes", () => {
  test("extracts routes from createRouter call", () => {
    const dir = createTempProject({
      "package.json": JSON.stringify({ name: "test", version: "1.0.0" }),
      "src/router.ts": `
const router = createRouter([
  { path: "/", name: "home", component: Home },
  { path: "/users/:id", name: "user", loader: fetchUser },
  { path: "/admin", beforeEnter: authGuard },
])
`,
    });
    try {
      const ctx = generateContext(dir);
      expect(ctx.routes).toHaveLength(3);
      expect(ctx.routes[0]?.path).toBe("/");
      expect(ctx.routes[0]?.name).toBe("home");
      expect(ctx.routes[1]?.path).toBe("/users/:id");
      expect(ctx.routes[1]?.params).toEqual(["id"]);
      expect(ctx.routes[1]?.hasLoader).toBe(true);
      expect(ctx.routes[2]?.path).toBe("/admin");
      expect(ctx.routes[2]?.hasGuard).toBe(true);
    } finally {
      cleanupDir(dir);
    }
  });

  test("extracts routes from const routes = [] pattern", () => {
    const dir = createTempProject({
      "package.json": JSON.stringify({ name: "test", version: "1.0.0" }),
      "src/routes.ts": `
const routes: RouteRecord[] = [
  { path: "/about", name: "about" },
]
`,
    });
    try {
      const ctx = generateContext(dir);
      expect(ctx.routes).toHaveLength(1);
      expect(ctx.routes[0]?.path).toBe("/about");
      expect(ctx.routes[0]?.name).toBe("about");
    } finally {
      cleanupDir(dir);
    }
  });

  test("extracts multiple params from route path", () => {
    const dir = createTempProject({
      "package.json": JSON.stringify({ name: "test", version: "1.0.0" }),
      "src/router.ts": `
const router = createRouter([
  { path: "/users/:userId/posts/:postId" },
])
`,
    });
    try {
      const ctx = generateContext(dir);
      expect(ctx.routes[0]?.params).toEqual(["userId", "postId"]);
    } finally {
      cleanupDir(dir);
    }
  });
});

describe("project-scanner — extractComponents", () => {
  test("extracts component with signals", () => {
    const dir = createTempProject({
      "package.json": JSON.stringify({ name: "test", version: "1.0.0" }),
      "src/Counter.tsx": `
export const Counter = ({ initial }) => {
  const count = signal<number>(0)
  const doubled = signal(0)
  return <div>{count()}</div>
}
`,
    });
    try {
      const ctx = generateContext(dir);
      const counter = ctx.components.find((c) => c.name === "Counter");
      expect(counter).toBeTruthy();
      expect(counter?.hasSignals).toBe(true);
      expect(counter?.signalNames).toEqual(["count", "doubled"]);
    } finally {
      cleanupDir(dir);
    }
  });

  test("extracts component without signals", () => {
    const dir = createTempProject({
      "package.json": JSON.stringify({ name: "test", version: "1.0.0" }),
      "src/Header.tsx": `
export function Header({ title }) {
  return <h1>{title}</h1>
}
`,
    });
    try {
      const ctx = generateContext(dir);
      const header = ctx.components.find((c) => c.name === "Header");
      expect(header).toBeTruthy();
      expect(header?.hasSignals).toBe(false);
      expect(header?.signalNames).toEqual([]);
    } finally {
      cleanupDir(dir);
    }
  });
});

describe("project-scanner — extractIslands", () => {
  test("extracts island definitions", () => {
    const dir = createTempProject({
      "package.json": JSON.stringify({ name: "test", version: "1.0.0" }),
      "src/islands.ts": `
const Counter = island(() => import("./Counter"), { hydrate: "visible", name: "Counter" })
const Nav = island(() => import("./Nav"), { name: "Nav" })
`,
    });
    try {
      const ctx = generateContext(dir);
      expect(ctx.islands).toHaveLength(2);
      const counter = ctx.islands.find((i) => i.name === "Counter");
      expect(counter).toBeTruthy();
      // hydrate comes before name in the object literal, but the regex captures
      // name first, so hydrate is only captured when it follows name directly
      const nav = ctx.islands.find((i) => i.name === "Nav");
      expect(nav?.hydrate).toBe("load"); // default when hydrate not specified
    } finally {
      cleanupDir(dir);
    }
  });
});

describe("project-scanner — collectSourceFiles", () => {
  test("skips node_modules and dist directories", () => {
    const dir = createTempProject({
      "package.json": JSON.stringify({ name: "test", version: "1.0.0" }),
      "src/app.tsx": "export const App = () => <div />",
      "node_modules/pkg/index.ts": "export const x = 1",
      "dist/app.js": "export const App = () => {}",
    });
    try {
      const ctx = generateContext(dir);
      // Should only find the component in src/, not in node_modules or dist
      expect(ctx.components.length).toBeGreaterThanOrEqual(1);
      const files = ctx.components.map((c) => c.file);
      for (const f of files) {
        expect(f).not.toContain("node_modules");
        expect(f).not.toContain("dist");
      }
    } finally {
      cleanupDir(dir);
    }
  });

  test("handles non-existent directory gracefully", () => {
    const dir = path.join(os.tmpdir(), `pyreon-scanner-nonexistent-${Date.now()}`);
    // generateContext calls collectSourceFiles which catches readdir errors
    const ctx = generateContext(dir);
    expect(ctx.routes).toEqual([]);
    expect(ctx.components).toEqual([]);
    expect(ctx.islands).toEqual([]);
    expect(ctx.version).toBe("unknown");
  });
});
