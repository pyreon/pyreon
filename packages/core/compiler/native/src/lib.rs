// Pyreon JSX reactive transform — Rust implementation via oxc-parser.
// Produces identical output to the JS version in `../src/jsx.ts`.
#![allow(dead_code, unused_imports)]

use napi_derive::napi;
use oxc_allocator::Allocator;
use oxc_ast::ast::*;
use oxc_parser::Parser;
use oxc_span::{GetSpan, SourceType, Span};
use rustc_hash::{FxHashMap, FxHashSet};

#[napi(object)]
pub struct CompilerWarning {
    pub message: String,
    pub line: u32,
    pub column: u32,
    pub code: String,
}

/// Reactivity-lens span — the Rust mirror of `ReactivitySpan` in
/// `src/jsx.ts`. Each is a faithful RECORD of a codegen decision the
/// compiler already made (never an approximation). Populated ONLY when
/// `transform_jsx`'s `reactivity_lens` arg is `Some(true)`; the emitted
/// `code` is byte-identical whether or not this is collected. napi-rs
/// maps the snake_case fields to camelCase (`endLine` / `endColumn` /
/// the parent `reactivityLens`) so the JS shape matches `src/jsx.ts`
/// exactly.
#[napi(object)]
pub struct ReactivitySpan {
    pub start: u32,
    pub end: u32,
    pub line: u32,
    pub column: u32,
    pub end_line: u32,
    pub end_column: u32,
    pub kind: String,
    pub detail: String,
}

#[napi(object)]
pub struct TransformResult {
    pub code: String,
    pub uses_templates: Option<bool>,
    pub warnings: Vec<CompilerWarning>,
    pub reactivity_lens: Option<Vec<ReactivitySpan>>,
}

// ─── Constants ────────────────────────────────────────────────────────────────

fn is_skip_prop(name: &str) -> bool {
    matches!(name, "key" | "ref")
}

fn is_event_handler(name: &str) -> bool {
    name.len() > 2
        && name.starts_with("on")
        && name
            .as_bytes()
            .get(2)
            .map_or(false, |b| b.is_ascii_uppercase())
}

fn is_delegated_event(name: &str) -> bool {
    matches!(
        name,
        "click"
            | "dblclick"
            | "contextmenu"
            | "focusin"
            | "focusout"
            | "input"
            | "change"
            | "keydown"
            | "keyup"
            | "mousedown"
            | "mouseup"
            | "mousemove"
            | "mouseover"
            | "mouseout"
            | "pointerdown"
            | "pointerup"
            | "pointermove"
            | "pointerover"
            | "pointerout"
            | "touchstart"
            | "touchend"
            | "touchmove"
            | "submit"
    )
}

fn is_void_element(tag: &str) -> bool {
    matches!(
        tag,
        "area"
            | "base"
            | "br"
            | "col"
            | "embed"
            | "hr"
            | "img"
            | "input"
            | "link"
            | "meta"
            | "param"
            | "source"
            | "track"
            | "wbr"
    )
}

fn jsx_to_html_attr(name: &str) -> &str {
    match name {
        "className" => "class",
        "htmlFor" => "for",
        _ => name,
    }
}

fn is_stateful_call(name: &str) -> bool {
    matches!(
        name,
        "signal"
            | "computed"
            | "effect"
            | "batch"
            | "createSelector"
            | "createContext"
            | "createReactiveContext"
            | "useContext"
            | "useRef"
            | "createRef"
            | "useForm"
            | "useQuery"
            | "useMutation"
            | "defineStore"
            | "useStore"
    )
}

fn is_pure_call(name: &str) -> bool {
    matches!(
        name,
        "Math.max"
            | "Math.min"
            | "Math.abs"
            | "Math.floor"
            | "Math.ceil"
            | "Math.round"
            | "Math.pow"
            | "Math.sqrt"
            | "Math.random"
            | "Math.trunc"
            | "Math.sign"
            | "Number.parseInt"
            | "Number.parseFloat"
            | "Number.isNaN"
            | "Number.isFinite"
            | "parseInt"
            | "parseFloat"
            | "isNaN"
            | "isFinite"
            | "String.fromCharCode"
            | "String.fromCodePoint"
            | "Object.keys"
            | "Object.values"
            | "Object.entries"
            | "Object.assign"
            | "Object.freeze"
            | "Object.create"
            | "Array.from"
            | "Array.isArray"
            | "Array.of"
            | "JSON.stringify"
            | "JSON.parse"
            | "encodeURIComponent"
            | "decodeURIComponent"
            | "encodeURI"
            | "decodeURI"
            | "Date.now"
    )
}

fn is_lower_case(s: &str) -> bool {
    s.as_bytes()
        .first()
        .map_or(false, |b| b.is_ascii_lowercase())
}

fn escape_html_attr(s: &str) -> String {
    s.replace('&', "&amp;").replace('"', "&quot;")
}

fn escape_html_text(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.char_indices().peekable();
    while let Some((i, ch)) = chars.next() {
        if ch == '<' {
            out.push_str("&lt;");
        } else if ch == '&' {
            // Check if this is already an HTML entity: &...;
            if let Some(semi_pos) = s[i + 1..].find(';') {
                let entity = &s[i + 1..i + 1 + semi_pos];
                let is_entity = entity.starts_with('#')
                    || entity
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == 'x' || c == 'X');
                if is_entity && !entity.is_empty() {
                    out.push('&');
                    continue;
                }
            }
            out.push_str("&amp;");
        } else {
            out.push(ch);
        }
    }
    out
}

// React/Babel JSX whitespace algorithm (cleanJSXElementLiteralChild).
// Same-line text is preserved verbatim so adjacent expressions keep their
// spacing (`<p>doubled: {x}</p>` keeps the trailing space). Multi-line text
// strips leading whitespace from non-first lines and trailing whitespace
// from non-last lines, drops fully-empty lines, and joins the survivors
// with a single space — collapsing JSX indentation without losing
// intentional inline spacing.
fn clean_jsx_text(raw: &str) -> String {
    if !raw.contains('\n') && !raw.contains('\r') {
        return raw.to_string();
    }
    let lines: Vec<&str> = raw.split(|c| c == '\n' || c == '\r').collect();
    let last_non_empty: Option<usize> = lines
        .iter()
        .enumerate()
        .filter(|(_, l)| l.bytes().any(|b| b != b' ' && b != b'\t'))
        .map(|(i, _)| i)
        .last();
    let mut out = String::new();
    let line_count = lines.len();
    for (i, line_raw) in lines.iter().enumerate() {
        let mut line: String = line_raw.replace('\t', " ");
        if i != 0 {
            let trimmed = line.trim_start_matches(' ').to_string();
            line = trimmed;
        }
        if i != line_count - 1 {
            let trimmed = line.trim_end_matches(' ').to_string();
            line = trimmed;
        }
        if !line.is_empty() {
            if Some(i) != last_non_empty {
                line.push(' ');
            }
            out.push_str(&line);
        }
    }
    out
}

// ─── Line index ───────────────────────────────────────────────────────────────

struct LineIndex {
    line_starts: Vec<u32>,
}

impl LineIndex {
    fn new(source: &str) -> Self {
        let mut line_starts = vec![0u32];
        for (i, b) in source.bytes().enumerate() {
            if b == b'\n' {
                line_starts.push(i as u32 + 1);
            }
        }
        LineIndex { line_starts }
    }

    fn locate(&self, offset: u32) -> (u32, u32) {
        let mut lo = 0usize;
        let mut hi = self.line_starts.len() - 1;
        while lo <= hi {
            let mid = (lo + hi) / 2;
            if self.line_starts[mid] <= offset {
                lo = mid + 1;
            } else {
                if mid == 0 {
                    break;
                }
                hi = mid - 1;
            }
        }
        let line = lo as u32; // 1-based
        let column = offset - self.line_starts[lo - 1];
        (line, column)
    }
}

// ─── Transform context ──────────────────────────────────────────────────────

struct Replacement {
    start: u32,
    end: u32,
    text: String,
}

struct Hoist {
    name: String,
    text: String,
}

struct Ctx<'a> {
    source: &'a str,
    program: &'a Program<'a>,
    line_index: LineIndex,
    ssr: bool,

    replacements: Vec<Replacement>,
    warnings: Vec<CompilerWarning>,
    hoists: Vec<Hoist>,
    hoist_idx: u32,

    needs_tpl_import: bool,
    needs_rp_import: bool,
    needs_wrap_spread_import: bool,
    needs_bind_text_import: bool,
    needs_bind_direct_import: bool,
    needs_bind_import: bool,
    needs_apply_props_import: bool,
    needs_mount_slot_import: bool,

    props_names: FxHashSet<String>,
    prop_derived_vars: FxHashMap<String, Span>,
    resolved_cache: FxHashMap<String, String>,
    resolving: FxHashSet<String>,
    warned_cycles: FxHashSet<String>,

    is_dynamic_cache: FxHashMap<u32, bool>,
    callback_depth: u32,

    /// Whether the current JSX element's parent is another JSX element/fragment.
    parent_is_jsx: bool,

    /// Whether the IMMEDIATE parent JSX element is a COMPONENT (uppercase
    /// tag). Set inside `handle_jsx_element` for the duration of the
    /// component's children walk, then restored. Consumed by
    /// `handle_jsx_expression_child` to decide whether to skip the
    /// accessor wrap for stable-reference children — see the JS backend's
    /// `handleJsxExpression(node, parentJsx)` for the rationale + bisect
    /// reference (`packages/core/compiler/src/tests/component-child-no-wrap.test.ts`).
    parent_is_component_jsx_element: bool,

    /// Whether the expression currently being walked is the DIRECT child
    /// render-callback of a JSX element (`<For>{(row) => …}</For>`,
    /// `<Index>`, `<Show>`, `<Switch>`). Set by `handle_jsx_expression_child`
    /// only when the child expression is directly an arrow/function, and
    /// consumed+cleared by that arrow's `walk_expression` branch so the
    /// callback's parameter is NOT registered as reactive component props.
    /// Mirrors the JS backend's `maybeRegisterComponentProps` skip for
    /// `parent === JSXExpressionContainer && grandparent === JSXElement`.
    /// Attribute-value arrows (`component={(p) => …}`) take a different path
    /// and are NOT affected — they can be real inline components.
    in_jsx_child_callback: bool,

    /// Signal variables: `const x = signal(...)` or `const x = computed(...)`
    signal_vars: FxHashSet<String>,
    /// Shadowed signal names in current scope (for scope-aware auto-call)
    shadowed_signals: FxHashSet<String>,
    /// Selector variables: `const x = createSelector(...)` — drives the
    /// `selector(k) ? a : b` ternary auto-promotion to `.subscribe(k, m => ...)`.
    /// See JS backend's `selectorVars` for parity.
    selector_vars: FxHashSet<String>,
    /// Shadowed selector names — populated by find_shadowing logic in
    /// future PR. Currently always empty (matches JS backend's TODO).
    shadowed_selectors: FxHashSet<String>,
    /// Bindings whose initializer is DIRECTLY a JSX element/fragment
    /// (optionally parenthesized) — e.g. `const header = <h1/>`. A bare
    /// `{header}` child of such a binding must MOUNT via `_mountSlot`, not be
    /// text-coerced through `createTextNode` (which stringifies the NativeItem
    /// → "[object Object]"). Mirrors the JS backend's `elementVars` exactly so
    /// the two backends stay 1:1. Tracks `let`/callback-scope too: routing to
    /// `_mountSlot` renders strings/numbers/elements all correctly, so the
    /// only cost of imprecision is skipping the text fast path, never a wrong
    /// render.
    element_vars: FxHashSet<String>,

    /// Reactivity-lens sidecar (opt-in via `transform_jsx`'s 5th arg).
    /// Mirrors `src/jsx.ts`'s `collectLens` / `reactivityLens` exactly:
    /// purely additive, recorded at the SAME codegen-decision sites as
    /// the existing `replacements`/`hoists` pushes — never a second pass.
    collect_lens: bool,
    reactivity_lens: Vec<ReactivitySpan>,
}

impl<'a> Ctx<'a> {
    fn new(source: &'a str, program: &'a Program<'a>, ssr: bool, collect_lens: bool) -> Self {
        Ctx {
            source,
            program,
            line_index: LineIndex::new(source),
            ssr,
            replacements: Vec::new(),
            warnings: Vec::new(),
            hoists: Vec::new(),
            hoist_idx: 0,
            needs_tpl_import: false,
            needs_rp_import: false,
            needs_wrap_spread_import: false,
            needs_bind_text_import: false,
            needs_bind_direct_import: false,
            needs_bind_import: false,
            needs_apply_props_import: false,
            needs_mount_slot_import: false,
            props_names: FxHashSet::default(),
            prop_derived_vars: FxHashMap::default(),
            resolved_cache: FxHashMap::default(),
            resolving: FxHashSet::default(),
            warned_cycles: FxHashSet::default(),
            is_dynamic_cache: FxHashMap::default(),
            callback_depth: 0,
            parent_is_jsx: false,
            parent_is_component_jsx_element: false,
            in_jsx_child_callback: false,
            signal_vars: FxHashSet::default(),
            shadowed_signals: FxHashSet::default(),
            selector_vars: FxHashSet::default(),
            shadowed_selectors: FxHashSet::default(),
            element_vars: FxHashSet::default(),
            collect_lens,
            reactivity_lens: Vec::new(),
        }
    }

    /// Record a reactivity-lens span. Byte-for-byte mirror of
    /// `src/jsx.ts`'s `lens(start, end, kind, detail)`: `locate(start)`
    /// → (line, column); `locate(end)` → (endLine, endColumn). No-op
    /// when `collect_lens` is false (zero cost on the default path).
    fn lens(&mut self, start: u32, end: u32, kind: &str, detail: String) {
        if !self.collect_lens {
            return;
        }
        let (line, column) = self.line_index.locate(start);
        let (end_line, end_column) = self.line_index.locate(end);
        self.reactivity_lens.push(ReactivitySpan {
            start,
            end,
            line,
            column,
            end_line,
            end_column,
            kind: kind.to_string(),
            detail,
        });
    }

    fn slice(&self, span: Span) -> &'a str {
        &self.source[span.start as usize..span.end as usize]
    }

    fn warn(&mut self, span: Span, message: String, code: &str) {
        let (line, column) = self.line_index.locate(span.start);
        self.warnings.push(CompilerWarning {
            message,
            line,
            column,
            code: code.to_string(),
        });
    }

    fn add_replacement(&mut self, start: u32, end: u32, text: String) {
        self.replacements.push(Replacement { start, end, text });
    }

    fn next_hoist_name(&mut self) -> String {
        let name = format!("_$h{}", self.hoist_idx);
        self.hoist_idx += 1;
        name
    }

    fn build_result(mut self) -> TransformResult {
        if self.replacements.is_empty() && self.hoists.is_empty() {
            return TransformResult {
                code: self.source.to_string(),
                uses_templates: None,
                warnings: self.warnings,
                reactivity_lens: if self.collect_lens {
                    Some(self.reactivity_lens)
                } else {
                    None
                },
            };
        }

        self.replacements.sort_by_key(|r| r.start);

        let mut parts = Vec::new();
        let mut last_pos = 0usize;
        for r in &self.replacements {
            parts.push(&self.source[last_pos..r.start as usize]);
            parts.push(&r.text);
            last_pos = r.end as usize;
        }
        parts.push(&self.source[last_pos..]);
        let mut result = parts.join("");

        if !self.hoists.is_empty() {
            let preamble: String = self
                .hoists
                .iter()
                .map(|h| format!("const {} = /*@__PURE__*/ {}\n", h.name, h.text))
                .collect();
            result = preamble + &result;
        }

        if self.needs_tpl_import {
            let mut imports = vec!["_tpl"];
            if self.needs_bind_direct_import {
                imports.push("_bindDirect");
            }
            if self.needs_bind_text_import {
                imports.push("_bindText");
            }
            if self.needs_apply_props_import {
                imports.push("_applyProps");
            }
            if self.needs_mount_slot_import {
                imports.push("_mountSlot");
            }
            let reactivity = if self.needs_bind_import {
                "\nimport { _bind } from \"@pyreon/reactivity\";"
            } else {
                ""
            };
            result = format!(
                "import {{ {} }} from \"@pyreon/runtime-dom\";{}\n{}",
                imports.join(", "),
                reactivity,
                result
            );
        }

        if self.needs_rp_import || self.needs_wrap_spread_import {
            let mut core_imports: Vec<&str> = Vec::new();
            if self.needs_rp_import {
                core_imports.push("_rp");
            }
            if self.needs_wrap_spread_import {
                core_imports.push("_wrapSpread");
            }
            result = format!(
                "import {{ {} }} from \"@pyreon/core\";\n{}",
                core_imports.join(", "),
                result
            );
        }

        TransformResult {
            code: result,
            uses_templates: if self.needs_tpl_import {
                Some(true)
            } else {
                None
            },
            warnings: self.warnings,
            reactivity_lens: if self.collect_lens {
                Some(self.reactivity_lens)
            } else {
                None
            },
        }
    }
}

// ─── Analysis helpers ────────────────────────────────────────────────────────

/// True for string/number/boolean/null literals and no-substitution template
/// literals. `undefined` is an Identifier in ESTree, NOT static.
fn is_static(expr: &Expression) -> bool {
    match expr {
        Expression::StringLiteral(_)
        | Expression::NumericLiteral(_)
        | Expression::BooleanLiteral(_)
        | Expression::NullLiteral(_) => true,
        Expression::TemplateLiteral(tpl) => tpl.expressions.is_empty(),
        Expression::TSAsExpression(e) => is_static(&e.expression),
        Expression::TSSatisfiesExpression(e) => is_static(&e.expression),
        Expression::TSNonNullExpression(e) => is_static(&e.expression),
        Expression::TSTypeAssertion(e) => is_static(&e.expression),
        Expression::ParenthesizedExpression(p) => is_static(&p.expression),
        _ => false,
    }
}

fn is_static_jsx_attr_value(value: &JSXAttributeValue) -> bool {
    match value {
        JSXAttributeValue::StringLiteral(_) => true,
        JSXAttributeValue::ExpressionContainer(c) => match &c.expression {
            JSXExpression::EmptyExpression(_) => true,
            _ => jsx_expr_as_expression(&c.expression).map_or(true, |e| is_static(e)),
        },
        _ => false,
    }
}

/// Extract a callee name string from a call expression.
/// Returns "Foo.bar" for member expressions, "foo" for identifiers.
fn callee_name(expr: &Expression) -> Option<String> {
    match expr {
        Expression::Identifier(id) => Some(id.name.to_string()),
        Expression::StaticMemberExpression(m) => {
            if let Expression::Identifier(obj) = &m.object {
                Some(format!("{}.{}", obj.name, m.property.name))
            } else {
                None
            }
        }
        _ => None,
    }
}

/// True if the call is a pure static call (callee in PURE_CALLS and all args static).
fn is_pure_static_call(call: &CallExpression) -> bool {
    let name = match callee_name(&call.callee) {
        Some(n) => n,
        None => return false,
    };
    if !is_pure_call(&name) {
        return false;
    }
    call.arguments.iter().all(|arg| match arg {
        Argument::SpreadElement(_) => false,
        _ => arg.as_expression().map_or(false, |e| is_static(e)),
    })
}

/// Pure-coercion globals (String/Number/Boolean) — referentially transparent
/// functions whose result depends ONLY on their argument. Unlike
/// `is_pure_static_call` (requires all args be literals), only checks the
/// CALLEE shape. The argument's dynamism is handled by the recurse in
/// `is_dynamic_impl`. Mirrors the JS path's `isPureCoercionCall`.
fn is_pure_coercion_call(call: &CallExpression) -> bool {
    let id = match &call.callee {
        Expression::Identifier(id) => id,
        _ => return false,
    };
    let name = id.name.as_str();
    if name != "String" && name != "Number" && name != "Boolean" {
        return false;
    }
    if call.arguments.len() > 1 {
        return false;
    }
    if let Some(arg) = call.arguments.first() {
        if matches!(arg, Argument::SpreadElement(_)) {
            return false;
        }
    }
    true
}

fn is_stateful_call_expr(expr: &Expression) -> bool {
    if let Expression::CallExpression(call) = expr {
        if let Expression::Identifier(id) = &call.callee {
            return is_stateful_call(id.name.as_str());
        }
    }
    false
}

