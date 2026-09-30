/**
 * The pipeline: spec text -> IR -> files.
 *
 * Pure. It takes source text and returns file CONTENTS; nothing here touches
 * the filesystem, which is what makes the whole generator testable without a
 * temp directory and what lets the CLI diff before writing.
 */

import { emitAtlasScenarios, emitAtlasWrapper } from "../emit/atlas";
import { emitComponents } from "../emit/components";
import {
  emitBarrel,
  emitDevEntry,
  emitEndpointsBarrel,
  emitKeys,
  emitQueriesBarrel,
} from "../emit/entries";
import {
  byTag,
  emitClient,
  emitNativeModules,
  hasNativeDataComponent,
  hasNativeStreamComponent,
  emitWebEndpoints,
  emitWebQueries,
} from "../emit/client";
import { tagFile, typeIdent } from "./naming";
import { docsImportBase, emitDocs } from "../emit/docs";
import { emitFaker } from "../emit/faker";
import { emitMcpTools } from "../emit/mcp";
import { emitMocks } from "../emit/mock";
import { emitPackageMarker } from "../emit/package-marker";
import { isStreamOnly, streamHookName, streamName } from "../emit/stream";
import { emitSchemas, emitTypes } from "../emit/schema";
import { emitWebhooks } from '../emit/webhooks'
import { banner, jsonLiteral, type GeneratedFile } from "../emit/writer";
import type { ResolvedConfig } from "./config";
import type { IrDocument, IrNote, IrOperation, IrType, Reach } from "./ir";
import { usesBigInt, visitTypes } from "./walk";
import {
  loadOpenApi,
  parsePagination,
  type LoadOptions,
} from "../input/openapi";
import { checkPagination } from "../emit/pagination";
import { emitOutputManifest } from "./output-manifest";
import { closest } from "./suggest";
import {
  extractSurface,
  type ApiSurface,
  type SurfaceMetadata,
} from "./surface";
import {
  applyNaming,
  applyOperationSettings,
  assertHookNames,
  operationByKey,
} from "./customize";
import { runAsync, runEmits, runSetup, runSync, runTransforms, type Pipeline } from "./plugin";
import { applyFilters } from "./select";

export interface GenerateResult {
  doc: IrDocument;
  files: GeneratedFile[];
  /** Per-operation native reach, decided statically from the IR. */
  reach: Map<string, { reach: Reach; reason?: string }>;
  /**
   * The comparable API surface of THIS run.
   *
   * Committed as `api-surface.json` and diffed on the next run, which is what
   * makes a contract change visible. A spec edit that removes a response field
   * still typechecks after regeneration — against the new types, which agree
   * with the new spec and with nothing the app was written for.
   */
  surface: ApiSurface;
  /** Every spec document read, root first — used by watch mode. */
  /**
   * Every document the spec was read from, root first -- more than one for a
   * spec that `$ref`s other files. Watchers regenerate when any changes.
   */
  documents: string[]
}

/**
 * Run the pipeline over a spec document's text, synchronously.
 *
 * Every plugin hook must return synchronously here; one that returns a promise
 * is refused with its name. Use {@link generateAsync} for async plugins -- the
 * CLI and the Vite plugin do.
 */
export function generate(
  specText: string,
  config: ResolvedConfig,
  /** Where the spec came from; resolves a relative `servers[].url`. */
  options: LoadOptions = {},
): GenerateResult {
  return runSync(pipeline(specText, config, options));
}

/**
 * {@link generate}, awaiting plugin hooks that return promises. Output is
 * byte-identical to `generate()` for the same spec, config and plugins.
 */
export function generateAsync(
  specText: string,
  config: ResolvedConfig,
  options: LoadOptions = {},
): Promise<GenerateResult> {
  return runAsync(pipeline(specText, config, options));
}

/**
 * The pipeline, written once. Each plugin hook's result is `yield`ed to the
 * driver, which hands back the settled value -- so this body reads the same
 * for a synchronous and an asynchronous run.
 */
