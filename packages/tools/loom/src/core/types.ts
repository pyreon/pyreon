/**
 * `@pyreon/loom` — the domain model of a workspace's dependency fabric.
 *
 * Loom reads a monorepo the way an install tool does — root workspace globs,
 * every member manifest — and turns it into DATA: an internal dependency
 * graph, the external-dependency usage map, and a set of detected issues.
 * Everything downstream (the CLI report, the observatory UI, CI gating) reads
 * this one model; nothing re-derives its own truth.
 */

/** Which manifest field a dependency edge was declared in. */
export type DepField = 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies'

/** One declared dependency edge, exactly as the manifest states it. */
export interface DeclaredDep {
  /** The depended-on package name (`react`, `@scope/pkg`). */
  name: string
  /** The declared range, verbatim (`^1.2.3`, `workspace:*`, `>=5 <7`). */
  range: string
  field: DepField
}

/** One workspace member. */
export interface WorkspacePackage {
  name: string
  version: string
  /** Directory relative to the workspace root (`packages/tools/loom`). */
  dir: string
  private: boolean
  license?: string
  deps: DeclaredDep[]
}

/** The workspace root manifest's facts Loom cares about. */
export interface WorkspaceRoot {
  name?: string
  dir: string
  /** Version pins from root `overrides` / `resolutions` (npm + bun + yarn spellings). */
  overrides: Record<string, string>
  /** The raw workspace globs the members were resolved from. */
  workspaceGlobs: string[]
}

export interface WorkspaceModel {
  root: WorkspaceRoot
  /** Internal (workspace-member) packages. */
  packages: WorkspacePackage[]
}

/**
 * How one EXTERNAL package is used across the workspace: every distinct
 * declared range, and who declares it. The version-drift detector is a fold
 * over this map; the UI's manifest table reads it directly.
 */
export interface ExternalUsage {
  name: string
  /** range → the internal packages (or 'ROOT') declaring it, with the field. */
  ranges: Record<string, { user: string; field: DepField }[]>
}

/** Severity contract: `error` gates (red exit), `warning` advises, `info` informs. */
export type IssueSeverity = 'error' | 'warning' | 'info'

/** Stable machine-readable issue codes — the detector registry's vocabulary. */
export type IssueCode =
  | 'version-drift'
  | 'internal-range'
  | 'cycle'
  | 'phantom-dep'
  | 'prod-import-of-dev-dep'
  | 'unused-dep'
  | 'peer-mismatch'

export interface LoomIssue {
  code: IssueCode
  severity: IssueSeverity
  /** The workspace package the issue is attributed to ('ROOT' for root-level). */
  pkg: string
  /** The dependency name involved, when one is. */
  dep?: string
  /** One-sentence human statement of the defect. */
  message: string
  /** Structured evidence (ranges per user, cycle path, importing files, …). */
  details?: Record<string, unknown>
}

/** Graph analysis output — depths, cycles, reach. Pure over the model. */
export interface GraphAnalysis {
  /** package name → resolution depth (0 = entry: no internal RUNTIME dependents). */
  depths: Record<string, number>
  /** Internal runtime-edge cycles, each as the loop's package names in order. */
  cycles: string[][]
  /** package name → transitive internal dependents count (blast radius). */
  reach: Record<string, number>
  /** Internal runtime edges as [from, to] (from depends on to). */
  edges: [string, string][]
  /** Internal dev/test-only edges (excluded from cycles by default). */
  devEdges: [string, string][]
}

/** The full scan result — what `loom-report.json` serializes. */
export interface LoomReport {
  model: WorkspaceModel
  external: ExternalUsage[]
  graph: GraphAnalysis
  issues: LoomIssue[]
  stats: {
    internal: number
    external: number
    edges: number
    depth: number
    cycles: number
    errors: number
    warnings: number
    infos: number
  }
}
