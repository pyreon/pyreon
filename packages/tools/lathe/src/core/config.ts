/**
 * Lathe's configuration.
 *
 * Mirrors `AtlasSection` / `LoomSection` in `@pyreon/config` so a project
 * configures every Pyreon tool in one `pyreon.config.ts`.
 */

import {
  ALL_CLIENTS,
  ALL_RESPONSE_VALIDATION,
  reachesNative,
  type ClientName,
  type ResponseValidation,
} from "../emit/client-runtime";
import { ALL_VALIDATORS, type ValidatorName } from "../emit/validator";
import type { LatheNaming, LatheOperationSettings } from "./customize";
import type { LatheFormatter } from "./format";
import type { LatheSpecPatch } from "./patch";
import { isLathePlugin, type LathePlugin } from "./plugin";
import type { LatheFilters } from "./select";

export type { ClientName, ResponseValidation, ValidatorName };

/** Which emitters run. Omitted means "the sensible default set". */
export type PluginName =
  | "types"
  | "schemas"
  | "client"
  | "queries"
  | "mocks"
  | "faker"
  | "components"
  | "atlas"
  | "docs"
  | "mcp";

export const ALL_PLUGINS: readonly PluginName[] = [
  "types",
  "schemas",
  "client",
  "queries",
  "mocks",
  "faker",
  "components",
  "atlas",
  "docs",
  "mcp",
];

export const DEFAULT_PLUGINS: readonly PluginName[] = [
  "schemas",
  "client",
  "queries",
];

/**
 * What each emitter's OUTPUT imports.
 *
 * These are not preferences, they are import edges in the emitted code:
 * `queries/*.ts` imports from `endpoints/*.ts`, which imports the client;
 * `components.tsx` imports the hooks; `mocks.ts` imports the client's
 * transport seam. Selecting a plugin without what it imports produced files
 * referencing modules that were never written -- output that looks complete
 * and does not resolve.
 *
 * Resolved rather than REFUSED: someone asking for `components` wants
 * browsable previews, and the hooks they are built from are an implementation
 * detail of that answer. The report says what came along.
 */
export const PLUGIN_REQUIRES: Readonly<
  Record<PluginName, readonly PluginName[]>
> = {
  types: [],
  schemas: [],
  // An endpoint's `{ response }` clause names a schema.
  client: ["schemas"],
  queries: ["client"],
  mocks: ["client"],
  // The factories exist to produce data the SCHEMA accepts -- constraints
  // choose their generators. Without schemas there is nothing for them to be
  // correct against, and no round-trip test that could prove they are.
  faker: ["schemas"],
  components: ["queries"],
  // Scenarios key the preview components; the wrapper installs the mocks.
  atlas: ["components", "mocks"],
  // Markdown rendered from the IR. It imports nothing and is imported by
  // nothing, so it is the one plugin with no edges at all.
  docs: [],
  // Each tool's `call` runs the generated endpoint.
  mcp: ["client"],
};

/**
 * Expand a selection to include everything its output imports.
 *
 * Order-preserving and idempotent, so the emitted file set is stable: an
 * unstable plugin order would reorder the report and, worse, the barrel.
 */
export function expandPlugins(selected: readonly PluginName[]): PluginName[] {
  const out: PluginName[] = [];
  const seen = new Set<PluginName>();
  const visit = (name: PluginName): void => {
    if (seen.has(name)) return;
    seen.add(name);
    for (const dep of PLUGIN_REQUIRES[name]) visit(dep);
    out.push(name);
  };
  for (const name of selected) visit(name);
  return out;
}

/**
 * One generated client. Every field a single-project config takes, plus a name.
 *
 * Named after `@pyreon/atlas`'s `projects` for the same reason it has one: a
 * monorepo routinely has several APIs, and pointing one tool run at each of
 * them beats running the tool N times with N config files that drift apart.
 */
export interface LatheProject extends Omit<LatheSection, "projects"> {
  /** Identifies the project in the report and in error messages. */
  name: string;
  /** Required per project - there is no single top-level spec to fall back on. */
  input: string;
}

export interface LatheSection {
  /**
   * Several specs in one run, each with its own output and target.
   *
   * When present, the top-level `input`/`output` are IGNORED - a config that
   * silently generated BOTH would produce output nobody asked for. Fields not
   * set on a project fall back to the top-level value, so shared settings
   * (`target`, `plugins`) are written once.
   */
  projects?: readonly LatheProject[];

