/**
 * `@pyreon/coolgrid/native-plugin` — how `<Container>` / `<Row>` / `<Col>` cross to SwiftUI and Compose.
 *
 * The package OWNS its native lowering: Container and Row retag to the canonical `<Stack>`, and `<Col size>` is
 * a fractional span of the 12-column grid (SwiftUI `containerRelativeFrame`, Compose `weight`).
 * `@pyreon/native-cli` discovers it from `package.json` → `pyreon.native.plugin` when a source file imports
 * `@pyreon/coolgrid`.
 *
 * Tooling-only — nothing here is reachable from the web entry point.
 */
export {
  colHasExplicitSize,
  colSizeLiteral,
  colToStack,
  COOLGRID_TAGS,
  coolgridLowering,
  coolgridPlugin,
  coolgridPlugin as default,
  coolgridToStack,
  DEFAULT_COLUMNS,
  isCoolgridTag,
} from './native-plugin/plugin'
