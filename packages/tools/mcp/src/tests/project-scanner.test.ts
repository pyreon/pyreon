import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { generateContext } from "../project-scanner"

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pyreon-scanner-"))
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
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("returns correct framework and version from @pyreon dependency", () => {
    writeFile(
      tmpDir,
      "package.json",
      JSON.stringify({ dependencies: { "@pyreon/core": "^1.2.3" } }),
    )
    const ctx = generateContext(tmpDir)
    expect(ctx.framework).toBe("pyreon")
    expect(ctx.version).toBe("1.2.3")
    expect(ctx.generatedAt).toBeTruthy()
  })

  it("falls back to package version when no @pyreon dep", () => {
    writeFile(tmpDir, "package.json", JSON.stringify({ version: "0.5.0" }))
    const ctx = generateContext(tmpDir)
    expect(ctx.version).toBe("0.5.0")
  })

  it("returns unknown version when no package.json", () => {
    const ctx = generateContext(tmpDir)
    expect(ctx.version).toBe("unknown")
  })

  it("extracts routes from createRouter calls", () => {
    writeFile(tmpDir, "package.json", JSON.stringify({ version: "1.0.0" }))
    writeFile(
      tmpDir,
      "src/router.ts",
      `
import { createRouter } from "@pyreon/router"
const router = createRouter([
  { path: "/", component: Home },
  { path: "/about", component: About },
])
`,
    )
    const ctx = generateContext(tmpDir)
    expect(ctx.routes).toHaveLength(2)
    expect(ctx.routes[0]?.path).toBe("/")
    expect(ctx.routes[1]?.path).toBe("/about")
  })

  it("extracts routes from routes variable", () => {
    writeFile(tmpDir, "package.json", JSON.stringify({ version: "1.0.0" }))
    writeFile(
      tmpDir,
      "src/routes.ts",
      `
const routes = [
  { path: "/home", component: Home },
]
`,
    )
    const ctx = generateContext(tmpDir)
    expect(ctx.routes).toHaveLength(1)
    expect(ctx.routes[0]?.path).toBe("/home")
  })

  it("extracts route params", () => {
    writeFile(tmpDir, "package.json", JSON.stringify({ version: "1.0.0" }))
    writeFile(
      tmpDir,
      "src/router.ts",
      `
const routes = [
  { path: "/users/:id/posts/:postId" },
]
`,
    )
    const ctx = generateContext(tmpDir)
    expect(ctx.routes[0]?.params).toEqual(["id", "postId"])
  })

  it("extracts optional route params", () => {
    writeFile(tmpDir, "package.json", JSON.stringify({ version: "1.0.0" }))
    writeFile(
      tmpDir,
      "src/router.ts",
      `
const routes = [
  { path: "/search/:query?" },
]
`,
    )
    const ctx = generateContext(tmpDir)
    expect(ctx.routes[0]?.params).toEqual(["query"])
  })

  it("detects loaders and guards", () => {
    writeFile(tmpDir, "package.json", JSON.stringify({ version: "1.0.0" }))
    writeFile(
      tmpDir,
      "src/router.ts",
      `
const routes = [
  { path: "/dash", loader: fetchData, beforeEnter: authGuard },
]
`,
    )
    const ctx = generateContext(tmpDir)
    expect(ctx.routes[0]?.hasLoader).toBe(true)
    expect(ctx.routes[0]?.hasGuard).toBe(true)
  })

  it("detects beforeLeave guard", () => {
    writeFile(tmpDir, "package.json", JSON.stringify({ version: "1.0.0" }))
    writeFile(
      tmpDir,
      "src/router.ts",
      `
const routes = [
  { path: "/form", beforeLeave: confirmLeave },
]
`,
    )
    const ctx = generateContext(tmpDir)
    expect(ctx.routes[0]?.hasGuard).toBe(true)
  })

  it("extracts route names", () => {
    writeFile(tmpDir, "package.json", JSON.stringify({ version: "1.0.0" }))
    writeFile(
      tmpDir,
      "src/router.ts",
      `
const routes = [
  { path: "/profile", name: "profile", component: Profile },
]
`,
    )
    const ctx = generateContext(tmpDir)
    expect(ctx.routes[0]?.name).toBe("profile")
  })

  it("extracts component names with props", () => {
    writeFile(tmpDir, "package.json", JSON.stringify({ version: "1.0.0" }))
    writeFile(
      tmpDir,
      "src/Button.tsx",
      `
export function Button(props: { label: string; disabled: boolean }) {
  return <button>{props.label}</button>
}
`,
    )
    const ctx = generateContext(tmpDir)
    expect(ctx.components).toHaveLength(1)
    expect(ctx.components[0]?.name).toBe("Button")
    expect(ctx.components[0]?.file).toBe("src/Button.tsx")
  })

  it("detects signals in components", () => {
    writeFile(tmpDir, "package.json", JSON.stringify({ version: "1.0.0" }))
    writeFile(
      tmpDir,
      "src/Counter.tsx",
      `
function Counter() {
  const count = signal<number>(0)
  const name = signal<string>("hello")
  return <div>{count()}</div>
}
`,
    )
    const ctx = generateContext(tmpDir)
    expect(ctx.components[0]?.hasSignals).toBe(true)
    expect(ctx.components[0]?.signalNames).toEqual(["count", "name"])
  })

  it("reports no signals when none present", () => {
    writeFile(tmpDir, "package.json", JSON.stringify({ version: "1.0.0" }))
    writeFile(
      tmpDir,
      "src/Static.tsx",
      `
function Static() {
  return <div>hello</div>
}
`,
    )
    const ctx = generateContext(tmpDir)
    expect(ctx.components[0]?.hasSignals).toBe(false)
    expect(ctx.components[0]?.signalNames).toEqual([])
  })

  it("extracts island declarations with hydrate strategy", () => {
    writeFile(tmpDir, "package.json", JSON.stringify({ version: "1.0.0" }))
    writeFile(
      tmpDir,
      "src/islands.ts",
      `
const Counter = island(() => import("./Counter"), { name: "Counter", hydrate: "visible" })
const Nav = island(() => import("./Nav"), { name: "Nav", hydrate: "idle" })
`,
    )
    const ctx = generateContext(tmpDir)
    expect(ctx.islands).toHaveLength(2)
    expect(ctx.islands[0]?.name).toBe("Counter")
    expect(ctx.islands[1]?.name).toBe("Nav")
  })

  it("defaults hydrate to load when not specified", () => {
    writeFile(tmpDir, "package.json", JSON.stringify({ version: "1.0.0" }))
    writeFile(
      tmpDir,
      "src/islands.ts",
      `
const Widget = island(() => import("./Widget"), { name: "Widget" })
`,
    )
    const ctx = generateContext(tmpDir)
    expect(ctx.islands[0]?.hydrate).toBe("load")
  })

  it("returns empty arrays for empty project", () => {
    writeFile(tmpDir, "package.json", JSON.stringify({ version: "1.0.0" }))
    const ctx = generateContext(tmpDir)
    expect(ctx.routes).toEqual([])
    expect(ctx.components).toEqual([])
    expect(ctx.islands).toEqual([])
  })

  it("skips node_modules and dist directories", () => {
    writeFile(tmpDir, "package.json", JSON.stringify({ version: "1.0.0" }))
    writeFile(
      tmpDir,
      "node_modules/@pyreon/core/src/index.ts",
      `function Internal() { return null }`,
    )
    writeFile(tmpDir, "dist/bundle.ts", `function Bundled() { return null }`)
    writeFile(tmpDir, "src/App.tsx", `function App() { return <div /> }`)
    const ctx = generateContext(tmpDir)
    expect(ctx.components).toHaveLength(1)
    expect(ctx.components[0]?.name).toBe("App")
  })

  it("handles unreadable directories gracefully", () => {
    writeFile(tmpDir, "package.json", JSON.stringify({ version: "1.0.0" }))
    writeFile(tmpDir, "src/App.tsx", `function App() { return <div /> }`)
    const badDir = path.join(tmpDir, "restricted")
    fs.mkdirSync(badDir)
    fs.chmodSync(badDir, 0o000)

    try {
      const ctx = generateContext(tmpDir)
      expect(ctx.components).toHaveLength(1)
      expect(ctx.components[0]?.name).toBe("App")
    } finally {
      fs.chmodSync(badDir, 0o755)
    }
  })

  it("extracts const arrow function components", () => {
    writeFile(tmpDir, "package.json", JSON.stringify({ version: "1.0.0" }))
    writeFile(
      tmpDir,
      "src/Card.tsx",
      `
export const Card = (props: CardProps) => {
  return <div>{props.title}</div>
}
`,
    )
    const ctx = generateContext(tmpDir)
    expect(ctx.components).toHaveLength(1)
    expect(ctx.components[0]?.name).toBe("Card")
  })
})