  /**
   * Path to the OpenAPI 3.x document (`.json`, `.yaml`, `.yml`).
   *
   * Relative to the config FILE when read from `pyreon.config.ts`; a path given
   * on the command line is relative to the working directory, like any other
   * CLI argument.
   */
  input?: string;
  /**
   * Output directory. Relative to the config file, like `input`.
   *
   * @default './src/gen'
   */
  output?: string;
  /**
   * Where `lathe pull` fetches the spec from: an http(s) URL, written to
   * `input`. With `projects`, `lathe pull` pulls every project that sets one.
   */
  source?: string;

  /**
   * Which platforms the client is for: `web`, or `multiplatform`, which also
   * emits native modules for iOS and Android and verifies they lower.
   *
   * `web` emits the idiomatic multi-file layout. `multiplatform` ALSO emits one self-contained module per tag, shaped for
   * PMTC, and verifies that those modules actually lower. It is additive: the
   * web output is unchanged, so turning it on can never make the web build
   * worse.
   *
   * @default 'web'
   */
  target?: "web" | "multiplatform";
  /**
   * Emitters to run: built-in names, and third-party plugins made with
   * `definePlugin` (see `LathePlugin`). Built-ins run first, then
   * plugins in the order listed. Built-ins bring along their required output
   * (`components` needs `queries`), and the report identifies additions.
   *
   * @default ['schemas', 'client', 'queries']
   *
   * @example
   * ```ts
   * import { mswHandlers } from './lathe-msw'
   * export default defineConfig({ lathe: { input: './openapi.yaml', plugins: ['schemas', 'client', mswHandlers()] } })
   * ```
   */
  plugins?: readonly (PluginName | LathePlugin)[];
  /**
   * Which HTTP runtime the generated client is built on.
   *
   * `pyreon` (the default) is the only one that reaches native: PMTC
   * recognises `createHttp` + `api.endpoint(...)` by name and lowers the pair
   * to a real `URLSession` / `OkHttp` call. The others emit a self-contained
   * endpoint factory over that library, satisfying the SAME seam — so every
   * other generated file is byte-identical whichever is chosen.
   *
   * @default 'pyreon'
   */
  client?: ClientName;
  /**
   * Which library the generated schemas are written in.
   *
   * `pyreon` (the default) emits `@pyreon/validate` `s.*`; `zod` emits `z.*`.
   * Both satisfy Standard Schema, so the endpoint layer accepts either without
   * knowing which was chosen.
   *
   * Both also reach native, through different doors and with DIFFERENT
   * coverage: PMTC reads `s.object({ … })` directly and reads zod only inside
   * `@pyreon/validation`'s `zodSchema(...)`. Measured against the real
   * compiler, the zod recogniser lowers strictly more — nested objects and
   * arrays of objects lower there and are dropped under `s.*`.
   *
   * @default 'pyreon'
   */
  validator?: ValidatorName;
  /**
   * Overrides the spec's `servers[0].url` — must be an absolute literal to
   * reach native. `configureApi({ baseUrl })` switches it at runtime.
   *
   * @default the spec's `servers[0].url`
   */
  baseUrl?: string;
  /**
   * What the generated client does with a response that does not match its
   * schema. `strict` (the default) rejects; `warn` logs and passes the raw body
   * through, which is the usual choice in production when a backend may drift;
   * `off` skips validation, which also skips its cost on large list responses.
   * `configureApi({ validate })` switches it at runtime.
   *
   * Web client only. The native modules decode into typed structs, which is
   * validation in itself and is not configurable.
   *
   * @example
   * ```ts
   * export default { lathe: { input: './openapi.yaml', responseValidation: 'warn' } }
   * ```
   *
   * @default 'strict'
   */
  responseValidation?: ResponseValidation;
  /**
   * How an OpenAPI `format: int64` integer is generated.
   *
   * `number` (the default) types it as a `number`, and `JSON.parse` rounds any
   * value past 2^53 - 1 (9007199254740991) before validation runs — reported as
   * an `int64-precision` note. `bigint` generates it as a `bigint` and makes the
   * client decode JSON LOSSLESSLY: the digits are read from the response text
   * (`@pyreon/http/json` on the `pyreon` client, the same codec emitted into an
   * axios / ky / fetch client), so `9007199254740993` arrives exactly, and a
   * `bigint` in a request body is sent as JSON number text.
   *
   * Under `bigint`, every int64 field's schema widens a safe integer to a
   * `bigint`, so response validation must stay on — `responseValidation: 'off'`
   * is refused (and switching it off at runtime leaves small int64 values as
   * numbers). Path, query and header parameters of int64 type are typed
   * `string | number` / `string`: pass a large id as its digits. Web only: the
   * native modules keep a platform integer (an `int64-native` note says which).
   *
   * @example
   * ```ts
   * export default { lathe: { input: './openapi.yaml', int64: 'bigint' } }
   * ```
   *
   * @default 'number'
   */
  int64?: Int64Mode;
  /**
   * What `generate` does with a `$ref` into a REMOTE document (an http(s) URL)
   * in a spec on disk. `off` (the default) keeps generation offline and
   * deterministic: the ref is reported and typed `unknown` -- `lathe pull` a
   * remote spec to bundle it instead. `fetch` downloads every remote part with
   * the same rules as `lathe pull`: a per-document ETag cache under
   * `node_modules/.cache/lathe`, credentials from `remoteHeaders` for their
   * own origin only, and a failed fetch fails the run rather than silently
   * typing that part `unknown`.
   *
   * @example
   * ```ts
   * export default { lathe: { input: './openapi.yaml', remoteRefs: 'fetch' } }
   * ```
   */
  remoteRefs?: 'off' | 'fetch'
  /**
   * Headers for `remoteRefs: 'fetch'`, keyed by ORIGIN: each set is sent only
   * to documents on that origin, so a spec that references another host never
   * receives your credential.
   *
   * @example
   * ```ts
   * remoteHeaders: { 'https://specs.internal.test': { Authorization: `Bearer ${process.env.SPEC_TOKEN}` } }
   * ```
   */
  remoteHeaders?: Readonly<Record<string, Readonly<Record<string, string>>>>
  /**
   * How to page through operations, keyed by the GENERATED operation name
   * (the `endpoints` export). Declared, never guessed — each entry emits a
   * `use<Op>Infinite` hook and a `<op>InfiniteOptions` factory. Same shape as
   * the `x-pyreon-pagination` spec extension, which a config entry overrides.
   *
   * ```ts
   * pagination: {
   *   listCustomers: { kind: 'lastItem', param: 'starting_after', items: 'data', field: 'id', hasMore: 'has_more' },
   *   listEvents: { kind: 'cursor', param: 'cursor', next: 'meta.next_cursor' },
   * }
   * ```
   */
  pagination?: Readonly<Record<string, PaginationConfig>>;
  /**
   * Streaming responses, keyed by the GENERATED operation name. Each entry
   * emits `<op>Stream` (an async iterator of validated events) and
   * `use<Op>Stream` (signals). An operation whose 2xx response declares
   * `text/event-stream` or an NDJSON media type gets both WITHOUT an entry;
   * one here overrides what the spec says, or declares a stream the spec does
   * not describe (an endpoint that streams when its body says `stream: true`).
   *
   * @example
   * ```ts
   * streams: {
   *   createChatCompletion: { format: 'sse', event: 'ChatCompletionChunk' },
   *   exportRows: { format: 'ndjson', event: 'Row' },
   * }
   * ```
   */
  streams?: Readonly<Record<string, StreamConfig>>;
  /**
   * Per-operation settings, keyed by the generated endpoint name OR the
   * spec's `operationId`. Each entry may rename the hook, turn it off, set the
   * operation's own response validation, or declare its pagination (the same
   * entry `pagination` takes — use one or the other for an operation).
   *
   * @example
   * ```ts
   * operations: {
   *   listEvents: { responseValidation: 'off', pagination: { kind: 'cursor', param: 'cursor', next: 'next' } },
   *   getPetById: { hook: 'usePet' },
   *   deleteAccount: { hook: false }, // endpoint only — no mutation hook
   * }
   * ```
   */
  operations?: Readonly<
    Record<string, LatheOperationSettings<PaginationConfig>>
  >;
  /**
   * Generate a SUBSET of the spec. `include` keeps operations some matcher
   * selects, then `exclude` drops any a matcher selects; models only the
   * dropped operations used are dropped too (`models: 'all'` keeps them).
   * A matcher that selects nothing is an error — it is almost always a typo.
   *
   * @example
   * ```ts
   * filters: {
   *   include: [{ tag: ['pets', 'store'] }, { path: '/users/**', method: 'get' }],
   *   exclude: { operationId: '*Deprecated' },
   * }
   * ```
   */
  filters?: LatheFilters;
  /**
   * Corrections applied to the spec BEFORE it is read — RFC 6902 `add` /
   * `replace` / `remove` at an RFC 6901 pointer. A note's `at` (`#/paths/…`)
   * can be pasted in as the path. A patch whose target no longer exists FAILS
   * the run: the spec changed under it and it needs another look.
   *
   * @example
   * ```ts
   * patches: [
   *   { op: 'add', path: '/paths/~1pets/get/operationId', value: 'listPets' },
   *   { op: 'replace', path: '/components/schemas/Pet/properties/tag/nullable', value: true },
   * ]
   * ```
   */
  patches?: readonly LatheSpecPatch[];
  /**
   * Rename what Lathe generates. Each function receives Lathe's own choice as
   * `default`, so returning it keeps it. Results are checked: an invalid name
   * or two things mapped to one name is an error naming both.
   *
   * @example
   * ```ts
   * naming: {
   *   operation: ({ default: name }) => name.replace(/^v1/, ''),
   *   model: ({ default: name }) => `${name}Dto`,
   *   file: ({ default: stem }) => `${stem}-api`,
   *   hook: ({ default: name, kind }) => (kind === 'mutation' ? false : name),
   * }
   * ```
   */
  naming?: LatheNaming;
  /**
   * Format every generated source file before it is written AND before
   * `lathe check` compares — so committed, formatted output is not reported
   * stale. Receives the file's path so a formatter can pick its parser.
   * Lathe's own bookkeeping (`lathe-manifest.json`, `api-surface.json`) is
   * never passed. Must be deterministic, like everything else here.
   *
   * @example
   * ```ts
   * import { format as prettier } from 'prettier'
   * export default defineConfig({
   *   lathe: { input: './openapi.yaml', format: (code, path) => prettier(code, { filepath: path }) },
   * })
   * ```
   */
  format?: LatheFormatter;
  /**
   * Fail the run when a generated native module does not lower.
   *
   * Off by default: a spec is usually partly un-lowerable and that is fine and
   * expected. Turn it on in CI for an app that means to ship on iOS/Android,
   * where a silent regression to web-only is a real defect.
   *
   * @default false
   */
  strictNative?: boolean;
}

