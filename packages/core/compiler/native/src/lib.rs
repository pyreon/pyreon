use napi::bindgen_prelude::*;
use napi_derive::napi;
use oxc_allocator::Allocator;
use oxc_ast::ast::*;
use oxc_ast::visit::walk;
use oxc_ast::Visit;
use oxc_parser::Parser;
use oxc_span::{SourceType, Span};
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

// ─── Constants ─────────────────────���────────────────────────────────────────

fn is_skip_prop(name: &str) -> bool {
    matches!(name, "key" | "ref")
}

fn is_event_handler(name: &str) -> bool {
    name.len() > 2 && name.starts_with("on") && name.as_bytes().get(2).map_or(false, |b| b.is_ascii_uppercase())
}

fn is_delegated_event(name: &str) -> bool {
    matches!(
        name,
        "click" | "dblclick" | "contextmenu" | "focusin" | "focusout" | "input"
            | "change" | "keydown" | "keyup" | "mousedown" | "mouseup" | "mousemove"
            | "mouseover" | "mouseout" | "pointerdown" | "pointerup" | "pointermove"
            | "pointerover" | "pointerout" | "touchstart" | "touchend" | "touchmove"
            | "submit"
    )
}

fn is_void_element(tag: &str) -> bool {
    matches!(
        tag,
        "area" | "base" | "br" | "col" | "embed" | "hr" | "img" | "input"
            | "link" | "meta" | "param" | "source" | "track" | "wbr"
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
        "signal" | "computed" | "effect" | "batch"
            | "createContext" | "createReactiveContext"
            | "useContext" | "useRef" | "createRef"
            | "useForm" | "useQuery" | "useMutation"
            | "defineStore" | "useStore"
    )
}

fn is_pure_call(name: &str) -> bool {
    matches!(
        name,
        "Math.max" | "Math.min" | "Math.abs" | "Math.floor" | "Math.ceil" | "Math.round"
            | "Math.pow" | "Math.sqrt" | "Math.random" | "Math.trunc" | "Math.sign"
            | "Number.parseInt" | "Number.parseFloat" | "Number.isNaN" | "Number.isFinite"
            | "parseInt" | "parseFloat" | "isNaN" | "isFinite"
            | "String.fromCharCode" | "String.fromCodePoint"
            | "Object.keys" | "Object.values" | "Object.entries" | "Object.assign"
            | "Object.freeze" | "Object.create"
            | "Array.from" | "Array.isArray" | "Array.of"
            | "JSON.stringify" | "JSON.parse"
            | "encodeURIComponent" | "decodeURIComponent" | "encodeURI" | "decodeURI"
            | "Date.now"
    )
}