function* pipeline(
  specText: string,
  config: ResolvedConfig,
  options: LoadOptions,
): Pipeline<GenerateResult> {
  const plugins = config.customPlugins ?? [];
  yield* runSetup(plugins, config);
  // The document, in the order an author reasons about it: correct the spec,
  // read it, choose the subset, name things, set per-operation directives —
  // and only then hand it to plugins, so a plugin sees exactly the names and
  // directives the built-in emitters will use.
  const loaded = loadOpenApi(specText, {
    ...options,
    patches: options.patches ?? config.patches,
    int64: options.int64 ?? config.int64,
  });
  const documents = loaded.documents;
  let doc = applyFilters(loaded.doc, config.filters);
  doc = applyNaming(doc, config.naming);
  doc = applyOperationSettings(doc, config.operations, config.naming?.hook);
  applyPagination(doc, config);
  applyStreams(doc, config);
  assertInt64Validation(doc);
  if (config.target === "multiplatform") noteInt64Native(doc);
  // Frozen from here on, with or without plugins: every emitter reads, none
  // writes, and a plugin is held to the same rule.
  doc = yield* runTransforms(doc, plugins, config);
  // Hook names are checked after the plugins, which may set them too — and
  // only when hooks are generated at all.
  if (config.plugins.includes("queries")) assertHookNames(doc);
  const native = config.target === "multiplatform";
  const files: GeneratedFile[] = [];
  const reach = reachOf(doc, config);
  const head = banner(doc.title, doc.version);
  const push = (f: { build: (b: string) => GeneratedFile }): void => {
    const built = f.build(head);
    // An emitter with nothing to say emits nothing — a file containing only a
    // banner is noise in the diff and a lie in the file tree.
    if (built.contents.trim() !== head.trim()) files.push(built);
  };

  const pushMaybe = (
    f: { build: (b: string) => GeneratedFile } | null,
  ): void => {
    if (f) push(f);
  };

  const has = (p: string): boolean => config.plugins.includes(p as never);

  if (has("types")) push(emitTypes(doc));
  if (has("schemas")) {
    for (const f of emitSchemas(doc, {
      native: false,
      validator: config.validator,
    }))
      push(f);
    pushMaybe(emitWebhooks(doc, config.validator));
  }
  if (has("client")) {
    push(
      emitClient(doc, {
        native,
        baseUrl: config.baseUrl,
        client: config.client,
        // A project's NAME when it has one, else the API's own base URL (unique
        // per API by construction), else its title.
        keyScope: config.name || config.baseUrl || doc.baseUrl || doc.title,
        responseValidation: config.responseValidation,
      }),
    );
    for (const f of emitWebEndpoints(doc, config.validator, config.client))
      push(f);
  }
  if (has("queries")) {
    for (const f of emitWebQueries(doc)) push(f);
    push(emitKeys(doc));
  }
  if (has("mocks")) push(emitMocks(doc, config.client));
  if (has("mcp")) push(emitMcpTools(doc));
  // The factories import the model TYPES, which both `schemas` and `types`
  // export under the same names. `faker` requires `schemas`, so the first
  // branch is the live one; the second keeps the emitter honest if that
  // requirement is ever relaxed.
  if (has("faker"))
    pushMaybe(emitFaker(doc, has("schemas") ? "schemas" : "types"));
  // Previews come BEFORE scenarios: the scenario keys are these component
  // names, so emitting scenarios without them is a plausible-looking no-op.
  if (has("components")) push(emitComponents(doc));
  if (has("atlas")) {
    push(emitAtlasScenarios(doc, { faker: has("faker") }));
    push(emitAtlasWrapper(doc));
  }
  // The native modules are the `client` + `queries` emitters' native LAYOUT,
  // not a separate output — so they follow the same plugin selection. Emitting
  // them unconditionally meant `--plugins schemas` still produced a client and
  // a data component, which is the opposite of what was asked for.
  if (native && (has("client") || has("queries"))) {
    for (const f of emitNativeModules(doc, {
      native,
      baseUrl: config.baseUrl,
      validator: config.validator,
    }))
      push(f);
  }
  // `docs` reads the same reach analysis the CLI reports, so a page and the
  // terminal can never disagree about whether an operation reaches native.
  if (has("docs")) {
    for (const f of emitDocs(doc, {
      reach,
      hasQueries: has("queries"),
      // The EFFECTIVE base, matching what the client emitter bakes and what the
      // reach analysis read — not the spec's `servers[0]`, which a config
      // `baseUrl` overrides.
      baseUrl: config.baseUrl ?? doc.baseUrl,
      importBase: docsImportBase(config.output),
    })) {
      files.push(f);
    }
  }
  // Entry points last, so they re-export whatever the selection produced.
  //
  // Per-LAYER, not one flat barrel: an entry point is a reachability edge, and
  // a barrel naming every layer makes one hook reach every operation and every
  // fixture. Measured at 120 operations that was 30.7 kB against 6.1 kB.
  // Keyed on what was EMITTED, not on what was selected: an emitter with
  // nothing to say writes no file, and a barrel naming it does not compile.
  if (has("client")) pushMaybe(emitEndpointsBarrel(doc));
  if (has("queries")) pushMaybe(emitQueriesBarrel(doc));
  const entryOpts = {
    plugins: config.plugins,
    client: config.client,
    emitted: new Set(files.map((f) => f.path)),
  };
  pushMaybe(emitDevEntry(doc, entryOpts));
  push(emitBarrel(doc, entryOpts));

  // Third-party plugins, after every built-in, so each can read (and must not
  // collide with) what the built-ins wrote. Their files are ordinary output:
  // listed in the manifest below, compared by `check`, pruned when dropped.
  const extra = yield* runEmits(plugins, { doc, config, reach, banner: head }, files);
  files.push(...extra.files);

  // The `sideEffects` marker. Emitted unconditionally and last-but-one: it is
  // not a plugin's output but a statement ABOUT the output, and it is what
  // makes the whole generated graph tree-shakeable regardless of how the
  // consuming app's own package.json is configured.
  files.push(emitPackageMarker(config.plugins, extra.sideEffects));

  // The record of what THIS run generated, so the next one can remove what it
  // no longer produces. Listed before `api-surface.json` is appended, and that
  // file is added to it explicitly: every path the run writes is on the list.
  files.push(
    emitOutputManifest([...files.map((f) => f.path), "api-surface.json"]),
  );

  assertUniquePaths(files);

  // Module + symbols per operation, so the surface can name the code a
  // contract change touches. Recorded for what THIS run emitted: an
  // `endpoints`-only run has no hooks to name.
  const surface = extractSurface(
    doc,
    surfaceMetadata(doc, { client: has("client"), queries: has("queries") }),
  );
  // Emitted LAST and unconditionally: it is not a plugin's output but the
  // record of what this run promised, and a run that emitted only schemas
  // still changed the contract if a model moved.
  files.push({
    path: "api-surface.json",
    // `jsonLiteral`, not bare `JSON.stringify`: the latter leaves U+2028 and
    // U+2029 RAW, and both are JavaScript line terminators. A spec
    // `description` carrying one would produce a file that parses as JSON and
    // breaks the moment anything imports it as a module.
    contents: `${jsonLiteral(surface, 2)}\n`,
  });
  return { doc, files, reach, surface, documents };
}

