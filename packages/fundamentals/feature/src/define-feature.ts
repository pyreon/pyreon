import { onUnmount } from '@pyreon/core'
import type { SchemaValidateFn } from '@pyreon/form'
import { useForm as _useForm } from '@pyreon/form'
import { createFieldComponent } from './field'
import type { QueryKey } from '@pyreon/query'
import { useMutation as _useMutation, useQuery as _useQuery, useQueryClient } from '@pyreon/query'
import {
  createFetchTransport,
  createHttp,
  type HttpMethod,
  type RequestOptions,
} from '@pyreon/http'
import { batch, signal } from '@pyreon/reactivity'
import { defineStore } from '@pyreon/store'
import type { ColumnDef, SortingState } from '@pyreon/table'
import { useTable as _useTable } from '@pyreon/table'
import { createTableComponent } from './table-render'
import { isStandardSchema, standardSchemaToValidator, zodSchema } from '@pyreon/validation'
import { defaultInitialValues, extractFields } from './schema'
import { type FeatureTableFeatures, featureTableFeatures } from './table-features'
import type {
  Feature,
  FeatureConfig,
  FeatureFormOptions,
  FeatureStore,
  FeatureTableOptions,
  ListOptions,
} from './types'

// ─── Fetch wrapper ────────────────────────────────────────────────────────────

/**
 * The REST layer, on `@pyreon/http`.
 *
 * ## Why this migrated
 *
 * The hand-rolled version took no `AbortSignal`, and every read hook called
 * it as `queryFn: () => http.getById(api, id)`. TanStack always passes
 * `{ signal }` and aborts it on unmount or supersede, so dropping it meant
 * cancellation was silently dead for EVERY feature-driven query since the
 * package shipped: an unmounted component kept fetching, and a retyped
 * search raced its own stale responses into the cache.
 *
 * Routing through the client also fixes un-encoded path interpolation
 * (`${url}/${id}` let an id containing "/" escape its segment) and gives
 * the requests a deadline, which raw `fetch` has none of.
 *
 * ## What is deliberately UNCHANGED
 *
 * The thrown error shape is feature's public contract — `message` from the
 * body when present else `<METHOD> <url> failed: <status>`, plus `status`,
 * plus `errors` ONLY when the body carries them. `@pyreon/http`'s own
 * `HttpError` has a different message and no `errors`, so the client runs
 * with `throwHttpErrors: false` and the existing extraction is preserved
 * verbatim. Migrating the transport must not silently re-shape what
 * consumers catch.
 */
function createFetcher(baseFetcher?: typeof fetch) {
  const client = createHttp({
    // Feature owns its error contract — see above.
    throwHttpErrors: false,
    // `config.fetcher` stays a plain `typeof fetch` for back-compat.
    ...(baseFetcher ? { transport: createFetchTransport(baseFetcher) } : {}),
  })

  async function request<T>(
    method: HttpMethod,
    path: string,
    options: RequestOptions & { displayUrl: string },
  ): Promise<T> {
    const { displayUrl, ...requestOptions } = options
    const res = await client.request(method, path, requestOptions)

    if (!res.ok) {
      let message = `${method} ${displayUrl} failed: ${res.status}`
      try {
        const body = await res.raw.json()
        if (body?.message) message = body.message
        if (body?.errors) {
          throw Object.assign(new Error(message), {
            status: res.status,
            errors: body.errors,
          })
        }
      } catch (e) {
        if (e instanceof Error && 'errors' in e) throw e
      }
      throw Object.assign(new Error(message), { status: res.status })
    }

    if (res.status === 204) return undefined as T
    return res.raw.json() as Promise<T>
  }

  return {
    list<T>(
      url: string,
      params?: Record<string, string | number | boolean>,
      abortSignal?: AbortSignal,
    ): Promise<T[]> {
      const query = params
        ? `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()}`
        : ''
      return request<T[]>('GET', url, {
        ...(params ? { query: params } : {}),
        ...(abortSignal ? { signal: abortSignal } : {}),
        displayUrl: `${url}${query}`,
      })
    },
    getById<T>(url: string, id: string | number, abortSignal?: AbortSignal): Promise<T> {
      return request<T>('GET', `${url}/:id`, {
        params: { id },
        ...(abortSignal ? { signal: abortSignal } : {}),
        displayUrl: `${url}/${id}`,
      })
    },
    create<T>(url: string, data: unknown): Promise<T> {
      return request<T>('POST', url, { json: data, displayUrl: url })
    },
    update<T>(url: string, id: string | number, data: unknown): Promise<T> {
      return request<T>('PUT', `${url}/:id`, {
        params: { id },
        json: data,
        displayUrl: `${url}/${id}`,
      })
    },
    delete(url: string, id: string | number): Promise<void> {
      return request<void>('DELETE', `${url}/:id`, {
        params: { id },
        displayUrl: `${url}/${id}`,
      })
    },
  }
}

