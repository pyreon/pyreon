import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { type DoctorOptions, doctor } from "../doctor";

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pyreon-doctor-"));
  return dir;
}

function writeFile(dir: string, relPath: string, content: string): void {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
}

function readFile(dir: string, relPath: string): string {
  return fs.readFileSync(path.join(dir, relPath), "utf-8");
}

function defaultOptions(cwd: string): DoctorOptions {
  return { fix: false, json: false, ci: false, cwd };
}

const REACT_TSX = `import { useState, useEffect } from "react"

export function Counter() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    console.log(count)
  }, [count])
  return <div className="counter">{count}</div>
}
`;

const CLEAN_TSX = `import { signal } from "@pyreon/reactivity"

export function Counter() {
  const count = signal(0)
  return <div class="counter">{count()}</div>
}
`;

describe("doctor", () => {
  let tmpDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── detect-only mode ──────────────────────────────────────────────────

  it("detects React patterns in files (no --fix)", async () => {
    writeFile(tmpDir, "src/App.tsx", REACT_TSX);

    const errorCount = await doctor(defaultOptions(tmpDir));

    expect(errorCount).toBeGreaterThan(0);
  });

  it("reports correct file paths and diagnostic counts", async () => {
    writeFile(tmpDir, "src/App.tsx", REACT_TSX);

    const opts: DoctorOptions = { fix: false, json: true, ci: false, cwd: tmpDir };
    await doctor(opts);

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
    const result = JSON.parse(output);

    expect(result.passed).toBe(false);
    expect(result.files.length).toBe(1);
    expect(result.files[0].file).toBe(path.join("src", "App.tsx"));
    expect(result.summary.filesWithIssues).toBe(1);
    expect(result.summary.totalErrors).toBeGreaterThan(0);
    // Should detect: react-import, use-state, use-effect-deps, class-name-prop
    const codes = result.files[0].diagnostics.map((d: { code: string }) => d.code);
    expect(codes).toContain("react-import");
    expect(codes).toContain("use-state");
    expect(codes).toContain("class-name-prop");
  });

  // ─── --fix mode ────────────────────────────────────────────────────────

  it("--fix mode rewrites files with migrations", async () => {
    writeFile(tmpDir, "src/App.tsx", REACT_TSX);

    const opts: DoctorOptions = { fix: true, json: false, ci: false, cwd: tmpDir };
    await doctor(opts);

    const updated = readFile(tmpDir, "src/App.tsx");
    // React import should be removed or rewritten
    expect(updated).not.toContain('from "react"');
    // useState should be migrated to signal
    expect(updated).toContain("signal");
    // className should be migrated to class
    expect(updated).toContain("class=");
  });

  it("--fix mode reports totalFixed in JSON output", async () => {
    writeFile(tmpDir, "src/App.tsx", REACT_TSX);

    const opts: DoctorOptions = { fix: true, json: true, ci: false, cwd: tmpDir };
    await doctor(opts);

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
    const result = JSON.parse(output);

    expect(result.summary.totalFixed).toBeGreaterThan(0);
  });

  // ─── --json mode ───────────────────────────────────────────────────────

  it("--json mode returns structured JSON output", async () => {
    writeFile(tmpDir, "src/App.tsx", REACT_TSX);

    const opts: DoctorOptions = { fix: false, json: true, ci: false, cwd: tmpDir };
    await doctor(opts);

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
    const result = JSON.parse(output);

    expect(result).toHaveProperty("passed");
    expect(result).toHaveProperty("files");
    expect(result).toHaveProperty("summary");
    expect(result.summary).toHaveProperty("filesScanned");
    expect(result.summary).toHaveProperty("filesWithIssues");
    expect(result.summary).toHaveProperty("totalErrors");
    expect(result.summary).toHaveProperty("totalFixable");
    expect(result.summary).toHaveProperty("totalFixed");
    expect(Array.isArray(result.files)).toBe(true);
  });

  // ─── --ci mode ─────────────────────────────────────────────────────────

  it("--ci mode returns non-zero error count when issues found", async () => {
    writeFile(tmpDir, "src/App.tsx", REACT_TSX);

    const opts: DoctorOptions = { fix: false, json: false, ci: true, cwd: tmpDir };
    const errorCount = await doctor(opts);

    expect(errorCount).toBeGreaterThan(0);
  });

  it("--ci mode returns 0 when no issues found", async () => {
    writeFile(tmpDir, "src/App.tsx", CLEAN_TSX);

    const opts: DoctorOptions = { fix: false, json: false, ci: true, cwd: tmpDir };
    const errorCount = await doctor(opts);

    expect(errorCount).toBe(0);
  });

  // ─── skipping ──────────────────────────────────────────────────────────

  it("skips node_modules and non-source files", async () => {
    writeFile(tmpDir, "node_modules/some-pkg/index.tsx", REACT_TSX);
    writeFile(tmpDir, "dist/bundle.tsx", REACT_TSX);
    writeFile(tmpDir, "assets/readme.md", "# className something useState");
    writeFile(tmpDir, "src/App.tsx", CLEAN_TSX);

    const opts: DoctorOptions = { fix: false, json: true, ci: false, cwd: tmpDir };
    await doctor(opts);

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
    const result = JSON.parse(output);

    expect(result.passed).toBe(true);
    expect(result.summary.filesWithIssues).toBe(0);
    // Only the clean .tsx in src/ should be scanned
    expect(result.summary.filesScanned).toBe(1);
  });

  // ─── clean project ─────────────────────────────────────────────────────

  it("clean project returns no issues", async () => {
    writeFile(tmpDir, "src/App.tsx", CLEAN_TSX);

    const errorCount = await doctor(defaultOptions(tmpDir));

    expect(errorCount).toBe(0);
  });

  it("clean project prints success message in human mode", async () => {
    writeFile(tmpDir, "src/App.tsx", CLEAN_TSX);

    await doctor(defaultOptions(tmpDir));

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(output).toContain("No issues found");
  });

  // ─── hasReactPatterns pre-filter ────────────────────────────────────────

  it("hasReactPatterns pre-filter skips non-React files efficiently", async () => {
    // A file with Pyreon-only code should not produce diagnostics
    const pyreonOnly = `import { signal, computed, effect } from "@pyreon/reactivity"
import { onMount } from "@pyreon/core"

export function App() {
  const count = signal(0)
  const doubled = computed(() => count() * 2)
  effect(() => console.log(doubled()))
  onMount(() => { console.log("mounted") })
  return <div class="app">{count()}</div>
}
`;
    writeFile(tmpDir, "src/App.tsx", pyreonOnly);

    const opts: DoctorOptions = { fix: false, json: true, ci: false, cwd: tmpDir };
    await doctor(opts);

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
    const result = JSON.parse(output);

    expect(result.passed).toBe(true);
    expect(result.summary.totalErrors).toBe(0);
  });

  // ─── empty directory ────────────────────────────────────────────────────

  it("handles empty directory with no source files", async () => {
    const errorCount = await doctor(defaultOptions(tmpDir));

    expect(errorCount).toBe(0);
  });

  // ─── multiple files ─────────────────────────────────────────────────────

  it("scans multiple files and aggregates results", async () => {
    writeFile(tmpDir, "src/A.tsx", REACT_TSX);
    writeFile(
      tmpDir,
      "src/B.tsx",
      `import { useState } from "react"
export function B() { const [x, setX] = useState(0); return <div>{x}</div> }
`,
    );
    writeFile(tmpDir, "src/C.tsx", CLEAN_TSX);

    const opts: DoctorOptions = { fix: false, json: true, ci: false, cwd: tmpDir };
    await doctor(opts);

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
    const result = JSON.parse(output);

    expect(result.summary.filesScanned).toBe(3);
    expect(result.summary.filesWithIssues).toBe(2);
  });
});