/**
 * Merge `pagination` config onto the operations and CHECK every declaration
 * against the spec's types (audit E3).
 *
 * A config entry is the user's explicit instruction, so a wrong one FAILS the
 * run with the reason; a wrong `x-pyreon-pagination` in someone else's spec is
 * NOTED and skipped, like every other spec construct Lathe cannot honour.
 */
function applyPagination(doc: IrDocument, config: ResolvedConfig): void {
  const byId = new Map(doc.operations.map((o) => [o.id, o]));
  // Two places declare pagination -- the `pagination` map and an
  // `operations.<id>.pagination` entry. Both are honoured; declaring BOTH for
  // one operation is refused rather than picking a winner silently.
  const declared: Array<{ where: string; key: string; entry: unknown }> = [
    ...Object.entries(config.pagination ?? {}).map(([key, entry]) => ({
      where: `pagination.${key}`,
      key,
      entry,
    })),
    ...Object.entries(config.operations ?? {}).flatMap(([key, s]) =>
      s?.pagination === undefined
        ? []
        : [
            {
              where: `operations.${key}.pagination`,
              key,
              entry: s.pagination as unknown,
            },
          ],
    ),
  ];
  const fromConfig = new Map<string, string>();
  for (const { where, key, entry } of declared) {
    const op = operationByKey(doc, key, where);
    const prev = fromConfig.get(op.id);
    if (prev !== undefined) {
      throw new Error(
        `[Pyreon] lathe: \`${op.id}\` declares pagination twice (\`${prev}\` and \`${where}\`). Keep one.`,
      );
    }
    fromConfig.set(op.id, where);
    const parsed = parsePagination(entry);
    if (typeof parsed === "string")
      throw new Error(`[Pyreon] lathe: \`${where}\`: ${parsed}`);
    op.pagination = parsed;
  }
  const models = new Map(doc.models.map((m) => [m.name, m.type]));
  for (const op of doc.operations) {
    if (!op.pagination) continue;
    const clash = [`${op.id}Infinite`, `${op.id}InfiniteOptions`].find((n) =>
      byId.has(n),
    );
    const problem =
      op.method !== "GET"
        ? `pagination for \`${op.id}\`: only a GET can be paged.`
        : clash
          ? `pagination for \`${op.id}\`: its hook would collide with the operation \`${clash}\`.`
          : checkPagination(op, models);
    if (problem === undefined) continue;
    if (fromConfig.has(op.id)) throw new Error(`[Pyreon] lathe: ${problem}`);
    (doc.notes as IrNote[]).push({
      code: "invalid-pagination",
      at: `#/paths/${op.path}`,
      message: `${problem} Ignored.`,
    });
    op.pagination = undefined;
  }
}