// ─── Schema validation ────────────────────────────────────────────────────────

function createValidator<TValues extends Record<string, unknown>>(
  schema: unknown,
  customValidate?: SchemaValidateFn<TValues>,
): SchemaValidateFn<TValues> | undefined {
  if (customValidate) return customValidate

  // Zod (v3/v4): the schema object exposes `safeParseAsync` — route it through
  // @pyreon/validation's typed zod adapter (the original path, kept first so
  // Zod behaviour is byte-identical).
  if (
    schema &&
    typeof schema === 'object' &&
    typeof (schema as Record<string, unknown>).safeParseAsync === 'function'
  ) {
    return zodSchema(schema as Parameters<typeof zodSchema>[0])
      .validator as SchemaValidateFn<TValues>
  }

  // Valibot / ArkType / any other Standard Schema (`~standard`) validator.
  // These carry NO `safeParseAsync`, so the Zod branch above skips them.
  // Without this branch a Valibot/ArkType feature silently received NO form
  // validation despite the documented "Zod / Valibot / ArkType" support — the
  // silent-schema-drop class (see anti-patterns "a whole-form schema error
  // keyed by a path that doesn't match…"). `standardSchemaToValidator`
  // produces the same field-keyed error record the form consumes, mirroring
  // @pyreon/form's own `resolveSchemaValidator`.
  //
  // `isStandardSchema` detects BOTH object-shaped AND callable `~standard`
  // schemas (Valibot / ArkType / Zod v4 / `@pyreon/validate`'s `s`) — ArkType's
  // `type(...)` is a FUNCTION carrying `~standard`. (feature used to duck-type
  // this locally because validation's guard was over-narrow; #2243 fixed the
  // guard to accept callables, so the local workaround is gone.)
  if (isStandardSchema(schema)) {
    return standardSchemaToValidator<TValues>(schema)
  }

  return undefined
}

// ─── Resolve page value ───────────────────────────────────────────────────────

function resolvePageValue(page: number | (() => number) | undefined): number | undefined {
  if (page === undefined) return undefined
  if (typeof page === 'function') return page()
  return page
}

// ─── defineFeature ────────────────────────────────────────────────────────────

/**
 * Define a schema-driven feature with auto-generated CRUD hooks.
 *
 * @example
 * ```ts
 * import { defineFeature } from '@pyreon/feature'
 * import { z } from 'zod'
 *
 * const users = defineFeature({
 *   name: 'users',
 *   schema: z.object({
 *     name: z.string().min(2),
 *     email: z.string().email(),
 *     role: z.enum(['admin', 'editor', 'viewer']),
 *   }),
 *   api: '/api/users',
 * })
 * ```
 */
