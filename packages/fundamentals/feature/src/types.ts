import type { FormState, SchemaValidateFn } from "@pyreon/form";
import type { QueryKey, UseMutationResult, UseQueryResult } from "@pyreon/query";
import type { Computed, Signal } from "@pyreon/reactivity";
import type { StoreApi } from "@pyreon/store";
import type { SortingState } from "@pyreon/table";
import type { FieldInfo } from "./schema";

/**
 * Duck-typed schema inference. Matches Zod (`_output`), Valibot, ArkType
 * without importing their types. Allows TypeScript to infer TValues from schema.
 */
export type InferSchemaValues<TSchema> = TSchema extends {
  _output: infer T extends Record<string, unknown>;
}
  ? T // Zod v3/v4: z.ZodType has _output
  : TSchema extends { infer: infer T extends Record<string, unknown> }
    ? T // ArkType
    : Record<string, unknown>;

/**
 * Configuration for defining a feature.
 */
export interface FeatureConfig<TValues extends Record<string, unknown>> {
  /** Unique feature name — used for store ID and query key namespace. */
  name: string;
  /** Validation schema (Zod, Valibot, or ArkType). Duck-typed — must have `safeParseAsync` for auto-validation.
   * Zod schemas carry `_output` for automatic TValues inference. */
  schema: { _output?: TValues } & Record<never, never>;
  /** Custom schema-level validation function. If provided, overrides auto-detection from schema. */
  validate?: SchemaValidateFn<TValues>;
  /** API base path (e.g., '/api/users'). */
  api: string;
  /** Default initial values for create forms. If not provided, auto-generated from schema field types. */
  initialValues?: Partial<TValues>;
  /** Custom fetch function. Defaults to global fetch. */
  fetcher?: typeof fetch;
}

/**
 * Query options for useList.
 */
export interface ListOptions {
  /** Additional query parameters appended to the URL. */
  params?: Record<string, string | number | boolean>;
  /** Reactive page number. When provided, `page` and `pageSize` are appended to query params. */
  page?: number | Signal<number>;
  /** Items per page. Defaults to 20 when `page` is provided. */
  pageSize?: number;
  /** Override stale time for this query. */
  staleTime?: number;
  /** Enable/disable the query. */
  enabled?: boolean;
}

/**
 * Form options for useForm.
 */
export interface FeatureFormOptions<TValues extends Record<string, unknown>> {
  /** 'create' (default) or 'edit'. Edit mode uses PUT instead of POST. */
  mode?: "create" | "edit";
  /** Item ID — required when mode is 'edit'. Used to PUT to api/:id and auto-fetch data. */
  id?: string | number;
  /** Override initial values (merged with feature defaults). */
  initialValues?: Partial<TValues>;
  /** When to validate: 'blur' (default), 'change', or 'submit'. */
  validateOn?: "blur" | "change" | "submit";
  /** Callback after successful create/update. */
  onSuccess?: (result: unknown) => void;
  /** Callback on submit error. */
  onError?: (error: unknown) => void;
}

/**
 * Table options for useTable.
 */
export interface FeatureTableOptions<TValues extends Record<string, unknown>> {
  /** Subset of schema fields to show as columns. If not provided, all fields are shown. */
  columns?: (keyof TValues & string)[];
  /** Per-column overrides (header text, cell renderer, size, etc.). */
  columnOverrides?: Partial<Record<keyof TValues & string, Record<string, unknown>>>;
  /** Page size for pagination. If not provided, pagination is disabled. */
  pageSize?: number;
}

/**
 * Return type of feature.useTable().
 */
export interface FeatureTableResult<TValues extends Record<string, unknown>> {
  /** The reactive TanStack Table instance. */
  table: Computed<import("@pyreon/table").Table<TValues>>;
  /** Sorting state signal — bind to UI controls. */
  sorting: Signal<SortingState>;
  /** Global filter signal — bind to search input. */
  globalFilter: Signal<string>;
  /** Column metadata from schema introspection. */
  columns: FieldInfo[];
}

/**
 * Reactive store for a feature's cached data.
 */
export interface FeatureStore<TValues extends Record<string, unknown>> {
  /** Cached list of items. */
  items: Signal<TValues[]>;
  /** Currently selected item. */
  selected: Signal<TValues | null>;
  /** Loading state. */
  loading: Signal<boolean>;
  /** Set the selected item by ID (finds from items list). */
  select: (id: string | number) => void;
  /** Clear the current selection. */
  clear: () => void;
  /** Index signature for Record<string, unknown> compatibility. */
  [key: string]: unknown;
}

/**
 * The feature object returned by defineFeature().
 */
export interface Feature<TValues extends Record<string, unknown>> {
  /** Feature name. */
  name: string;
  /** API base path. */
  api: string;
  /** The schema passed to defineFeature. */
  schema: unknown;
  /** Introspected field information from the schema. */
  fields: FieldInfo[];

  /** Fetch a paginated/filtered list. */
  useList: (options?: ListOptions) => UseQueryResult<TValues[], unknown>;

  /** Fetch a single item by ID. */
  useById: (id: string | number) => UseQueryResult<TValues, unknown>;

  /** Search with a reactive signal term. */
  useSearch: (
    searchTerm: Signal<string>,
    options?: ListOptions,
  ) => UseQueryResult<TValues[], unknown>;

  /** Create mutation — POST to api. */
  useCreate: () => UseMutationResult<TValues, unknown, Partial<TValues>>;

  /** Update mutation — PUT to api/:id with optimistic updates. */
  useUpdate: () => UseMutationResult<
    TValues,
    unknown,
    { id: string | number; data: Partial<TValues> }
  >;

  /** Delete mutation — DELETE to api/:id. */
  useDelete: () => UseMutationResult<void, unknown, string | number>;

  /** Create a form pre-wired with schema validation and API submit. In edit mode with an ID, auto-fetches data. */
  useForm: (options?: FeatureFormOptions<TValues>) => FormState<TValues>;

  /** Create a reactive table with columns inferred from schema. */
  useTable: (
    data: TValues[] | (() => TValues[]),
    options?: FeatureTableOptions<TValues>,
  ) => FeatureTableResult<TValues>;

  /** Reactive store for cached items, selection, and loading state. */
  useStore: () => StoreApi<FeatureStore<TValues>>;

  /** Generate namespaced query keys. */
  queryKey: (suffix?: string | number) => QueryKey;
}
