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

#[napi(object)]
pub struct TransformResult {
    pub code: String,
    pub uses_templates: Option<bool>,
    pub warnings: Vec<CompilerWarning>,
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
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'<' {
            out.push_str("&lt;");
            i += 1;
        } else if bytes[i] == b'&' {
            // Check if this is already an HTML entity
            if let Some(semi_pos) = s[i + 1..].find(';') {
                let entity = &s[i + 1..i + 1 + semi_pos];
                let is_entity = entity.starts_with('#')
                    || entity
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == 'x' || c == 'X');
                if is_entity && !entity.is_empty() {
                    out.push('&');
                    i += 1;
                    continue;
                }
            }
            out.push_str("&amp;");
            i += 1;
        } else {
            out.push(bytes[i] as char);
            i += 1;
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
    line_index: LineIndex,
    ssr: bool,

    replacements: Vec<Replacement>,
    warnings: Vec<CompilerWarning>,
    hoists: Vec<Hoist>,
    hoist_idx: u32,

    needs_tpl_import: bool,
    needs_rp_import: bool,
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
    /// Used to decide whether template call output needs wrapping in {}.
    parent_is_jsx: bool,
}

impl<'a> Ctx<'a> {
    fn new(source: &'a str, ssr: bool) -> Self {
        Ctx {
            source,
            line_index: LineIndex::new(source),
            ssr,
            replacements: Vec::new(),
            warnings: Vec::new(),
            hoists: Vec::new(),
            hoist_idx: 0,
            needs_tpl_import: false,
            needs_rp_import: false,
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
        }
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

        if self.needs_rp_import {
            result = format!("import {{ _rp }} from \"@pyreon/core\";\n{}", result);
        }

        TransformResult {
            code: result,
            uses_templates: if self.needs_tpl_import {
                Some(true)
            } else {
                None
            },
            warnings: self.warnings,
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

fn is_stateful_call_expr(expr: &Expression) -> bool {
    if let Expression::CallExpression(call) = expr {
        if let Expression::Identifier(id) = &call.callee {
            return is_stateful_call(id.name.as_str());
        }
    }
    false
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
            if !is_pure_static_call(call) {
                return true;
            }
            // Pure static call — fall through to check args
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
            // We don't have parent context here in Rust — so we conservatively
            // mark it as dynamic. The JS version checks parent for property-name
            // position, but in practice prop-derived vars are rarely used as
            // non-computed property names.
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

/// Resolve prop-derived var to its inlined text (with transitive resolution).
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
    let raw_text = ctx.source[span.start as usize..span.end as usize].to_string();
    let resolved = resolve_identifiers_in_text(&raw_text, span.start, ctx);
    ctx.resolving.remove(var_name);
    ctx.resolved_cache.insert(var_name.to_string(), resolved.clone());
    resolved
}

/// Walk the initializer text, find Identifier references to prop-derived vars,
/// and replace them with their resolved text (recursively).
///
/// Uses string-level scanning with word-boundary and string-literal awareness
/// to avoid replacing occurrences inside string/template literals.
fn resolve_identifiers_in_text(text: &str, base_offset: u32, ctx: &mut Ctx) -> String {
    if ctx.prop_derived_vars.is_empty() {
        return text.to_string();
    }

    let _end_offset = base_offset + text.len() as u32;

    // Build a set of byte ranges that are inside string literals (single-quoted,
    // double-quoted, or backtick template literals). We skip any identifier match
    // whose start falls inside one of these ranges.
    let string_ranges = find_string_literal_ranges(text);

    let var_names: Vec<String> = ctx.prop_derived_vars.keys().cloned().collect();
    let mut replacements: Vec<(usize, usize, String)> = Vec::new();

    for var_name in &var_names {
        let var_bytes = var_name.as_bytes();
        let text_bytes = text.as_bytes();
        let mut pos = 0;
        while pos + var_bytes.len() <= text_bytes.len() {
            if let Some(found) = text[pos..].find(var_name.as_str()) {
                let start = pos + found;
                let end = start + var_bytes.len();
                // Check word boundary: char before and after must not be identifier chars
                let before_ok = if start == 0 {
                    true
                } else {
                    let b = text_bytes[start - 1];
                    !b.is_ascii_alphanumeric() && b != b'_' && b != b'$'
                };
                let after_ok = if end >= text_bytes.len() {
                    true
                } else {
                    let b = text_bytes[end];
                    !b.is_ascii_alphanumeric() && b != b'_' && b != b'$'
                };
                // Check it's not a property access position (preceded by '.')
                let not_property = if start == 0 {
                    true
                } else {
                    // Walk backwards skipping whitespace
                    let mut idx = start - 1;
                    while idx > 0 && text_bytes[idx].is_ascii_whitespace() {
                        idx -= 1;
                    }
                    text_bytes[idx] != b'.'
                };
                // Check it's not inside a string literal
                let not_in_string = !string_ranges.iter().any(|&(s, e)| start >= s && start < e);
                if before_ok && after_ok && not_property && not_in_string {
                    let resolved = resolve_var_to_string(var_name, ctx);
                    replacements.push((start, end, format!("({})", resolved)));
                }
                pos = end;
            } else {
                break;
            }
        }
    }

    if replacements.is_empty() {
        return text.to_string();
    }

    replacements.sort_by_key(|r| r.0);
    // Deduplicate overlapping ranges
    let mut deduped: Vec<(usize, usize, String)> = Vec::new();
    for r in replacements {
        if deduped.last().map_or(true, |last| r.0 >= last.1) {
            deduped.push(r);
        }
    }

    let mut result = String::new();
    let mut last = 0;
    for (start, end, replacement) in &deduped {
        result.push_str(&text[last..*start]);
        result.push_str(replacement);
        last = *end;
    }
    result.push_str(&text[last..]);
    result
}

/// Find byte ranges of string literal contents (including quotes) in source text.
/// Handles single-quoted, double-quoted, and backtick template strings.
/// Returns Vec<(start, end)> where start..end covers the entire quoted region.
fn find_string_literal_ranges(text: &str) -> Vec<(usize, usize)> {
    let bytes = text.as_bytes();
    let mut ranges = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if b == b'\'' || b == b'"' || b == b'`' {
            let quote = b;
            let start = i;
            i += 1;
            while i < bytes.len() {
                if bytes[i] == b'\\' {
                    i += 2; // skip escaped char
                    continue;
                }
                if bytes[i] == quote {
                    i += 1; // past closing quote
                    break;
                }
                i += 1;
            }
            ranges.push((start, i));
        } else if b == b'/' && i + 1 < bytes.len() && bytes[i + 1] == b'/' {
            // Line comment — skip to end of line
            while i < bytes.len() && bytes[i] != b'\n' {
                i += 1;
            }
        } else if b == b'/' && i + 1 < bytes.len() && bytes[i + 1] == b'*' {
            // Block comment — skip to */
            i += 2;
            while i + 1 < bytes.len() {
                if bytes[i] == b'*' && bytes[i + 1] == b'/' {
                    i += 2;
                    break;
                }
                i += 1;
            }
        } else {
            i += 1;
        }
    }
    ranges
}

/// Slice source text for an expression, resolving prop-derived vars if needed.
fn slice_expr(expr: &Expression, ctx: &mut Ctx) -> String {
    let span = expr.span();
    let raw = &ctx.source[span.start as usize..span.end as usize];
    if !ctx.prop_derived_vars.is_empty() && accesses_props(expr, ctx) {
        resolve_identifiers_in_text(raw, span.start, ctx)
    } else {
        raw.to_string()
    }
}

/// Slice raw source text for a span.
fn slice_span(span: Span, ctx: &Ctx) -> String {
    ctx.source[span.start as usize..span.end as usize].to_string()
}

// ─── Main entry ──────────────────────────────────────────────────────────────

#[napi]
pub fn transform_jsx(code: String, filename: String, ssr: bool) -> TransformResult {
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
        };
    }