/** How `format: int64` is generated — see `LatheSection.int64`. */
export type Int64Mode = "number" | "bigint";

export const ALL_INT64_MODES: readonly Int64Mode[] = ["number", "bigint"];

/** One operation's stream declaration — see `LatheSection.streams`. */
export interface StreamConfig {
  /** Required when the spec does not already declare a streaming response. */
  format?: "sse" | "ndjson";
  /** A model NAME from the spec — the type of one event's `data` / one line. */
  event?: string;
  /** SSE only: `text` keeps each event's `data` as a string. Default `json`. */
  data?: "json" | "text";
}

/** One operation's pagination declaration — see `LatheSection.pagination`. */
export type PaginationConfig =
  | { kind: "cursor"; param: string; next: string; hasMore?: string }
  | {
      kind: "lastItem";
      param: string;
      items?: string;
      field: string;
      hasMore?: string;
    }
  | {
      kind: "offset" | "page";
      param: string;
      items?: string;
      hasMore?: string;
      initial?: number;
    };

export interface ResolvedConfig {
  /** Project name, or `''` for a single-project config. */
  name: string;
  /**
   * Plugins the caller asked for, before dependency expansion.
   *
   * Kept so the report can show what came along rather than expanding
   * silently -- a file set larger than the one you selected is confusing
   * exactly once, and only if nobody says why.
   */
  requestedPlugins: readonly PluginName[]
  input: string
  output: string
  target: 'web' | 'multiplatform'
  plugins: readonly PluginName[]
  client: ClientName
  validator: ValidatorName
  baseUrl?: string | undefined
  pagination?: Readonly<Record<string, PaginationConfig>> | undefined;
  streams?: Readonly<Record<string, StreamConfig>> | undefined;
  strictNative: boolean;
  responseValidation: ResponseValidation;
  int64: Int64Mode;
  /** Third-party plugins, in declaration order. Built-ins are in `plugins`. */
  customPlugins: readonly LathePlugin[];
  operations?:
    | Readonly<Record<string, LatheOperationSettings<PaginationConfig>>>
    | undefined;
  filters?: LatheFilters | undefined;
  patches?: readonly LatheSpecPatch[] | undefined;
  naming?: LatheNaming | undefined;
  format?: LatheFormatter | undefined
  remoteRefs: 'off' | 'fetch'
  remoteHeaders?: Readonly<Record<string, Readonly<Record<string, string>>>> | undefined
}

