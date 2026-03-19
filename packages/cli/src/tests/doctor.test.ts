import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { doctor } from "../doctor"

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pyreon-doctor-"))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function writeFile(relPath: string, content: string): void {
  const full = path.join(tmpDir, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, "utf-8")
}

function baseOptions() {
  return { fix: false, json: false, ci: false, cwd: tmpDir }
}

describe("doctor", () => {
  describe("clean project", () => {
    it("returns 0 errors for pyreon-native code", async () => {
      writeFile(
        "src/App.tsx",
        `import { signal } from "@pyreon/reactivity"
const count = signal(0)
export function App() {
  return <div>{count()}</div>
}
`,
      )
      const errors = await doctor(baseOptions())
      expect(errors).toBe(0)
    })

    it("returns 0 for an empty directory", async () => {
      const errors = await doctor(baseOptions())
      expect(errors).toBe(0)
    })
  })

  describe("react pattern detection", () => {
    it("detects React imports", async () => {
      writeFile(
        "src/App.tsx",
        `import React from "react"
import { useState } from "react"
export function App() {
  const [count, setCount] = useState(0)
  return <div>{count}</div>
}
`,
      )
      const errors = await doctor(baseOptions())
      expect(errors).toBeGreaterThan(0)
    })

    it("detects className usage", async () => {
      writeFile(
        "src/Card.tsx",
        `export function Card() {
  return <div className="card">hello</div>
}
`,
      )
      const errors = await doctor(baseOptions())
      expect(errors).toBeGreaterThan(0)
    })

    it("detects htmlFor usage", async () => {
      writeFile(
        "src/Form.tsx",
        `export function Form() {
  return <label htmlFor="email">Email</label>
}
`,
      )
      const errors = await doctor(baseOptions())
      expect(errors).toBeGreaterThan(0)
    })
  })

  describe("json mode", () => {
    it("outputs valid JSON to console.log", async () => {
      writeFile(
        "src/App.tsx",
        `import { useState } from "react"
export function App() {
  const [x, setX] = useState(0)
  return <div className="app">{x}</div>
}
`,
      )
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
      try {
        await doctor({ ...baseOptions(), json: true })
        const calls = logSpy.mock.calls.flat()
        const jsonStr = calls[0] as string
        const parsed = JSON.parse(jsonStr)
        expect(parsed).toHaveProperty("passed")
        expect(parsed).toHaveProperty("files")
        expect(parsed).toHaveProperty("summary")
        expect(parsed.summary).toHaveProperty("filesScanned")
        expect(parsed.summary).toHaveProperty("totalErrors")
        expect(parsed.passed).toBe(false)
        expect(parsed.summary.totalErrors).toBeGreaterThan(0)
      } finally {
        logSpy.mockRestore()
      }
    })

    it("outputs passed: true for clean code", async () => {
      writeFile(
        "src/Clean.tsx",
        `export function Clean() {
  return <div>ok</div>
}
`,
      )
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
      try {
        await doctor({ ...baseOptions(), json: true })
        const parsed = JSON.parse(logSpy.mock.calls[0]![0] as string)
        expect(parsed.passed).toBe(true)
        expect(parsed.summary.totalErrors).toBe(0)
      } finally {
        logSpy.mockRestore()
      }
    })
  })

  describe("fix mode", () => {
    it("auto-fixes className to class", async () => {
      writeFile(
        "src/Fix.tsx",
        `export function Fix() {
  return <div className="box">hello</div>
}
`,
      )
      const errors = await doctor({ ...baseOptions(), fix: true })
      const content = fs.readFileSync(path.join(tmpDir, "src/Fix.tsx"), "utf-8")
      expect(content).toContain('class="box"')
      expect(content).not.toContain("className")
      // Fixed issues don't count as remaining errors
      expect(errors).toBe(0)
    })

    it("auto-fixes htmlFor to for", async () => {
      writeFile(
        "src/Label.tsx",
        `export function Label() {
  return <label htmlFor="email">Email</label>
}
`,
      )
      await doctor({ ...baseOptions(), fix: true })
      const content = fs.readFileSync(path.join(tmpDir, "src/Label.tsx"), "utf-8")
      expect(content).toContain('for="email"')
      expect(content).not.toContain("htmlFor")
    })
  })

  describe("file scanning", () => {
    it("skips node_modules", async () => {
      writeFile(
        "node_modules/react/index.tsx",
        `import React from "react"
export default React
`,
      )
      const errors = await doctor(baseOptions())
      expect(errors).toBe(0)
    })

    it("skips dist directory", async () => {
      writeFile(
        "dist/bundle.tsx",
        `import { useState } from "react"
`,
      )
      const errors = await doctor(baseOptions())
      expect(errors).toBe(0)
    })

    it("scans .tsx, .jsx, .ts, .js files", async () => {
      writeFile("src/a.tsx", `import React from "react"\n`)
      writeFile("src/b.jsx", `import React from "react"\n`)
      writeFile("src/c.ts", `import { useState } from "react"\n`)
      writeFile("src/d.js", `import { useEffect } from "react"\n`)

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
      try {
        await doctor({ ...baseOptions(), json: true })
        const parsed = JSON.parse(logSpy.mock.calls[0]![0] as string)
        expect(parsed.summary.filesScanned).toBe(4)
        expect(parsed.summary.filesWithIssues).toBe(4)
      } finally {
        logSpy.mockRestore()
      }
    })

    it("ignores non-source files", async () => {
      writeFile("src/data.json", `{"className": "test"}`)
      writeFile("src/styles.css", `.className { color: red }`)
      const errors = await doctor(baseOptions())
      expect(errors).toBe(0)
    })

    it("handles unreadable directories gracefully", async () => {
      // Directory that doesn't exist as cwd should just scan 0 files
      const errors = await doctor({ ...baseOptions(), cwd: path.join(tmpDir, "nonexistent") })
      expect(errors).toBe(0)
    })
  })

  describe("human output", () => {
    it("prints summary for clean project", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
      try {
        await doctor(baseOptions())
        const output = logSpy.mock.calls.map((c) => c[0]).join("\n")
        expect(output).toContain("Pyreon Doctor")
        expect(output).toContain("No issues found")
      } finally {
        logSpy.mockRestore()
      }
    })

    it("prints diagnostics for files with issues", async () => {
      writeFile(
        "src/Bad.tsx",
        `import React from "react"
export function Bad() { return <div className="x">hi</div> }
`,
      )
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
      try {
        await doctor(baseOptions())
        const output = logSpy.mock.calls.map((c) => c[0]).join("\n")
        expect(output).toContain("Pyreon Doctor")
        expect(output).toContain("issue")
      } finally {
        logSpy.mockRestore()
      }
    })
  })
})
