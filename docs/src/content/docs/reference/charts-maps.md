---
title: "@pyreon/charts-maps — API Reference"
description: "Boundary data for @pyreon/charts maps — world countries and US states as TopoJSON, one lazy module per map"
---

> **Generated** from `charts-maps`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest.

Boundary data for `<MapChart>`: `@pyreon/charts-maps/world-110m` (the countries of the world, Natural Earth 1:110m, joined on ISO alpha-3) and `@pyreon/charts-maps/us-states` (the 50 states, DC and Puerto Rico, Census 1:20m, joined on FIPS). Each subpath default-exports a `MapModule` — the topology plus the projection it was prepared for (Equal Earth for the world, Albers USA for the US), the name property and the join key — so `<MapChart map={world} values={...}>` just works and an app bundles only the maps it imports. Public-domain sources, pinned and checksummed; the data is committed and nothing is fetched at install or run time.

## Multiplatform

**Tier:** Web-only — the browser package; the native story is stated below

it is DATA: TopoJSON modules a web `<MapChart>` decodes at load. A native map takes a precomputed `GeoShape[]` const (a world boundary constant that compiles within the Swift and Kotlin limits is under investigation), so these modules are not lowered to iOS or Android yet.

See [Multiplatform](/docs/multiplatform) for the capability matrix and [Multiplatform libraries](/docs/multiplatform-libraries) for every package's tier.

## Features

- world-110m: 177 countries, Natural Earth 1:110m (public domain), joined on ISO 3166-1 alpha-3
- us-states: 50 states + DC + Puerto Rico, Census cartographic boundary 1:20m (public domain), joined on state FIPS
- One module per map with lazy subpath exports — an app bundles only the maps it imports (about 33 KB gzip each)
- Each module carries its default projection (Equal Earth / Albers USA), name property and join key; chart options override
- Pinned, checksummed sources and a regeneration script (`bun run build:data`); SOURCES.md records URLs, dates, licences and the conversion

## Complete example

A full, end-to-end usage of the package:

```tsx
import { MapChart } from '@pyreon/charts'
import world from '@pyreon/charts-maps/world-110m'
import usStates from '@pyreon/charts-maps/us-states'

// Values join on the feature id: ISO 3166-1 alpha-3 for the world, the two-digit state FIPS code for the US.
<MapChart map={world} values={{ DEU: 83, FRA: 68, BRA: 215 }} height={360} />
<MapChart map={usStates} values={{ '06': 39, '48': 30 }} height={400} />

// An explicit option still wins over the map's own default projection:
<MapChart map={world} options={{ projection: 'naturalEarth1' }} values={{ DEU: 83 }} />

// Lazy: the map is fetched when it is first needed.
const { default: lazyWorld } = await import('@pyreon/charts-maps/world-110m')
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`world-110m`](#world-110m-function) | function | The countries of the world as a `MapModule` for `<MapChart map>`: Natural Earth 1:110m TopoJSON (object `countries`),… |
| [`us-states`](#us-states-function) | function | The 50 US states, DC and Puerto Rico as a `MapModule`: Census cartographic boundary 1:20m TopoJSON (object `states`),… |

## API

### `world-110m` `function`

```ts
import world from '@pyreon/charts-maps/world-110m'  // MapModule
```

The countries of the world as a `MapModule` for `<MapChart map>`: Natural Earth 1:110m TopoJSON (object `countries`), joined on the ISO 3166-1 alpha-3 feature id, named by `properties.name`, prepared for the Equal Earth projection. About 33 KB gzip.

**Example**

```tsx
import { MapChart } from '@pyreon/charts'
import world from '@pyreon/charts-maps/world-110m'

<MapChart map={world} values={{ DEU: 83, FRA: 68 }} />
```

**Common mistakes**

- Joining values on the country NAME — the key is the ISO alpha-3 id (`DEU`), not `Germany`; the display name is only the label
- Importing from the package root for the data — the root is types and a list; each map is its own subpath (`@pyreon/charts-maps/world-110m`) so it bundles only when imported
- Expecting a disputed border to match your convention — Natural Earth draws de facto lines; this package takes no position on them

**See also:** `us-states`

---

### `us-states` `function`

```ts
import usStates from '@pyreon/charts-maps/us-states'  // MapModule
```

The 50 US states, DC and Puerto Rico as a `MapModule`: Census cartographic boundary 1:20m TopoJSON (object `states`), joined on the two-digit state FIPS feature id (`"06"`), named by `properties.name`, prepared for Albers USA (Alaska and Hawaii in insets). About 34 KB gzip.

**Example**

```tsx
import { MapChart } from '@pyreon/charts'
import usStates from '@pyreon/charts-maps/us-states'

<MapChart map={usStates} values={{ '06': 39, '48': 30 }} />
```

**Common mistakes**

- Writing FIPS codes as numbers — the id is a TWO-CHARACTER STRING (`"06"`, not `6`), so a numeric key never matches
- Expecting counties — this is states only; the larger county file was measured (about 229 KB gzip) and left out

**See also:** `world-110m`

---

## Package-level notes

> **Per-map defaults, explicit options win:** A `MapModule` carries `projection`, `nameProperty` and `idProperty`; `<MapChart map={module}>` uses them, and any value you pass in `options` overrides the matching default.
