---
title: Connector Document
description: Bridge between Pyreon UI system styled components and @pyreon/document for multi-format rendering.
---

`@pyreon/connector-document` bridges Pyreon's UI system styled components with the `@pyreon/document` rendering pipeline, enabling styled components to render across 14+ output formats (PDF, DOCX, email, etc.).

<PackageBadge name="@pyreon/connector-document" href="/docs/connector-document" />

## Installation

::: code-group

```bash [npm]
npm install @pyreon/connector-document
```

```bash [bun]
bun add @pyreon/connector-document
```

```bash [pnpm]
pnpm add @pyreon/connector-document
```

```bash [yarn]
yarn add @pyreon/connector-document
```

:::

## Overview

When you build components with `@pyreon/rocketstyle` or `@pyreon/styler`, their styles live in the CSS-in-JS layer. To export those components to non-browser formats (PDF, DOCX, Slack, etc.) via `@pyreon/document`, the styles need to be extracted and converted into a format the document renderers understand.

`@pyreon/connector-document` handles this extraction. It walks a styled component tree, resolves all CSS-in-JS styles into inline style objects, and produces a document node tree that `@pyreon/document` renderers can consume.

## How It Works

1. **Extract** -- `extractDocumentTree()` traverses a Pyreon component tree and collects the rendered output along with resolved styles.
2. **Resolve** -- `resolveStyles()` converts CSS class-based styles into flat style objects compatible with document primitives.
3. **Parse** -- CSS value parsers (`parseCssDimension`, `parseBoxModel`, `parseFontWeight`, `parseLineHeight`) normalize CSS values into the units expected by each output format.

## Usage

```tsx
import { extractDocumentTree, resolveStyles } from "@pyreon/connector-document";
import { render } from "@pyreon/document";

// Extract the styled component tree into document nodes
const tree = extractDocumentTree(MyStyledComponent, { data: myData });

// Render to any format
const pdf = await render(tree, "pdf");
const docx = await render(tree, "docx");
const email = await render(tree, "email");
```

## CSS Value Parsers

The package includes parsers that normalize CSS values for document renderers:

```tsx
import {
  parseCssDimension,
  parseBoxModel,
  parseFontWeight,
  parseLineHeight,
} from "@pyreon/connector-document";

parseCssDimension("16px"); // { value: 16, unit: 'px' }
parseCssDimension("1.5rem"); // { value: 1.5, unit: 'rem' }
parseBoxModel("8px 16px"); // { top: 8, right: 16, bottom: 8, left: 16 }
parseFontWeight("bold"); // 700
parseLineHeight("1.5"); // 1.5
```

## API Reference

| Export                | Type     | Description                                                        |
| --------------------- | -------- | ------------------------------------------------------------------ |
| `extractDocumentTree` | Function | Walks a styled component tree and produces document nodes          |
| `resolveStyles`       | Function | Converts CSS classes to inline style objects                       |
| `parseCssDimension`   | Function | Parses a CSS dimension string (e.g., `'16px'`) into value and unit |
| `parseBoxModel`       | Function | Parses CSS box model shorthand (margin/padding)                    |
| `parseFontWeight`     | Function | Parses CSS font-weight keywords and numbers                        |
| `parseLineHeight`     | Function | Parses CSS line-height values                                      |

## Types

| Type             | Description                                         |
| ---------------- | --------------------------------------------------- |
| `DocNode`        | A node in the extracted document tree               |
| `DocChild`       | Child node type (text string or DocNode)            |
| `NodeType`       | Union of document node type identifiers             |
| `ResolvedStyles` | Flat style object after CSS resolution              |
| `ExtractOptions` | Options for `extractDocumentTree`                   |
| `DocumentMarker` | Marker interface for document extraction boundaries |

## Key Features

- Connects styler-powered components to document primitives
- Enables design-system-consistent exports across 14+ formats
- CSS value parsers for normalizing dimensions, box model, font weight, and line height
- Works with `@pyreon/rocketstyle` and `@pyreon/styler` components
- Produces document node trees compatible with all `@pyreon/document` renderers