/// Check if a call expression is `signal(...)` or `computed(...)`.
fn is_signal_call_expr(expr: &Expression) -> bool {
    if let Expression::CallExpression(call) = expr {
        if let Expression::Identifier(id) = &call.callee {
            let name = id.name.as_str();
            return name == "signal" || name == "computed";
        }
    }
    false
}

/// Check if an identifier name is an active (non-shadowed) signal variable.
fn is_active_signal(name: &str, ctx: &Ctx) -> bool {
    ctx.signal_vars.contains(name) && !ctx.shadowed_signals.contains(name)
}

/// Check if a call expression creates a selector (`createSelector(...)`).
fn is_selector_call_expr(expr: &Expression) -> bool {
    if let Expression::CallExpression(call) = expr {
        if let Expression::Identifier(id) = &call.callee {
            return id.name.as_str() == "createSelector";
        }
    }
    false
}

/// Check if an identifier name is an active (non-shadowed) selector variable.
fn is_active_selector(name: &str, ctx: &Ctx) -> bool {
    ctx.selector_vars.contains(name) && !ctx.shadowed_selectors.contains(name)
}

/// Conservative reactivity check for the selector-promote bail catalog.
/// Returns true iff the subtree contains a CallExpression whose callee is a
/// known active signal — i.e. an actual reactive read. Plain member access
/// (`row.id`, `obj.deep.x`) returns FALSE even though it would trip the more
/// permissive `is_dynamic` (which also flags props access). That distinction
/// matters for `<For>` row keys — the callback parameter is stable, and its
/// member chain is a safe key for `.subscribe`. Mirrors JS `containsSignalCall`.
fn contains_signal_call(expr: &Expression, ctx: &Ctx) -> bool {
    if let Expression::CallExpression(call) = expr {
        if let Expression::Identifier(id) = &call.callee {
            if is_active_signal(id.name.as_str(), ctx) {
                return true;
            }
        }
    }
    match expr {
        Expression::CallExpression(c) => {
            contains_signal_call(&c.callee, ctx)
                || c.arguments
                    .iter()
                    .any(|a| a.as_expression().map_or(false, |e| contains_signal_call(e, ctx)))
        }
        Expression::StaticMemberExpression(m) => contains_signal_call(&m.object, ctx),
        Expression::ComputedMemberExpression(m) => {
            contains_signal_call(&m.object, ctx) || contains_signal_call(&m.expression, ctx)
        }
        Expression::BinaryExpression(b) => {
            contains_signal_call(&b.left, ctx) || contains_signal_call(&b.right, ctx)
        }
        Expression::LogicalExpression(l) => {
            contains_signal_call(&l.left, ctx) || contains_signal_call(&l.right, ctx)
        }
        Expression::ConditionalExpression(c) => {
            contains_signal_call(&c.test, ctx)
                || contains_signal_call(&c.consequent, ctx)
                || contains_signal_call(&c.alternate, ctx)
        }
        Expression::UnaryExpression(u) => contains_signal_call(&u.argument, ctx),
        Expression::ParenthesizedExpression(p) => contains_signal_call(&p.expression, ctx),
        Expression::TemplateLiteral(t) => t.expressions.iter().any(|e| contains_signal_call(e, ctx)),
        Expression::TSAsExpression(e) => contains_signal_call(&e.expression, ctx),
        Expression::TSSatisfiesExpression(e) => contains_signal_call(&e.expression, ctx),
        Expression::TSNonNullExpression(e) => contains_signal_call(&e.expression, ctx),
        Expression::TSTypeAssertion(e) => contains_signal_call(&e.expression, ctx),
        Expression::ChainExpression(c) => match &c.expression {
            ChainElement::CallExpression(call) => {
                contains_signal_call(&call.callee, ctx)
                    || call
                        .arguments
                        .iter()
                        .any(|a| a.as_expression().map_or(false, |e| contains_signal_call(e, ctx)))
            }
            ChainElement::StaticMemberExpression(m) => contains_signal_call(&m.object, ctx),
            ChainElement::ComputedMemberExpression(m) => {
                contains_signal_call(&m.object, ctx) || contains_signal_call(&m.expression, ctx)
            }
            ChainElement::PrivateFieldExpression(p) => contains_signal_call(&p.object, ctx),
            ChainElement::TSNonNullExpression(e) => contains_signal_call(&e.expression, ctx),
        },
        _ => false,
    }
}

/// Detect the `selector(key) ? consequent : alternate` ternary shape for
/// effect-free promotion to `selector.subscribe(key, m => ...)`. Mirrors
/// JS backend's `tryDirectSelectorTernary` — conservative, bails on every
/// shape we can't prove safe. See JS comment for the full bail catalog.
struct SelectorTernary {
    selector_ref: String,
    key_expr: String,
    consequent: String,
    alternate: String,
}

fn try_direct_selector_ternary(
    expr_node: &Expression,
    ctx: &mut Ctx,
) -> Option<SelectorTernary> {
    // Unwrap a leading arrow function expression body (`() => sel(k) ? a : b`).
    // oxc represents `(x) => expr` with `arrow.expression == true` and the
    // body's single statement wrapping the expression.
    let mut inner: &Expression = expr_node;
    if let Expression::ArrowFunctionExpression(arrow) = expr_node {
        if arrow.expression {
            if let Some(Statement::ExpressionStatement(stmt)) = arrow.body.statements.first() {
                inner = &stmt.expression;
            }
        }
    }
    while let Expression::ParenthesizedExpression(p) = inner {
        inner = &p.expression;
    }
    let cond = match inner {
        Expression::ConditionalExpression(c) => c,
        _ => return None,
    };
    let test_call = match &cond.test {
        Expression::CallExpression(c) => c,
        _ => return None,
    };
    if test_call.arguments.len() != 1 {
        return None;
    }
    let callee_name = match &test_call.callee {
        Expression::Identifier(id) => id.name.to_string(),
        _ => return None,
    };
    if !is_active_selector(&callee_name, ctx) {
        return None;
    }
    let key_arg = test_call.arguments.first()?.as_expression()?;
    if contains_signal_call(key_arg, ctx) {
        return None;
    }
    if contains_signal_call(&cond.consequent, ctx) {
        return None;
    }
    if contains_signal_call(&cond.alternate, ctx) {
        return None;
    }
    let key_expr = slice_expr(key_arg, ctx);
    let consequent = slice_expr(&cond.consequent, ctx);
    let alternate = slice_expr(&cond.alternate, ctx);
    Some(SelectorTernary {
        selector_ref: callee_name,
        key_expr,
        consequent,
        alternate,
    })
}

/// Result of `try_direct_signal_method_call`: the signal reference (for
/// `_bindDirect` first arg) and the method-call suffix (e.g. `.toFixed(2)`)
/// applied to `v` in the updater body.
struct SignalMethodCall {
    signal_ref: String,
    method_call: String,
}

/// Detect `signalRef().method(...args)` where `method` is in the pure
/// primitive safelist and args are non-reactive. Mirrors JS backend's
/// `tryDirectSignalMethodCall` byte-for-byte. Used by `emit_reactive_text_child`
/// to auto-promote `<span>{count().toFixed(2)}</span>` to
/// `_bindDirect(count, (v) => { textNode.data = v.toFixed(2) })`.
fn try_direct_signal_method_call(
    expr_node: &Expression,
    ctx: &mut Ctx,
) -> Option<SignalMethodCall> {
    let mut inner: &Expression = expr_node;
    if let Expression::ArrowFunctionExpression(arrow) = expr_node {
        if arrow.expression {
            if let Some(Statement::ExpressionStatement(stmt)) = arrow.body.statements.first() {
                inner = &stmt.expression;
            }
        }
    }
    while let Expression::ParenthesizedExpression(p) = inner {
        inner = &p.expression;
    }
    let method_call_expr = match inner {
        Expression::CallExpression(c) => c,
        _ => return None,
    };
    // Method callee must be a non-computed static member expression.
    let method_callee = match &method_call_expr.callee {
        Expression::StaticMemberExpression(m) => m,
        _ => return None,
    };
    let method_name = method_callee.property.name.as_str();
    if !is_pure_primitive_method(method_name) {
        return None;
    }
    // Receiver must be a zero-arg call to a known signal identifier.
    let recv = match &method_callee.object {
        Expression::CallExpression(c) => c,
        _ => return None,
    };
    if !recv.arguments.is_empty() {
        return None;
    }
    let sig_name = match &recv.callee {
        Expression::Identifier(id) => id.name.to_string(),
        _ => return None,
    };
    if !is_active_signal(&sig_name, ctx) {
        return None;
    }
    // Method args must not contain reactive reads.
    for arg in &method_call_expr.arguments {
        match arg {
            Argument::SpreadElement(_) => return None,
            _ => {
                if let Some(e) = arg.as_expression() {
                    if contains_signal_call(e, ctx) {
                        return None;
                    }
                }
            }
        }
    }
    // Slice `.method(...args)` from source — prepend the dot.
    let method_start = method_callee.property.span().start as usize;
    let method_end = method_call_expr.span().end as usize;
    let method_call = format!(".{}", &ctx.source[method_start..method_end]);
    Some(SignalMethodCall {
        signal_ref: sig_name,
        method_call,
    })
}

/// Number / String / Boolean prototype methods that are provably pure.
/// MUST stay in sync with JS backend's `PURE_PRIMITIVE_METHODS`.
fn is_pure_primitive_method(name: &str) -> bool {
    matches!(
        name,
        "toFixed"
            | "toExponential"
            | "toPrecision"
            | "toString"
            | "valueOf"
            | "toUpperCase"
            | "toLowerCase"
            | "toLocaleUpperCase"
            | "toLocaleLowerCase"
            | "trim"
            | "trimStart"
            | "trimEnd"
            | "slice"
            | "substring"
            | "substr"
            | "charAt"
            | "charCodeAt"
            | "codePointAt"
            | "padStart"
            | "padEnd"
            | "repeat"
            | "normalize"
            | "concat"
            | "startsWith"
            | "endsWith"
            | "includes"
            | "indexOf"
            | "lastIndexOf"
            | "at"
    )
}

/// Find variable declarations and parameters in a function that shadow signal names.
fn find_shadowing_names(node: &oxc_ast::ast::Function, ctx: &Ctx) -> Vec<String> {
    let mut shadows = Vec::new();
    // Check function parameters
    for param in &node.params.items {
        match &param.pattern {
            BindingPattern::BindingIdentifier(id) => {
                if ctx.signal_vars.contains(id.name.as_str()) {
                    shadows.push(id.name.to_string());
                }
            }
            BindingPattern::ObjectPattern(obj) => {
                for prop in &obj.properties {
                    if let BindingPattern::BindingIdentifier(id) = &prop.value {
                        if ctx.signal_vars.contains(id.name.as_str()) {
                            shadows.push(id.name.to_string());
                        }
                    }
                }
            }
            BindingPattern::ArrayPattern(arr) => {
                for el in arr.elements.iter().flatten() {
                    if let BindingPattern::BindingIdentifier(id) = el {
                        if ctx.signal_vars.contains(id.name.as_str()) {
                            shadows.push(id.name.to_string());
                        }
                    }
                }
            }
            _ => {}
        }
    }
    // Check top-level variable declarations in the function body
    if let Some(body) = &node.body {
        for stmt in &body.statements {
            if let Statement::VariableDeclaration(decl) = stmt {
                for declarator in &decl.declarations {
                    if let BindingPattern::BindingIdentifier(id) = &declarator.id {
                        if ctx.signal_vars.contains(id.name.as_str()) {
                            if let Some(init) = &declarator.init {
                                if !is_signal_call_expr(init) {
                                    shadows.push(id.name.to_string());
                                }
                            } else {
                                shadows.push(id.name.to_string());
                            }
                        }
                    }
                }
            }
        }
    }
    shadows
}

/// Arrow function variant of find_shadowing_names.
fn find_shadowing_names_arrow(node: &ArrowFunctionExpression, ctx: &Ctx) -> Vec<String> {
    let mut shadows = Vec::new();
    for param in &node.params.items {
        match &param.pattern {
            BindingPattern::BindingIdentifier(id) => {
                if ctx.signal_vars.contains(id.name.as_str()) {
                    shadows.push(id.name.to_string());
                }
            }
            BindingPattern::ObjectPattern(obj) => {
                for prop in &obj.properties {
                    if let BindingPattern::BindingIdentifier(id) = &prop.value {
                        if ctx.signal_vars.contains(id.name.as_str()) {
                            shadows.push(id.name.to_string());
                        }
                    }
                }
            }
            BindingPattern::ArrayPattern(arr) => {
                for el in arr.elements.iter().flatten() {
                    if let BindingPattern::BindingIdentifier(id) = el {
                        if ctx.signal_vars.contains(id.name.as_str()) {
                            shadows.push(id.name.to_string());
                        }
                    }
                }
            }
            _ => {}
        }
    }
    for stmt in &node.body.statements {
        if let Statement::VariableDeclaration(decl) = stmt {
            for declarator in &decl.declarations {
                if let BindingPattern::BindingIdentifier(id) = &declarator.id {
                    if ctx.signal_vars.contains(id.name.as_str()) {
                        if let Some(init) = &declarator.init {
                            if !is_signal_call_expr(init) {
                                shadows.push(id.name.to_string());
                            }
                        } else {
                            shadows.push(id.name.to_string());
                        }
                    }
                }
            }
        }
    }
    shadows
}

/// Fused isDynamic: contains non-pure call OR accesses props/prop-derived vars.
/// Cached by span.start.
fn is_dynamic(expr: &Expression, ctx: &mut Ctx) -> bool {
    let key = expr.span().start;
    if let Some(&cached) = ctx.is_dynamic_cache.get(&key) {
        return cached;
    }
    let result = is_dynamic_impl(expr, ctx);
    ctx.is_dynamic_cache.insert(key, result);
    result
}

fn is_dynamic_impl(expr: &Expression, ctx: &mut Ctx) -> bool {
    match expr {
        Expression::CallExpression(call) => {
            if is_pure_static_call(call) {
                // Pure static call (all literal args) — fall through to recurse.
            } else if is_pure_coercion_call(call) {
                // Pure coercion (String/Number/Boolean as global) — the
                // FUNCTION is referentially transparent. Whether the CALL is
                // dynamic depends on its arguments. Fall through to the
                // recurse logic; mirrors JS path's isPureCoercionCall.
            } else {
                return true;
            }
        }
        Expression::TaggedTemplateExpression(_) => return true,
        Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_) => return false,
        _ => {}
    }
    // Props access: member expression on props name
    if let Expression::StaticMemberExpression(m) = expr {
        if let Expression::Identifier(obj) = &m.object {
            if ctx.props_names.contains(obj.name.as_str()) {
                return true;
            }
        }
    }
    // Props access via optional chaining
    if let Expression::ChainExpression(c) = expr {
        if let ChainElement::StaticMemberExpression(m) = &c.expression {
            if let Expression::Identifier(obj) = &m.object {
                if ctx.props_names.contains(obj.name.as_str()) {
                    return true;
                }
            }
        }
    }
    // Prop-derived variable reference
    if let Expression::Identifier(id) = expr {
        if ctx.prop_derived_vars.contains_key(id.name.as_str()) {
            return true;
        }
        // Signal variable reference — treated as dynamic (will be auto-called)
        if is_active_signal(id.name.as_str(), ctx) {
            return true;
        }
    }
    // Recurse into children (but not into functions)
    expr_children_any_dynamic(expr, ctx)
}

fn expr_children_any_dynamic(expr: &Expression, ctx: &mut Ctx) -> bool {
    match expr {
        Expression::BinaryExpression(b) => {
            is_dynamic(&b.left, ctx) || is_dynamic(&b.right, ctx)
        }
        Expression::LogicalExpression(l) => {
            is_dynamic(&l.left, ctx) || is_dynamic(&l.right, ctx)
        }
        Expression::ConditionalExpression(c) => {
            is_dynamic(&c.test, ctx) || is_dynamic(&c.consequent, ctx) || is_dynamic(&c.alternate, ctx)
        }
        Expression::UnaryExpression(u) => is_dynamic(&u.argument, ctx),
        Expression::UpdateExpression(_) => true, // updates are always dynamic
        Expression::SequenceExpression(s) => s.expressions.iter().any(|e| is_dynamic(e, ctx)),
        Expression::ParenthesizedExpression(p) => is_dynamic(&p.expression, ctx),
        Expression::TemplateLiteral(t) => t.expressions.iter().any(|e| is_dynamic(e, ctx)),
        Expression::StaticMemberExpression(m) => is_dynamic(&m.object, ctx),
        Expression::ComputedMemberExpression(m) => {
            is_dynamic(&m.object, ctx) || is_dynamic(&m.expression, ctx)
        }
        Expression::CallExpression(call) => {
            // Already checked if the call itself is non-pure above.
            // For pure calls, check args.
            is_dynamic(&call.callee, ctx)
                || call.arguments.iter().any(|a| match a {
                    Argument::SpreadElement(s) => is_dynamic(&s.argument, ctx),
                    _ => a.as_expression().map_or(false, |e| is_dynamic(e, ctx)),
                })
        }
        Expression::ArrayExpression(arr) => arr.elements.iter().any(|el| match el {
            ArrayExpressionElement::SpreadElement(s) => is_dynamic(&s.argument, ctx),
            _ => el.as_expression().map_or(false, |e| is_dynamic(e, ctx)),
        }),
        Expression::ObjectExpression(obj) => obj.properties.iter().any(|p| match p {
            ObjectPropertyKind::ObjectProperty(prop) => {
                is_dynamic(&prop.value, ctx)
                    || (prop.computed && is_dynamic_property_key(&prop.key, ctx))
            }
            ObjectPropertyKind::SpreadProperty(s) => is_dynamic(&s.argument, ctx),
        }),
        Expression::ChainExpression(c) => match &c.expression {
            ChainElement::CallExpression(call) => {
                if !is_pure_static_call(call) {
                    return true;
                }
                is_dynamic(&call.callee, ctx)
                    || call.arguments.iter().any(|a| match a {
                        Argument::SpreadElement(s) => is_dynamic(&s.argument, ctx),
                        _ => a.as_expression().map_or(false, |e| is_dynamic(e, ctx)),
                    })
            }
            ChainElement::StaticMemberExpression(m) => is_dynamic(&m.object, ctx),
            ChainElement::ComputedMemberExpression(m) => {
                is_dynamic(&m.object, ctx) || is_dynamic(&m.expression, ctx)
            }
            ChainElement::PrivateFieldExpression(p) => is_dynamic(&p.object, ctx),
            ChainElement::TSNonNullExpression(e) => is_dynamic(&e.expression, ctx),
        },
        Expression::AssignmentExpression(a) => is_dynamic(&a.right, ctx),
        Expression::AwaitExpression(a) => is_dynamic(&a.argument, ctx),
        Expression::YieldExpression(y) => {
            y.argument.as_ref().map_or(false, |a| is_dynamic(a, ctx))
        }
        Expression::NewExpression(_) => true,
        // Don't recurse into function expressions
        Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_) => false,
        // TypeScript expression wrappers — recurse through
        Expression::TSAsExpression(e) => is_dynamic(&e.expression, ctx),
        Expression::TSSatisfiesExpression(e) => is_dynamic(&e.expression, ctx),
        Expression::TSNonNullExpression(e) => is_dynamic(&e.expression, ctx),
        Expression::TSTypeAssertion(e) => is_dynamic(&e.expression, ctx),
        // JSX elements: recurse into attributes and children to detect calls
        Expression::JSXElement(el) => {
            // Check attributes for dynamic expressions
            for attr in &el.opening_element.attributes {
                match attr {
                    JSXAttributeItem::Attribute(a) => {
                        if let Some(JSXAttributeValue::ExpressionContainer(c)) = &a.value {
                            if let Some(e) = jsx_expr_as_expression(&c.expression) {
                                if is_dynamic(e, ctx) {
                                    return true;
                                }
                            }
                        }
                    }
                    JSXAttributeItem::SpreadAttribute(s) => {
                        if is_dynamic(&s.argument, ctx) {
                            return true;
                        }
                    }
                }
            }
            // Check children
            for child in &el.children {
                if jsx_child_is_dynamic(child, ctx) {
                    return true;
                }
            }
            false
        }
        Expression::JSXFragment(frag) => {
            for child in &frag.children {
                if jsx_child_is_dynamic(child, ctx) {
                    return true;
                }
            }
            false
        }
        _ => false,
    }
}