    let mut ctx = Ctx::new(&code, ssr);
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
            if let Some(body) = &func.body {
                for stmt in &body.statements {
                    walk_statement(stmt, ctx);
                }
            }
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
                    if let Some(body) = &func.body {
                        for stmt in &body.statements {
                            walk_statement(stmt, ctx);
                        }
                    }
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
                        if let Some(body) = &func.body {
                            for stmt in &body.statements {
                                walk_statement(stmt, ctx);
                            }
                        }
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
            for child in &frag.children {
                walk_jsx_child(child, ctx);
            }
        }
        Expression::ArrowFunctionExpression(arrow) => {
            maybe_register_component_props_arrow(arrow, ctx);
            let old = ctx.parent_is_jsx;
            ctx.parent_is_jsx = false;
            walk_arrow_body(arrow, ctx);
            ctx.parent_is_jsx = old;
        }
        Expression::FunctionExpression(func) => {
            let old = ctx.parent_is_jsx;
            ctx.parent_is_jsx = false;
            if let Some(body) = &func.body {
                for stmt in &body.statements {
                    walk_statement(stmt, ctx);
                }
            }
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
            for child in &frag.children {
                walk_jsx_child(child, ctx);
            }
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
                walk_expression(&spread.argument, ctx);
            }
        }
    }

    // Process children
    let old_parent_is_jsx = ctx.parent_is_jsx;
    ctx.parent_is_jsx = true;
    for child in &el.children {
        walk_jsx_child(child, ctx);
    }
    ctx.parent_is_jsx = old_parent_is_jsx;
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
            walk_expression(expr, ctx);
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
            ctx.add_replacement(
                expr.span().start,
                expr.span().end,
                format!("_rp(() => {})", inner),
            );
            ctx.needs_rp_import = true;
        }
    } else {
        // DOM prop: hoist or wrap with () =>
        hoist_or_wrap(expr, ctx);
    }
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
        wrap_expr(expr, ctx);
        return;
    }

    // Otherwise just recurse — but reset parent_is_jsx since we're already
    // inside a JSX expression container `{...}`
    let old = ctx.parent_is_jsx;
    ctx.parent_is_jsx = false;
    walk_expression(expr, ctx);
    ctx.parent_is_jsx = old;
}