/**
 * Under `int64: 'bigint'`, refuse an operation whose response validation is
 * `off` when its response carries an int64 -- the per-operation twin of the
 * config-level refusal in `resolveConfig`. Validation is what widens a SMALL
 * int64 to a bigint; skipped, the field holds a number under a bigint type.
 */
function assertInt64Validation(doc: IrDocument): void {
  if (!usesBigInt(doc)) return;
  const models = new Map(doc.models.map((m) => [m.name, m.type]));
  for (const op of doc.operations) {
    if (op.validate !== "off" || !op.response) continue;
    if (!reachesBigInt(op.response, models, new Set())) continue;
    throw new Error(
      `[Pyreon] lathe: \`${op.id}\` turns response validation off, but its response carries an int64 and \`int64: 'bigint'\` is set — ` +
        "validation is what turns a small int64 into a bigint. Use `'warn'` for that operation instead.",
    );
  }
}

function reachesBigInt(type: IrType, models: ReadonlyMap<string, IrType>, seen: Set<string>): boolean {
  let found = false;
  visitTypes(type, (t) => {
    if (t.kind === "bigint") found = true;
    else if (t.kind === "ref" && !seen.has(t.name)) {
      seen.add(t.name);
      const target = models.get(t.name);
      if (target && reachesBigInt(target, models, seen)) found = true;
    }
  });
  return found;
}

/**
 * `int64: 'bigint'` stops at the web. PMTC has no bigint type, so the native
 * modules keep the `number().int()` schema the default mode emits, and each
 * platform decodes it as its own integer. Reported, never silent: the two
 * targets hold different types for the same field.
 */
function noteInt64Native(doc: IrDocument): void {
  if (!usesBigInt(doc)) return;
  (doc.notes as IrNote[]).push({
    code: "int64-native",
    at: "#/components/schemas",
    message:
      "`int64: 'bigint'` is web-only: PMTC has no bigint type, so the native modules decode `format: int64` as the platform integer PMTC lowers `number().int()` to — " +
      "Swift `Int` (64-bit, exact) and Kotlin `Int` (32-bit: a value past 2147483647 fails to decode on Android). The web client holds a `bigint` for the same field.",
  });
}

/**
 * Which module each operation lands in and the symbols it exports, for a run
 * with these emitters. `lathe diff` over two SPECS asks it with the default
 * set, so a spec-to-spec diff names the same symbols a generated tree has.
 */