fn jsx_child_is_dynamic(child: &JSXChild, ctx: &mut Ctx) -> bool {
    match child {
        JSXChild::ExpressionContainer(c) => {
            if let Some(e) = jsx_expr_as_expression(&c.expression) {
                is_dynamic(e, ctx)
            } else {
                false
            }
        }
        JSXChild::Element(el) => {
            // Recurse: check if this element's attrs/children have dynamic content
            for attr in &el.opening_element.attributes {
                match attr {
                    JSXAttributeItem::Attribute(a) => {
                        if let Some(JSXAttributeValue::ExpressionContainer(c)) = &a.value {
                            if let Some(e) = jsx_expr_as_expression(&c.expression) {
                                if is_dynamic(e, ctx) {
                                    return true;
                                }
                            }
                        }
                    }
                    JSXAttributeItem::SpreadAttribute(s) => {
                        if is_dynamic(&s.argument, ctx) {
                            return true;
                        }
                    }
                }
            }
            el.children.iter().any(|c| jsx_child_is_dynamic(c, ctx))
        }
        JSXChild::Fragment(frag) => frag.children.iter().any(|c| jsx_child_is_dynamic(c, ctx)),
        _ => false,
    }
}

fn is_dynamic_property_key(key: &PropertyKey, ctx: &mut Ctx) -> bool {
    match key {
        PropertyKey::StaticIdentifier(_) | PropertyKey::StringLiteral(_) | PropertyKey::NumericLiteral(_) => false,
        _ => key.as_expression().map_or(false, |e| is_dynamic(e, ctx)),
    }
}

/// accessesProps — checks if expression reads from props names or prop-derived vars.
/// Used by sliceExpr to decide if resolution is needed.
fn accesses_props(expr: &Expression, ctx: &Ctx) -> bool {
    match expr {
        Expression::StaticMemberExpression(m) => {
            if let Expression::Identifier(obj) = &m.object {
                if ctx.props_names.contains(obj.name.as_str()) {
                    return true;
                }
            }
            accesses_props(&m.object, ctx)
        }
        Expression::ComputedMemberExpression(m) => {
            if let Expression::Identifier(obj) = &m.object {
                if ctx.props_names.contains(obj.name.as_str()) {
                    return true;
                }
            }
            accesses_props(&m.object, ctx) || accesses_props(&m.expression, ctx)
        }
        Expression::ChainExpression(c) => match &c.expression {
            ChainElement::StaticMemberExpression(m) => {
                if let Expression::Identifier(obj) = &m.object {
                    if ctx.props_names.contains(obj.name.as_str()) {
                        return true;
                    }
                }
                accesses_props(&m.object, ctx)
            }
            ChainElement::ComputedMemberExpression(m) => {
                if let Expression::Identifier(obj) = &m.object {
                    if ctx.props_names.contains(obj.name.as_str()) {
                        return true;
                    }
                }
                accesses_props(&m.object, ctx) || accesses_props(&m.expression, ctx)
            }
            ChainElement::CallExpression(call) => {
                accesses_props(&call.callee, ctx)
                    || call.arguments.iter().any(|a| {
                        a.as_expression().map_or(false, |e| accesses_props(e, ctx))
                    })
            }
            ChainElement::PrivateFieldExpression(p) => accesses_props(&p.object, ctx),
            ChainElement::TSNonNullExpression(e) => accesses_props(&e.expression, ctx),
        },
        Expression::Identifier(id) => ctx.prop_derived_vars.contains_key(id.name.as_str()),
        Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_) => false,
        _ => expr_children_any_accesses_props(expr, ctx),
    }
}

fn expr_children_any_accesses_props(expr: &Expression, ctx: &Ctx) -> bool {
    match expr {
        Expression::BinaryExpression(b) => accesses_props(&b.left, ctx) || accesses_props(&b.right, ctx),
        Expression::LogicalExpression(l) => accesses_props(&l.left, ctx) || accesses_props(&l.right, ctx),
        Expression::ConditionalExpression(c) => {
            accesses_props(&c.test, ctx)
                || accesses_props(&c.consequent, ctx)
                || accesses_props(&c.alternate, ctx)
        }
        Expression::UnaryExpression(u) => accesses_props(&u.argument, ctx),
        Expression::ParenthesizedExpression(p) => accesses_props(&p.expression, ctx),
        Expression::TemplateLiteral(t) => t.expressions.iter().any(|e| accesses_props(e, ctx)),
        Expression::SequenceExpression(s) => s.expressions.iter().any(|e| accesses_props(e, ctx)),
        Expression::CallExpression(call) => {
            accesses_props(&call.callee, ctx)
                || call.arguments.iter().any(|a| match a {
                    Argument::SpreadElement(s) => accesses_props(&s.argument, ctx),
                    _ => a.as_expression().map_or(false, |e| accesses_props(e, ctx)),
                })
        }
        Expression::ObjectExpression(obj) => obj.properties.iter().any(|p| match p {
            ObjectPropertyKind::ObjectProperty(prop) => accesses_props(&prop.value, ctx),
            ObjectPropertyKind::SpreadProperty(s) => accesses_props(&s.argument, ctx),
        }),
        Expression::ArrayExpression(arr) => arr.elements.iter().any(|el| match el {
            ArrayExpressionElement::SpreadElement(s) => accesses_props(&s.argument, ctx),
            _ => el.as_expression().map_or(false, |e| accesses_props(e, ctx)),
        }),
        _ => false,
    }
}

fn should_wrap(expr: &Expression, ctx: &mut Ctx) -> bool {
    match expr {
        Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_) => return false,
        _ => {}
    }
    if is_static(expr) {
        return false;
    }
    if let Expression::CallExpression(call) = expr {
        if is_pure_static_call(call) {
            return false;
        }
    }
    is_dynamic(expr, ctx)
}

// ─── Static JSX detection (for hoisting) ─────────────────────────────────────

fn is_static_jsx_node(el: &JSXElement) -> bool {
    if is_self_closing(el) {
        return is_static_attrs(&el.opening_element.attributes);
    }
    is_static_attrs(&el.opening_element.attributes)
        && el.children.iter().all(|c| is_static_jsx_child(c))
}

fn is_static_jsx_fragment(frag: &JSXFragment) -> bool {
    frag.children.iter().all(|c| is_static_jsx_child(c))
}

fn is_static_attrs(attrs: &[JSXAttributeItem]) -> bool {
    attrs.iter().all(|attr| match attr {
        JSXAttributeItem::SpreadAttribute(_) => false,
        JSXAttributeItem::Attribute(a) => match &a.value {
            None => true,
            Some(JSXAttributeValue::StringLiteral(_)) => true,
            Some(JSXAttributeValue::ExpressionContainer(c)) => match &c.expression {
                JSXExpression::EmptyExpression(_) => true,
                _ => jsx_expr_as_expression(&c.expression).map_or(true, |e| is_static(e)),
            },
            _ => false,
        },
    })
}

fn is_static_jsx_child(child: &JSXChild) -> bool {
    match child {
        JSXChild::Text(_) => true,
        JSXChild::Element(el) => is_static_jsx_node(el),
        JSXChild::Fragment(frag) => is_static_jsx_fragment(frag),
        JSXChild::ExpressionContainer(c) => match &c.expression {
            JSXExpression::EmptyExpression(_) => true,
            _ => jsx_expr_as_expression(&c.expression).map_or(true, |e| is_static(e)),
        },
        _ => false,
    }
}

/// Try to get an &Expression from a JSXExpression (which inherits Expression variants).
fn jsx_expr_as_expression<'a>(jsx_expr: &'a JSXExpression<'a>) -> Option<&'a Expression<'a>> {
    match jsx_expr {
        JSXExpression::EmptyExpression(_) => None,
        _ => jsx_expr.as_expression(),
    }
}

// ─── JSX helpers ─────────────────────────────────────────────────────────────

fn jsx_tag_name<'a>(el: &'a JSXElement<'a>) -> &'a str {
    match &el.opening_element.name {
        JSXElementName::Identifier(id) => id.name.as_str(),
        JSXElementName::IdentifierReference(id) => id.name.as_str(),
        _ => "",
    }
}

fn is_self_closing(el: &JSXElement) -> bool {
    el.closing_element.is_none()
}

/// Does expr contain JSX (element or fragment)?
fn contains_jsx_in_expr(expr: &Expression) -> bool {
    match expr {
        Expression::JSXElement(_) | Expression::JSXFragment(_) => true,
        Expression::ParenthesizedExpression(p) => contains_jsx_in_expr(&p.expression),
        Expression::ConditionalExpression(c) => {
            contains_jsx_in_expr(&c.consequent) || contains_jsx_in_expr(&c.alternate)
        }
        Expression::LogicalExpression(l) => {
            contains_jsx_in_expr(&l.left) || contains_jsx_in_expr(&l.right)
        }
        Expression::ArrowFunctionExpression(a) => {
            if let Some(expr) = a.get_expression() {
                return contains_jsx_in_expr(expr);
            }
            body_contains_jsx(&a.body)
        }
        Expression::CallExpression(call) => {
            call.arguments.iter().any(|a| {
                a.as_expression().map_or(false, |e| contains_jsx_in_expr(e))
            })
        }
        _ => false,
    }
}

fn is_children_expression(expr: &Expression, expr_text: &str) -> bool {
    match expr {
        Expression::StaticMemberExpression(m) => {
            m.property.name.as_str() == "children"
        }
        Expression::Identifier(id) => id.name.as_str() == "children",
        _ => expr_text.ends_with(".children") || expr_text == "children",
    }
}

// ─── Prop-derived variable resolution ────────────────────────────────────────

