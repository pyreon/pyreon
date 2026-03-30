import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { LintConfigFile } from "../types";

const CONFIG_FILENAMES = [".pyreonlintrc.json", ".pyreonlintrc", "pyreonlint.config.json"];

/**
 * Load a lint config file from the given directory or its parents.
 *
 * Search order:
 * 1. `.pyreonlintrc.json`
 * 2. `.pyreonlintrc`
 * 3. `pyreonlint.config.json`
 * 4. `package.json` `"pyreonlint"` field
 *
 * @example
 * ```ts
 * import { loadConfig } from "@pyreon/lint"
 *
 * const config = loadConfig(process.cwd())
 * if (config) console.log(config.preset)
 * ```
 */
export function loadConfig(cwd: string): LintConfigFile | null {
  let dir = resolve(cwd);
  const root = dirname(dir);

  while (true) {
    const found = searchDirectory(dir);
    if (found !== null) return found;

    const parent = dirname(dir);
    if (parent === dir || parent === root) break;
    dir = parent;
  }

  return null;
}

function searchDirectory(dir: string): LintConfigFile | null {
  for (const filename of CONFIG_FILENAMES) {
    const content = tryReadJson(join(dir, filename));
    if (content !== null) return content;
  }
  return extractPkgConfig(join(dir, "package.json"));
}

function extractPkgConfig(pkgPath: string): LintConfigFile | null {
  const pkg = tryReadJson(pkgPath);
  if (pkg === null || typeof pkg !== "object" || !("pyreonlint" in pkg)) return null;
  const field = (pkg as Record<string, unknown>).pyreonlint;
  if (field && typeof field === "object") return field as LintConfigFile;
  return null;
}

/**
 * Load a config file from a specific path.
 */
export function loadConfigFromPath(filePath: string): LintConfigFile | null {
  return tryReadJson(resolve(filePath));
}

function tryReadJson(filePath: string): any | null {
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, "utf-8").trim();
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
