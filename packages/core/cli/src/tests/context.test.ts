import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { generateContext } from "../context"

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pyreon-ctx-"))
  return dir
}

function writeFile(dir: string, relPath: string, content: string): void {
  const full = path.join(dir, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, "utf-8")
}

describe("generateContext", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTmpDir()
    // Every project needs a package.json
    writeFile(
      tmpDir,
      "package.json",
      JSON.stringify({
        name: "test-app",
        version: "1.0.0",
        dependencies: { "@pyreon/core": "^0.4.0" },
      }),
    )
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("extracts routes from createRouter([...]) calls", async () => {
    writeFile(
      tmpDir,
      "src/router.ts",
      `
import { createRouter } from "@pyreon/router"

export default createRouter([
  { path: "/", component: Home },
  { path: "/about", component: About },
])
`,
    )

    const ctx = await generateContext({ cwd: tmpDir })
    expect(ctx.routes).toHaveLength(2)
    expect(ctx.routes[0]?.path).toBe("/")
    expect(ctx.routes[1]?.path).toBe("/about")
  })

  it("extracts route params (:id, :slug)", async () => {
    writeFile(
      tmpDir,
      "src/router.ts",
      `
const routes = [
  { path: "/users/:id", component: User },
  { path: "/posts/:slug/comments/:commentId", component: Comment },
]
`,
    )

    const ctx = await generateContext({ cwd: tmpDir })
    expect(ctx.routes).toHaveLength(2)
    expect(ctx.routes[0]?.params).toEqual(["id"])
    expect(ctx.routes[1]?.params).toEqual(["slug", "commentId"])
  })

  it("detects loader and guard presence on a route", async () => {
    writeFile(
      tmpDir,
      "src/router.ts",
      `
const routes = [
  { path: "/dashboard", component: Dashboard, loader: fetchDashboard, beforeEnter: authGuard },
]
`,
    )

    const ctx = await generateContext({ cwd: tmpDir })
    expect(ctx.routes).toHaveLength(1)

    const dashboard = ctx.routes[0]
    expect(dashboard?.hasLoader).toBe(true)
    expect(dashboard?.hasGuard).toBe(true)
  })

  it("reports no loader/guard when absent", async () => {
    writeFile(
      tmpDir,
      "src/router.ts",
      `
const routes = [
  { path: "/public", component: Public },
]
`,
    )

    const ctx = await generateContext({ cwd: tmpDir })
    expect(ctx.routes).toHaveLength(1)

    const publicRoute = ctx.routes[0]
    expect(publicRoute?.hasLoader).toBe(false)
    expect(publicRoute?.hasGuard).toBe(false)
  })

  it("extracts component names and props", async () => {
    writeFile(
      tmpDir,
      "src/components/Button.tsx",
      `
export function Button({ label, onClick, disabled }) {
  return <button disabled={disabled} onClick={onClick}>{label}</button>
}
`,
    )

    const ctx = await generateContext({ cwd: tmpDir })
    const button = ctx.components.find((c) => c.name === "Button")
    expect(button).toBeDefined()
    expect(button?.props).toContain("label")
    expect(button?.props).toContain("onClick")
    expect(button?.props).toContain("disabled")
  })

  it("detects signal usage in components", async () => {
    writeFile(
      tmpDir,
      "src/components/Counter.tsx",
      `
export function Counter() {
  const count = signal<number>(0)
  const doubled = signal<number>(0)
  return <div>{count()}</div>
}
`,
    )

    const ctx = await generateContext({ cwd: tmpDir })
    const counter = ctx.components.find((c) => c.name === "Counter")
    expect(counter).toBeDefined()
    expect(counter?.hasSignals).toBe(true)
    expect(counter?.signalNames).toContain("count")
    expect(counter?.signalNames).toContain("doubled")
  })

  it("extracts island declarations", async () => {
    writeFile(
      tmpDir,
      "src/islands/Search.tsx",
      `
import { island } from "@pyreon/server"

export const SearchIsland = island(() => import("./SearchWidget"), { name: "Search", hydrate: "visible" })
`,
    )

    const ctx = await generateContext({ cwd: tmpDir })
    expect(ctx.islands).toHaveLength(1)
    expect(ctx.islands[0]?.name).toBe("Search")
    expect(ctx.islands[0]?.file).toBe(path.join("src", "islands", "Search.tsx"))
  })

  it("writes context.json to .pyreon/ directory", async () => {
    writeFile(
      tmpDir,
      "src/App.tsx",
      `
export function App() {
  return <div>Hello</div>
}
`,
    )

    await generateContext({ cwd: tmpDir })

    const outPath = path.join(tmpDir, ".pyreon", "context.json")
    expect(fs.existsSync(outPath)).toBe(true)

    const written = JSON.parse(fs.readFileSync(outPath, "utf-8"))
    expect(written.framework).toBe("pyreon")
    expect(written.version).toBe("0.4.0")
    expect(written.generatedAt).toBeDefined()
    expect(Array.isArray(written.routes)).toBe(true)
    expect(Array.isArray(written.components)).toBe(true)
    expect(Array.isArray(written.islands)).toBe(true)
  })

  it("handles empty project (no routes/components)", async () => {
    // No .tsx files at all, just the package.json
    const ctx = await generateContext({ cwd: tmpDir })

    expect(ctx.routes).toEqual([])
    expect(ctx.components).toEqual([])
    expect(ctx.islands).toEqual([])
    expect(ctx.framework).toBe("pyreon")
  })

  it("skips node_modules and dist directories", async () => {
    writeFile(
      tmpDir,
      "node_modules/@pyreon/core/src/index.tsx",
      `
export function Internal() {
  return <div>internal</div>
}
`,
    )
    writeFile(
      tmpDir,
      "dist/App.tsx",
      `
export function DistApp() {
  return <div>dist</div>
}
`,
    )
    writeFile(
      tmpDir,
      "src/App.tsx",
      `
export function RealApp() {
  return <div>real</div>
}
`,
    )

    const ctx = await generateContext({ cwd: tmpDir })
    const names = ctx.components.map((c) => c.name)
    expect(names).toContain("RealApp")
    expect(names).not.toContain("Internal")
    expect(names).not.toContain("DistApp")
  })

  it("extracts routes from const routes = [...] syntax", async () => {
    writeFile(
      tmpDir,
      "src/router.ts",
      `
const routes: RouteRecord[] = [
  { path: "/home", name: "home", component: Home },
]
`,
    )

    const ctx = await generateContext({ cwd: tmpDir })
    expect(ctx.routes).toHaveLength(1)
    expect(ctx.routes[0]?.path).toBe("/home")
    expect(ctx.routes[0]?.name).toBe("home")
  })

  it("defaults island hydrate to 'load' when not specified", async () => {
    writeFile(
      tmpDir,
      "src/islands/Nav.tsx",
      `
export const NavIsland = island(
  () => import("./NavWidget"),
  { name: "Nav" }
)
`,
    )

    const ctx = await generateContext({ cwd: tmpDir })
    expect(ctx.islands).toHaveLength(1)
    expect(ctx.islands[0]?.hydrate).toBe("load")
  })

  it("ensures .pyreon/ is added to .gitignore", async () => {
    writeFile(tmpDir, ".gitignore", "node_modules/\n")

    await generateContext({ cwd: tmpDir })

    const gitignore = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf-8")
    expect(gitignore).toContain(".pyreon/")
  })

  it("does not duplicate .pyreon/ in .gitignore", async () => {
    writeFile(tmpDir, ".gitignore", "node_modules/\n.pyreon/\n")

    await generateContext({ cwd: tmpDir })

    const gitignore = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf-8")
    const occurrences = gitignore.split(".pyreon/").length - 1
    expect(occurrences).toBe(1)
  })

  it("reads version from @pyreon/* dependency", async () => {
    writeFile(tmpDir, "src/App.tsx", `export function App() { return null }`)

    const ctx = await generateContext({ cwd: tmpDir })
    expect(ctx.version).toBe("0.4.0")
  })

  it("returns 'unknown' version when no package.json exists", async () => {
    const emptyDir = makeTmpDir()
    try {
      const ctx = await generateContext({ cwd: emptyDir })
      expect(ctx.version).toBe("unknown")
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true })
    }
  })

  it("writes to custom outPath when specified", async () => {
    writeFile(tmpDir, "src/App.tsx", `export function App() { return null }`)
    const customOut = path.join(tmpDir, "custom", "output.json")

    await generateContext({ cwd: tmpDir, outPath: customOut })

    expect(fs.existsSync(customOut)).toBe(true)
    const written = JSON.parse(fs.readFileSync(customOut, "utf-8"))
    expect(written.framework).toBe("pyreon")
  })

  it("detects component without signals", async () => {
    writeFile(
      tmpDir,
      "src/Static.tsx",
      `
export function Static({ title }) {
  return <h1>{title}</h1>
}
`,
    )

    const ctx = await generateContext({ cwd: tmpDir })
    const comp = ctx.components.find((c) => c.name === "Static")
    expect(comp).toBeDefined()
    expect(comp?.hasSignals).toBe(false)
    expect(comp?.signalNames).toEqual([])
  })
})