fn is_lower_case(s: &str) -> bool {
    s.as_bytes().first().map_or(false, |b| b.is_ascii_lowercase())
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

// ─── Line index ──────────────────────────────────────────���──────────────────

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

// ─── Transform context ───────────────────���──────────────────────────────────

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

// ─── Main entry ──────────────────��────────────────────────────���─────────────

#[napi]
pub fn transform_jsx(code: String, filename: String, ssr: bool) -> TransformResult {
    let source_type = SourceType::from_path(&filename)
        .unwrap_or_default()
        .with_module(true)
        .with_jsx(true);

    let allocator = Allocator::default();
    let ret = Parser::new(&allocator, &code, source_type).parse();

    if ret.panicked || !ret.errors.is_empty() {
        return TransformResult {
            code,
            uses_templates: None,
            warnings: vec![],
        };
    }

    let mut ctx = Ctx::new(&code, ssr);

    // Phase 1: Scan for component props and prop-derived vars
    // Phase 2: Walk JSX and emit replacements
    // Both happen in a single recursive walk thanks to const TDZ ordering.
    walk_program(&ret.program, &mut ctx);

    ctx.build_result()
}

fn walk_program(program: &Program, ctx: &mut Ctx) {
    for stmt in &program.body {
        walk_statement(stmt, ctx);
    }
}

fn walk_statement(stmt: &Statement, ctx: &mut Ctx) {
    // TODO: implement full recursive walk
    // For now, this is a placeholder that will be filled in
    // with the complete reactive pass logic
    match stmt {
        Statement::ExpressionStatement(expr_stmt) => {
            walk_expression(&expr_stmt.expression, ctx);
        }
        Statement::VariableDeclaration(decl) => {
            // Collect prop-derived vars
            collect_prop_derived(decl, ctx);
            // Walk initializers
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
            walk_function_body_expr(arrow, ctx);
        }
        Expression::FunctionExpression(func) => {
            if let Some(body) = &func.body {
                for stmt in &body.statements {
                    walk_statement(stmt, ctx);
                }
            }
        }
        Expression::CallExpression(call) => {
            walk_expression(&call.callee, ctx);
            for arg in &call.arguments {
                match arg {
                    Argument::SpreadElement(spread) => walk_expression(&spread.argument, ctx),
                    _ => walk_expression(arg.to_expression(), ctx),
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
        _ => {}
    }
}

fn walk_function_body_expr(arrow: &ArrowFunctionExpression, ctx: &mut Ctx) {
    match &arrow.body {
        FunctionBody::FunctionBody(body) => {
            for stmt in &body.statements {
                walk_statement(stmt, ctx);
            }
        }
        FunctionBody::Expression(expr) => {
            walk_expression(expr, ctx);
        }
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
            if let JSXExpression::Expression(expr) = &container.expression {
                walk_expression(expr, ctx);
            }
        }
        _ => {}
    }
}

fn handle_jsx_element(el: &JSXElement, ctx: &mut Ctx) {
    // TODO: implement full JSX handling (template emit, prop wrapping, etc.)
    // For now, just recurse into children
    for child in &el.children {
        walk_jsx_child(child, ctx);
    }
}

fn maybe_register_component_props_fn(func: &Function, ctx: &mut Ctx) {
    if func.params.items.is_empty() {
        return;
    }
    let first = &func.params.items[0];
    if let BindingPatternKind::BindingIdentifier(id) = &first.pattern.kind {
        // Check if function body contains JSX
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
    if let BindingPatternKind::BindingIdentifier(id) = &first.pattern.kind {
        if arrow_contains_jsx(arrow) {
            ctx.props_names.insert(id.name.to_string());
        }
    }
}

fn body_contains_jsx(body: &FunctionBody) -> bool {
    // Simple check: scan statements for JSX
    for stmt in &body.statements {
        if stmt_contains_jsx(stmt) {
            return true;
        }
    }
    false
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
    match &arrow.body {
        FunctionBody::FunctionBody(body) => body_contains_jsx(body),
        FunctionBody::Expression(expr) => expr_contains_jsx(expr),
    }
}

fn collect_prop_derived(decl: &VariableDeclaration, ctx: &mut Ctx) {
    if decl.kind != VariableDeclarationKind::Const {
        return;
    }
    if ctx.callback_depth > 0 {
        return;
    }
    for declarator in &decl.declarations {
        if let BindingPatternKind::BindingIdentifier(id) = &declarator.id.kind {
            if let Some(init) = &declarator.init {
                if is_stateful_call_expr(init) {
                    continue;
                }
                if reads_from_props(init, &ctx.props_names) {
                    ctx.prop_derived_vars
                        .insert(id.name.to_string(), init.span());
                }
            }
        }
        // Handle splitProps
        if let BindingPatternKind::ArrayPattern(arr) = &declarator.id.kind {
            if let Some(Expression::CallExpression(call)) = &declarator.init {
                if let Expression::Identifier(callee) = &call.callee {
                    if callee.name == "splitProps" {
                        for el in arr.elements.iter().flatten() {
                            if let BindingPatternKind::BindingIdentifier(id) = &el.kind {
                                ctx.props_names.insert(id.name.to_string());
                            }
                        }
                    }
                }
            }
        }
    }
}

fn is_stateful_call_expr(expr: &Expression) -> bool {
    if let Expression::CallExpression(call) = expr {
        if let Expression::Identifier(id) = &call.callee {
            return is_stateful_call(&id.name);
        }
    }
    false
}

fn reads_from_props(expr: &Expression, props_names: &FxHashSet<String>) -> bool {
    match expr {
        Expression::StaticMemberExpression(member) => {
            if let Expression::Identifier(obj) = &member.object {
                if props_names.contains(obj.name.as_str()) {
                    return true;
                }
            }
        }
        Expression::ComputedMemberExpression(member) => {
            if let Expression::Identifier(obj) = &member.object {
                if props_names.contains(obj.name.as_str()) {
                    return true;
                }
            }
        }
        _ => {}
    }
    // Recurse - simplified, would need full visitor in production
    false
}