export function defineFeature<TValues extends Record<string, unknown>>(
  config: FeatureConfig<TValues>,
): Feature<TValues> {
  const { name, schema, api, fetcher: customFetcher } = config
  const http = createFetcher(customFetcher)

  // Introspect schema fields
  const fields = extractFields(schema)
  const autoInitialValues = defaultInitialValues(fields) as TValues
  const initialValues = config.initialValues
    ? { ...autoInitialValues, ...config.initialValues }
    : autoInitialValues

  const validate = createValidator<TValues>(schema, config.validate)

  // Field introspection (`extractFields`) only understands Zod's shape. A real
  // NON-Zod Standard Schema validator (Valibot, ArkType, …) yields ZERO fields,
  // so the auto-derived form registers no fields and the first `setFieldValue`
  // throws a confusing "[@pyreon/form] Field … does not exist". Validation and
  // the query hooks are schema-agnostic and still work — but the user must
  // supply `initialValues` (for useForm) + `columns` (for useTable) explicitly.
  // Warn ONCE (per defineFeature call) with the actionable fix instead of
  // leaving the downstream error to be traced. Gated on a REAL Standard Schema
  // (never a plain type-only `{ _output }` map) that is NOT Zod, and only when
  // no explicit `initialValues` was given (the case that actually breaks).
  const looksLikeZod =
    schema != null &&
    typeof (schema as unknown as Record<string, unknown>).safeParseAsync === 'function'
  if (
    process.env.NODE_ENV !== 'production' &&
    fields.length === 0 &&
    !config.initialValues &&
    !looksLikeZod &&
    isStandardSchema(schema)
  ) {
    console.warn(
      `[Pyreon] defineFeature("${name}"): schema field introspection only ` +
        `supports Zod, so no fields were derived from this schema. Validation ` +
        `and the query hooks still work, but useForm() will have no fields ` +
        `(setFieldValue throws) and useTable() will have no columns. Pass ` +
        `initialValues (and columns for useTable) explicitly, e.g. ` +
        `defineFeature({ name: "${name}", schema, api, initialValues: { … } }).`,
    )
  }

  const queryKeyBase = [name] as const
  const queryKey = (suffix?: string | number): QueryKey =>
    suffix !== undefined ? [name, suffix] : [name]

  // ─── Store definition ──────────────────────────────────────────────

  const useStoreHook = defineStore<FeatureStore<TValues>>(name, () => {
    const items = signal<TValues[]>([])
    const selected = signal<TValues | null>(null)
    const loading = signal(false)

    const select = (id: string | number) => {
      const found = items.peek().find((item) => {
        const record = item as Record<string, unknown>
        return record.id === id
      })
      selected.set(found ?? null)
    }

    const clear = () => {
      selected.set(null)
    }

    return { items, selected, loading, select, clear }
  })

  return {
    name,
    api,
    schema,
    fields,
    queryKey,

    // ─── Table renderer ──────────────────────────────────────────────

    Table: createTableComponent<TValues>(),

    // ─── Store ───────────────────────────────────────────────────────

    useStore: useStoreHook,

    // ─── Queries ────────────────────────────────────────────────────

    useList(options?: ListOptions) {
      return _useQuery(() => {
        const pageValue = resolvePageValue(options?.page)
        const pageSize = options?.pageSize ?? 20

        const params: Record<string, string | number | boolean> = {
          ...options?.params,
        }

        if (pageValue !== undefined) {
          params.page = pageValue
          params.pageSize = pageSize
        }

        const queryKeyParts: unknown[] = [...queryKeyBase, 'list', params]

        return {
          queryKey: queryKeyParts as QueryKey,
          // `{ signal }` is TanStack's per-fetch AbortSignal. Forwarding it
          // is what makes cancellation work at all; dropping it (as this
          // did until now) leaves an unmounted component fetching.
          queryFn: ({ signal: abortSignal }) =>
            http.list<TValues>(
              api,
              Object.keys(params).length > 0 ? params : undefined,
              abortSignal,
            ),
          ...(options?.staleTime != null ? { staleTime: options.staleTime } : {}),
          ...(options?.enabled != null ? { enabled: options.enabled } : {}),
        }
      })
    },

    useById(id: string | number) {
      return _useQuery(() => ({
        queryKey: [name, id],
        queryFn: ({ signal: abortSignal }) => http.getById<TValues>(api, id, abortSignal),
        enabled: id !== undefined && id !== null,
      }))
    },

    useSearch(searchTerm, options?: ListOptions) {
      return _useQuery(() => ({
        queryKey: [...queryKeyBase, 'search', searchTerm()],
        queryFn: ({ signal: abortSignal }) =>
          http.list<TValues>(api, { ...options?.params, q: searchTerm() }, abortSignal),
        enabled: searchTerm().length > 0,
        ...(options?.staleTime != null ? { staleTime: options.staleTime } : {}),
      }))
    },

    // ─── Mutations ──────────────────────────────────────────────────

    useCreate() {
      const client = useQueryClient()
      return _useMutation({
        mutationFn: (data: Partial<TValues>) => http.create<TValues>(api, data),
        onSuccess: () => {
          client.invalidateQueries({
            queryKey: queryKeyBase as unknown as QueryKey,
          })
        },
      })
    },

    useUpdate() {
      type TVariables = { id: string | number; data: Partial<TValues> }
      const client = useQueryClient()
      return _useMutation<TValues, unknown, TVariables, { previous?: unknown }>({
        mutationFn: ({ id, data }: TVariables) => http.update<TValues>(api, id, data),
        onMutate: async (variables) => {
          await client.cancelQueries({ queryKey: [name, variables.id] })
          const previous = client.getQueryData([name, variables.id])
          client.setQueryData([name, variables.id], (old: unknown) => {
            if (old && typeof old === 'object') {
              return { ...old, ...variables.data }
            }
            return variables.data
          })
          return { previous }
        },
        onError: (_err, variables, context) => {
          if (context?.previous) {
            client.setQueryData([name, variables.id], context.previous)
          }
        },
        onSuccess: (_data, variables) => {
          client.invalidateQueries({
            queryKey: queryKeyBase as unknown as QueryKey,
          })
          client.invalidateQueries({ queryKey: [name, variables.id] })
        },
      }) as ReturnType<Feature<TValues>['useUpdate']>
    },

    useDelete() {
      const client = useQueryClient()
      return _useMutation({
        mutationFn: (id: string | number) => http.delete(api, id),
        onSuccess: () => {
          client.invalidateQueries({
            queryKey: queryKeyBase as unknown as QueryKey,
          })
        },
      })
    },

    // ─── Field (schema-driven per-field renderer) ───────────────────

    Field: createFieldComponent<TValues>(fields),

    // ─── Form ───────────────────────────────────────────────────────

    useForm(options?: FeatureFormOptions<TValues>) {
      const mode = options?.mode ?? 'create'
      const mergedInitial = {
        ...initialValues,
        ...options?.initialValues,
      } as TValues
      const client = useQueryClient()

      const form = _useForm<TValues>({
        initialValues: mergedInitial,
        ...(validate != null ? { schema: validate } : {}),
        validateOn: options?.validateOn ?? 'blur',
        onSubmit: async (values) => {
          try {
            let result: unknown
            if (mode === 'edit' && options?.id !== undefined) {
              result = await http.update<TValues>(api, options.id, values)
              // Invalidate the list AND the per-id query — mirrors
              // useUpdate()'s mutation behaviour so any list/detail
              // view auto-refetches after the form's submit succeeds.
              client.invalidateQueries({
                queryKey: queryKeyBase as unknown as QueryKey,
              })
              client.invalidateQueries({ queryKey: [name, options.id] })
            } else {
              result = await http.create<TValues>(api, values)
              // Invalidate the list query — without this, the list view
              // doesn't refetch after the form creates a new item and
              // the UI silently doesn't show the new entry until reload.
              // Mirrors useCreate()'s mutation onSuccess behaviour so
              // feature.useForm has parity with feature.useCreate.
              client.invalidateQueries({
                queryKey: queryKeyBase as unknown as QueryKey,
              })
            }
            options?.onSuccess?.(result)
          } catch (err) {
            options?.onError?.(err)
            throw err
          }
        },
      })

      // Auto-fetch in edit mode. The getById promise resolves
      // asynchronously, so the component can unmount before it settles
      // (route nav away, list re-render). Without a guard, the late
      // .then would call setFieldValue / isSubmitting.set on a form
      // whose scope is gone — the stale-promise class (see
      // .claude/rules/anti-patterns.md "Memory Leak Classes" → F, and
      // the storage/charts/createResource precedents). onUnmount fires
      // on the owning component's disposal; the cancelled flag skips
      // both settle branches after unmount.
      if (mode === 'edit' && options?.id !== undefined) {
        let cancelled = false
        onUnmount(() => {
          cancelled = true
        })
        form.isSubmitting.set(true)
        http.getById<TValues>(api, options.id).then(
          (data) => {
            if (cancelled) return
            batch(() => {
              for (const key of Object.keys(data)) {
                // Only populate REGISTERED form fields. A real backend returns
                // server-only keys (`id`, `createdAt`, `updatedAt`, relations)
                // that aren't schema fields — and `form.setFieldValue` THROWS on
                // an unknown field. Inside this batch that throw would abort
                // before `isSubmitting.set(false)`, leaving the form stuck
                // submitting (button disabled, fields unpopulated) with an
                // unhandled rejection. Skip anything not in the field set.
                if (!(key in mergedInitial)) continue
                form.setFieldValue(
                  key as keyof TValues & string,
                  (data as Record<string, unknown>)[key] as TValues[keyof TValues],
                )
              }
              form.isSubmitting.set(false)
            })
          },
          () => {
            if (cancelled) return
            form.isSubmitting.set(false)
          },
        )
      }

      return form
    },

    // ─── Table ──────────────────────────────────────────────────────

    useTable(data: TValues[] | (() => TValues[]), options?: FeatureTableOptions<TValues>) {
      const visibleFields = options?.columns
        ? fields.filter((f) => options.columns!.includes(f.name as keyof TValues & string))
        : fields

      const columns: ColumnDef<FeatureTableFeatures, TValues, unknown>[] = visibleFields.map(
        (field) => ({
          accessorKey: field.name,
          header: field.label,
          ...options?.columnOverrides?.[field.name as keyof TValues & string],
        }),
      )

      const sorting = signal<SortingState>([])
      const globalFilter = signal('')

      // `sorting` and `globalFilter` are CONTROLLED: supplying
      // `onSortingChange` / `onGlobalFilterChange` replaces core's own state
      // updater for that slice, so the table no longer self-updates it — the
      // callback writes the signal, `options()` re-runs (it reads both
      // signals), and `useTable`'s effect pushes the new `state` back in. The
      // round trip is what makes `result.sorting` a real two-way binding
      // rather than a mirror.
      const table = _useTable<FeatureTableFeatures, TValues>(() => ({
        features: featureTableFeatures,
        data: typeof data === 'function' ? data() : data,
        columns,
        // Only pageSize needs a starting value; every other slice starts blank.
        // `initialState` is read once at construction (v9 keeps it out of later
        // option merges), which is correct — pageSize is a static option.
        ...(options?.pageSize
          ? { initialState: { pagination: { pageIndex: 0, pageSize: options.pageSize } } }
          : {}),
        // No pageSize → pagination off. `manualPagination` makes
        // `getPaginatedRowModel()` return the pre-paginated rows, i.e. all of
        // them, which is exactly what omitting the row model did under v8. The
        // feature stays registered so `TFeatures` is one static type (see
        // `table-features.ts`) and the pagination APIs remain available.
        manualPagination: !options?.pageSize,
        state: {
          sorting: sorting(),
          globalFilter: globalFilter(),
        },
        onSortingChange: (updater: unknown) => {
          sorting.set(
            typeof updater === 'function'
              ? (updater as (prev: SortingState) => SortingState)(sorting())
              : (updater as SortingState),
          )
        },
        onGlobalFilterChange: (updater: unknown) => {
          globalFilter.set(
            typeof updater === 'function'
              ? (updater as (prev: string) => string)(globalFilter())
              : (updater as string),
          )
        },
      }))

      return {
        table,
        sorting,
        globalFilter,
        columns: visibleFields,
      }
    },
  }
}
