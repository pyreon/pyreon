---
title: Document Primitives
description: Rocketstyle document components that render in the browser and export to 18 formats.
---

`@pyreon/document-primitives` provides pre-styled document components built with `@pyreon/rocketstyle` that render in the browser and export to 18 formats via `@pyreon/document`.

<PackageBadge name="@pyreon/document-primitives" href="/docs/document-primitives" />

## Installation

::: code-group

```bash [npm]
npm install @pyreon/document-primitives
```

```bash [bun]
bun add @pyreon/document-primitives
```

```bash [pnpm]
pnpm add @pyreon/document-primitives
```

```bash [yarn]
yarn add @pyreon/document-primitives
```

:::

## Overview

Document Primitives are Rocketstyle-powered components that serve a dual purpose: they render in the browser for live preview and export to any format supported by `@pyreon/document` (PDF, DOCX, email, Slack, etc.). Because they are built on `@pyreon/rocketstyle`, they support multi-dimensional styling (themes, sizes, variants) while maintaining consistent output across all formats.

These primitives mirror the JSX primitives from `@pyreon/document` but add design-system integration through the Pyreon UI system.

## Components

| Component      | Description                                               |
| -------------- | --------------------------------------------------------- |
| `DocDocument`  | Root document container with metadata (title, author)     |
| `DocPage`      | Page with size, orientation, margin, header, footer       |
| `DocSection`   | Layout container with direction, gap, padding, background |
| `DocRow`       | Horizontal layout container                               |
| `DocColumn`    | Column within a row layout                                |
| `DocHeading`   | Heading levels h1--h6                                     |
| `DocText`      | Paragraph with bold, italic, color, size, align           |
| `DocLink`      | Hyperlink                                                 |
| `DocImage`     | Image with width, height, alt, caption                    |
| `DocTable`     | Data table with columns, rows, striped, bordered          |
| `DocList`      | Ordered or unordered list                                 |
| `DocListItem`  | Individual list item                                      |
| `DocCode`      | Code block with language                                  |
| `DocDivider`   | Horizontal rule                                           |
| `DocSpacer`    | Vertical gap                                              |
| `DocButton`    | CTA button (VML in email, styled link in PDF)             |
| `DocQuote`     | Block quote                                               |
| `DocPageBreak` | Force page break (PDF/DOCX)                               |

## Usage

```tsx
import { DocDocument, DocPage, DocHeading, DocText, DocTable } from '@pyreon/document-primitives'
import { render } from '@pyreon/document'

function Invoice({ data }) {
  return (
    <DocDocument title={`Invoice #${data.id}`}>
      <DocPage size="A4" margin={40}>
        <DocHeading>Invoice #{data.id}</DocHeading>
        <DocText color="#666">{data.date}</DocText>
        <DocTable
          columns={[
            { header: 'Item', width: '50%' },
            { header: 'Qty', align: 'center' },
            { header: 'Price', align: 'right' },
          ]}
          rows={data.items.map((i) => [i.name, i.qty, `$${i.price}`])}
          striped
        />
        <DocText bold align="right" size={18}>
          Total: ${data.total}
        </DocText>
      </DocPage>
    </DocDocument>
  )
}

// Render in browser for preview, or export
const pdf = await render(<Invoice data={invoiceData} />, 'pdf')
const email = await render(<Invoice data={invoiceData} />, 'email')
```

## Rocketstyle Integration

Because these components are built with `@pyreon/rocketstyle`, they support dimension-based styling:

```tsx
// DocHeading with theme and size dimensions
<DocHeading theme="primary" size="lg">Large Primary Heading</DocHeading>

// DocButton with variant
<DocButton theme="primary" size="md" href="/pay">Pay Now</DocButton>
```

## Connector Document Bridge

Document Primitives use `@pyreon/connector-document` under the hood to resolve their Rocketstyle-based styles into the format expected by `@pyreon/document` renderers. This means your design tokens (colors, spacing, typography) are preserved consistently across all 18 output formats.

## Key Features

- Rocketstyle-powered primitives with theme, size, and variant dimensions
- Render in the browser for live document preview
- Export to 18 formats via `@pyreon/document` pipeline
- Design-system-consistent output across PDF, DOCX, email, Slack, and more
- Full set of document building blocks (headings, tables, images, buttons, etc.)
- Bridged to document renderers via `@pyreon/connector-document`