fn maybe_hoist_expr(expr: &Expression, ctx: &mut Ctx) -> Option<String> {
    match expr {
        Expression::JSXElement(el) => {
            if is_static_jsx_node(el) {
                let name = ctx.next_hoist_name();
                let text = slice_span(expr.span(), ctx);
                ctx.hoists.push(Hoist {
                    name: name.clone(),
                    text,
                });
                Some(name)
            } else {
                None
            }
        }
        Expression::JSXFragment(frag) => {
            if is_static_jsx_fragment(frag) {
                let name = ctx.next_hoist_name();
                let text = slice_span(expr.span(), ctx);
                ctx.hoists.push(Hoist {
                    name: name.clone(),
                    text,
                });
                Some(name)
            } else {
                None
            }
        }
        _ => None,
    }
}

fn wrap_expr(expr: &Expression, ctx: &mut Ctx) {
    let sliced = slice_expr(expr, ctx);
    let text = if matches!(expr, Expression::ObjectExpression(_)) {
        format!("() => ({})", sliced)
    } else {
        format!("() => {}", sliced)
    };
    ctx.add_replacement(expr.span().start, expr.span().end, text);
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

    let mut body = tb
        .bind_lines
        .iter()
        .map(|l| format!("  {}", l))
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
    let event_name = {
        let chars: Vec<char> = attr_name.chars().collect();
        if chars.len() > 2 {
            let mut s = String::new();
            s.push(chars[2].to_ascii_lowercase());
            for &c in &chars[3..] {
                s.push(c);
            }
            s
        } else {
            return;
        }
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

fn try_direct_signal_ref(expr: &Expression, ctx: &mut Ctx) -> Option<String> {
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
        if let Expression::Identifier(_) = &call.callee {
            return Some(slice_expr(&call.callee, ctx));
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

fn attr_setter(html_attr_name: &str, var_name: &str, expr: &str) -> String {
    if html_attr_name == "class" {
        format!("{}.className = {}", var_name, expr)
    } else if html_attr_name == "style" {
        format!("{}.style.cssText = {}", var_name, expr)
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
    let direct_ref = try_direct_signal_ref(expr_node, ctx);
    if let Some(ref signal_name) = direct_ref {
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
        } else {
            format!(
                "(v) => {{ {}.setAttribute(\"{}\", v == null ? \"\" : String(v)) }}",
                var_name, html_attr_name
            )
        };
        tb.bind_lines
            .push(format!("const {} = _bindDirect({}, {})", d, signal_name, updater));
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
                    let raw = text.value.as_str();
                    let trimmed: String = raw
                        .lines()
                        .map(|l| l.trim())
                        .collect::<Vec<_>>()
                        .join("");
                    let trimmed = trimmed.trim();
                    if !trimmed.is_empty() {
                        flat.push(FlatChild::Text(trimmed.to_string()));
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
    let has_elem = flat.iter().any(|c| matches!(c, FlatChild::Element(_, _)));
    let has_non_elem = flat.iter().any(|c| !matches!(c, FlatChild::Element(_, _)));
    let expr_count = flat
        .iter()
        .filter(|c| matches!(c, FlatChild::Expression(_)))
        .count();
    (has_elem && has_non_elem, expr_count > 1)
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
    tb.bind_lines
        .push(format!("const {} = document.createTextNode(\"\")", t_var));
    if needs_placeholder {
        tb.bind_lines.push(format!(
            "{}.replaceChild({}, {}.childNodes[{}])",
            parent_ref, t_var, parent_ref, child_node_idx
        ));
    } else {
        tb.bind_lines
            .push(format!("{}.appendChild({})", var_name, t_var));
    }
    let direct_ref = try_direct_signal_ref(expr_node, ctx);
    if let Some(signal_name) = direct_ref {
        tb.needs_bind_text = true;
        let d = tb.next_disp();
        tb.bind_lines
            .push(format!("const {} = _bindText({}, {})", d, signal_name, t_var));
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
        String::new()
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
            "{}.replaceChild({}, {}.childNodes[{}])",
            parent_ref, t_var, parent_ref, child_node_idx
        ));
        "<!>".to_string()
    } else {
        tb.bind_lines
            .push(format!("{}.textContent = {}", var_name, expr_text));
        String::new()
    }
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
                format!("{}.childNodes[{}]", parent_ref, child_node_idx)
            } else {
                format!("{}.children[{}]", parent_ref, elem_idx)
            };
            process_element(el, &child_accessor, tb, ctx)
        }
        FlatChild::Expression(expr) => {
            let needs_placeholder = use_mixed || use_multi_expr;
            let (expr_text, is_reactive) = unwrap_accessor(expr, ctx);
            if is_children_expression(expr, &expr_text) {
                tb.needs_mount_slot = true;
                let placeholder = format!("{}.childNodes[{}]", parent_ref, child_node_idx);
                let d = tb.next_disp();
                tb.bind_lines.push(format!(
                    "const {} = _mountSlot({}, {}, {})",
                    d, expr_text, parent_ref, placeholder
                ));
                return Some("<!>".to_string());
            }
            if is_reactive {
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