export function surfaceMetadata(
  doc: IrDocument,
  ran: { client: boolean; queries: boolean },
): SurfaceMetadata {
  const groupOf = new Map<string, string>();
  for (const [group, ops] of byTag(doc))
    for (const op of ops) groupOf.set(op.id, tagFile(group));
  return {
    moduleOf: (op) => (ran.client ? groupOf.get(op.id) : undefined),
    symbolsOf: (op) => generatedSymbols(op, ran),
  };
}

/** The public symbols generated for one operation, given which plugins ran. */
function generatedSymbols(
  op: IrOperation,
  ran: { client: boolean; queries: boolean },
): string[] {
  const out: string[] = [];
  if (ran.client) {
    out.push(op.id);
    if (op.stream) out.push(streamName(op));
  }
  if (ran.queries) {
    if (!isStreamOnly(op)) out.push(`use${typeIdent(op.id)}`);
    if (op.pagination && op.method === "GET")
      out.push(`use${typeIdent(op.id)}Infinite`);
    if (op.stream) out.push(streamHookName(op));
  }
  return out;
}

/**
 * Merge the `streams` config onto the operations.
 *
 * Like `pagination`, a config entry is an explicit instruction, so every
 * mistake in one FAILS the run naming the fix: an unknown operation, a model
 * that does not exist, a stream with no format, a name that would collide.
 */
function applyStreams(doc: IrDocument, config: ResolvedConfig): void {
  const entries = Object.entries(config.streams ?? {});
  if (entries.length === 0) return;
  const byId = new Map(doc.operations.map((o) => [o.id, o]));
  const models = new Set(doc.models.map((m) => m.name));
  const fail = (id: string, why: string): never => {
    throw new Error(`[Pyreon] lathe: \`streams.${id}\`: ${why}`);
  };
  for (const [id, entry] of entries) {
    const op = byId.get(id);
    if (!op) {
      const near = closest(id, [...byId.keys()]);
      fail(
        id,
        `names no operation.${near ? ` Did you mean \`${near}\`?` : ""} Keys are the GENERATED operation names (the \`endpoints\` exports).`,
      );
      return;
    }
    const format = entry.format ?? op.stream?.format;
    if (!format) {
      fail(
        id,
        `the spec declares no streaming response for \`${id}\`, so \`format: 'sse' | 'ndjson'\` is required.`,
      );
      return;
    }
    if (format !== "sse" && format !== "ndjson")
      fail(id, `unknown format \`${String(format)}\` — use 'sse' or 'ndjson'.`);
    if (entry.data !== undefined && format !== "sse")
      fail(id, "`data` applies to SSE only; an NDJSON line is always JSON.");
    if (entry.event !== undefined && !models.has(entry.event)) {
      const near = closest(entry.event, [...models]);
      fail(
        id,
        `\`event: '${entry.event}'\` is not a model in this spec.${near ? ` Did you mean \`${near}\`?` : ""}`,
      );
    }
    if (byId.has(`${id}Stream`))
      fail(
        id,
        `its stream would be named \`${id}Stream\`, which is already an operation.`,
      );
    const keepsSpecType =
      entry.event === undefined && op.stream?.format === format;
    op.stream = {
      format,
      media:
        op.stream?.format === format
          ? op.stream.media
          : format === "sse"
            ? "text/event-stream"
            : "application/x-ndjson",
      event:
        entry.event !== undefined
          ? { kind: "ref", name: entry.event }
          : keepsSpecType && op.stream
            ? op.stream.event
            : { kind: "unknown", reason: "no event type declared" },
      data:
        format === "sse"
          ? (entry.data ??
            (keepsSpecType && op.stream ? op.stream.data : "json"))
          : "json",
    };
  }
}

/**
 * Two generated files with one path means one silently overwrites the other
 * on disk -- a whole tag's endpoints gone, with no error anywhere. Compared
 * case-INSENSITIVELY, because macOS and Windows filesystems are: `users.ts`
 * and `Users.ts` are one file there. The input layer is responsible for names
 * that never collide; this is the guard that makes a regression loud.
 */
function assertUniquePaths(files: readonly GeneratedFile[]): void {
  const seen = new Map<string, string>();
  for (const f of files) {
    const key = f.path.toLowerCase();
    const prev = seen.get(key);
    if (prev !== undefined) {
      throw new Error(
        `[Pyreon] lathe: two generated files map to the same path (\`${prev}\` and \`${f.path}\`) — one would overwrite the other. This is a lathe naming bug; please report it with the spec's tag and operation names.`,
      );
    }
    seen.set(key, f.path);
  }
}

