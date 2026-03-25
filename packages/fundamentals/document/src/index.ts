/**
 * @pyreon/document — Universal document rendering for Pyreon.
 *
 * One template, every output format: HTML, PDF, DOCX, email, XLSX,
 * Markdown, plain text, CSV, and custom formats.
 *
 * @example
 * ```tsx
 * import { Document, Page, Heading, Text, Table, render } from '@pyreon/document'
 *
 * const doc = (
 *   <Document title="Report">
 *     <Page>
 *       <Heading>Sales Report</Heading>
 *       <Text>Q4 2026 performance summary.</Text>
 *       <Table
 *         columns={['Region', 'Revenue']}
 *         rows={[['US', '$1M'], ['EU', '$800K']]}
 *       />
 *     </Page>
 *   </Document>
 * )
 *
 * await render(doc, 'pdf')    // → PDF Uint8Array
 * await render(doc, 'email')  // → email-safe HTML string
 * await render(doc, 'md')     // → Markdown string
 * ```
 */

// Builder
export { createDocument } from "./builder"
// Download (browser)
export { download } from "./download"
// Primitives
export {
  Button,
  Code,
  Column,
  Divider,
  Document,
  Heading,
  Image,
  isDocNode,
  Link,
  List,
  ListItem,
  Page,
  PageBreak,
  Quote,
  Row,
  Section,
  Spacer,
  Table,
  Text,
} from "./nodes"

// Render
export {
  _resetRenderers,
  registerRenderer,
  render,
  unregisterRenderer,
} from "./render"

// Types
export type {
  ButtonProps,
  CodeProps,
  ColumnProps,
  DividerProps,
  DocChild,
  DocNode,
  DocumentBuilder,
  DocumentProps,
  DocumentRenderer,
  HeadingProps,
  ImageProps,
  LinkProps,
  ListItemProps,
  ListProps,
  NodeType,
  OutputFormat,
  PageOrientation,
  PageProps,
  PageSize,
  QuoteProps,
  RenderOptions,
  RenderResult,
  ResolvedStyles,
  RowProps,
  SectionProps,
  SpacerProps,
  TableColumn,
  TableProps,
  TextProps,
} from "./types"