/// Walk a statement looking for a VariableDeclarator whose init span matches.
fn find_init_in_statement<'a>(stmt: &'a Statement<'a>, target: Span) -> Option<&'a Expression<'a>> {
    match stmt {
        Statement::VariableDeclaration(decl) => {
            for d in &decl.declarations {
                if let Some(init) = &d.init {
                    if init.span() == target {
                        return Some(init);
                    }
                }
            }
            None
        }
        Statement::FunctionDeclaration(f) => {
            if let Some(body) = &f.body {
                for s in &body.statements {
                    if let Some(e) = find_init_in_statement(s, target) {
                        return Some(e);
                    }
                }
            }
            None
        }
        Statement::BlockStatement(b) => {
            for s in &b.body {
                if let Some(e) = find_init_in_statement(s, target) {
                    return Some(e);
                }
            }
            None
        }
        Statement::IfStatement(if_stmt) => {
            if let Some(e) = find_init_in_statement(&if_stmt.consequent, target) {
                return Some(e);
            }
            if let Some(alt) = &if_stmt.alternate {
                if let Some(e) = find_init_in_statement(alt, target) {
                    return Some(e);
                }
            }
            None
        }
        Statement::ForStatement(f) => {
            if let Some(init) = &f.init {
                if let ForStatementInit::VariableDeclaration(decl) = init {
                    for d in &decl.declarations {
                        if let Some(init_expr) = &d.init {
                            if init_expr.span() == target {
                                return Some(init_expr);
                            }
                        }
                    }
                }
            }
            find_init_in_statement(&f.body, target)
        }
        Statement::ForInStatement(f) => find_init_in_statement(&f.body, target),
        Statement::ForOfStatement(f) => find_init_in_statement(&f.body, target),
        Statement::WhileStatement(w) => find_init_in_statement(&w.body, target),
        Statement::DoWhileStatement(d) => find_init_in_statement(&d.body, target),
        Statement::SwitchStatement(s) => {
            for case in &s.cases {
                for stmt in &case.consequent {
                    if let Some(e) = find_init_in_statement(stmt, target) {
                        return Some(e);
                    }
                }
            }
            None
        }
        Statement::TryStatement(t) => {
            for s in &t.block.body {
                if let Some(e) = find_init_in_statement(s, target) {
                    return Some(e);
                }
            }
            if let Some(handler) = &t.handler {
                for s in &handler.body.body {
                    if let Some(e) = find_init_in_statement(s, target) {
                        return Some(e);
                    }
                }
            }
            if let Some(finalizer) = &t.finalizer {
                for s in &finalizer.body {
                    if let Some(e) = find_init_in_statement(s, target) {
                        return Some(e);
                    }
                }
            }
            None
        }
        Statement::LabeledStatement(l) => find_init_in_statement(&l.body, target),
        Statement::WithStatement(w) => find_init_in_statement(&w.body, target),
        Statement::ExportDefaultDeclaration(exp) => {
            if let ExportDefaultDeclarationKind::FunctionDeclaration(func) = &exp.declaration {
                if let Some(body) = &func.body {
                    for s in &body.statements {
                        if let Some(e) = find_init_in_statement(s, target) {
                            return Some(e);
                        }
                    }
                }
            }
            None
        }
        Statement::ExportNamedDeclaration(exp) => {
            if let Some(decl) = &exp.declaration {
                match decl {
                    Declaration::VariableDeclaration(vd) => {
                        for d in &vd.declarations {
                            if let Some(init) = &d.init {
                                if init.span() == target {
                                    return Some(init);
                                }
                            }
                        }
                    }
                    Declaration::FunctionDeclaration(func) => {
                        if let Some(body) = &func.body {
                            for s in &body.statements {
                                if let Some(e) = find_init_in_statement(s, target) {
                                    return Some(e);
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
            None
        }
        Statement::ClassDeclaration(class) => {
            for element in &class.body.body {
                match element {
                    ClassElement::MethodDefinition(method) => {
                        if let Some(body) = &method.value.body {
                            for s in &body.statements {
                                if let Some(e) = find_init_in_statement(s, target) {
                                    return Some(e);
                                }
                            }
                        }
                    }
                    ClassElement::StaticBlock(block) => {
                        for s in &block.body {
                            if let Some(e) = find_init_in_statement(s, target) {
                                return Some(e);
                            }
                        }
                    }
                    _ => {}
                }
            }
            None
        }
        _ => None,
    }
}

/// Find the initializer expression in the program AST by its span.
fn find_init_expression_by_span<'a>(
    program: &'a Program<'a>,
    target: Span,
) -> Option<&'a Expression<'a>> {
    for stmt in &program.body {
        if let Some(expr) = find_init_in_statement(stmt, target) {
            return Some(expr);
        }
    }
    None
}

/// Resolve prop-derived var to its inlined text (with transitive resolution).
/// Uses AST-based identifier resolution to correctly skip identifiers inside
/// string literals, comments, template literal quasis, and property-name positions.
fn resolve_var_to_string(var_name: &str, ctx: &mut Ctx) -> String {
    if let Some(cached) = ctx.resolved_cache.get(var_name) {
        return cached.clone();
    }
    if ctx.resolving.contains(var_name) {
        let mut cycle_keys: Vec<&str> = ctx.resolving.iter().map(|s| s.as_str()).collect();
        cycle_keys.push(var_name);
        cycle_keys.sort();
        let cycle_key = cycle_keys.join(",");
        if !ctx.warned_cycles.contains(&cycle_key) {
            ctx.warned_cycles.insert(cycle_key);
            let chain_parts: Vec<&str> = ctx.resolving.iter().map(|s| s.as_str()).collect();
            let chain = format!("{} → {}", chain_parts.join(" → "), var_name);
            let msg = format!(
                "[Pyreon] Circular prop-derived const reference: {}. \
                 The cyclic identifier `{}` will use its captured value \
                 instead of being reactively inlined. Break the cycle by reading \
                 from `props.*` directly or restructuring the derivation chain.",
                chain, var_name
            );
            // Warn at offset 0 since we don't have the source node span here
            ctx.warnings.push(CompilerWarning {
                message: msg,
                line: 1,
                column: 0,
                code: "circular-prop-derived".to_string(),
            });
        }
        return var_name.to_string();
    }
    ctx.resolving.insert(var_name.to_string());
    let span = ctx.prop_derived_vars.get(var_name).copied().unwrap();

    // Copy the shared program reference before mutable operations
    let program = ctx.program;
    let resolved = if let Some(init_expr) = find_init_expression_by_span(program, span) {
        // AST-based resolution: find identifier references to prop-derived vars
        let prop_derived_vars_snapshot: FxHashMap<String, Span> =
            ctx.prop_derived_vars.clone();
        let mut idents: Vec<(u32, u32, String)> = Vec::new();
        collect_prop_derived_idents(init_expr, &prop_derived_vars_snapshot, &mut idents);

        if idents.is_empty() {
            ctx.source[span.start as usize..span.end as usize].to_string()
        } else {
            // Sort by position, deduplicate overlapping
            idents.sort_by_key(|i| i.0);
            let mut deduped: Vec<(u32, u32, String)> = Vec::new();
            for ident in idents {
                if deduped.last().map_or(true, |last| ident.0 >= last.1) {
                    deduped.push(ident);
                }
            }

            // Build replacement string using absolute source offsets
            let mut result = String::new();
            let mut last = span.start;
            for (start, end, ref ident_name) in &deduped {
                result.push_str(&ctx.source[last as usize..*start as usize]);
                let resolved_ident = resolve_var_to_string(ident_name, ctx);
                result.push_str(&format!("({})", resolved_ident));
                last = *end;
            }
            result.push_str(&ctx.source[last as usize..span.end as usize]);
            result
        }
    } else {
        // Fallback: return raw source text unchanged (shouldn't happen in practice)
        ctx.source[span.start as usize..span.end as usize].to_string()
    };

    ctx.resolving.remove(var_name);
    ctx.resolved_cache.insert(var_name.to_string(), resolved.clone());
    resolved
}

/// Resolve prop-derived vars in an expression by walking its AST subtree.
///
/// Finds `IdentifierReference` nodes whose name matches a key in
/// `ctx.prop_derived_vars`, skipping property-name positions and nested
/// function scopes. Replaces each matching span with the resolved initializer.
fn resolve_expr_with_props(expr: &Expression, ctx: &mut Ctx) -> String {
    let span = expr.span();
    let source_slice = &ctx.source[span.start as usize..span.end as usize];

    // Collect identifier references to prop-derived vars in this expression subtree
    let mut idents: Vec<(u32, u32, String)> = Vec::new(); // (start, end, var_name)
    collect_prop_derived_idents(expr, &ctx.prop_derived_vars, &mut idents);

    if idents.is_empty() {
        return source_slice.to_string();
    }

    // Sort by position, deduplicate overlapping
    idents.sort_by_key(|i| i.0);
    let mut deduped: Vec<(u32, u32, String)> = Vec::new();
    for ident in idents {
        if deduped.last().map_or(true, |last| ident.0 >= last.1) {
            deduped.push(ident);
        }
    }

    // Build replacement string using absolute source offsets
    let mut result = String::new();
    let mut last = span.start;
    for (start, end, var_name) in &deduped {
        result.push_str(&ctx.source[last as usize..*start as usize]);
        let resolved = resolve_var_to_string(var_name, ctx);
        result.push_str(&format!("({})", resolved));
        last = *end;
    }
    result.push_str(&ctx.source[last as usize..span.end as usize]);
    result
}

/// Names a binding pattern introduces (recursive). Mirrors the JS backend's
/// `collectPatternNames` — the compile-safe subset params/declarators use here.
fn collect_bind_pattern_names(p: &BindingPattern, out: &mut FxHashSet<String>) {
    match p {
        BindingPattern::BindingIdentifier(id) => {
            out.insert(id.name.to_string());
        }
        BindingPattern::ObjectPattern(obj) => {
            for prop in &obj.properties {
                collect_bind_pattern_names(&prop.value, out);
            }
        }
        BindingPattern::ArrayPattern(arr) => {
            for el in arr.elements.iter().flatten() {
                collect_bind_pattern_names(el, out);
            }
        }
        _ => {}
    }
}

/// prop-derived map minus a set of scope-bound names. R2 parity: a name a
/// nested scope binds shadows the top-level prop-derived const within that
/// subtree, so it must not be substituted there. Byte-equivalent to the JS
/// pass's enter/leave `shadowed` set. Map is tiny (component-body consts) so
/// the clone is cheap; identity is irrelevant (values are Spans).
fn pd_minus(
    pd: &FxHashMap<String, Span>,
    bound: &FxHashSet<String>,
) -> FxHashMap<String, Span> {
    if bound.is_empty() {
        return pd.clone();
    }
    pd.iter()
        .filter(|(k, _)| !bound.contains(k.as_str()))
        .map(|(k, v)| (k.clone(), *v))
        .collect()
}

/// Recurse a JSX element's attributes + children collecting prop-derived
/// idents. JSX introduces no bindings, so `pd` passes through unchanged.
fn collect_pd_in_jsx_element(el: &JSXElement, pd: &FxHashMap<String, Span>, out: &mut Vec<(u32, u32, String)>) {
    for attr in &el.opening_element.attributes {
        match attr {
            JSXAttributeItem::Attribute(a) => {
                if let Some(JSXAttributeValue::ExpressionContainer(c)) = &a.value {
                    if let Some(e) = jsx_expr_as_expression(&c.expression) {
                        collect_prop_derived_idents(e, pd, out);
                    }
                }
            }
            JSXAttributeItem::SpreadAttribute(s) => {
                collect_prop_derived_idents(&s.argument, pd, out);
            }
        }
    }
    for c in &el.children {
        collect_pd_in_jsx_child(c, pd, out);
    }
}

fn collect_pd_in_jsx_child(child: &JSXChild, pd: &FxHashMap<String, Span>, out: &mut Vec<(u32, u32, String)>) {
    match child {
        JSXChild::ExpressionContainer(c) => {
            if let Some(e) = jsx_expr_as_expression(&c.expression) {
                collect_prop_derived_idents(e, pd, out);
            }
        }
        JSXChild::Element(el) => collect_pd_in_jsx_element(el, pd, out),
        JSXChild::Fragment(frag) => {
            for c in &frag.children {
                collect_pd_in_jsx_child(c, pd, out);
            }
        }
        _ => {}
    }
}

/// Walk a block body's statements collecting prop-derived idents. First
/// computes the block's own bound names (declarations) and filters `pd` for
/// the whole block — byte-equivalent to the JS `bindingsIntroducedBy`
/// (BlockStatement) + enter/leave discipline.
fn collect_pd_in_body(stmts: &[Statement], pd: &FxHashMap<String, Span>, out: &mut Vec<(u32, u32, String)>) {
    let mut bound = FxHashSet::default();
    for s in stmts {
        match s {
            Statement::VariableDeclaration(d) => {
                for decl in &d.declarations {
                    collect_bind_pattern_names(&decl.id, &mut bound);
                }
            }
            Statement::FunctionDeclaration(f) => {
                if let Some(id) = &f.id {
                    bound.insert(id.name.to_string());
                }
            }
            Statement::ClassDeclaration(c) => {
                if let Some(id) = &c.id {
                    bound.insert(id.name.to_string());
                }
            }
            _ => {}
        }
    }
    let filtered = pd_minus(pd, &bound);
    for s in stmts {
        collect_pd_in_stmt(s, &filtered, out);
    }
}

fn collect_pd_in_stmt(stmt: &Statement, pd: &FxHashMap<String, Span>, out: &mut Vec<(u32, u32, String)>) {
    match stmt {
        Statement::ExpressionStatement(s) => collect_prop_derived_idents(&s.expression, pd, out),
        Statement::ReturnStatement(s) => {
            if let Some(a) = &s.argument {
                collect_prop_derived_idents(a, pd, out);
            }
        }
        Statement::VariableDeclaration(d) => {
            for decl in &d.declarations {
                if let Some(init) = &decl.init {
                    collect_prop_derived_idents(init, pd, out);
                }
            }
        }
        Statement::IfStatement(s) => {
            collect_prop_derived_idents(&s.test, pd, out);
            collect_pd_in_stmt(&s.consequent, pd, out);
            if let Some(a) = &s.alternate {
                collect_pd_in_stmt(a, pd, out);
            }
        }
        Statement::BlockStatement(b) => collect_pd_in_body(&b.body, pd, out),
        // R13: #687's walker skipped these — a prop-derived const used inside
        // a callback whose body is a while/switch/try/labeled/for shape lost
        // reactivity in the native backend (JS inlined, Rust did not). Same
        // pd_minus/collect_bind_pattern_names shadow-filter discipline as the
        // Block/If arms — byte-equivalent to the JS pass; loop/catch-param
        // bindings shadow correctly (no R2 over-substitution regression).
        Statement::ForStatement(f) => {
            let mut bound = FxHashSet::default();
            if let Some(ForStatementInit::VariableDeclaration(d)) = &f.init {
                for decl in &d.declarations {
                    collect_bind_pattern_names(&decl.id, &mut bound);
                }
            }
            let inner = pd_minus(pd, &bound);
            if let Some(ForStatementInit::VariableDeclaration(d)) = &f.init {
                for decl in &d.declarations {
                    if let Some(i) = &decl.init {
                        collect_prop_derived_idents(i, &inner, out);
                    }
                }
            }
            if let Some(t) = &f.test {
                collect_prop_derived_idents(t, &inner, out);
            }
            if let Some(u) = &f.update {
                collect_prop_derived_idents(u, &inner, out);
            }
            collect_pd_in_stmt(&f.body, &inner, out);
        }
        Statement::ForInStatement(f) => {
            collect_prop_derived_idents(&f.right, pd, out);
            collect_pd_in_stmt(&f.body, pd, out);
        }
        Statement::ForOfStatement(f) => {
            collect_prop_derived_idents(&f.right, pd, out);
            collect_pd_in_stmt(&f.body, pd, out);
        }
        Statement::WhileStatement(w) => {
            collect_prop_derived_idents(&w.test, pd, out);
            collect_pd_in_stmt(&w.body, pd, out);
        }
        Statement::DoWhileStatement(d) => {
            collect_pd_in_stmt(&d.body, pd, out);
            collect_prop_derived_idents(&d.test, pd, out);
        }
        Statement::SwitchStatement(s) => {
            collect_prop_derived_idents(&s.discriminant, pd, out);
            for case in &s.cases {
                if let Some(t) = &case.test {
                    collect_prop_derived_idents(t, pd, out);
                }
                for st in &case.consequent {
                    collect_pd_in_stmt(st, pd, out);
                }
            }
        }
        Statement::TryStatement(t) => {
            collect_pd_in_body(&t.block.body, pd, out);
            if let Some(h) = &t.handler {
                let mut bound = FxHashSet::default();
                if let Some(p) = &h.param {
                    collect_bind_pattern_names(&p.pattern, &mut bound);
                }
                let inner = pd_minus(pd, &bound);
                collect_pd_in_body(&h.body.body, &inner, out);
            }
            if let Some(f) = &t.finalizer {
                collect_pd_in_body(&f.body, pd, out);
            }
        }
        Statement::LabeledStatement(l) => collect_pd_in_stmt(&l.body, pd, out),
        _ => {}
    }
}

/// Walk an expression AST subtree, collecting IdentifierReference nodes whose
/// name matches a prop-derived var. Skips property-name positions (static member
/// `.property`) and shorthand object property keys. Recurses into nested
/// function/JSX scopes with R2-parity shadow filtering (1:1 with the JS pass).
fn collect_prop_derived_idents(
    expr: &Expression,
    prop_derived_vars: &FxHashMap<String, Span>,
    out: &mut Vec<(u32, u32, String)>,
) {
    match expr {
        Expression::Identifier(id) => {
            if prop_derived_vars.contains_key(id.name.as_str()) {
                out.push((id.span.start, id.span.end, id.name.to_string()));
            }
        }
        // Static member: only recurse into .object, NOT .property
        Expression::StaticMemberExpression(m) => {
            collect_prop_derived_idents(&m.object, prop_derived_vars, out);
        }
        // Computed member: both object and expression
        Expression::ComputedMemberExpression(m) => {
            collect_prop_derived_idents(&m.object, prop_derived_vars, out);
            collect_prop_derived_idents(&m.expression, prop_derived_vars, out);
        }
        // Binary / logical
        Expression::BinaryExpression(b) => {
            collect_prop_derived_idents(&b.left, prop_derived_vars, out);
            collect_prop_derived_idents(&b.right, prop_derived_vars, out);
        }
        Expression::LogicalExpression(l) => {
            collect_prop_derived_idents(&l.left, prop_derived_vars, out);
            collect_prop_derived_idents(&l.right, prop_derived_vars, out);
        }
        // Conditional (ternary)
        Expression::ConditionalExpression(c) => {
            collect_prop_derived_idents(&c.test, prop_derived_vars, out);
            collect_prop_derived_idents(&c.consequent, prop_derived_vars, out);
            collect_prop_derived_idents(&c.alternate, prop_derived_vars, out);
        }
        // Unary / update
        Expression::UnaryExpression(u) => {
            collect_prop_derived_idents(&u.argument, prop_derived_vars, out);
        }
        Expression::UpdateExpression(u) => {
            collect_prop_derived_idents_in_assignment_target(&u.argument, prop_derived_vars, out);
        }
        // Call expression: callee + args
        Expression::CallExpression(call) => {
            collect_prop_derived_idents(&call.callee, prop_derived_vars, out);
            for arg in &call.arguments {
                match arg {
                    Argument::SpreadElement(s) => {
                        collect_prop_derived_idents(&s.argument, prop_derived_vars, out);
                    }
                    _ => {
                        if let Some(e) = arg.as_expression() {
                            collect_prop_derived_idents(e, prop_derived_vars, out);
                        }
                    }
                }
            }
        }
        // New expression: callee + args
        Expression::NewExpression(n) => {
            collect_prop_derived_idents(&n.callee, prop_derived_vars, out);
            for arg in &n.arguments {
                match arg {
                    Argument::SpreadElement(s) => {
                        collect_prop_derived_idents(&s.argument, prop_derived_vars, out);
                    }
                    _ => {
                        if let Some(e) = arg.as_expression() {
                            collect_prop_derived_idents(e, prop_derived_vars, out);
                        }
                    }
                }
            }
        }
        // Array expression
        Expression::ArrayExpression(arr) => {
            for el in &arr.elements {
                match el {
                    ArrayExpressionElement::SpreadElement(s) => {
                        collect_prop_derived_idents(&s.argument, prop_derived_vars, out);
                    }
                    _ => {
                        if let Some(e) = el.as_expression() {
                            collect_prop_derived_idents(e, prop_derived_vars, out);
                        }
                    }
                }
            }
        }
        // Object expression: recurse into values and computed keys only
        Expression::ObjectExpression(obj) => {
            for prop in &obj.properties {
                match prop {
                    ObjectPropertyKind::ObjectProperty(p) => {
                        // Only recurse into key if computed
                        if p.computed {
                            collect_prop_derived_idents_in_prop_key(&p.key, prop_derived_vars, out);
                        }
                        collect_prop_derived_idents(&p.value, prop_derived_vars, out);
                    }
                    ObjectPropertyKind::SpreadProperty(s) => {
                        collect_prop_derived_idents(&s.argument, prop_derived_vars, out);
                    }
                }
            }
        }
        // Template literal: only expressions (quasis are static text)
        Expression::TemplateLiteral(t) => {
            for e in &t.expressions {
                collect_prop_derived_idents(e, prop_derived_vars, out);
            }
        }
        // Tagged template
        Expression::TaggedTemplateExpression(t) => {
            collect_prop_derived_idents(&t.tag, prop_derived_vars, out);
            for e in &t.quasi.expressions {
                collect_prop_derived_idents(e, prop_derived_vars, out);
            }
        }
        // Sequence expression
        Expression::SequenceExpression(s) => {
            for e in &s.expressions {
                collect_prop_derived_idents(e, prop_derived_vars, out);
            }
        }
        // Parenthesized
        Expression::ParenthesizedExpression(p) => {
            collect_prop_derived_idents(&p.expression, prop_derived_vars, out);
        }
        // Assignment: only right side (left is a target, not a reference)
        Expression::AssignmentExpression(a) => {
            collect_prop_derived_idents(&a.right, prop_derived_vars, out);
        }
        // TypeScript expression wrappers
        Expression::TSAsExpression(e) => {
            collect_prop_derived_idents(&e.expression, prop_derived_vars, out);
        }
        Expression::TSSatisfiesExpression(e) => {
            collect_prop_derived_idents(&e.expression, prop_derived_vars, out);
        }
        Expression::TSNonNullExpression(e) => {
            collect_prop_derived_idents(&e.expression, prop_derived_vars, out);
        }
        Expression::TSTypeAssertion(e) => {
            collect_prop_derived_idents(&e.expression, prop_derived_vars, out);
        }
        // Optional chaining
        Expression::ChainExpression(c) => match &c.expression {
            ChainElement::StaticMemberExpression(m) => {
                collect_prop_derived_idents(&m.object, prop_derived_vars, out);
            }
            ChainElement::ComputedMemberExpression(m) => {
                collect_prop_derived_idents(&m.object, prop_derived_vars, out);
                collect_prop_derived_idents(&m.expression, prop_derived_vars, out);
            }
            ChainElement::CallExpression(call) => {
                collect_prop_derived_idents(&call.callee, prop_derived_vars, out);
                for arg in &call.arguments {
                    match arg {
                        Argument::SpreadElement(s) => {
                            collect_prop_derived_idents(&s.argument, prop_derived_vars, out);
                        }
                        _ => {
                            if let Some(e) = arg.as_expression() {
                                collect_prop_derived_idents(e, prop_derived_vars, out);
                            }
                        }
                    }
                }
            }
            ChainElement::PrivateFieldExpression(p) => {
                collect_prop_derived_idents(&p.object, prop_derived_vars, out);
            }
            ChainElement::TSNonNullExpression(e) => {
                collect_prop_derived_idents(&e.expression, prop_derived_vars, out);
            }
        },
        // Yield (generator expression)
        Expression::YieldExpression(y) => {
            if let Some(arg) = &y.argument {
                collect_prop_derived_idents(arg, prop_derived_vars, out);
            }
        }
        // Await
        Expression::AwaitExpression(a) => {
            collect_prop_derived_idents(&a.argument, prop_derived_vars, out);
        }
        // Recurse into nested function scopes with R2-parity shadow filtering
        // (1:1 with the JS pass, which walks the whole program AST). A param /
        // body binding that reuses a prop-derived name is removed from `pd`
        // for that subtree so it is NOT substituted there (no clobber); a
        // non-shadowed prop-derived ident used inside a callback IS collected
        // (closes the R7 native divergence — `items.map(i => <li class={cls}/>)`
        // now inlines `cls` like JS).
        Expression::ArrowFunctionExpression(arrow) => {
            let mut bound = FxHashSet::default();
            for p in &arrow.params.items {
                collect_bind_pattern_names(&p.pattern, &mut bound);
            }
            let filtered = pd_minus(prop_derived_vars, &bound);
            if let Some(e) = arrow.get_expression() {
                collect_prop_derived_idents(e, &filtered, out);
            } else {
                collect_pd_in_body(&arrow.body.statements, &filtered, out);
            }
        }
        Expression::FunctionExpression(func) => {
            let mut bound = FxHashSet::default();
            for p in &func.params.items {
                collect_bind_pattern_names(&p.pattern, &mut bound);
            }
            if let Some(id) = &func.id {
                bound.insert(id.name.to_string());
            }
            let filtered = pd_minus(prop_derived_vars, &bound);
            if let Some(body) = &func.body {
                collect_pd_in_body(&body.statements, &filtered, out);
            }
        }
        // JSX produced by an expression (e.g. a concise arrow body
        // `i => <li class={cls}>`): recurse attrs + children. No bindings.
        Expression::JSXElement(el) => collect_pd_in_jsx_element(el, prop_derived_vars, out),
        Expression::JSXFragment(frag) => {
            for c in &frag.children {
                collect_pd_in_jsx_child(c, prop_derived_vars, out);
            }
        }
        // Literals, ThisExpression, etc. — no identifiers to find
        _ => {}
    }
}

/// Helper to recurse into a computed property key expression.
fn collect_prop_derived_idents_in_prop_key(
    key: &PropertyKey,
    prop_derived_vars: &FxHashMap<String, Span>,
    out: &mut Vec<(u32, u32, String)>,
) {
    if let Some(expr) = key.as_expression() {
        collect_prop_derived_idents(expr, prop_derived_vars, out);
    }
}

/// Helper to collect prop-derived idents from a SimpleAssignmentTarget
/// (used by UpdateExpression.argument).
fn collect_prop_derived_idents_in_assignment_target(
    target: &SimpleAssignmentTarget,
    prop_derived_vars: &FxHashMap<String, Span>,
    out: &mut Vec<(u32, u32, String)>,
) {
    match target {
        SimpleAssignmentTarget::AssignmentTargetIdentifier(id) => {
            if prop_derived_vars.contains_key(id.name.as_str()) {
                out.push((id.span.start, id.span.end, id.name.to_string()));
            }
        }
        SimpleAssignmentTarget::StaticMemberExpression(m) => {
            collect_prop_derived_idents(&m.object, prop_derived_vars, out);
        }
        SimpleAssignmentTarget::ComputedMemberExpression(m) => {
            collect_prop_derived_idents(&m.object, prop_derived_vars, out);
            collect_prop_derived_idents(&m.expression, prop_derived_vars, out);
        }
        SimpleAssignmentTarget::TSAsExpression(e) => {
            collect_prop_derived_idents(&e.expression, prop_derived_vars, out);
        }
        SimpleAssignmentTarget::TSSatisfiesExpression(e) => {
            collect_prop_derived_idents(&e.expression, prop_derived_vars, out);
        }
        SimpleAssignmentTarget::TSNonNullExpression(e) => {
            collect_prop_derived_idents(&e.expression, prop_derived_vars, out);
        }
        SimpleAssignmentTarget::TSTypeAssertion(e) => {
            collect_prop_derived_idents(&e.expression, prop_derived_vars, out);
        }
        _ => {}
    }
}

/// Slice source text for an expression, resolving prop-derived vars if needed.
/// Uses AST-based resolution to correctly skip identifiers inside string
/// literals, comments, template literal quasis, and property-name positions.
fn slice_expr(expr: &Expression, ctx: &mut Ctx) -> String {
    let span = expr.span();
    let mut result = if !ctx.prop_derived_vars.is_empty() && accesses_props(expr, ctx) {
        resolve_expr_with_props(expr, ctx)
    } else {
        ctx.source[span.start as usize..span.end as usize].to_string()
    };

    // Auto-call signal variables: insert () after bare signal identifiers
    if !ctx.signal_vars.is_empty()
        && ctx.signal_vars.len() > ctx.shadowed_signals.len()
        && references_signal_var(expr, ctx)
    {
        result = auto_call_signals(&result, expr, ctx);
    }

    result
}

/// Check if an expression references any active signal variable.
fn references_signal_var(expr: &Expression, ctx: &Ctx) -> bool {
    if let Expression::Identifier(id) = expr {
        if is_active_signal(id.name.as_str(), ctx) {
            return true;
        }
    }
    match expr {
        Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_) => false,
        Expression::BinaryExpression(b) => {
            references_signal_var(&b.left, ctx) || references_signal_var(&b.right, ctx)
        }
        Expression::LogicalExpression(l) => {
            references_signal_var(&l.left, ctx) || references_signal_var(&l.right, ctx)
        }
        Expression::ConditionalExpression(c) => {
            references_signal_var(&c.test, ctx)
                || references_signal_var(&c.consequent, ctx)
                || references_signal_var(&c.alternate, ctx)
        }
        Expression::UnaryExpression(u) => references_signal_var(&u.argument, ctx),
        Expression::ParenthesizedExpression(p) => references_signal_var(&p.expression, ctx),
        Expression::TemplateLiteral(t) => t.expressions.iter().any(|e| references_signal_var(e, ctx)),
        Expression::CallExpression(call) => {
            references_signal_var(&call.callee, ctx)
                || call.arguments.iter().any(|a| {
                    a.as_expression().map_or(false, |e| references_signal_var(e, ctx))
                })
        }
        Expression::ObjectExpression(obj) => obj.properties.iter().any(|p| {
            match p {
                ObjectPropertyKind::ObjectProperty(prop) => {
                    references_signal_var(&prop.value, ctx)
                        || (prop.computed && prop.key.as_expression().map_or(false, |e| references_signal_var(e, ctx)))
                }
                ObjectPropertyKind::SpreadProperty(s) => references_signal_var(&s.argument, ctx),
            }
        }),
        Expression::ArrayExpression(arr) => arr.elements.iter().any(|el| {
            el.as_expression().map_or(false, |e| references_signal_var(e, ctx))
        }),
        Expression::StaticMemberExpression(m) => references_signal_var(&m.object, ctx),
        Expression::ComputedMemberExpression(m) => {
            references_signal_var(&m.object, ctx) || references_signal_var(&m.expression, ctx)
        }
        Expression::SequenceExpression(s) => s.expressions.iter().any(|e| references_signal_var(e, ctx)),
        Expression::AssignmentExpression(a) => references_signal_var(&a.right, ctx),
        Expression::TSAsExpression(e) => references_signal_var(&e.expression, ctx),
        Expression::TSNonNullExpression(e) => references_signal_var(&e.expression, ctx),
        _ => false,
    }
}

/// Auto-insert () after signal variable references in expression source text.
fn auto_call_signals(text: &str, expr: &Expression, ctx: &Ctx) -> String {
    let base = expr.span().start;
    let end_offset = base + text.len() as u32;
    let mut idents: Vec<(u32, u32)> = Vec::new();
    collect_signal_idents(expr, ctx, &mut idents, base, end_offset);

    if idents.is_empty() {
        return text.to_string();
    }

    idents.sort_by_key(|&(start, _)| start);
    let mut result = String::new();
    let mut last = base;
    for &(start, end) in &idents {
        result.push_str(&ctx.source[last as usize..end as usize]);
        result.push_str("()");
        last = end;
    }
    result.push_str(&ctx.source[last as usize..end_offset as usize]);
    result
}

/// Collect Identifier positions that need auto-calling.
fn collect_signal_idents(
    expr: &Expression,
    ctx: &Ctx,
    out: &mut Vec<(u32, u32)>,
    range_start: u32,
    range_end: u32,
) {
    let span = expr.span();
    if span.start >= range_end || span.end <= range_start {
        return;
    }

    if let Expression::Identifier(id) = expr {
        if is_active_signal(id.name.as_str(), ctx) {
            out.push((id.span.start, id.span.end));
        }
        return;
    }

    // Skip nested functions
    if matches!(expr, Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_)) {
        return;
    }

    // Skip callee position (already being called)
    if let Expression::CallExpression(call) = expr {
        // Don't collect the callee if it's the signal being called
        for arg in &call.arguments {
            if let Some(e) = arg.as_expression() {
                collect_signal_idents(e, ctx, out, range_start, range_end);
            }
        }
        // Callee handling:
        match &call.callee {
            // `signal()` — already-called, don't double-call
            Expression::Identifier(id) if is_active_signal(id.name.as_str(), ctx) => {}
            // `signal.method(...)` — the user is invoking a method on the
            // signal OBJECT. Auto-calling the bare signal would produce
            // `signal().method(...)` — calls the signal, gets its value,
            // then `.method` on the value is undefined → TypeError. Every
            // event handler that did `signal.set(x)` was silently broken.
            // Skip the entire MemberExpression callee — neither object
            // nor property gets auto-called.
            Expression::StaticMemberExpression(m) => {
                if let Expression::Identifier(id) = &m.object {
                    if is_active_signal(id.name.as_str(), ctx) {
                        // Skip — don't auto-call the signal in `signal.method()`
                    } else {
                        // Non-signal object — recurse normally
                        collect_signal_idents(&call.callee, ctx, out, range_start, range_end);
                    }
                } else {
                    collect_signal_idents(&call.callee, ctx, out, range_start, range_end);
                }
            }
            _ => {
                collect_signal_idents(&call.callee, ctx, out, range_start, range_end);
            }
        }
        return;
    }

    // Skip property name positions on member expressions
    if let Expression::StaticMemberExpression(m) = expr {
        collect_signal_idents(&m.object, ctx, out, range_start, range_end);
        return; // don't collect .property
    }

    // Skip shorthand object properties
    if let Expression::ObjectExpression(obj) = expr {
        for prop in &obj.properties {
            if let ObjectPropertyKind::ObjectProperty(p) = prop {
                if p.shorthand {
                    continue; // { name } — can't auto-call
                }
                if !p.computed {
                    // Only collect value, not key
                    collect_signal_idents(&p.value, ctx, out, range_start, range_end);
                } else {
                    collect_signal_idents(&p.value, ctx, out, range_start, range_end);
                    if let PropertyKey::StaticIdentifier(_) = &p.key {
                        // static key — skip
                    } else if let Some(e) = p.key.as_expression() {
                        collect_signal_idents(e, ctx, out, range_start, range_end);
                    }
                }
            }
        }
        return;
    }

    // Generic recursion for other expression types
    match expr {
        Expression::BinaryExpression(b) => {
            collect_signal_idents(&b.left, ctx, out, range_start, range_end);
            collect_signal_idents(&b.right, ctx, out, range_start, range_end);
        }
        Expression::LogicalExpression(l) => {
            collect_signal_idents(&l.left, ctx, out, range_start, range_end);
            collect_signal_idents(&l.right, ctx, out, range_start, range_end);
        }
        Expression::ConditionalExpression(c) => {
            collect_signal_idents(&c.test, ctx, out, range_start, range_end);
            collect_signal_idents(&c.consequent, ctx, out, range_start, range_end);
            collect_signal_idents(&c.alternate, ctx, out, range_start, range_end);
        }
        Expression::UnaryExpression(u) => {
            collect_signal_idents(&u.argument, ctx, out, range_start, range_end);
        }
        Expression::ParenthesizedExpression(p) => {
            collect_signal_idents(&p.expression, ctx, out, range_start, range_end);
        }
        Expression::TemplateLiteral(t) => {
            for e in &t.expressions {
                collect_signal_idents(e, ctx, out, range_start, range_end);
            }
        }
        Expression::SequenceExpression(s) => {
            for e in &s.expressions {
                collect_signal_idents(e, ctx, out, range_start, range_end);
            }
        }
        Expression::ArrayExpression(a) => {
            for el in &a.elements {
                if let Some(e) = el.as_expression() {
                    collect_signal_idents(e, ctx, out, range_start, range_end);
                }
            }
        }
        Expression::ComputedMemberExpression(m) => {
            collect_signal_idents(&m.object, ctx, out, range_start, range_end);
            collect_signal_idents(&m.expression, ctx, out, range_start, range_end);
        }
        Expression::AssignmentExpression(a) => {
            collect_signal_idents(&a.right, ctx, out, range_start, range_end);
        }
        Expression::TSAsExpression(e) => {
            collect_signal_idents(&e.expression, ctx, out, range_start, range_end);
        }
        Expression::TSNonNullExpression(e) => {
            collect_signal_idents(&e.expression, ctx, out, range_start, range_end);
        }
        _ => {}
    }
}

/// Slice raw source text for a span.
fn slice_span(span: Span, ctx: &Ctx) -> String {
    ctx.source[span.start as usize..span.end as usize].to_string()
}

// ─── Main entry ──────────────────────────────────────────────────────────────

#[napi]
pub fn transform_jsx(
    code: String,
    filename: String,
    ssr: bool,
    known_signals: Option<Vec<String>>,
    reactivity_lens: Option<bool>,
) -> TransformResult {
    let source_type = SourceType::from_path(&filename)
        .unwrap_or_default()
        .with_module(true)
        .with_jsx(true);

    let allocator = Allocator::default();
    let ret = Parser::new(&allocator, &code, source_type).parse();

    // Only bail on panicked parser — recoverable errors (like empty JSX
    // expressions `{/* comment */}`) still produce a valid AST.
    if ret.panicked {
        return TransformResult {
            code,
            uses_templates: None,
            warnings: vec![],
            reactivity_lens: None,
        };
    }

    let collect_lens = reactivity_lens == Some(true);
    let mut ctx = Ctx::new(&code, &ret.program, ssr, collect_lens);

    // Seed signal_vars from known_signals (cross-module imports resolved by Vite plugin)
    if let Some(signals) = known_signals {
        for name in signals {
            ctx.signal_vars.insert(name);
        }
    }

    walk_program(&ret.program, &mut ctx);
    ctx.build_result()
}

// ─── Walk functions ──────────────────────────────────────────────────────────

fn walk_program(program: &Program, ctx: &mut Ctx) {
    for stmt in &program.body {
        walk_statement(stmt, ctx);
    }
}

fn walk_statement(stmt: &Statement, ctx: &mut Ctx) {
    match stmt {
        Statement::ExpressionStatement(expr_stmt) => {
            walk_expression(&expr_stmt.expression, ctx);
        }
        Statement::VariableDeclaration(decl) => {
            collect_prop_derived(decl, ctx);
            for declarator in &decl.declarations {
                if let Some(init) = &declarator.init {
                    walk_expression(init, ctx);
                }
            }
        }
        Statement::FunctionDeclaration(func) => {
            maybe_register_component_props_fn(func, ctx);
            let shadows = if !ctx.signal_vars.is_empty() {
                let s = find_shadowing_names(func, ctx);
                for name in &s { ctx.shadowed_signals.insert(name.clone()); }
                s
            } else { vec![] };
            if let Some(body) = &func.body {
                for stmt in &body.statements {
                    walk_statement(stmt, ctx);
                }
            }
            for name in &shadows { ctx.shadowed_signals.remove(name); }
        }
        Statement::ReturnStatement(ret) => {
            if let Some(arg) = &ret.argument {
                walk_expression(arg, ctx);
            }
        }
        Statement::IfStatement(if_stmt) => {
            walk_expression(&if_stmt.test, ctx);
            walk_statement(&if_stmt.consequent, ctx);
            if let Some(alt) = &if_stmt.alternate {
                walk_statement(alt, ctx);
            }
        }
        Statement::BlockStatement(block) => {
            for stmt in &block.body {
                walk_statement(stmt, ctx);
            }
        }
        Statement::ClassDeclaration(class) => {
            // Walk class body methods for JSX
            for element in &class.body.body {
                match element {
                    ClassElement::MethodDefinition(method) => {
                        maybe_register_component_props_fn(&method.value, ctx);
                        let shadows = if !ctx.signal_vars.is_empty() {
                            let s = find_shadowing_names(&method.value, ctx);
                            for name in &s { ctx.shadowed_signals.insert(name.clone()); }
                            s
                        } else { vec![] };
                        if let Some(body) = &method.value.body {
                            for stmt in &body.statements {
                                walk_statement(stmt, ctx);
                            }
                        }
                        for name in &shadows { ctx.shadowed_signals.remove(name); }
                    }
                    ClassElement::PropertyDefinition(prop) => {
                        if let Some(value) = &prop.value {
                            walk_expression(value, ctx);
                        }
                    }
                    ClassElement::StaticBlock(block) => {
                        for stmt in &block.body {
                            walk_statement(stmt, ctx);
                        }
                    }
                    _ => {}
                }
            }
        }
        Statement::ForStatement(for_stmt) => {
            if let Some(init) = &for_stmt.init {
                match init {
                    ForStatementInit::VariableDeclaration(decl) => {
                        collect_prop_derived(decl, ctx);
                        for declarator in &decl.declarations {
                            if let Some(init) = &declarator.init {
                                walk_expression(init, ctx);
                            }
                        }
                    }
                    _ => {
                        if let Some(expr) = init.as_expression() {
                            walk_expression(expr, ctx);
                        }
                    }
                }
            }
            if let Some(test) = &for_stmt.test {
                walk_expression(test, ctx);
            }
            if let Some(update) = &for_stmt.update {
                walk_expression(update, ctx);
            }
            walk_statement(&for_stmt.body, ctx);
        }
        Statement::WhileStatement(w) => {
            walk_expression(&w.test, ctx);
            walk_statement(&w.body, ctx);
        }
        Statement::SwitchStatement(s) => {
            walk_expression(&s.discriminant, ctx);
            for case in &s.cases {
                if let Some(test) = &case.test {
                    walk_expression(test, ctx);
                }
                for stmt in &case.consequent {
                    walk_statement(stmt, ctx);
                }
            }
        }
        Statement::TryStatement(t) => {
            for stmt in &t.block.body {
                walk_statement(stmt, ctx);
            }
            if let Some(handler) = &t.handler {
                for stmt in &handler.body.body {
                    walk_statement(stmt, ctx);
                }
            }
            if let Some(finalizer) = &t.finalizer {
                for stmt in &finalizer.body {
                    walk_statement(stmt, ctx);
                }
            }
        }
        Statement::ExportDefaultDeclaration(exp) => {
            match &exp.declaration {
                ExportDefaultDeclarationKind::FunctionDeclaration(func) => {
                    maybe_register_component_props_fn(func, ctx);
                    let shadows = if !ctx.signal_vars.is_empty() {
                        let s = find_shadowing_names(func, ctx);
                        for name in &s { ctx.shadowed_signals.insert(name.clone()); }
                        s
                    } else { vec![] };
                    if let Some(body) = &func.body {
                        for stmt in &body.statements {
                            walk_statement(stmt, ctx);
                        }
                    }
                    for name in &shadows { ctx.shadowed_signals.remove(name); }
                }
                _ => {
                    if let Some(expr) = exp.declaration.as_expression() {
                        walk_expression(expr, ctx);
                    }
                }
            }
        }
        Statement::ExportNamedDeclaration(exp) => {
            if let Some(decl) = &exp.declaration {
                match decl {
                    Declaration::VariableDeclaration(vd) => {
                        collect_prop_derived(vd, ctx);
                        for declarator in &vd.declarations {
                            if let Some(init) = &declarator.init {
                                walk_expression(init, ctx);
                            }
                        }
                    }
                    Declaration::FunctionDeclaration(func) => {
                        maybe_register_component_props_fn(func, ctx);
                        let shadows = if !ctx.signal_vars.is_empty() {
                            let s = find_shadowing_names(func, ctx);
                            for name in &s { ctx.shadowed_signals.insert(name.clone()); }
                            s
                        } else { vec![] };
                        if let Some(body) = &func.body {
                            for stmt in &body.statements {
                                walk_statement(stmt, ctx);
                            }
                        }
                        for name in &shadows { ctx.shadowed_signals.remove(name); }
                    }
                    _ => {}
                }
            }
        }
        Statement::ForInStatement(f) => {
            walk_expression(&f.right, ctx);
            walk_statement(&f.body, ctx);
        }
        Statement::ForOfStatement(f) => {
            walk_expression(&f.right, ctx);
            walk_statement(&f.body, ctx);
        }
        Statement::DoWhileStatement(d) => {
            walk_statement(&d.body, ctx);
            walk_expression(&d.test, ctx);
        }
        Statement::ThrowStatement(t) => {
            walk_expression(&t.argument, ctx);
        }
        Statement::LabeledStatement(l) => {
            walk_statement(&l.body, ctx);
        }
        Statement::WithStatement(w) => {
            walk_expression(&w.object, ctx);
            walk_statement(&w.body, ctx);
        }
        _ => {}
    }
}

fn walk_expression(expr: &Expression, ctx: &mut Ctx) {
    match expr {
        Expression::JSXElement(el) => {
            handle_jsx_element(el, ctx);
        }
        Expression::JSXFragment(frag) => {
            let old = ctx.parent_is_jsx;
            ctx.parent_is_jsx = true;
            for child in &frag.children {
                walk_jsx_child(child, ctx);
            }
            ctx.parent_is_jsx = old;
        }
        Expression::ArrowFunctionExpression(arrow) => {
            // Consume the JSX-child-callback flag: a `<For>{(row) => …}</For>`
            // render callback's parameter is a runtime item, NOT reactive
            // props. Clear immediately so nested arrows inside the body still
            // register their own props.
            let is_jsx_child_cb = ctx.in_jsx_child_callback;
            ctx.in_jsx_child_callback = false;
            if !is_jsx_child_cb {
                maybe_register_component_props_arrow(arrow, ctx);
            }
            let old = ctx.parent_is_jsx;
            ctx.parent_is_jsx = false;
            // Track signal name shadowing for scope awareness
            let shadows = if !ctx.signal_vars.is_empty() {
                let s = find_shadowing_names_arrow(arrow, ctx);
                for name in &s { ctx.shadowed_signals.insert(name.clone()); }
                s
            } else { vec![] };
            walk_arrow_body(arrow, ctx);
            for name in &shadows { ctx.shadowed_signals.remove(name); }
            ctx.parent_is_jsx = old;
        }
        Expression::FunctionExpression(func) => {
            // Don't let a function-expression render-callback's flag leak into
            // nested arrows in its body (this branch doesn't register props
            // itself, so just clear).
            ctx.in_jsx_child_callback = false;
            let old = ctx.parent_is_jsx;
            ctx.parent_is_jsx = false;
            let shadows = if !ctx.signal_vars.is_empty() {
                let s = find_shadowing_names(func, ctx);
                for name in &s { ctx.shadowed_signals.insert(name.clone()); }
                s
            } else { vec![] };
            if let Some(body) = &func.body {
                for stmt in &body.statements {
                    walk_statement(stmt, ctx);
                }
            }
            for name in &shadows { ctx.shadowed_signals.remove(name); }
            ctx.parent_is_jsx = old;
        }
        Expression::CallExpression(call) => {
            walk_expression(&call.callee, ctx);
            // Track callback depth for arguments that are functions
            for arg in &call.arguments {
                match arg {
                    Argument::SpreadElement(spread) => walk_expression(&spread.argument, ctx),
                    _ => {
                        if let Some(e) = arg.as_expression() {
                            let is_fn = matches!(
                                e,
                                Expression::ArrowFunctionExpression(_)
                                    | Expression::FunctionExpression(_)
                            );
                            if is_fn {
                                ctx.callback_depth += 1;
                            }
                            walk_expression(e, ctx);
                            if is_fn {
                                ctx.callback_depth -= 1;
                            }
                        }
                    }
                }
            }
        }
        Expression::ConditionalExpression(cond) => {
            walk_expression(&cond.test, ctx);
            walk_expression(&cond.consequent, ctx);
            walk_expression(&cond.alternate, ctx);
        }
        Expression::LogicalExpression(logical) => {
            walk_expression(&logical.left, ctx);
            walk_expression(&logical.right, ctx);
        }
        Expression::BinaryExpression(binary) => {
            walk_expression(&binary.left, ctx);
            walk_expression(&binary.right, ctx);
        }
        Expression::SequenceExpression(seq) => {
            for expr in &seq.expressions {
                walk_expression(expr, ctx);
            }
        }
        Expression::ParenthesizedExpression(paren) => {
            walk_expression(&paren.expression, ctx);
        }
        Expression::TemplateLiteral(tpl) => {
            for expr in &tpl.expressions {
                walk_expression(expr, ctx);
            }
        }
        Expression::StaticMemberExpression(member) => {
            walk_expression(&member.object, ctx);
        }
        Expression::ComputedMemberExpression(member) => {
            walk_expression(&member.object, ctx);
            walk_expression(&member.expression, ctx);
        }
        Expression::AssignmentExpression(a) => {
            walk_expression(&a.right, ctx);
        }
        Expression::ObjectExpression(obj) => {
            for prop in &obj.properties {
                match prop {
                    ObjectPropertyKind::ObjectProperty(p) => {
                        walk_expression(&p.value, ctx);
                    }
                    ObjectPropertyKind::SpreadProperty(s) => {
                        walk_expression(&s.argument, ctx);
                    }
                }
            }
        }
        Expression::ArrayExpression(arr) => {
            for el in &arr.elements {
                match el {
                    ArrayExpressionElement::SpreadElement(s) => {
                        walk_expression(&s.argument, ctx);
                    }
                    _ => {
                        if let Some(e) = el.as_expression() {
                            walk_expression(e, ctx);
                        }
                    }
                }
            }
        }
        Expression::UnaryExpression(u) => walk_expression(&u.argument, ctx),
        Expression::UpdateExpression(_) => {
            // UpdateExpression argument is SimpleAssignmentTarget, not Expression.
            // Nothing to walk for JSX transform purposes.
        }
        Expression::AwaitExpression(a) => walk_expression(&a.argument, ctx),
        Expression::YieldExpression(y) => {
            if let Some(arg) = &y.argument {
                walk_expression(arg, ctx);
            }
        }
        Expression::NewExpression(n) => {
            walk_expression(&n.callee, ctx);
            for arg in &n.arguments {
                match arg {
                    Argument::SpreadElement(s) => walk_expression(&s.argument, ctx),
                    _ => {
                        if let Some(e) = arg.as_expression() {
                            walk_expression(e, ctx);
                        }
                    }
                }
            }
        }
        Expression::TaggedTemplateExpression(t) => {
            walk_expression(&t.tag, ctx);
            for expr in &t.quasi.expressions {
                walk_expression(expr, ctx);
            }
        }
        Expression::ChainExpression(c) => match &c.expression {
            ChainElement::CallExpression(call) => {
                walk_expression(&call.callee, ctx);
                for arg in &call.arguments {
                    match arg {
                        Argument::SpreadElement(spread) => walk_expression(&spread.argument, ctx),
                        _ => {
                            if let Some(e) = arg.as_expression() {
                                walk_expression(e, ctx);
                            }
                        }
                    }
                }
            }
            ChainElement::StaticMemberExpression(m) => walk_expression(&m.object, ctx),
            ChainElement::ComputedMemberExpression(m) => {
                walk_expression(&m.object, ctx);
                walk_expression(&m.expression, ctx);
            }
            ChainElement::PrivateFieldExpression(p) => walk_expression(&p.object, ctx),
            ChainElement::TSNonNullExpression(e) => walk_expression(&e.expression, ctx),
        },
        Expression::TSAsExpression(e) => walk_expression(&e.expression, ctx),
        Expression::TSSatisfiesExpression(e) => walk_expression(&e.expression, ctx),
        Expression::TSNonNullExpression(e) => walk_expression(&e.expression, ctx),
        Expression::TSTypeAssertion(e) => walk_expression(&e.expression, ctx),
        Expression::TSInstantiationExpression(e) => walk_expression(&e.expression, ctx),
        _ => {}
    }
}

fn walk_arrow_body(arrow: &ArrowFunctionExpression, ctx: &mut Ctx) {
    for stmt in &arrow.body.statements {
        walk_statement(stmt, ctx);
    }
}

fn walk_jsx_child(child: &JSXChild, ctx: &mut Ctx) {
    match child {
        JSXChild::Element(el) => handle_jsx_element(el, ctx),
        JSXChild::Fragment(frag) => {
            let old = ctx.parent_is_jsx;
            // Mirror the JS backend: fragments are transparent in JSX
            // semantics but they DO break the "direct parent is a
            // component" relationship. The JS walker passes `parentJsx`
            // to `handleJsxExpression` only from the immediate JSXElement
            // iteration — fragment-nested expression children fall through
            // generic descent and lose the parent context. Clear here so
            // a `{x}` inside `<Comp><>{x}</></Comp>` still goes through
            // the wrap path (matches JS-backend equivalence).
            let old_component = ctx.parent_is_component_jsx_element;
            ctx.parent_is_jsx = true;
            ctx.parent_is_component_jsx_element = false;
            for child in &frag.children {
                walk_jsx_child(child, ctx);
            }
            ctx.parent_is_jsx = old;
            ctx.parent_is_component_jsx_element = old_component;
        }
        JSXChild::ExpressionContainer(container) => {
            handle_jsx_expression_child(container, ctx);
        }
        JSXChild::Text(_text) => {}
        JSXChild::Spread(spread) => {
            walk_expression(&spread.expression, ctx);
        }
    }
}

// ─── JSX element handling ────────────────────────────────────────────────────

fn handle_jsx_element(el: &JSXElement, ctx: &mut Ctx) {
    // Try template emit (non-self-closing only)
    if !is_self_closing(el) && try_template_emit(el, ctx) {
        return;
    }

    // Check warnings (<For> without by)
    check_for_warnings(el, ctx);

    let tag = jsx_tag_name(el);
    let is_component = !tag.is_empty() && !is_lower_case(tag);

    // Process attributes
    for attr in &el.opening_element.attributes {
        match attr {
            JSXAttributeItem::Attribute(a) => {
                handle_jsx_attribute(a, el, is_component, ctx);
            }
            JSXAttributeItem::SpreadAttribute(spread) => {
                // Walk the spread argument FIRST so any nested JSX / signal
                // accesses get their own transformations applied.
                walk_expression(&spread.argument, ctx);
                if is_component {
                    handle_jsx_spread_attribute(spread, ctx);
                }
            }
        }
    }

    // Process children
    let old_parent_is_jsx = ctx.parent_is_jsx;
    let old_parent_is_component = ctx.parent_is_component_jsx_element;
    ctx.parent_is_jsx = true;
    ctx.parent_is_component_jsx_element = is_component;
    for child in &el.children {
        walk_jsx_child(child, ctx);
    }
    ctx.parent_is_jsx = old_parent_is_jsx;
    ctx.parent_is_component_jsx_element = old_parent_is_component;
}

fn check_for_warnings(el: &JSXElement, ctx: &mut Ctx) {
    let tag = jsx_tag_name(el);
    if tag != "For" {
        return;
    }
    let has_by = el.opening_element.attributes.iter().any(|attr| {
        if let JSXAttributeItem::Attribute(a) = attr {
            if let JSXAttributeName::Identifier(id) = &a.name {
                return id.name.as_str() == "by";
            }
        }
        false
    });
    if !has_by {
        let span = match &el.opening_element.name {
            JSXElementName::Identifier(id) => id.span,
            _ => el.span(),
        };
        ctx.warn(
            span,
            "<For> without a \"by\" prop will use index-based diffing, which is slower and may cause bugs with stateful children. Add by={(item) => item.id} for efficient keyed reconciliation.".to_string(),
            "missing-key-on-for",
        );
    }
}

fn handle_jsx_attribute(
    attr: &JSXAttribute,
    _parent_el: &JSXElement,
    is_component: bool,
    ctx: &mut Ctx,
) {
    let name = match &attr.name {
        JSXAttributeName::Identifier(id) => id.name.as_str(),
        _ => return,
    };
    if is_skip_prop(name) || is_event_handler(name) {
        return;
    }
    let value = match &attr.value {
        Some(v) => v,
        None => return,
    };
    let container = match value {
        JSXAttributeValue::ExpressionContainer(c) => c,
        _ => return,
    };
    let expr = match &container.expression {
        JSXExpression::EmptyExpression(_) => return,
        _ => match jsx_expr_as_expression(&container.expression) {
            Some(e) => e,
            None => return,
        },
    };

    if is_component {
        // For component props: single JSX children are just recursed into
        let is_single_jsx = matches!(expr, Expression::JSXElement(_) | Expression::JSXFragment(_));
        if is_single_jsx {
            // Reset parent_is_jsx — we're inside an attribute value `prop={<Elem/>}`,
            // not a JSX child, so templates shouldn't get brace-wrapped.
            let old = ctx.parent_is_jsx;
            ctx.parent_is_jsx = false;
            walk_expression(expr, ctx);
            ctx.parent_is_jsx = old;
            return;
        }

        // Try hoisting
        if let Some(hoist_name) = maybe_hoist_expr(expr, ctx) {
            ctx.add_replacement(expr.span().start, expr.span().end, hoist_name);
            return;
        }

        // Wrap with _rp() if dynamic
        if should_wrap(expr, ctx) {
            let sliced = slice_expr(expr, ctx);
            let inner = if matches!(expr, Expression::ObjectExpression(_)) {
                format!("({})", sliced)
            } else {
                sliced
            };
            let sp = expr.span();
            ctx.add_replacement(sp.start, sp.end, format!("_rp(() => {})", inner));
            ctx.needs_rp_import = true;
            ctx.lens(
                sp.start,
                sp.end,
                "reactive-prop",
                "live prop — signal reads here are tracked into the component".to_string(),
            );
        }
    } else {
        // DOM prop: hoist or wrap with () =>
        hoist_or_wrap(expr, ctx);
    }
}

/// Handle `{...spreadExpr}` attributes on COMPONENT JSX (DOM elements use
/// the template path's `_applyProps` instead).
///
/// Bug class this closes: esbuild's automatic JSX runtime compiles
/// `<Comp {...a} foo={x}>` to `jsx(Comp, { ...a, foo: x })`. The JS-level
/// object spread fires every getter on `a` and stores the resolved value
/// — so any reactive prop on `a` (e.g. `splitProps` result carrying
/// compiler-emitted `_rp` getters from a parent component) is collapsed
/// to its initial value before `Comp` sees it.
///
/// Fix: wrap each spread source with `_wrapSpread(...)` so its getters
/// are re-branded as `_rp` thunks pointing back at the original. JS
/// spread copies the brands as plain data property values; later in the
/// mount pipeline, `makeReactiveProps` converts the brands back into
/// getters that lazily read from the live source — preserving the
/// reactive subscription end-to-end.
///
/// Idempotent: skip when the argument is already a `_wrapSpread(...)`
/// call so multi-pass / re-run compilation doesn't double-wrap.
fn handle_jsx_spread_attribute(spread: &JSXSpreadAttribute, ctx: &mut Ctx) {
    let arg = &spread.argument;
    // Idempotent guard: don't double-wrap on re-compilation.
    if let Expression::CallExpression(call) = arg {
        if let Expression::Identifier(id) = &call.callee {
            if id.name.as_str() == "_wrapSpread" {
                return;
            }
        }
    }
    let sliced = slice_expr(arg, ctx);
    ctx.add_replacement(
        arg.span().start,
        arg.span().end,
        format!("_wrapSpread({})", sliced),
    );
    ctx.needs_wrap_spread_import = true;
}

fn handle_jsx_expression_child(container: &JSXExpressionContainer, ctx: &mut Ctx) {
    let expr = match &container.expression {
        JSXExpression::EmptyExpression(_) => return,
        _ => match jsx_expr_as_expression(&container.expression) {
            Some(e) => e,
            None => return,
        },
    };

    // Try hoisting
    if let Some(hoist_name) = maybe_hoist_expr(expr, ctx) {
        ctx.add_replacement(expr.span().start, expr.span().end, hoist_name);
        return;
    }

    // Wrap if dynamic
    if should_wrap(expr, ctx) {
        // Carve-out: stable references passed as JSX children of a
        // COMPONENT parent are emitted bare (no accessor wrap). Mirrors
        // the JS backend's `handleJsxExpression(node, parentJsx)` —
        // see `packages/core/compiler/src/jsx.ts` + the bisect tests at
        // `packages/core/compiler/src/tests/component-child-no-wrap.test.ts`.
        // Background: the kinetic Stagger + bokisch.com Intro reproducer
        // (PR #731 shipped the library-side workaround). The compiler
        // wrapping `{children}` as `() => h.children` in component child
        // position breaks libraries that iterate / cloneVNode children
        // directly.
        if ctx.parent_is_component_jsx_element
            && is_stable_reference(expr)
            && !references_signal_var(expr, ctx)
        {
            // Skip the carve-out for signal references — `<Comp>{count}</Comp>`
            // (bare signal identifier) is the user's deliberate "make this
            // reactive at the call site" pattern. Auto-call + wrap converts
            // to `() => count()` so the receiving component re-evaluates
            // inside its mountReactive/mountChild scope. Prop-derived
            // stable refs (the kinetic / bokisch fix shape) take the bare
            // path.
            //
            // Slice the UNWRAPPED expression (TS type-only layers stripped)
            // so cross-backend equivalence holds — the JS backend does
            // the same. Esbuild strips TS casts at the next stage anyway.
            let sp = expr.span();
            let unwrapped = unwrap_type_layers(expr);
            let sliced = slice_expr(unwrapped, ctx);
            ctx.add_replacement(sp.start, sp.end, sliced);
            return;
        }
        wrap_expr(expr, ctx);
        return;
    }

    // Otherwise just recurse — but reset parent_is_jsx since we're already
    // inside a JSX expression container `{...}`.
    let old = ctx.parent_is_jsx;
    ctx.parent_is_jsx = false;
    // Flag a DIRECT arrow/function child as a render callback so its first
    // parameter is not registered as reactive component props — see the
    // `in_jsx_child_callback` field doc.
    let is_render_cb = matches!(
        expr,
        Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_)
    );
    let old_cb = ctx.in_jsx_child_callback;
    ctx.in_jsx_child_callback = is_render_cb;
    walk_expression(expr, ctx);
    ctx.in_jsx_child_callback = old_cb;
    ctx.parent_is_jsx = old;
}

fn maybe_hoist_expr(expr: &Expression, ctx: &mut Ctx) -> Option<String> {
    match expr {
        Expression::JSXElement(el) => {
            if is_static_jsx_node(el) {
                let name = ctx.next_hoist_name();
                let sp = expr.span();
                let text = slice_span(sp, ctx);
                ctx.hoists.push(Hoist {
                    name: name.clone(),
                    text,
                });
                ctx.lens(
                    sp.start,
                    sp.end,
                    "hoisted-static",
                    "static — hoisted once to module scope, never re-evaluated".to_string(),
                );
                Some(name)
            } else {
                None
            }
        }
        Expression::JSXFragment(frag) => {
            if is_static_jsx_fragment(frag) {
                let name = ctx.next_hoist_name();
                let sp = expr.span();
                let text = slice_span(sp, ctx);
                ctx.hoists.push(Hoist {
                    name: name.clone(),
                    text,
                });
                ctx.lens(
                    sp.start,
                    sp.end,
                    "hoisted-static",
                    "static — hoisted once to module scope, never re-evaluated".to_string(),
                );
                Some(name)
            } else {
                None
            }
        }
        _ => None,
    }
}

/// Stable reference — bare Identifier or non-computed MemberExpression chain
/// terminating in an Identifier or `this`. Reading once captures the same
/// value as reading repeatedly inside an effect (the underlying getter
/// resolves identically either way), so the no-wrap path doesn't lose
/// reactivity. Mirrors `isStableReference` in `src/jsx.ts`.
///
/// TS type-only layers (`as T` / `satisfies T` / non-null `!` /
/// `<T>expr`) and parentheses are transparent — they don't change runtime
/// semantics so we unwrap to look at the underlying expression. Real-app
/// reproducer: `<Comp>{children as VNode[]}</Comp>` in kinetic's
/// `createKineticComponent.tsx` — without unwrap the carve-out misses
/// the very pattern it was written for.
fn is_stable_reference(expr: &Expression) -> bool {
    let u = unwrap_type_layers(expr);
    match u {
        Expression::Identifier(_) => true,
        Expression::StaticMemberExpression(member) => {
            // StaticMemberExpression is the non-computed form `obj.prop`.
            // Walk down the object chain — must terminate in Identifier or
            // `this`. Computed accesses (`obj[key]`) come through
            // `ComputedMemberExpression` and are NOT stable references
            // (the index might be dynamic).
            walk_member_chain(&member.object)
        }
        _ => false,
    }
}

fn walk_member_chain(expr: &Expression) -> bool {
    let u = unwrap_type_layers(expr);
    match u {
        Expression::Identifier(_) => true,
        Expression::ThisExpression(_) => true,
        Expression::StaticMemberExpression(member) => walk_member_chain(&member.object),
        _ => false,
    }
}

/// Strip TS type-only layers + parens that don't affect runtime value.
fn unwrap_type_layers<'a>(expr: &'a Expression<'a>) -> &'a Expression<'a> {
    let mut cur = expr;
    loop {
        cur = match cur {
            Expression::TSAsExpression(e) => &e.expression,
            Expression::TSSatisfiesExpression(e) => &e.expression,
            Expression::TSNonNullExpression(e) => &e.expression,
            Expression::TSTypeAssertion(e) => &e.expression,
            Expression::ParenthesizedExpression(e) => &e.expression,
            _ => return cur,
        };
    }
}