/**
 * Decide, per operation, whether the generated code can reach native.
 *
 * Static and cheap — it reads the IR, not the emitted source, so the CLI can
 * report reach even when the native compiler is absent. `verifyNative` is the
 * stronger check and runs the real compiler; this is the explanation of WHY,
 * which a compiler warning alone does not give in spec terms.
 */
function reachOf(
  doc: IrDocument,
  config: ResolvedConfig,
): Map<string, { reach: Reach; reason?: string }> {
  const out = new Map<string, { reach: Reach; reason?: string }>();
  const baseUrl = config.baseUrl ?? doc.baseUrl;
  for (const op of doc.operations) {
    out.set(op.id, decide(op, op.baseUrl ?? baseUrl));
  }
  return out;
}

function decide(
  op: IrOperation,
  baseUrl: string,
): { reach: Reach; reason?: string } {
  if (baseUrl === "") {
    return {
      reach: "web-only",
      reason:
        "no absolute baseUrl — PMTC bakes the request URL at compile time and cannot resolve a relative one.",
    };
  }
  if (!/^https?:\/\//.test(baseUrl)) {
    return {
      reach: "web-only",
      reason: `baseUrl \`${baseUrl}\` is not absolute.`,
    };
  }
  // A path parameter used to disqualify an operation, because PMTC resolved
  // the endpoint URL to a compile-time constant. It no longer does: a runtime
  // `:param` lowers through `useQuery`, whose native harness is keyed on the
  // resulting URL and therefore re-fetches when the value changes. The
  // generated component takes the param as a PROP.
  //
  // Left as a comment rather than deleted because the reason it USED to be
  // here is the reason the generated native layout looks the way it does.
  if (op.method !== "GET" && isStreamOnly(op)) {
    // Not the mutation reason: PMTC DOES lower a hand-written non-GET stream
    // (`enabled` as the trigger, a runtime `json` body serialized per run).
    // What is missing is the GENERATED surface — every generated native
    // component opens on mount and takes only params as props.
    return {
      reach: "web-only",
      reason: `a \`${op.method}\` stream is started by the user with a body, and Lathe's generated native components open on mount with params as their only props -- there is no generated surface for a trigger and a body yet. PMTC lowers a hand-written one: \`useStream(src, { enabled: () => sent() })\` with a runtime \`json\` body.`,
    };
  }
  if (op.method !== "GET") {
    return {
      reach: "web-only",
      reason: `\`${op.method}\` lowers through mutations, which PMTC does not yet recognise; GET operations on this client DO reach native.`,
    };
  }
  if (isStreamOnly(op)) {
    // A stream lowers through `useStream` to the native stream runtime, and is
    // decoded INTO its declared event type -- asked of the emitter, so the
    // report and the native layout agree about which streams get a component.
    if (hasNativeStreamComponent(op)) return { reach: "web+native" };
    return {
      reach: "web-only",
      reason:
        op.hook === false
          ? "its hook is turned off (`operations.<id>.hook: false`, `naming.hook` or a plugin), so no native stream component is generated."
          : "a streaming response (SSE / NDJSON) with no declared event type -- a native stream decodes each event into a declared type, so there is nothing to lower it to. Declare one with `lathe: { streams: { <op>: { event: 'Model' } } }` (or `data: 'text'` for raw SSE).",
    };
  }
  if (op.hook === false) {
    return {
      reach: "web-only",
      reason:
        "its hook is turned off (`operations.<id>.hook: false`, `naming.hook` or a plugin), so no native data component is generated.",
    };
  }
  // Asked of the emitter rather than re-derived: the reach report and the
  // native layout must agree about which reads get a data component.
  if (!hasNativeDataComponent(op)) {
    return {
      reach: "web-only",
      reason:
        "no typed JSON response (no content, or a media type Lathe cannot type) -- a native query decodes into a declared type, so there is nothing to lower it to.",
    };
  }
  return { reach: "web+native" };
}

export type { GeneratedFile };