/**
 * Resolve every project this config describes.
 *
 * Always a LIST, so the caller has one code path. A single-project config
 * resolves to a one-element list rather than a special case.
 */
export function resolveProjects(
  section: LatheSection | undefined,
): ResolvedConfig[] {
  const projects = section?.projects;
  if (!projects || projects.length === 0) return [resolveConfig(section)];

  const seen = new Set<string>();
  return projects.map((p, i) => {
    if (!p.name) {
      throw new Error(
        `[Pyreon] lathe: lathe.projects[${i}] has no \`name\`. It identifies the project in the report and in errors.`,
      );
    }
    if (seen.has(p.name)) {
      throw new Error(
        `[Pyreon] lathe: two projects are both named \`${p.name}\`. Names must be unique - they key the report.`,
      );
    }
    seen.add(p.name);
    // Project fields win; anything absent falls back to the top level, so
    // `target` and `plugins` are written once and shared.
    // `projects` is dropped rather than set to undefined:
    // `exactOptionalPropertyTypes` treats `{ projects: undefined }` and an
    // absent key as different types, and only the absent key is legal here.
    const { projects: _drop, ...base } = { ...section, ...p };
    return { ...resolveConfig(base), name: p.name };
  });
}

/** Fill defaults. Throws with actionable text when a required field is absent. */
export function resolveConfig(
  section: LatheSection | undefined,
): ResolvedConfig {
  const input = section?.input;
  if (!input) {
    throw new Error(
      "[Pyreon] lathe: no input spec. Set `lathe.input` in pyreon.config.ts, or pass one: `lathe generate ./openapi.yaml`.",
    );
  }
  const entries = section?.plugins ?? DEFAULT_PLUGINS;
  const plugins: PluginName[] = [];
  const customPlugins: LathePlugin[] = [];
  for (const p of entries) {
    if (typeof p === "string") {
      if (!ALL_PLUGINS.includes(p)) {
        throw new Error(
          `[Pyreon] lathe: unknown plugin \`${p}\`. Known: ${ALL_PLUGINS.join(", ")}.`,
        );
      }
      plugins.push(p);
      continue;
    }
    // A plugin object must come from `definePlugin`, which validated its
    // shape; a bare object literal with a typo'd hook would otherwise run
    // nothing, silently.
    if (!isLathePlugin(p)) {
      throw new Error(
        `[Pyreon] lathe: a \`plugins\` entry is neither a built-in name nor a plugin. Create plugins with \`definePlugin({ name, … })\` from '@pyreon/lathe'.`,
      );
    }
    if ((ALL_PLUGINS as readonly string[]).includes(p.name)) {
      throw new Error(
        `[Pyreon] lathe: plugin \`${p.name}\` has the name of a built-in plugin. Choose another name.`,
      );
    }
    if (customPlugins.some((c) => c.name === p.name)) {
      throw new Error(
        `[Pyreon] lathe: two plugins are named \`${p.name}\`. Names must be unique — they attribute errors.`,
      );
    }
    customPlugins.push(p);
    for (const dep of p.requires ?? []) {
      if (!ALL_PLUGINS.includes(dep)) {
        throw new Error(
          `[Pyreon] lathe: plugin \`${p.name}\` requires \`${String(dep)}\`, which is not a built-in plugin. Known: ${ALL_PLUGINS.join(", ")}.`,
        );
      }
    }
  }
  if (section?.format !== undefined && typeof section.format !== "function") {
    throw new Error(
      "[Pyreon] lathe: `format` must be a function `(code, path) => string | Promise<string>`.",
    );
  }
  const required = customPlugins.flatMap((p) => p.requires ?? []);
  const client = section?.client ?? "pyreon";
  if (!ALL_CLIENTS.includes(client)) {
    throw new Error(
      `[Pyreon] lathe: unknown client \`${client}\`. Known: ${ALL_CLIENTS.join(", ")}.`,
    );
  }
  const validator = section?.validator ?? "pyreon";
  if (!ALL_VALIDATORS.includes(validator)) {
    throw new Error(
      `[Pyreon] lathe: unknown validator \`${validator}\`. Known: ${ALL_VALIDATORS.join(", ")}.`,
    );
  }
  const responseValidation = section?.responseValidation ?? "strict";
  if (!ALL_RESPONSE_VALIDATION.includes(responseValidation)) {
    throw new Error(
      `[Pyreon] lathe: unknown responseValidation \`${String(responseValidation)}\`. Known: ${ALL_RESPONSE_VALIDATION.join(", ")}.`,
    );
  }
  const int64 = section?.int64 ?? "number";
  if (!ALL_INT64_MODES.includes(int64)) {
    throw new Error(
      `[Pyreon] lathe: unknown int64 \`${String(int64)}\`. Known: ${ALL_INT64_MODES.join(", ")}.`,
    );
  }
  // REFUSED rather than tolerated: under `bigint` the lossless decoder only
  // turns an integer that does not fit a double into a bigint, and it is the
  // int64 field's SCHEMA that widens the rest. With validation off, an int64
  // field would hold a bigint for a large id and a number for a small one --
  // under a type that promises bigint.
  if (int64 === "bigint" && responseValidation === "off") {
    throw new Error(
      "[Pyreon] lathe: `int64: 'bigint'` needs response validation — each int64 field's schema is what turns a small id into a bigint. " +
        "Use `responseValidation: 'strict'` or `'warn'`, or `int64: 'number'`.",
    );
  }
  const remoteRefs = section?.remoteRefs ?? 'off'
  if (remoteRefs !== 'off' && remoteRefs !== 'fetch') {
    throw new Error(`[Pyreon] lathe: unknown remoteRefs \`${String(remoteRefs)}\`. Known: off, fetch.`)
  }
  const target = section?.target ?? "web";
  // Validated like the others: a config typo (`target: 'native'`) used to be
  // treated as `web` by every `=== 'multiplatform'` check downstream, so the
  // native modules the author asked for were silently never generated.
  if (target !== "web" && target !== "multiplatform") {
    throw new Error(
      `[Pyreon] lathe: unknown target \`${String(target)}\`. Known: web, multiplatform.`,
    );
  }
  // REFUSED rather than silently downgraded. `multiplatform` exists to prove
  // the generated modules lower, and PMTC recognises `createHttp` by NAME — an
  // axios instance is an ordinary import it has never heard of. Emitting
  // native modules over one would produce exactly the silent regression to
  // web-only that this target was built to catch.
  if (target === "multiplatform" && !reachesNative(client)) {
    throw new Error(
      `[Pyreon] lathe: \`target: 'multiplatform'\` needs \`client: 'pyreon'\`, but this config asks for \`${client}\`. ` +
        `PMTC lowers \`createHttp\` + \`api.endpoint(...)\` by name; it cannot see through ${client}. ` +
        `Use \`target: 'web'\` with ${client}, or \`client: 'pyreon'\` to reach iOS and Android.`,
    );
  }
  return {
    name: "",
    requestedPlugins: plugins,
    input,
    output: section?.output ?? "./src/gen",
    target,
    plugins: expandPlugins([...plugins, ...required]),
    client,
    validator,
    baseUrl: section?.baseUrl,
    pagination: section?.pagination,
    streams: section?.streams,
    strictNative: section?.strictNative ?? false,
    responseValidation,
    int64,
    customPlugins,
    operations: section?.operations,
    filters: section?.filters,
    patches: section?.patches,
    naming: section?.naming,
    format: section?.format,
    remoteRefs,
    remoteHeaders: section?.remoteHeaders,
  }
}