fn wrap_expr(expr: &Expression, ctx: &mut Ctx) {
    let sliced = slice_expr(expr, ctx);
    let text = if matches!(expr, Expression::ObjectExpression(_)) {
        format!("() => ({})", sliced)
    } else {
        format!("() => {}", sliced)
    };
    let sp = expr.span();
    ctx.add_replacement(sp.start, sp.end, text);
    ctx.lens(
        sp.start,
        sp.end,
        "reactive",
        "live — re-evaluates whenever its signals change".to_string(),
    );
}

fn hoist_or_wrap(expr: &Expression, ctx: &mut Ctx) {
    if let Some(hoist_name) = maybe_hoist_expr(expr, ctx) {
        ctx.add_replacement(expr.span().start, expr.span().end, hoist_name);
    } else if should_wrap(expr, ctx) {
        wrap_expr(expr, ctx);
    }
}

// ─── Template emit ───────────────────────────────────────────────────────────

fn try_template_emit(el: &JSXElement, ctx: &mut Ctx) -> bool {
    if ctx.ssr {
        return false;
    }
    if is_self_closing(el) {
        return false;
    }
    let elem_count = template_element_count(el, true);
    if elem_count < 1 {
        return false;
    }
    let tpl_call = match build_template_call(el, ctx) {
        Some(s) => s,
        None => return false,
    };
    let start = el.span().start;
    let end = el.span().end;
    let needs_braces = ctx.parent_is_jsx;
    let text = if needs_braces {
        format!("{{{}}}", tpl_call)
    } else {
        tpl_call
    };
    ctx.add_replacement(start, end, text);
    ctx.needs_tpl_import = true;
    true
}

fn has_bail_attr(el: &JSXElement, is_root: bool) -> bool {
    for attr in &el.opening_element.attributes {
        match attr {
            JSXAttributeItem::SpreadAttribute(_) => {
                if is_root {
                    continue;
                }
                return true;
            }
            JSXAttributeItem::Attribute(a) => {
                if let JSXAttributeName::Identifier(id) = &a.name {
                    if id.name.as_str() == "key" {
                        return true;
                    }
                }
            }
        }
    }
    false
}

fn template_element_count(el: &JSXElement, is_root: bool) -> i32 {
    let tag = jsx_tag_name(el);
    if tag.is_empty() || !is_lower_case(tag) {
        return -1;
    }
    if has_bail_attr(el, is_root) {
        return -1;
    }
    if is_self_closing(el) {
        return 1;
    }
    let mut count = 1;
    for child in &el.children {
        let c = count_child_for_template(child);
        if c == -1 {
            return -1;
        }
        count += c;
    }
    count
}

fn count_child_for_template(child: &JSXChild) -> i32 {
    match child {
        JSXChild::Text(_) => 0,
        JSXChild::Element(el) => template_element_count(el, false),
        JSXChild::ExpressionContainer(c) => match &c.expression {
            JSXExpression::EmptyExpression(_) => 0,
            _ => {
                if let Some(expr) = jsx_expr_as_expression(&c.expression) {
                    if contains_jsx_in_expr(expr) {
                        -1
                    } else {
                        0
                    }
                } else {
                    0
                }
            }
        },
        JSXChild::Fragment(frag) => template_fragment_count(frag),
        _ => -1,
    }
}

fn template_fragment_count(frag: &JSXFragment) -> i32 {
    let mut count = 0;
    for child in &frag.children {
        let c = count_child_for_template(child);
        if c == -1 {
            return -1;
        }
        count += c;
    }
    count
}

// ─── Build template call ─────────────────────────────────────────────────────

struct TemplateBuilder {
    bind_lines: Vec<String>,
    disposer_names: Vec<String>,
    reactive_bind_exprs: Vec<String>,
    var_idx: u32,
    disp_idx: u32,
    needs_bind_text: bool,
    needs_bind_direct: bool,
    needs_apply_props: bool,
    needs_mount_slot: bool,
    needs_bind: bool,
}

impl TemplateBuilder {
    fn new() -> Self {
        TemplateBuilder {
            bind_lines: Vec::new(),
            disposer_names: Vec::new(),
            reactive_bind_exprs: Vec::new(),
            var_idx: 0,
            disp_idx: 0,
            needs_bind_text: false,
            needs_bind_direct: false,
            needs_apply_props: false,
            needs_mount_slot: false,
            needs_bind: false,
        }
    }

    fn next_var(&mut self) -> String {
        let name = format!("__e{}", self.var_idx);
        self.var_idx += 1;
        name
    }

    fn next_disp(&mut self) -> String {
        let name = format!("__d{}", self.disp_idx);
        self.disp_idx += 1;
        self.disposer_names.push(name.clone());
        name
    }

    fn next_text_var(&mut self) -> String {
        let name = format!("__t{}", self.var_idx);
        self.var_idx += 1;
        name
    }
}

enum FlatChild<'a> {
    Text(String),
    Element(&'a JSXElement<'a>, usize), // node + elemIdx
    Expression(&'a Expression<'a>),
}

fn build_template_call(el: &JSXElement, ctx: &mut Ctx) -> Option<String> {
    let mut tb = TemplateBuilder::new();
    let html = process_element(el, "__root", &mut tb, ctx)?;

    if tb.needs_bind_text {
        ctx.needs_bind_text_import = true;
    }
    if tb.needs_bind_direct {
        ctx.needs_bind_direct_import = true;
    }
    if tb.needs_apply_props {
        ctx.needs_apply_props_import = true;
    }
    if tb.needs_mount_slot {
        ctx.needs_mount_slot_import = true;
    }

    let escaped = html.replace('\\', "\\\\").replace('"', "\\\"");

    if !tb.reactive_bind_exprs.is_empty() {
        tb.needs_bind = true;
        let combined_name = tb.next_disp();
        let combined_body = tb.reactive_bind_exprs.join("; ");
        tb.bind_lines
            .push(format!("const {} = _bind(() => {{ {} }})", combined_name, combined_body));
    }

    if tb.needs_bind {
        ctx.needs_bind_import = true;
    }

    if tb.bind_lines.is_empty() && tb.disposer_names.is_empty() {
        return Some(format!("_tpl(\"{}\", () => null)", escaped));
    }

    // Append `;` to every bind line so ASI can't merge consecutive
    // statements when the next line starts with `(`, `[`, etc. Mirror of
    // the JS-fallback fix in `src/jsx.ts`. Concrete bug shape pre-fix:
    // a child element with `has_dynamic=true` emits
    // `const __e0 = __root.children[N]` followed by a ref-callback line
    // `((el) => { x = el })(__e0)`. JS does NOT insert ASI here because
    // `__root.children[N]((el) => ...)` is a valid expression, so the
    // parser merges them into one function call:
    //   `const __e0 = __root.children[N]((el) => ...)(__e0)`
    // — calling `children[N]` as a function with the arrow as argument,
    // and self-referencing `__e0` before assignment. Adding the `;`
    // terminates each statement deterministically.
    let mut body = tb
        .bind_lines
        .iter()
        .map(|l| format!("  {};", l))
        .collect::<Vec<_>>()
        .join("\n");

    if !tb.disposer_names.is_empty() {
        let disposers = tb
            .disposer_names
            .iter()
            .map(|d| format!("{}()", d))
            .collect::<Vec<_>>()
            .join("; ");
        body.push_str(&format!("\n  return () => {{ {} }}", disposers));
    } else {
        body.push_str("\n  return null");
    }

    Some(format!("_tpl(\"{}\", (__root) => {{\n{}\n}})", escaped, body))
}

fn resolve_element_var(
    accessor: &str,
    has_dynamic: bool,
    tb: &mut TemplateBuilder,
) -> String {
    if accessor == "__root" {
        return "__root".to_string();
    }
    if has_dynamic {
        let v = tb.next_var();
        tb.bind_lines.push(format!("const {} = {}", v, accessor));
        v
    } else {
        accessor.to_string()
    }
}

fn attr_is_dynamic(attr: &JSXAttributeItem) -> bool {
    match attr {
        JSXAttributeItem::SpreadAttribute(_) => true,
        JSXAttributeItem::Attribute(a) => {
            if let JSXAttributeName::Identifier(id) = &a.name {
                let name = id.name.as_str();
                if name == "ref" {
                    return true;
                }
                if is_event_handler(name) {
                    return true;
                }
            }
            match &a.value {
                Some(JSXAttributeValue::ExpressionContainer(c)) => {
                    match &c.expression {
                        JSXExpression::EmptyExpression(_) => false,
                        _ => {
                            jsx_expr_as_expression(&c.expression).map_or(false, |e| !is_static(e))
                        }
                    }
                }
                _ => false,
            }
        }
    }
}

fn element_has_dynamic(el: &JSXElement) -> bool {
    if el.opening_element.attributes.iter().any(attr_is_dynamic) {
        return true;
    }
    if !is_self_closing(el) {
        return el.children.iter().any(|c| match c {
            JSXChild::ExpressionContainer(ec) => !matches!(ec.expression, JSXExpression::EmptyExpression(_)),
            _ => false,
        });
    }
    false
}

fn process_element(
    el: &JSXElement,
    accessor: &str,
    tb: &mut TemplateBuilder,
    ctx: &mut Ctx,
) -> Option<String> {
    let tag = jsx_tag_name(el);
    if tag.is_empty() {
        return None;
    }
    let has_dyn = element_has_dynamic(el);
    let var_name = resolve_element_var(accessor, has_dyn, tb);
    let html_attrs = process_attrs(el, &var_name, tb, ctx);
    let mut html = format!("<{}{}>", tag, html_attrs);
    if !is_self_closing(el) {
        let child_html = process_children(el, &var_name, accessor, tb, ctx)?;
        html.push_str(&child_html);
    }
    if !is_void_element(tag) {
        html.push_str(&format!("</{}>", tag));
    }
    Some(html)
}

fn process_attrs(
    el: &JSXElement,
    var_name: &str,
    tb: &mut TemplateBuilder,
    ctx: &mut Ctx,
) -> String {
    let mut html_attrs = String::new();
    for attr in &el.opening_element.attributes {
        html_attrs.push_str(&process_one_attr(attr, var_name, tb, ctx));
    }
    html_attrs
}

fn process_one_attr(
    attr: &JSXAttributeItem,
    var_name: &str,
    tb: &mut TemplateBuilder,
    ctx: &mut Ctx,
) -> String {
    match attr {
        JSXAttributeItem::SpreadAttribute(spread) => {
            let expr_text = slice_expr(&spread.argument, ctx);
            tb.needs_apply_props = true;
            if is_dynamic(&spread.argument, ctx) {
                tb.reactive_bind_exprs
                    .push(format!("_applyProps({}, {})", var_name, expr_text));
            } else {
                tb.bind_lines
                    .push(format!("_applyProps({}, {})", var_name, expr_text));
            }
            String::new()
        }
        JSXAttributeItem::Attribute(a) => {
            let attr_name = match &a.name {
                JSXAttributeName::Identifier(id) => id.name.as_str(),
                _ => return String::new(),
            };
            if attr_name == "key" {
                return String::new();
            }
            // Special attrs: ref and event handlers
            if attr_name == "ref" {
                emit_ref(a, var_name, tb, ctx);
                return String::new();
            }
            if is_event_handler(attr_name) {
                emit_event_listener(a, attr_name, var_name, tb, ctx);
                return String::new();
            }
            let html_attr_name = jsx_to_html_attr(attr_name);
            attr_initializer_to_html(a, html_attr_name, var_name, tb, ctx)
        }
    }
}

fn emit_ref(
    attr: &JSXAttribute,
    var_name: &str,
    tb: &mut TemplateBuilder,
    ctx: &mut Ctx,
) {
    let expr = match &attr.value {
        Some(JSXAttributeValue::ExpressionContainer(c)) => {
            match jsx_expr_as_expression(&c.expression) {
                Some(e) => e,
                None => return,
            }
        }
        _ => return,
    };
    let expr_text = slice_expr(expr, ctx);
    match expr {
        Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_) => {
            tb.bind_lines
                .push(format!("({})({})", expr_text, var_name));
        }
        _ => {
            tb.bind_lines.push(format!(
                "{{ const __r = {}; if (typeof __r === \"function\") __r({}); else if (__r) __r.current = {} }}",
                expr_text, var_name, var_name
            ));
        }
    }
}

fn emit_event_listener(
    attr: &JSXAttribute,
    attr_name: &str,
    var_name: &str,
    tb: &mut TemplateBuilder,
    ctx: &mut Ctx,
) {
    // Translate the JSX-style React attribute name (e.g. `onKeyDown`,
    // `onDoubleClick`) to the canonical DOM event name (`keydown`,
    // `dblclick`).
    //
    // Default rule: drop the `on` prefix and lowercase. Covers most
    // React event-prop conventions because the underlying DOM event name
    // is the lowercased multi-word form (`onKeyDown` → `keydown`,
    // `onMouseEnter` → `mouseenter`, `onPointerLeave` → `pointerleave`,
    // `onAnimationStart` → `animationstart`, etc.).
    //
    // Exceptions live in REACT_EVENT_REMAP — same table as the JS-side
    // fallback in `src/event-names.ts`. When adding a new exception,
    // update BOTH this table AND `event-names.ts:REACT_EVENT_REMAP`.
    //
    // Today exactly one: `onDoubleClick` → `dblclick`. See the JSDoc on
    // `REACT_EVENT_REMAP` in `src/event-names.ts` for the full audit.
    let lowered = if attr_name.len() > 2 {
        attr_name[2..].to_ascii_lowercase()
    } else {
        return;
    };
    let event_name = match lowered.as_str() {
        "doubleclick" => "dblclick".to_string(),
        _ => lowered,
    };
    let expr = match &attr.value {
        Some(JSXAttributeValue::ExpressionContainer(c)) => {
            match jsx_expr_as_expression(&c.expression) {
                Some(e) => e,
                None => return,
            }
        }
        _ => return,
    };
    let handler = slice_expr(expr, ctx);
    if is_delegated_event(&event_name) {
        tb.bind_lines
            .push(format!("{}.__ev_{} = {}", var_name, event_name, handler));
    } else {
        tb.bind_lines.push(format!(
            "{}.addEventListener(\"{}\", {})",
            var_name, event_name, handler
        ));
    }
}

fn static_attr_to_html(expr: &Expression, html_attr_name: &str) -> Option<String> {
    if !is_static(expr) {
        return None;
    }
    match expr {
        Expression::StringLiteral(s) => {
            Some(format!(" {}=\"{}\"", html_attr_name, escape_html_attr(&s.value)))
        }
        Expression::NumericLiteral(n) => {
            Some(format!(" {}=\"{}\"", html_attr_name, n.value))
        }
        Expression::BooleanLiteral(b) => {
            if b.value {
                Some(format!(" {}", html_attr_name))
            } else {
                Some(String::new()) // false → omit
            }
        }
        Expression::NullLiteral(_) => Some(String::new()), // null → omit
        Expression::TemplateLiteral(t) if t.expressions.is_empty() => {
            // No-substitution template literal: use the raw text
            if let Some(quasi) = t.quasis.first() {
                Some(format!(
                    " {}=\"{}\"",
                    html_attr_name,
                    escape_html_attr(quasi.value.raw.as_str())
                ))
            } else {
                Some(String::new())
            }
        }
        _ => Some(String::new()),
    }
}

/// Returns `(ref, is_member)` for a zero-arg signal-like call shape suitable
/// for the `_bindText` / `_bindDirect` fast path. Mirrors the JS path's
/// `tryDirectSignalRef`. See that function's JSDoc for the accepted shapes
/// and `is_member` semantics. `is_member: true` tells the emitter to pass an
/// explicit `caller` 3rd arg so the runtime's slow path preserves `this`.
fn try_direct_signal_ref(expr: &Expression, ctx: &mut Ctx) -> Option<(String, bool)> {
    let mut inner = expr;
    // Unwrap concise arrow: () => signal()
    if let Expression::ArrowFunctionExpression(arrow) = inner {
        if let Some(body_expr) = arrow.get_expression() {
            inner = body_expr;
        } else {
            return None;
        }
    }
    if let Expression::CallExpression(call) = inner {
        if !call.arguments.is_empty() {
            return None;
        }
        // Bare identifier: count() — existing fast path. Emit 2-arg form.
        if let Expression::Identifier(_) = &call.callee {
            // Use raw slice — NOT slice_expr — to avoid auto-calling the callee.
            // _bindText needs the signal FUNCTION reference, not its called value.
            return Some((slice_span(call.callee.span(), ctx), false));
        }
        // Non-computed MemberExpression chain: row.label(), data.user.name().
        // Walk the chain, bail on any computed access. Root identifier must
        // NOT be a tracked active signal (would imply count.peek() etc).
        if let Expression::StaticMemberExpression(_) = &call.callee {
            let mut cur: &Expression = &call.callee;
            loop {
                match cur {
                    Expression::StaticMemberExpression(m) => {
                        cur = &m.object;
                    }
                    Expression::ComputedMemberExpression(_) => return None,
                    _ => break,
                }
            }
            if let Expression::Identifier(id) = cur {
                if is_active_signal(id.name.as_str(), ctx) {
                    return None;
                }
                return Some((slice_span(call.callee.span(), ctx), true));
            }
            return None;
        }
        return None;
    }
    None
}

fn unwrap_accessor(expr: &Expression, ctx: &mut Ctx) -> (String, bool) {
    match expr {
        Expression::ArrowFunctionExpression(arrow) => {
            if let Some(body_expr) = arrow.get_expression() {
                // Concise arrow: () => expr
                let text = slice_expr(body_expr, ctx);
                return (text, true);
            }
            // Block arrow
            let text = slice_expr(expr, ctx);
            return (format!("({})()", text), true);
        }
        Expression::FunctionExpression(_) => {
            let text = slice_expr(expr, ctx);
            return (format!("({})()", text), true);
        }
        _ => {
            let text = slice_expr(expr, ctx);
            let reactive = is_dynamic(expr, ctx);
            (text, reactive)
        }
    }
}

// DOM properties whose live value diverges from the content attribute.
// For these, emit property assignment (`el.value = v`) instead of
// `setAttribute("value", v)`. Otherwise the property and attribute drift
// apart in user-driven flows: typing in a controlled <input> updates the
// .value property, but `input.set('')` clearing the signal only resets
// the attribute — the stale typed text stays visible. Same for `checked`
// on checkboxes (presence of the attribute means checked regardless of
// value).
fn is_dom_prop(name: &str) -> bool {
    matches!(
        name,
        "value"
            | "checked"
            | "selected"
            | "disabled"
            | "multiple"
            | "readOnly"
            | "indeterminate"
    )
}

fn attr_setter(html_attr_name: &str, var_name: &str, expr: &str) -> String {
    if html_attr_name == "class" {
        format!("{}.className = {}", var_name, expr)
    } else if html_attr_name == "style" {
        format!("{}.style.cssText = {}", var_name, expr)
    } else if is_dom_prop(html_attr_name) {
        format!("{}.{} = {}", var_name, html_attr_name, expr)
    } else {
        format!("{}.setAttribute(\"{}\", {})", var_name, html_attr_name, expr)
    }
}

fn emit_dynamic_attr(
    expr_node: &Expression,
    html_attr_name: &str,
    var_name: &str,
    tb: &mut TemplateBuilder,
    ctx: &mut Ctx,
) {
    let (expr_text, is_reactive) = unwrap_accessor(expr_node, ctx);
    if !is_reactive {
        tb.bind_lines
            .push(attr_setter(html_attr_name, var_name, &expr_text));
        return;
    }
    let sp = expr_node.span();
    ctx.lens(
        sp.start,
        sp.end,
        "reactive-attr",
        format!(
            "live attribute — `{}` re-applies whenever its signals change",
            html_attr_name
        ),
    );
    let direct_ref = try_direct_signal_ref(expr_node, ctx);
    if let Some((signal_name, is_member)) = direct_ref {
        tb.needs_bind_direct = true;
        let d = tb.next_disp();
        let updater = if html_attr_name == "class" {
            format!(
                "(v) => {{ {}.className = v == null ? \"\" : String(v) }}",
                var_name
            )
        } else if html_attr_name == "style" {
            format!(
                "(v) => {{ if (typeof v === \"string\") {0}.style.cssText = v; else if (v) Object.assign({0}.style, v) }}",
                var_name
            )
        } else if is_dom_prop(html_attr_name) {
            format!("(v) => {{ {}.{} = v }}", var_name, html_attr_name)
        } else {
            format!(
                "(v) => {{ {}.setAttribute(\"{}\", v == null ? \"\" : String(v)) }}",
                var_name, html_attr_name
            )
        };
        let caller_arg = if is_member {
            format!(", () => {}()", signal_name)
        } else {
            String::new()
        };
        tb.bind_lines.push(format!(
            "const {} = _bindDirect({}, {}{})",
            d, signal_name, updater, caller_arg
        ));
        return;
    }
    // Selector-ternary auto-promotion: `selector(k) ? a : b` becomes
    // `selector.subscribe(k, m => setter(m ? a : b))` — the effect-free
    // per-key fast path. See `try_direct_selector_ternary` for the bail
    // catalog. Real-world impact: per-row className-on-selection in
    // <For> drops from ~5 allocs (full renderEffect) to ~2 (Set.add +
    // dispose closure).
    if let Some(sel) = try_direct_selector_ternary(expr_node, ctx) {
        let d = tb.next_disp();
        let setter_expr = format!("(m ? {} : {})", sel.consequent, sel.alternate);
        let setter_body = attr_setter(html_attr_name, var_name, &setter_expr);
        tb.bind_lines.push(format!(
            "const {} = {}.subscribe({}, (m) => {{ {} }})",
            d, sel.selector_ref, sel.key_expr, setter_body
        ));
        return;
    }
    tb.reactive_bind_exprs
        .push(attr_setter(html_attr_name, var_name, &expr_text));
}

fn emit_attr_expression(
    expr_node: &Expression,
    html_attr_name: &str,
    var_name: &str,
    tb: &mut TemplateBuilder,
    ctx: &mut Ctx,
) -> String {
    if let Some(static_html) = static_attr_to_html(expr_node, html_attr_name) {
        return static_html;
    }
    // Style object special case
    if html_attr_name == "style" {
        if let Expression::ObjectExpression(_) = expr_node {
            let text = slice_expr(expr_node, ctx);
            tb.bind_lines
                .push(format!("Object.assign({}.style, {})", var_name, text));
            return String::new();
        }
    }
    emit_dynamic_attr(expr_node, html_attr_name, var_name, tb, ctx);
    String::new()
}

fn attr_initializer_to_html(
    attr: &JSXAttribute,
    html_attr_name: &str,
    var_name: &str,
    tb: &mut TemplateBuilder,
    ctx: &mut Ctx,
) -> String {
    match &attr.value {
        None => format!(" {}", html_attr_name),
        Some(JSXAttributeValue::StringLiteral(s)) => {
            format!(" {}=\"{}\"", html_attr_name, escape_html_attr(&s.value))
        }
        Some(JSXAttributeValue::ExpressionContainer(c)) => {
            match jsx_expr_as_expression(&c.expression) {
                Some(expr) => emit_attr_expression(expr, html_attr_name, var_name, tb, ctx),
                None => String::new(),
            }
        }
        _ => String::new(),
    }
}

// ─── Template children processing ────────────────────────────────────────────

fn flatten_children<'a>(children: &'a [JSXChild<'a>]) -> Vec<FlatChild<'a>> {
    let mut flat: Vec<FlatChild<'a>> = Vec::new();
    let mut elem_idx = 0usize;
    fn add_children<'a>(
        kids: &'a [JSXChild<'a>],
        flat: &mut Vec<FlatChild<'a>>,
        elem_idx: &mut usize,
    ) {
        for child in kids {
            match child {
                JSXChild::Text(text) => {
                    let cleaned = clean_jsx_text(text.value.as_str());
                    if !cleaned.is_empty() {
                        flat.push(FlatChild::Text(cleaned));
                    }
                }
                JSXChild::Element(el) => {
                    flat.push(FlatChild::Element(el, *elem_idx));
                    *elem_idx += 1;
                }
                JSXChild::ExpressionContainer(c) => {
                    if let Some(expr) = jsx_expr_as_expression(&c.expression) {
                        flat.push(FlatChild::Expression(expr));
                    }
                }
                JSXChild::Fragment(frag) => {
                    add_children(&frag.children, flat, elem_idx);
                }
                _ => {}
            }
        }
    }
    add_children(children, &mut flat, &mut elem_idx);
    flat
}

fn analyze_children(flat: &[FlatChild]) -> (bool, bool) {
    // `useMixed` triggers placeholder-based positional mounting (each
    // dynamic child gets a `<!>` comment slot in the template that
    // `replaceChild`-replaces at mount). It must fire whenever ≥2 of
    // {element, text, expression} are interleaved — otherwise dynamic
    // text nodes added via `appendChild` land after all static template
    // content, breaking source-order rendering for shapes like
    // `<p>foo {x()} bar</p>` (rendered "foo  barX" instead of
    // "foo X bar"). Mirrors `analyzeChildren` in
    // `packages/core/compiler/src/jsx.ts:1132-1147` — the JS rule was
    // updated by Phase B2's whitespace tests; this Rust port previously
    // used `has_elem && has_non_elem` which only fires when AT LEAST
    // ONE element child coexists with a text/expression — broken for
    // pure text+expression mixes (`<div>hello{name()}</div>`).
    let has_elem = flat.iter().any(|c| matches!(c, FlatChild::Element(_, _)));
    let has_text = flat.iter().any(|c| matches!(c, FlatChild::Text(_)));
    let expr_count = flat
        .iter()
        .filter(|c| matches!(c, FlatChild::Expression(_)))
        .count();
    let present = (has_elem as u8) + (has_text as u8) + ((expr_count > 0) as u8);
    (present > 1, expr_count > 1)
}

fn emit_reactive_text_child(
    expr_text: &str,
    expr_node: &Expression,
    var_name: &str,
    parent_ref: &str,
    child_node_idx: usize,
    needs_placeholder: bool,
    tb: &mut TemplateBuilder,
    ctx: &mut Ctx,
) -> String {
    let t_var = tb.next_text_var();
    // Sole-dynamic-text-child fast path (mirrors jsx.ts byte-for-byte): a
    // single-space text node is BAKED into the template HTML and grabbed
    // via `.firstChild` — saves a createTextNode+appendChild pair per
    // template instantiation (per ROW under <For>). Whitespace-only text
    // survives innerHTML parsing in every element context (incl. table
    // foster-parenting, which exempts whitespace), and every binding path
    // writes the initial value synchronously at bind time, so the space
    // never renders. Mixed-content keeps comment+replaceChild — adjacent
    // baked text runs would merge during parsing.
    if needs_placeholder {
        tb.bind_lines
            .push(format!("const {} = document.createTextNode(\"\")", t_var));
        tb.bind_lines.push(format!(
            "{}.replaceChild({}, {})",
            parent_ref, t_var, child_node_accessor(parent_ref, child_node_idx, true)
        ));
    } else {
        tb.bind_lines
            .push(format!("const {} = {}.firstChild", t_var, var_name));
    }
    let direct_ref = try_direct_signal_ref(expr_node, ctx);
    if let Some((signal_name, is_member)) = direct_ref {
        tb.needs_bind_text = true;
        let d = tb.next_disp();
        let caller_arg = if is_member {
            format!(", () => {}()", signal_name)
        } else {
            String::new()
        };
        tb.bind_lines.push(format!(
            "const {} = _bindText({}, {}{})",
            d, signal_name, t_var, caller_arg
        ));
    } else if let Some(sel) = try_direct_selector_ternary(expr_node, ctx) {
        // Selector-ternary auto-promotion for text children — companion
        // to className path (PR #898). See `try_direct_selector_ternary`.
        let d = tb.next_disp();
        tb.bind_lines.push(format!(
            "const {} = {}.subscribe({}, (m) => {{ {}.data = (m ? {} : {}) }})",
            d, sel.selector_ref, sel.key_expr, t_var, sel.consequent, sel.alternate
        ));
    } else if let Some(sig_method) = try_direct_signal_method_call(expr_node, ctx) {
        // Signal-method-call auto-promotion. See `try_direct_signal_method_call`.
        tb.needs_bind_direct = true;
        let d = tb.next_disp();
        tb.bind_lines.push(format!(
            "const {} = _bindDirect({}, (v) => {{ {}.data = v{} }})",
            d, sig_method.signal_ref, t_var, sig_method.method_call
        ));
    } else {
        tb.needs_bind = true;
        let d = tb.next_disp();
        tb.bind_lines.push(format!(
            "const {} = _bind(() => {{ {}.data = {} }})",
            d, t_var, expr_text
        ));
    }
    if needs_placeholder {
        "<!>".to_string()
    } else {
        " ".to_string()
    }
}

fn emit_static_text_child(
    expr_text: &str,
    var_name: &str,
    parent_ref: &str,
    child_node_idx: usize,
    needs_placeholder: bool,
    tb: &mut TemplateBuilder,
) -> String {
    if needs_placeholder {
        let t_var = tb.next_text_var();
        tb.bind_lines
            .push(format!("const {} = document.createTextNode({})", t_var, expr_text));
        tb.bind_lines.push(format!(
            "{}.replaceChild({}, {})",
            parent_ref, t_var, child_node_accessor(parent_ref, child_node_idx, true)
        ));
        "<!>".to_string()
    } else {
        tb.bind_lines
            .push(format!("{}.textContent = {}", var_name, expr_text));
        String::new()
    }
}

// Strength-reduce children[N]/childNodes[N] to a firstChild/nextSibling walk.
// The live HTMLCollection/NodeList indexed getter is measurably slower than
// direct pointer reads (~3.8% on create-heavy mounts; SolidJS emits the walk
// form for the same reason). children[] (element collection, skips text) maps to
// firstElementChild/nextElementSibling; childNodes[] (node list) maps to
// firstChild/nextSibling. Falls back to indexed past 8 hops. MUST stay byte-for-
// byte identical to jsx.ts:childNodeAccessor (native-equivalence tests enforce).
fn child_node_accessor(parent_ref: &str, idx: usize, mixed: bool) -> String {
    if idx > 8 {
        return if mixed {
            format!("{}.childNodes[{}]", parent_ref, idx)
        } else {
            format!("{}.children[{}]", parent_ref, idx)
        };
    }
    let first = if mixed { "firstChild" } else { "firstElementChild" };
    let next = if mixed { "nextSibling" } else { "nextElementSibling" };
    let mut s = format!("{}.{}", parent_ref, first);
    for _ in 0..idx {
        s.push('.');
        s.push_str(next);
    }
    s
}

fn process_one_child(
    child: &FlatChild,
    var_name: &str,
    parent_ref: &str,
    use_mixed: bool,
    use_multi_expr: bool,
    child_node_idx: usize,
    tb: &mut TemplateBuilder,
    ctx: &mut Ctx,
) -> Option<String> {
    match child {
        FlatChild::Text(text) => Some(escape_html_text(text)),
        FlatChild::Element(el, elem_idx) => {
            let child_accessor = if use_mixed {
                child_node_accessor(parent_ref, child_node_idx, true)
            } else {
                child_node_accessor(parent_ref, *elem_idx, false)
            };
            process_element(el, &child_accessor, tb, ctx)
        }
        FlatChild::Expression(expr) => {
            let needs_placeholder = use_mixed || use_multi_expr;
            let (expr_text, is_reactive) = unwrap_accessor(expr, ctx);
            let is_element_valued_ident = matches!(
                expr,
                Expression::Identifier(id) if ctx.element_vars.contains(id.name.as_str())
            );
            if is_children_expression(expr, &expr_text) || is_element_valued_ident {
                tb.needs_mount_slot = true;
                let placeholder = child_node_accessor(parent_ref, child_node_idx, true);
                let d = tb.next_disp();
                tb.bind_lines.push(format!(
                    "const {} = _mountSlot({}, {}, {})",
                    d, expr_text, parent_ref, placeholder
                ));
                return Some("<!>".to_string());
            }
            let cx_sp = expr.span();
            if is_reactive {
                ctx.lens(
                    cx_sp.start,
                    cx_sp.end,
                    "reactive",
                    "live — this text re-renders whenever its signals change".to_string(),
                );
                Some(emit_reactive_text_child(
                    &expr_text,
                    expr,
                    var_name,
                    parent_ref,
                    child_node_idx,
                    needs_placeholder,
                    tb,
                    ctx,
                ))
            } else {
                ctx.lens(
                    cx_sp.start,
                    cx_sp.end,
                    "static-text",
                    "baked once into the DOM — never re-renders (no signal read here)".to_string(),
                );
                Some(emit_static_text_child(
                    &expr_text,
                    var_name,
                    parent_ref,
                    child_node_idx,
                    needs_placeholder,
                    tb,
                ))
            }
        }
    }
}

fn process_children(
    el: &JSXElement,
    var_name: &str,
    accessor: &str,
    tb: &mut TemplateBuilder,
    ctx: &mut Ctx,
) -> Option<String> {
    let flat = flatten_children(&el.children);
    let (use_mixed, use_multi_expr) = analyze_children(&flat);
    let parent_ref = if accessor == "__root" {
        "__root"
    } else {
        var_name
    };
    let mut html = String::new();
    let mut child_node_idx = 0;
    for child in &flat {
        let child_html = process_one_child(
            child,
            var_name,
            parent_ref,
            use_mixed,
            use_multi_expr,
            child_node_idx,
            tb,
            ctx,
        )?;
        html.push_str(&child_html);
        child_node_idx += 1;
    }
    Some(html)
}

// ─── Component props detection ──────────────────────────────────────────────

fn maybe_register_component_props_fn(func: &oxc_ast::ast::Function, ctx: &mut Ctx) {
    if func.params.items.is_empty() {
        return;
    }
    let first = &func.params.items[0];
    if let BindingPattern::BindingIdentifier(id) = &first.pattern {
        if let Some(body) = &func.body {
            if body_contains_jsx(body) {
                ctx.props_names.insert(id.name.to_string());
            }
        }
    }
}

fn maybe_register_component_props_arrow(arrow: &ArrowFunctionExpression, ctx: &mut Ctx) {
    if arrow.params.items.is_empty() {
        return;
    }
    let first = &arrow.params.items[0];
    if let BindingPattern::BindingIdentifier(id) = &first.pattern {
        if arrow_contains_jsx(arrow) {
            ctx.props_names.insert(id.name.to_string());
        }
    }
}

fn body_contains_jsx(body: &FunctionBody) -> bool {
    body.statements.iter().any(|s| stmt_contains_jsx(s))
}

fn stmt_contains_jsx(stmt: &Statement) -> bool {
    match stmt {
        Statement::ReturnStatement(ret) => {
            ret.argument.as_ref().map_or(false, |e| expr_contains_jsx(e))
        }
        Statement::ExpressionStatement(expr) => expr_contains_jsx(&expr.expression),
        Statement::VariableDeclaration(decl) => decl
            .declarations
            .iter()
            .any(|d| d.init.as_ref().map_or(false, |e| expr_contains_jsx(e))),
        Statement::IfStatement(if_stmt) => {
            stmt_contains_jsx(&if_stmt.consequent)
                || if_stmt
                    .alternate
                    .as_ref()
                    .map_or(false, |s| stmt_contains_jsx(s))
        }
        Statement::BlockStatement(block) => block.body.iter().any(|s| stmt_contains_jsx(s)),
        Statement::TryStatement(t) => {
            t.block.body.iter().any(|s| stmt_contains_jsx(s))
                || t.handler.as_ref().map_or(false, |h| h.body.body.iter().any(|s| stmt_contains_jsx(s)))
                || t.finalizer.as_ref().map_or(false, |f| f.body.iter().any(|s| stmt_contains_jsx(s)))
        }
        Statement::ForStatement(f) => stmt_contains_jsx(&f.body),
        Statement::ForInStatement(f) => stmt_contains_jsx(&f.body),
        Statement::ForOfStatement(f) => stmt_contains_jsx(&f.body),
        Statement::WhileStatement(w) => stmt_contains_jsx(&w.body),
        Statement::DoWhileStatement(d) => stmt_contains_jsx(&d.body),
        Statement::SwitchStatement(s) => s.cases.iter().any(|c| c.consequent.iter().any(|s| stmt_contains_jsx(s))),
        Statement::LabeledStatement(l) => stmt_contains_jsx(&l.body),
        _ => false,
    }
}

fn expr_contains_jsx(expr: &Expression) -> bool {
    match expr {
        Expression::JSXElement(_) | Expression::JSXFragment(_) => true,
        Expression::ParenthesizedExpression(p) => expr_contains_jsx(&p.expression),
        Expression::ConditionalExpression(c) => {
            expr_contains_jsx(&c.consequent) || expr_contains_jsx(&c.alternate)
        }
        Expression::LogicalExpression(l) => {
            expr_contains_jsx(&l.left) || expr_contains_jsx(&l.right)
        }
        Expression::ArrowFunctionExpression(a) => arrow_contains_jsx(a),
        _ => false,
    }
}

fn arrow_contains_jsx(arrow: &ArrowFunctionExpression) -> bool {
    if let Some(expr) = arrow.get_expression() {
        return expr_contains_jsx(expr);
    }
    body_contains_jsx(&arrow.body)
}

// ─── Prop-derived variable collection ────────────────────────────────────────

fn collect_prop_derived(decl: &VariableDeclaration, ctx: &mut Ctx) {
    // Handle splitProps regardless of kind
    for declarator in &decl.declarations {
        if let BindingPattern::ArrayPattern(arr) = &declarator.id {
            if let Some(Expression::CallExpression(call)) = &declarator.init {
                if let Expression::Identifier(callee) = &call.callee {
                    if callee.name.as_str() == "splitProps" {
                        for el in arr.elements.iter().flatten() {
                            if let BindingPattern::BindingIdentifier(id) = el {
                                ctx.props_names.insert(id.name.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    // Element-valued bindings (const OR let, any scope): initializer is
    // DIRECTLY a JSX element/fragment, optionally parenthesized. Captured
    // before the const-only / callback-depth gates below — a stored element
    // used as a bare child must mount in every scope. Mirrors the JS
    // backend's `elementVars` collection exactly (1:1).
    for declarator in &decl.declarations {
        if let BindingPattern::BindingIdentifier(id) = &declarator.id {
            if let Some(init) = &declarator.init {
                let mut e = init;
                while let Expression::ParenthesizedExpression(p) = e {
                    e = &p.expression;
                }
                if matches!(e, Expression::JSXElement(_) | Expression::JSXFragment(_)) {
                    ctx.element_vars.insert(id.name.to_string());
                }
            }
        }
    }

    if decl.kind != VariableDeclarationKind::Const {
        return;
    }
    if ctx.callback_depth > 0 {
        return;
    }
    for declarator in &decl.declarations {
        if let BindingPattern::BindingIdentifier(id) = &declarator.id {
            if let Some(init) = &declarator.init {
                if is_stateful_call_expr(init) {
                    // Track signal() and computed() declarations for auto-call
                    if is_signal_call_expr(init) {
                        ctx.signal_vars.insert(id.name.to_string());
                    }
                    // Track createSelector() for .subscribe auto-promotion
                    // in className/attr bindings (see try_direct_selector_ternary).
                    if is_selector_call_expr(init) {
                        ctx.selector_vars.insert(id.name.to_string());
                    }
                    continue;
                }
                if reads_from_props(init, &ctx.props_names)
                    || references_prop_derived(init, &ctx.prop_derived_vars)
                {
                    ctx.prop_derived_vars
                        .insert(id.name.to_string(), init.span());
                }
            }
        }
    }
}

fn reads_from_props(expr: &Expression, props_names: &FxHashSet<String>) -> bool {
    match expr {
        Expression::StaticMemberExpression(member) => {
            if let Expression::Identifier(obj) = &member.object {
                if props_names.contains(obj.name.as_str()) {
                    return true;
                }
            }
            reads_from_props(&member.object, props_names)
        }
        Expression::ComputedMemberExpression(member) => {
            if let Expression::Identifier(obj) = &member.object {
                if props_names.contains(obj.name.as_str()) {
                    return true;
                }
            }
            reads_from_props(&member.object, props_names)
                || reads_from_props(&member.expression, props_names)
        }
        Expression::BinaryExpression(b) => {
            reads_from_props(&b.left, props_names) || reads_from_props(&b.right, props_names)
        }
        Expression::LogicalExpression(l) => {
            reads_from_props(&l.left, props_names) || reads_from_props(&l.right, props_names)
        }
        Expression::ConditionalExpression(c) => {
            reads_from_props(&c.test, props_names)
                || reads_from_props(&c.consequent, props_names)
                || reads_from_props(&c.alternate, props_names)
        }
        Expression::UnaryExpression(u) => reads_from_props(&u.argument, props_names),
        Expression::ParenthesizedExpression(p) => reads_from_props(&p.expression, props_names),
        Expression::TemplateLiteral(t) => {
            t.expressions.iter().any(|e| reads_from_props(e, props_names))
        }
        Expression::CallExpression(call) => {
            reads_from_props(&call.callee, props_names)
                || call.arguments.iter().any(|a| {
                    a.as_expression()
                        .map_or(false, |e| reads_from_props(e, props_names))
                })
        }
        Expression::ArrayExpression(arr) => arr.elements.iter().any(|el| {
            el.as_expression()
                .map_or(false, |e| reads_from_props(e, props_names))
        }),
        Expression::ObjectExpression(obj) => obj.properties.iter().any(|p| match p {
            ObjectPropertyKind::ObjectProperty(prop) => reads_from_props(&prop.value, props_names),
            ObjectPropertyKind::SpreadProperty(s) => reads_from_props(&s.argument, props_names),
        }),
        // TypeScript expression wrappers
        Expression::TSAsExpression(e) => reads_from_props(&e.expression, props_names),
        Expression::TSSatisfiesExpression(e) => reads_from_props(&e.expression, props_names),
        Expression::TSNonNullExpression(e) => reads_from_props(&e.expression, props_names),
        Expression::TSTypeAssertion(e) => reads_from_props(&e.expression, props_names),
        // Optional chaining
        Expression::ChainExpression(c) => match &c.expression {
            ChainElement::CallExpression(call) => {
                reads_from_props(&call.callee, props_names)
                    || call.arguments.iter().any(|a| {
                        a.as_expression()
                            .map_or(false, |e| reads_from_props(e, props_names))
                    })
            }
            ChainElement::StaticMemberExpression(m) => {
                if let Expression::Identifier(obj) = &m.object {
                    if props_names.contains(obj.name.as_str()) {
                        return true;
                    }
                }
                reads_from_props(&m.object, props_names)
            }
            ChainElement::ComputedMemberExpression(m) => {
                if let Expression::Identifier(obj) = &m.object {
                    if props_names.contains(obj.name.as_str()) {
                        return true;
                    }
                }
                reads_from_props(&m.object, props_names)
                    || reads_from_props(&m.expression, props_names)
            }
            ChainElement::PrivateFieldExpression(p) => reads_from_props(&p.object, props_names),
            ChainElement::TSNonNullExpression(e) => reads_from_props(&e.expression, props_names),
        },
        _ => false,
    }
}

fn references_prop_derived(expr: &Expression, prop_derived: &FxHashMap<String, Span>) -> bool {
    if prop_derived.is_empty() {
        return false;
    }
    match expr {
        Expression::Identifier(id) => prop_derived.contains_key(id.name.as_str()),
        Expression::StaticMemberExpression(m) => {
            // Skip property-name position
            references_prop_derived(&m.object, prop_derived)
        }
        Expression::ComputedMemberExpression(m) => {
            references_prop_derived(&m.object, prop_derived)
                || references_prop_derived(&m.expression, prop_derived)
        }
        Expression::BinaryExpression(b) => {
            references_prop_derived(&b.left, prop_derived)
                || references_prop_derived(&b.right, prop_derived)
        }
        Expression::LogicalExpression(l) => {
            references_prop_derived(&l.left, prop_derived)
                || references_prop_derived(&l.right, prop_derived)
        }
        Expression::ConditionalExpression(c) => {
            references_prop_derived(&c.test, prop_derived)
                || references_prop_derived(&c.consequent, prop_derived)
                || references_prop_derived(&c.alternate, prop_derived)
        }
        Expression::UnaryExpression(u) => references_prop_derived(&u.argument, prop_derived),
        Expression::ParenthesizedExpression(p) => {
            references_prop_derived(&p.expression, prop_derived)
        }
        Expression::TemplateLiteral(t) => {
            t.expressions
                .iter()
                .any(|e| references_prop_derived(e, prop_derived))
        }
        Expression::CallExpression(call) => {
            references_prop_derived(&call.callee, prop_derived)
                || call.arguments.iter().any(|a| {
                    a.as_expression()
                        .map_or(false, |e| references_prop_derived(e, prop_derived))
                })
        }
        // TypeScript expression wrappers
        Expression::TSAsExpression(e) => references_prop_derived(&e.expression, prop_derived),
        Expression::TSSatisfiesExpression(e) => references_prop_derived(&e.expression, prop_derived),
        Expression::TSNonNullExpression(e) => references_prop_derived(&e.expression, prop_derived),
        Expression::TSTypeAssertion(e) => references_prop_derived(&e.expression, prop_derived),
        // Optional chaining
        Expression::ChainExpression(c) => match &c.expression {
            ChainElement::CallExpression(call) => {
                references_prop_derived(&call.callee, prop_derived)
                    || call.arguments.iter().any(|a| {
                        a.as_expression()
                            .map_or(false, |e| references_prop_derived(e, prop_derived))
                    })
            }
            ChainElement::StaticMemberExpression(m) => references_prop_derived(&m.object, prop_derived),
            ChainElement::ComputedMemberExpression(m) => {
                references_prop_derived(&m.object, prop_derived)
                    || references_prop_derived(&m.expression, prop_derived)
            }
            ChainElement::PrivateFieldExpression(p) => references_prop_derived(&p.object, prop_derived),
            ChainElement::TSNonNullExpression(e) => references_prop_derived(&e.expression, prop_derived),
        },
        _ => false,
    }
}
