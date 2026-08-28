//! Plain Mode pre-pass — the Rust mirror of `src/plain.ts` (`transformPlain`).
//!
//! Byte-identical by contract: the JS implementation is the ORACLE, and the
//! cross-backend differential suite (`plain-native-equivalence.test.ts`)
//! asserts `transform_plain(code)` equals the JS output — code AND warnings —
//! over the whole plain corpus plus a seeded fuzz. Any intentional change
//! lands in BOTH implementations in the same PR, exactly like the JSX
//! transform's native-equivalence discipline.
//!
//! Two implementation notes that keep the mirror honest:
//!
//!  * **Edit ordering.** The JS side uses MagicString. This file's `Magic`
//!    replicates the subset of MagicString semantics `transformPlain`
//!    actually exercises: `appendLeft`/`appendRight` in call order at a
//!    position, Left-inserts before Right-inserts before overwrite content
//!    at the same position, and disjoint overwrite/remove ranges.
//!  * **Set iteration order.** JS `Set` iterates in insertion order and the
//!    total-tracking prologue text depends on it — so frames use
//!    insertion-ordered Vecs with contains-checks, never hash sets.

use napi_derive::napi;

use oxc_allocator::Allocator;
use oxc_ast::ast::*;
use oxc_ast_visit::{walk, Visit};
use oxc_parser::Parser;
use oxc_span::{GetSpan, SourceType};
use rustc_hash::{FxHashMap, FxHashSet};

use crate::CompilerWarning;

const PLAIN_SOURCE: &str = "@pyreon/core/plain";
const REACTIVITY_SOURCE: &str = "@pyreon/reactivity";

#[napi(object)]
pub struct PlainResult {
    pub code: String,
    pub warnings: Vec<CompilerWarning>,
}

/// Mirror of the JS `detectPlain` — pure substring checks (deliberately NOT
/// a regex; over-matching is fine, the parser's real directive check decides).
fn detect_plain(code: &str) -> bool {
    code.contains(PLAIN_SOURCE) || code.contains("'use plain'") || code.contains("\"use plain\"")
}

// ─── Magic: the MagicString subset transformPlain uses ─────────────────────

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Side {
    Left = 0,
    Right = 1,
}

struct Ins {
    pos: u32,
    side: Side,
    seq: u32,
    text: String,
}

struct Del {
    start: u32,
    end: u32,
    /// `Some` = overwrite, `None` = remove.
    text: Option<String>,
}

#[derive(Default)]
struct Magic {
    inserts: Vec<Ins>,
    dels: Vec<Del>,
    seq: u32,
}

impl Magic {
    fn append_left(&mut self, pos: u32, text: String) {
        self.seq += 1;
        self.inserts.push(Ins {
            pos,
            side: Side::Left,
            seq: self.seq,
            text,
        });
    }
    fn append_right(&mut self, pos: u32, text: String) {
        self.seq += 1;
        self.inserts.push(Ins {
            pos,
            side: Side::Right,
            seq: self.seq,
            text,
        });
    }
    fn overwrite(&mut self, start: u32, end: u32, text: String) {
        self.dels.push(Del {
            start,
            end,
            text: Some(text),
        });
    }
    fn remove(&mut self, start: u32, end: u32) {
        self.dels.push(Del {
            start,
            end,
            text: None,
        });
    }
    fn build(mut self, src: &str) -> String {
        // At one position: Left inserts (call order), then Right inserts
        // (call order), then the chunk content (original or overwrite text).
        self.inserts
            .sort_by(|a, b| (a.pos, a.side, a.seq).cmp(&(b.pos, b.side, b.seq)));
        self.dels.sort_by_key(|d| d.start);
        let mut out = String::with_capacity(src.len() + 64);
        let mut cursor: usize = 0;
        let mut i = 0usize;
        for d in &self.dels {
            while i < self.inserts.len() && self.inserts[i].pos <= d.start {
                let p = self.inserts[i].pos as usize;
                if p >= cursor {
                    out.push_str(&src[cursor..p]);
                    cursor = p;
                }
                out.push_str(&self.inserts[i].text);
                i += 1;
            }
            if (d.start as usize) >= cursor {
                out.push_str(&src[cursor..d.start as usize]);
            }
            if let Some(t) = &d.text {
                out.push_str(t);
            }
            cursor = d.end as usize;
            // transformPlain never inserts strictly INSIDE a removed range;
            // skip any that would land there (mirrors dropped content).
            while i < self.inserts.len() && (self.inserts[i].pos as usize) < cursor {
                i += 1;
            }
        }
        while i < self.inserts.len() {
            let p = self.inserts[i].pos as usize;
            if p >= cursor {
                out.push_str(&src[cursor..p]);
                cursor = p;
            }
            out.push_str(&self.inserts[i].text);
            i += 1;
        }
        out.push_str(&src[cursor..]);
        out
    }
}

// ─── Binding + frame models ────────────────────────────────────────────────

#[derive(Clone)]
enum Bind {
    State,
    Store,
    Derived,
    ImportedState,
    Shadow,
    Prop {
        props_var: String,
        key: String,
        default_text: Option<String>,
    },
}

impl Bind {
    fn is_shadow(&self) -> bool {
        matches!(self, Bind::Shadow)
    }
}

/// Insertion-ordered string set (JS `Set` iteration-order parity).
#[derive(Default)]
struct OrderedSet {
    items: Vec<String>,
}
impl OrderedSet {
    fn add(&mut self, s: &str) {
        if !self.items.iter().any(|x| x == s) {
            self.items.push(s.to_string());
        }
    }
    fn has(&self, s: &str) -> bool {
        self.items.iter().any(|x| x == s)
    }
}

struct Frame {
    unconditional: OrderedSet,
    conditional: OrderedSet,
    unconditional_paths: OrderedSet,
    conditional_paths: OrderedSet,
    func_depth: i32,
    prologue_at: Option<u32>,
    expr_body: Option<(u32, u32)>,
}

struct FnInfo {
    props_var: Option<String>,
    is_component: bool,
}

struct Emit {
    state: String,
    derived: String,
    effect: String,
    store: String,
}

#[derive(Default)]
struct Used {
    state: bool,
    derived: bool,
    effect: bool,
    store: bool,
}

#[derive(Clone, Copy, PartialEq)]
enum Marker {
    State,
    Derived,
    Effect,
}

/// The function body shape `walkFunction` abstracts over.
enum FnBody<'b, 'a> {
    Block(&'b FunctionBody<'a>),
    Expr(&'b Expression<'a>),
    None,
}

// ─── The transform ─────────────────────────────────────────────────────────

struct P<'a> {
    src: &'a str,
    ms: Magic,
    warnings: Vec<CompilerWarning>,
    scopes: Vec<FxHashMap<String, Bind>>,
    markers: FxHashMap<String, Marker>,
    emit: Emit,
    used: Used,
    track: Vec<Frame>,
    func_depth: i32,
    cond_depth: i32,
    await_seen: i32,
    exit_seen: i32,
    fn_stack: Vec<FnInfo>,
    saved_track: Vec<(i32, i32)>,
}

fn pos_of(src: &str, offset: u32) -> (u32, u32) {
    let bytes = src.as_bytes();
    let mut line = 1u32;
    let mut line_start = 0u32;
    let end = (offset as usize).min(bytes.len());
    for (i, b) in bytes.iter().enumerate().take(end) {
        if *b == b'\n' {
            line += 1;
            line_start = i as u32 + 1;
        }
    }
    (line, offset - line_start)
}

impl<'a> P<'a> {
    fn warn(&mut self, offset: u32, message: &str) {
        let (line, column) = pos_of(self.src, offset);
        self.warnings.push(CompilerWarning {
            message: format!("[plain] {message}"),
            line,
            column,
            code: "plain-mode".to_string(),
        });
    }

    fn slice(&self, start: u32, end: u32) -> &'a str {
        &self.src[start as usize..end as usize]
    }

    fn lookup(&self, name: &str) -> Option<&Bind> {
        for scope in self.scopes.iter().rev() {
            if let Some(b) = scope.get(name) {
                return Some(b);
            }
        }
        None
    }

    fn declare_binding(&mut self, name: &str, b: Bind) {
        self.scopes.last_mut().unwrap().insert(name.to_string(), b);
    }

    fn is_marker(&self, name: &str) -> Option<Marker> {
        let m = *self.markers.get(name)?;
        if self.lookup(name).is_some() {
            return None; // shadowed by a closer binding
        }
        Some(m)
    }

    fn record_read(&mut self, name: &str) {
        let (func_depth, cond_depth, await_seen, exit_seen) = (
            self.func_depth,
            self.cond_depth,
            self.await_seen,
            self.exit_seen,
        );
        let Some(frame) = self.track.last_mut() else {
            return;
        };
        let unconditional =
            func_depth == frame.func_depth && cond_depth == 0 && await_seen == 0 && exit_seen == 0;
        if unconditional {
            frame.unconditional.add(name);
        } else {
            frame.conditional.add(name);
        }
    }

    fn record_path(&mut self, expr: &str) {
        let (func_depth, cond_depth, await_seen, exit_seen) = (
            self.func_depth,
            self.cond_depth,
            self.await_seen,
            self.exit_seen,
        );
        let Some(frame) = self.track.last_mut() else {
            return;
        };
        let unconditional =
            func_depth == frame.func_depth && cond_depth == 0 && await_seen == 0 && exit_seen == 0;
        if unconditional {
            frame.unconditional_paths.add(expr);
        } else {
            frame.conditional_paths.add(expr);
        }
    }

    /// Rewrite a READ of a tracked binding at an identifier (span given).
    fn rewrite_read(&mut self, name: &str, span_start: u32, span_end: u32) {
        let Some(b) = self.lookup(name) else { return };
        match b.clone() {
            Bind::State | Bind::Store | Bind::Derived | Bind::ImportedState => {
                self.ms.append_left(span_end, "()".to_string());
                self.record_read(name);
            }
            Bind::Prop {
                props_var,
                key,
                default_text,
            } => {
                let access = format!("{props_var}.{key}");
                let text = match default_text {
                    Some(d) => format!("({access} ?? {d})"),
                    None => access,
                };
                self.ms.overwrite(span_start, span_end, text);
                self.record_read(name);
            }
            Bind::Shadow => {}
        }
    }
}

// ─── Pattern-name collection + hoisting scans ──────────────────────────────

fn collect_pattern_names(pat: &BindingPattern, into: &mut FxHashSet<String>) {
    match pat {
        BindingPattern::BindingIdentifier(id) => {
            into.insert(id.name.to_string());
        }
        BindingPattern::ObjectPattern(o) => {
            for p in &o.properties {
                collect_pattern_names(&p.value, into);
            }
            if let Some(rest) = &o.rest {
                collect_pattern_names(&rest.argument, into);
            }
        }
        BindingPattern::ArrayPattern(a) => {
            for el in a.elements.iter().flatten() {
                collect_pattern_names(el, into);
            }
            if let Some(rest) = &a.rest {
                collect_pattern_names(&rest.argument, into);
            }
        }
        BindingPattern::AssignmentPattern(ap) => {
            collect_pattern_names(&ap.left, into);
        }
    }
}

/// Names an ASSIGNMENT destructuring target binds (`({ a } = …)`).
fn collect_assignment_target_names(target: &AssignmentTarget, into: &mut FxHashSet<String>) {
    fn from_maybe_default(t: &AssignmentTargetMaybeDefault, into: &mut FxHashSet<String>) {
        match t {
            AssignmentTargetMaybeDefault::AssignmentTargetWithDefault(d) => {
                from_target(&d.binding, into)
            }
            _ => {
                if let Some(t) = t.as_assignment_target() {
                    from_target(t, into)
                }
            }
        }
    }
    fn from_target(t: &AssignmentTarget, into: &mut FxHashSet<String>) {
        match t {
            AssignmentTarget::AssignmentTargetIdentifier(id) => {
                into.insert(id.name.to_string());
            }
            AssignmentTarget::ObjectAssignmentTarget(o) => {
                for p in &o.properties {
                    match p {
                        AssignmentTargetProperty::AssignmentTargetPropertyIdentifier(pi) => {
                            into.insert(pi.binding.name.to_string());
                        }
                        AssignmentTargetProperty::AssignmentTargetPropertyProperty(pp) => {
                            from_maybe_default(&pp.binding, into);
                        }
                    }
                }
                if let Some(rest) = &o.rest {
                    from_target(&rest.target, into);
                }
            }
            AssignmentTarget::ArrayAssignmentTarget(a) => {
                for el in a.elements.iter().flatten() {
                    from_maybe_default(el, into);
                }
                if let Some(rest) = &a.rest {
                    from_target(&rest.target, into);
                }
            }
            _ => {}
        }
    }
    from_target(target, into)
}

/// Module-scope declared names (collision scan). Mirrors `collectDeclaredNames`.
fn collect_declared_names(stmt: &Statement, into: &mut FxHashSet<String>) {
    match stmt {
        Statement::VariableDeclaration(decl) => {
            for d in &decl.declarations {
                collect_pattern_names(&d.id, into);
            }
        }
        Statement::FunctionDeclaration(f) => {
            if let Some(id) = &f.id {
                into.insert(id.name.to_string());
            }
        }
        Statement::ClassDeclaration(c) => {
            if let Some(id) = &c.id {
                into.insert(id.name.to_string());
            }
        }
        Statement::ImportDeclaration(imp) => {
            if let Some(specs) = &imp.specifiers {
                for spec in specs {
                    let local = match spec {
                        ImportDeclarationSpecifier::ImportSpecifier(s) => &s.local,
                        ImportDeclarationSpecifier::ImportDefaultSpecifier(s) => &s.local,
                        ImportDeclarationSpecifier::ImportNamespaceSpecifier(s) => &s.local,
                    };
                    into.insert(local.name.to_string());
                }
            }
        }
        Statement::ExportDeclaration(e) => {
            collect_declaration_names(&e.declaration, into);
        }
        Statement::ExportDefaultDeclaration(e) => match &e.declaration {
            ExportDefaultDeclarationKind::FunctionDeclaration(f) => {
                if let Some(id) = &f.id {
                    into.insert(id.name.to_string());
                }
            }
            ExportDefaultDeclarationKind::ClassDeclaration(c) => {
                if let Some(id) = &c.id {
                    into.insert(id.name.to_string());
                }
            }
            _ => {}
        },
        _ => {}
    }
}

fn collect_declaration_names(decl: &Declaration, into: &mut FxHashSet<String>) {
    match decl {
        Declaration::VariableDeclaration(v) => {
            for d in &v.declarations {
                collect_pattern_names(&d.id, into);
            }
        }
        Declaration::FunctionDeclaration(f) => {
            if let Some(id) = &f.id {
                into.insert(id.name.to_string());
            }
        }
        Declaration::ClassDeclaration(c) => {
            if let Some(id) = &c.id {
                into.insert(id.name.to_string());
            }
        }
        _ => {}
    }
}

/// Hoisted names (`var`, function declarations) for a function body.
/// Mirrors the JS `hoistScan`'s exact key-driven descent: statement
/// containers only (body/consequent/alternate/block/handler/finalizer/cases)
/// — never into expressions, never into nested functions.
fn hoist_scan(body: &FunctionBody, into: &mut FxHashSet<String>) {
    fn visit(s: &Statement, into: &mut FxHashSet<String>) {
        match s {
            Statement::FunctionDeclaration(f) => {
                if let Some(id) = &f.id {
                    into.insert(id.name.to_string());
                }
                // do not descend into nested functions
            }
            Statement::VariableDeclaration(v) => {
                if v.kind == VariableDeclarationKind::Var {
                    for d in &v.declarations {
                        collect_pattern_names(&d.id, into);
                    }
                }
            }
            Statement::BlockStatement(b) => {
                for c in &b.body {
                    visit(c, into);
                }
            }
            Statement::IfStatement(i) => {
                visit(&i.consequent, into);
                if let Some(alt) = &i.alternate {
                    visit(alt, into);
                }
            }
            Statement::TryStatement(t) => {
                for c in &t.block.body {
                    visit(c, into);
                }
                if let Some(h) = &t.handler {
                    for c in &h.body.body {
                        visit(c, into);
                    }
                }
                if let Some(f) = &t.finalizer {
                    for c in &f.body {
                        visit(c, into);
                    }
                }
            }
            Statement::SwitchStatement(sw) => {
                for case in &sw.cases {
                    for c in &case.consequent {
                        visit(c, into);
                    }
                }
            }
            Statement::ForStatement(f) => visit(&f.body, into),
            Statement::ForInStatement(f) => visit(&f.body, into),
            Statement::ForOfStatement(f) => visit(&f.body, into),
            Statement::WhileStatement(w) => visit(&w.body, into),
            Statement::DoWhileStatement(d) => visit(&d.body, into),
            Statement::LabeledStatement(l) => visit(&l.body, into),
            _ => {}
        }
    }
    for s in &body.statements {
        visit(s, into);
    }
}

// ─── Query visitors (Visit-trait walks mirroring the JS generic walks) ─────

/// Does any declaration ANYWHERE inside (nested functions included) bind
/// `name`? Mirrors `declaresNameDeep` (FunctionDeclaration/ClassDeclaration
/// ids + VariableDeclaration patterns; full descent).
struct DeclaresName<'q> {
    name: &'q str,
    found: bool,
}
impl<'a, 'q> Visit<'a> for DeclaresName<'q> {
    fn visit_variable_declaration(&mut self, it: &VariableDeclaration<'a>) {
        if self.found {
            return;
        }
        let mut names = FxHashSet::default();
        for d in &it.declarations {
            collect_pattern_names(&d.id, &mut names);
        }
        if names.contains(self.name) {
            self.found = true;
            return;
        }
        walk::walk_variable_declaration(self, it);
    }
    fn visit_function(&mut self, it: &Function<'a>, flags: oxc_syntax::scope::ScopeFlags) {
        if self.found {
            return;
        }
        if it.r#type == FunctionType::FunctionDeclaration {
            if let Some(id) = &it.id {
                if id.name == self.name {
                    self.found = true;
                    return;
                }
            }
        }
        walk::walk_function(self, it, flags);
    }
    fn visit_class(&mut self, it: &Class<'a>) {
        if self.found {
            return;
        }
        if it.r#type == ClassType::ClassDeclaration {
            if let Some(id) = &it.id {
                if id.name == self.name {
                    self.found = true;
                    return;
                }
            }
        }
        walk::walk_class(self, it);
    }
}

fn declares_name_deep_block(body: &FunctionBody, name: &str) -> bool {
    let mut v = DeclaresName { name, found: false };
    for s in &body.statements {
        v.visit_statement(s);
        if v.found {
            return true;
        }
    }
    false
}
fn declares_name_deep_expr(expr: &Expression, name: &str) -> bool {
    let mut v = DeclaresName { name, found: false };
    v.visit_expression(expr);
    v.found
}

/// Mirrors `statementContainsReturn`: a ReturnStatement anywhere in the
/// statement, stopping at EVERY function boundary (decls, exprs, arrows).
struct ReturnFinder {
    found: bool,
}
impl<'a> Visit<'a> for ReturnFinder {
    fn visit_return_statement(&mut self, _it: &ReturnStatement<'a>) {
        self.found = true;
    }
    fn visit_function(&mut self, _it: &Function<'a>, _flags: oxc_syntax::scope::ScopeFlags) {}
    fn visit_arrow_function_expression(&mut self, _it: &ArrowFunctionExpression<'a>) {}
}
fn stmt_contains_return(s: &Statement) -> bool {
    let mut v = ReturnFinder { found: false };
    v.visit_statement(s);
    v.found
}

/// Mirrors `containsJsxReturn`: JSX anywhere in the function body, stopping
/// at FunctionDeclaration/FunctionExpression but NOT at arrows (the JS walk
/// descends into arrow bodies — deliberate parity).
struct JsxReturnFinder {
    found: bool,
}
impl<'a> Visit<'a> for JsxReturnFinder {
    fn visit_jsx_element(&mut self, _it: &JSXElement<'a>) {
        self.found = true;
    }
    fn visit_jsx_fragment(&mut self, _it: &JSXFragment<'a>) {
        self.found = true;
    }
    fn visit_function(&mut self, _it: &Function<'a>, _flags: oxc_syntax::scope::ScopeFlags) {}
}
fn contains_jsx_return(body: &FnBody) -> bool {
    let mut v = JsxReturnFinder { found: false };
    match body {
        FnBody::Block(b) => {
            for s in &b.statements {
                v.visit_statement(s);
                if v.found {
                    return true;
                }
            }
        }
        FnBody::Expr(e) => v.visit_expression(e),
        FnBody::None => {}
    }
    v.found
}

/// Mirrors `mentionsReactive`: does the expression mention a non-shadow
/// binding, or a `props.*` member of the current component? The JS generic
/// walk visits property-name Identifiers too (`obj.loading` mentions a state
/// named `loading`) — `visit_identifier_name` preserves that quirk. TS type
/// positions are skipped, as the JS walk skips `typeAnnotation` keys.
struct ReactiveMention<'q, 'p> {
    scopes: &'q [FxHashMap<String, Bind>],
    props_var: Option<&'p str>,
    found: bool,
}
impl<'q, 'p> ReactiveMention<'q, 'p> {
    fn check(&mut self, name: &str) {
        for scope in self.scopes.iter().rev() {
            if let Some(b) = scope.get(name) {
                if !b.is_shadow() {
                    self.found = true;
                }
                return;
            }
        }
    }
}
impl<'a, 'q, 'p> Visit<'a> for ReactiveMention<'q, 'p> {
    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        self.check(it.name.as_str());
    }
    fn visit_identifier_name(&mut self, it: &IdentifierName<'a>) {
        self.check(it.name.as_str());
    }
    fn visit_static_member_expression(&mut self, it: &StaticMemberExpression<'a>) {
        if let (Some(pv), Expression::Identifier(obj)) = (self.props_var, &it.object) {
            if obj.name == pv {
                self.found = true;
                return;
            }
        }
        walk::walk_static_member_expression(self, it);
    }
    fn visit_computed_member_expression(&mut self, it: &ComputedMemberExpression<'a>) {
        if let (Some(pv), Expression::Identifier(obj)) = (self.props_var, &it.object) {
            if obj.name == pv {
                self.found = true;
                return;
            }
        }
        walk::walk_computed_member_expression(self, it);
    }
    fn visit_ts_type_annotation(&mut self, _it: &TSTypeAnnotation<'a>) {}
    fn visit_ts_as_expression(&mut self, it: &TSAsExpression<'a>) {
        self.visit_expression(&it.expression);
    }
    fn visit_ts_satisfies_expression(&mut self, it: &TSSatisfiesExpression<'a>) {
        self.visit_expression(&it.expression);
    }
    fn visit_ts_instantiation_expression(&mut self, it: &TSInstantiationExpression<'a>) {
        self.visit_expression(&it.expression);
    }
}

// ─── TS/paren unwrap ───────────────────────────────────────────────────────

fn unwrap_ts<'b, 'a>(mut e: &'b Expression<'a>) -> &'b Expression<'a> {
    loop {
        match e {
            Expression::TSAsExpression(x) => e = &x.expression,
            Expression::TSSatisfiesExpression(x) => e = &x.expression,
            Expression::TSNonNullExpression(x) => e = &x.expression,
            Expression::TSInstantiationExpression(x) => e = &x.expression,
            Expression::ParenthesizedExpression(x) => e = &x.expression,
            _ => return e,
        }
    }
}

fn is_pascal_case(name: &str) -> bool {
    name.chars().next().is_some_and(|c| c.is_ascii_uppercase())
}

// ─── Component detection + props pattern ───────────────────────────────────

enum PropsPattern {
    Complex,
    Simple(Vec<(String, String, Option<String>)>), // (key, local, defaultText)
}

fn analyze_simple_props_pattern(src: &str, pat: &ObjectPattern) -> PropsPattern {
    if pat.rest.is_some() {
        return PropsPattern::Complex;
    }
    let mut out = Vec::new();
    for p in &pat.properties {
        if p.computed {
            return PropsPattern::Complex;
        }
        let PropertyKey::StaticIdentifier(key) = &p.key else {
            return PropsPattern::Complex;
        };
        match &p.value {
            BindingPattern::BindingIdentifier(id) => {
                out.push((key.name.to_string(), id.name.to_string(), None));
            }
            BindingPattern::AssignmentPattern(ap) => {
                let BindingPattern::BindingIdentifier(id) = &ap.left else {
                    return PropsPattern::Complex;
                };
                let right = ap.right.span();
                out.push((
                    key.name.to_string(),
                    id.name.to_string(),
                    Some(format!(
                        "({})",
                        &src[right.start as usize..right.end as usize]
                    )),
                ));
            }
            _ => return PropsPattern::Complex,
        }
    }
    PropsPattern::Simple(out)
}

impl<'a> P<'a> {
    fn declare_pattern_as_shadow(&mut self, pat: &BindingPattern<'a>) {
        let mut names = FxHashSet::default();
        collect_pattern_names(pat, &mut names);
        for n in names {
            self.declare_binding(&n, Bind::Shadow);
        }
    }

    /// Default values in params/patterns are expressions — walk them. The
    /// TOP-level param default lives on `FormalParameter.initializer` in oxc
    /// (ESTree wraps the pattern in AssignmentPattern instead); the JS walk
    /// order — top default first, then inner pattern defaults — is preserved
    /// by `walk_formal_param_defaults`.
    fn walk_pattern_defaults(&mut self, pat: &BindingPattern<'a>) {
        match pat {
            BindingPattern::AssignmentPattern(ap) => {
                self.walk_expr(&ap.right, true);
                self.walk_pattern_defaults(&ap.left);
            }
            BindingPattern::ObjectPattern(o) => {
                for p in &o.properties {
                    self.walk_pattern_defaults(&p.value);
                }
                if let Some(rest) = &o.rest {
                    self.walk_pattern_defaults(&rest.argument);
                }
            }
            BindingPattern::ArrayPattern(a) => {
                for el in a.elements.iter().flatten() {
                    self.walk_pattern_defaults(el);
                }
                if let Some(rest) = &a.rest {
                    self.walk_pattern_defaults(&rest.argument);
                }
            }
            BindingPattern::BindingIdentifier(_) => {}
        }
    }

    fn walk_formal_param_defaults(&mut self, param: &FormalParameter<'a>) {
        if let Some(init) = &param.initializer {
            self.walk_expr(init, true);
        }
        self.walk_pattern_defaults(&param.pattern);
    }

    fn walk_function_decl(&mut self, f: &Function<'a>, component_name: Option<&str>) {
        let body = match &f.body {
            Some(b) => FnBody::Block(b),
            None => FnBody::None,
        };
        self.walk_function_core(&f.params, body, f.generator, component_name);
    }

    fn walk_arrow(&mut self, f: &ArrowFunctionExpression<'a>) {
        match &f.body {
            ArrowFunctionBody::FunctionBody(b) => {
                self.walk_function_core(&f.params, FnBody::Block(b), false, None)
            }
            other => match other.as_expression() {
                Some(e) => self.walk_function_core(&f.params, FnBody::Expr(e), false, None),
                None => self.walk_function_core(&f.params, FnBody::None, false, None),
            },
        }
    }

    fn walk_function_core(
        &mut self,
        params: &FormalParameters<'a>,
        body: FnBody<'_, 'a>,
        generator: bool,
        component_name: Option<&str>,
    ) {
        let is_component = (component_name.is_some_and(is_pascal_case)
            || contains_jsx_return(&body))
            && !generator;

        self.func_depth += 1;
        self.scopes.push(FxHashMap::default());
        let saved_cond = self.cond_depth;
        let saved_await = self.await_seen;
        let saved_exit = self.exit_seen;
        self.cond_depth = 0;

        // Hoisted names shadow before anything in the body runs.
        let mut hoisted = FxHashSet::default();
        if let FnBody::Block(b) = &body {
            hoist_scan(b, &mut hoisted);
        }
        for n in &hoisted {
            self.declare_binding(n, Bind::Shadow);
        }

        // Params: possibly the props-destructure rewrite; everything else shadows.
        let mut props_var: Option<String> = None;
        let items = &params.items;
        if is_component && !items.is_empty() {
            let param0 = &items[0];
            let p0 = &param0.pattern;
            // A top-level param DEFAULT (`({ a } = {})`) is an ESTree
            // AssignmentPattern — never the props-rewrite shape.
            let has_default = param0.initializer.is_some();
            match p0 {
                BindingPattern::ObjectPattern(op) if !has_default => {
                    match analyze_simple_props_pattern(self.src, op) {
                        PropsPattern::Complex => {
                            self.warn(
                                p0.span().start,
                                "complex props destructuring (rest / nested / computed) is not rewritten — it captures values ONCE and loses reactivity. Take `props` and read properties directly.",
                            );
                            self.declare_pattern_as_shadow(p0);
                        }
                        PropsPattern::Simple(entries) => {
                            let mut names = FxHashSet::default();
                            collect_pattern_names(p0, &mut names);
                            for other in items.iter().skip(1) {
                                collect_pattern_names(&other.pattern, &mut names);
                            }
                            if let Some(rest) = &params.rest {
                                collect_pattern_names(&rest.rest.argument, &mut names);
                            }
                            // The chosen props name must be free EVERYWHERE in
                            // the function (see the JS comment).
                            let deep_props = match &body {
                                FnBody::Block(b) => declares_name_deep_block(b, "props"),
                                FnBody::Expr(e) => declares_name_deep_expr(e, "props"),
                                FnBody::None => false,
                            };
                            let pv = if names.contains("props")
                                || hoisted.contains("props")
                                || deep_props
                            {
                                "__props"
                            } else {
                                "props"
                            };
                            let ann_start = param0.type_annotation.as_ref().map(|t| t.span().start);
                            let p0span = p0.span();
                            self.ms.overwrite(
                                p0span.start,
                                ann_start.unwrap_or(p0span.end),
                                pv.to_string(),
                            );
                            for (key, local, default_text) in entries {
                                self.declare_binding(
                                    &local,
                                    Bind::Prop {
                                        props_var: pv.to_string(),
                                        key,
                                        default_text,
                                    },
                                );
                            }
                            props_var = Some(pv.to_string());
                        }
                    }
                }
                BindingPattern::BindingIdentifier(id) if !has_default => {
                    props_var = Some(id.name.to_string());
                    self.declare_binding(id.name.as_str(), Bind::Shadow);
                }
                _ => {
                    // Non-object, non-identifier (or defaulted) first param:
                    // ordinary shadow.
                    self.walk_formal_param_defaults(param0);
                    self.declare_pattern_as_shadow(p0);
                }
            }
            for other in items.iter().skip(1) {
                self.walk_formal_param_defaults(other);
                self.declare_pattern_as_shadow(&other.pattern);
            }
            if let Some(rest) = &params.rest {
                self.walk_pattern_defaults(&rest.rest.argument);
                self.declare_pattern_as_shadow(&rest.rest.argument);
            }
        } else {
            for p in items {
                self.walk_formal_param_defaults(p);
                self.declare_pattern_as_shadow(&p.pattern);
            }
            if let Some(rest) = &params.rest {
                self.walk_pattern_defaults(&rest.rest.argument);
                self.declare_pattern_as_shadow(&rest.rest.argument);
            }
        }

        self.fn_stack.push(FnInfo {
            props_var,
            is_component,
        });

        match &body {
            FnBody::Block(b) => {
                for stmt in &b.statements {
                    self.walk_stmt(stmt);
                }
                // Tail detection runs AFTER the walk so component-BODY state
                // is in scope when the `if` tests are classified.
                let wrap_from = if is_component {
                    self.find_reactive_tail(b)
                } else {
                    None
                };
                if let Some(from) = wrap_from {
                    self.ms.append_left(from, "return () => {\n".to_string());
                    self.ms.append_right(b.span.end - 1, "\n}\n".to_string());
                }
            }
            FnBody::Expr(e) => self.walk_expr(e, true),
            FnBody::None => {}
        }

        self.fn_stack.pop();
        self.scopes.pop();
        self.func_depth -= 1;
        self.cond_depth = saved_cond;
        self.await_seen = saved_await;
        self.exit_seen = saved_exit;
    }

    /// Component tail wrap: mirrors `findReactiveTail`.
    fn find_reactive_tail(&mut self, body: &FunctionBody<'a>) -> Option<u32> {
        let stmts = &body.statements;
        for (i, s) in stmts.iter().enumerate() {
            let Statement::IfStatement(ifs) = s else {
                continue;
            };
            if !stmt_contains_return(s) {
                continue;
            }
            if !self.mentions_reactive(&ifs.test) {
                continue;
            }
            let bad = stmts[i..].iter().any(|t| match t {
                Statement::FunctionDeclaration(_) => true,
                Statement::VariableDeclaration(v) => v.kind == VariableDeclarationKind::Var,
                _ => false,
            });
            if bad {
                self.warn(
                    s.span().start,
                    "a reactive early return could not be made live: the statement tail declares a hoisted `function`/`var`. Move those above the conditional, or the branch is evaluated ONCE.",
                );
                return None;
            }
            return Some(s.span().start);
        }
        None
    }

    fn mentions_reactive(&self, expr: &Expression<'a>) -> bool {
        let props_var = self.fn_stack.last().and_then(|f| f.props_var.as_deref());
        let mut v = ReactiveMention {
            scopes: &self.scopes,
            props_var,
            found: false,
        };
        v.visit_expression(expr);
        v.found
    }

    // ─── Tracked-callback machinery (effect / derived) ─────────────────────

    fn walk_tracked_callback_fn(&mut self, f: &Function<'a>) {
        let (prologue_at, expr_body) = match &f.body {
            Some(b) => (Some(b.span.start + 1), None),
            None => (None, None),
        };
        self.open_tracked_frame(prologue_at, expr_body);
        self.walk_function_decl(f, None);
        self.close_tracked_frame();
    }

    fn walk_tracked_callback_arrow(&mut self, f: &ArrowFunctionExpression<'a>) {
        match &f.body {
            ArrowFunctionBody::FunctionBody(b) => {
                self.open_tracked_frame(Some(b.span.start + 1), None);
            }
            other => {
                let expr_span = other.as_expression().map(|e| e.span());
                self.open_tracked_frame(None, expr_span.map(|s| (s.start, s.end)));
            }
        }
        self.walk_arrow(f);
        self.close_tracked_frame();
    }

    fn open_tracked_frame(&mut self, prologue_at: Option<u32>, expr_body: Option<(u32, u32)>) {
        self.track.push(Frame {
            unconditional: OrderedSet::default(),
            conditional: OrderedSet::default(),
            unconditional_paths: OrderedSet::default(),
            conditional_paths: OrderedSet::default(),
            func_depth: self.func_depth + 1,
            prologue_at,
            expr_body,
        });
        self.saved_track.push((self.await_seen, self.exit_seen));
        self.await_seen = 0;
        self.exit_seen = 0;
    }

    fn close_tracked_frame(&mut self) {
        let (a, e) = self.saved_track.pop().unwrap();
        self.await_seen = a;
        self.exit_seen = e;
        let frame = self.track.pop().unwrap();
        self.emit_prologue(&frame);
    }

    /// Expression-position derived: `derived(a + b)` — frame without a body.
    fn open_tracked_expr_frame(&mut self, start: u32, end: u32) {
        self.track.push(Frame {
            unconditional: OrderedSet::default(),
            conditional: OrderedSet::default(),
            unconditional_paths: OrderedSet::default(),
            conditional_paths: OrderedSet::default(),
            func_depth: self.func_depth,
            prologue_at: None,
            expr_body: Some((start, end)),
        });
    }
    fn close_tracked_expr_frame(&mut self) {
        let frame = self.track.pop().unwrap();
        self.emit_prologue(&frame);
    }

    fn emit_prologue(&mut self, frame: &Frame) {
        let names: Vec<&String> = frame
            .conditional
            .items
            .iter()
            .filter(|n| !frame.unconditional.has(n))
            .collect();
        let paths: Vec<&String> = frame
            .conditional_paths
            .items
            .iter()
            .filter(|p| !frame.unconditional_paths.has(p))
            .collect();
        if names.is_empty() && paths.is_empty() {
            return;
        }
        let reads: Vec<String> = names
            .iter()
            .map(|n| format!("{n}()"))
            .chain(paths.iter().map(|p| (*p).clone()))
            .collect();
        let reads = reads.join(", ");
        if let Some(at) = frame.prologue_at {
            self.ms.append_right(at, format!(" void ({reads});"));
        } else if let Some((start, end)) = frame.expr_body {
            self.ms.append_right(start, format!("(void ({reads}), "));
            self.ms.append_left(end, ")".to_string());
        }
    }
}

// ─── Statement walking ─────────────────────────────────────────────────────

impl<'a> P<'a> {
    fn walk_stmt(&mut self, stmt: &Statement<'a>) {
        match stmt {
            Statement::ExpressionStatement(s) => {
                // (directives never appear in oxc's body — no 'use plain' check needed)
                self.walk_expr(&s.expression, false);
            }
            Statement::VariableDeclaration(decl) => self.walk_variable_declaration(decl),
            Statement::FunctionDeclaration(f) => {
                let name = f.id.as_ref().map(|id| id.name.to_string());
                if let Some(n) = &name {
                    self.declare_binding(n, Bind::Shadow);
                }
                self.walk_function_decl(f, name.as_deref());
            }
            Statement::ClassDeclaration(c) => {
                if let Some(id) = &c.id {
                    self.declare_binding(id.name.as_str(), Bind::Shadow);
                }
                self.walk_class(c);
            }
            Statement::ReturnStatement(r) => {
                if let Some(arg) = &r.argument {
                    self.walk_expr(arg, true);
                }
            }
            Statement::IfStatement(s) => {
                self.walk_expr(&s.test, true);
                self.cond_depth += 1;
                self.walk_stmt(&s.consequent);
                if let Some(alt) = &s.alternate {
                    self.walk_stmt(alt);
                }
                self.cond_depth -= 1;
                if self.cond_depth == 0 && !self.track.is_empty() && stmt_contains_return(stmt) {
                    self.exit_seen += 1;
                }
            }
            Statement::BlockStatement(b) => {
                self.scopes.push(FxHashMap::default());
                for s in &b.body {
                    self.walk_stmt(s);
                }
                self.scopes.pop();
            }
            Statement::ForStatement(f) => {
                self.scopes.push(FxHashMap::default());
                if let Some(init) = &f.init {
                    match init {
                        ForStatementInit::VariableDeclaration(v) => {
                            self.walk_variable_declaration(v)
                        }
                        _ => {
                            if let Some(e) = init.as_expression() {
                                self.walk_expr(e, false);
                            }
                        }
                    }
                }
                if let Some(test) = &f.test {
                    self.walk_expr(test, true);
                }
                self.cond_depth += 1;
                if let Some(update) = &f.update {
                    self.walk_expr(update, false);
                }
                self.walk_stmt(&f.body);
                self.cond_depth -= 1;
                self.scopes.pop();
            }
            Statement::ForOfStatement(f) => {
                self.walk_for_in_of(&f.left, &f.right, &f.body, "of");
            }
            Statement::ForInStatement(f) => {
                self.walk_for_in_of(&f.left, &f.right, &f.body, "in");
            }
            Statement::WhileStatement(w) => {
                self.walk_expr(&w.test, true);
                self.cond_depth += 1;
                self.walk_stmt(&w.body);
                self.cond_depth -= 1;
            }
            Statement::DoWhileStatement(d) => {
                self.walk_expr(&d.test, true);
                self.cond_depth += 1;
                self.walk_stmt(&d.body);
                self.cond_depth -= 1;
            }
            Statement::SwitchStatement(sw) => {
                self.walk_expr(&sw.discriminant, true);
                self.cond_depth += 1;
                self.scopes.push(FxHashMap::default());
                for case in &sw.cases {
                    if let Some(test) = &case.test {
                        self.walk_expr(test, true);
                    }
                    for s in &case.consequent {
                        self.walk_stmt(s);
                    }
                }
                self.scopes.pop();
                self.cond_depth -= 1;
            }
            Statement::TryStatement(t) => {
                self.cond_depth += 1;
                self.scopes.push(FxHashMap::default());
                for s in &t.block.body {
                    self.walk_stmt(s);
                }
                self.scopes.pop();
                if let Some(h) = &t.handler {
                    self.scopes.push(FxHashMap::default());
                    if let Some(param) = &h.param {
                        self.declare_pattern_as_shadow(&param.pattern);
                    }
                    // (JS walkStmt(handler.body) pushes the block's own scope)
                    self.scopes.push(FxHashMap::default());
                    for s in &h.body.body {
                        self.walk_stmt(s);
                    }
                    self.scopes.pop();
                    self.scopes.pop();
                }
                if let Some(f) = &t.finalizer {
                    self.scopes.push(FxHashMap::default());
                    for s in &f.body {
                        self.walk_stmt(s);
                    }
                    self.scopes.pop();
                }
                self.cond_depth -= 1;
            }
            Statement::ThrowStatement(t) => self.walk_expr(&t.argument, true),
            Statement::LabeledStatement(l) => self.walk_stmt(&l.body),
            Statement::ExportDeclaration(e) => {
                self.walk_declaration(&e.declaration);
            }
            Statement::ExportDefaultDeclaration(e) => match &e.declaration {
                ExportDefaultDeclarationKind::FunctionDeclaration(f) => {
                    let name = f.id.as_ref().map(|id| id.name.to_string());
                    if let Some(n) = &name {
                        self.declare_binding(n, Bind::Shadow);
                    }
                    self.walk_function_decl(f, name.as_deref());
                }
                ExportDefaultDeclarationKind::ClassDeclaration(c) => {
                    if let Some(id) = &c.id {
                        self.declare_binding(id.name.as_str(), Bind::Shadow);
                    }
                    self.walk_class(c);
                }
                _ => {
                    if let Some(expr) = e.declaration.as_expression() {
                        self.walk_expr(expr, true);
                    }
                }
            },
            _ => {}
        }
    }

    fn walk_declaration(&mut self, decl: &Declaration<'a>) {
        match decl {
            Declaration::VariableDeclaration(v) => self.walk_variable_declaration(v),
            Declaration::FunctionDeclaration(f) => {
                let name = f.id.as_ref().map(|id| id.name.to_string());
                if let Some(n) = &name {
                    self.declare_binding(n, Bind::Shadow);
                }
                self.walk_function_decl(f, name.as_deref());
            }
            Declaration::ClassDeclaration(c) => {
                if let Some(id) = &c.id {
                    self.declare_binding(id.name.as_str(), Bind::Shadow);
                }
                self.walk_class(c);
            }
            _ => {}
        }
    }

    fn walk_for_in_of(
        &mut self,
        left: &ForStatementLeft<'a>,
        right: &Expression<'a>,
        body: &Statement<'a>,
        _kind: &str,
    ) {
        self.scopes.push(FxHashMap::default());
        match left {
            ForStatementLeft::VariableDeclaration(v) => {
                let pats: Vec<_> = v.declarations.iter().map(|d| &d.id).collect();
                for pat in pats {
                    self.declare_pattern_as_shadow(pat);
                }
            }
            ForStatementLeft::AssignmentTargetIdentifier(id) => {
                let warnable = matches!(
                    self.lookup(id.name.as_str()),
                    Some(Bind::State) | Some(Bind::Store) | Some(Bind::Derived)
                );
                if warnable {
                    let msg = format!(
                        "`for ({} of …)` writes plain state per iteration — not rewritten. Use a local loop variable and assign once.",
                        id.name
                    );
                    self.warn(id.span.start, &msg);
                }
            }
            _ => {}
        }
        self.walk_expr(right, true);
        self.cond_depth += 1;
        self.walk_stmt(body);
        self.cond_depth -= 1;
        self.scopes.pop();
    }

    fn walk_class(&mut self, cls: &Class<'a>) {
        if let Some(h) = &cls.heritage {
            self.walk_expr(&h.expression, true);
        }
        for el in &cls.body.body {
            match el {
                ClassElement::MethodDefinition(m) => {
                    if m.computed {
                        if let Some(key) = m.key.as_expression() {
                            self.walk_expr(key, true);
                        }
                    }
                    self.walk_function_decl(&m.value, None);
                }
                ClassElement::PropertyDefinition(p) => {
                    if p.computed {
                        if let Some(key) = p.key.as_expression() {
                            self.walk_expr(key, true);
                        }
                    }
                    if let Some(value) = &p.value {
                        self.walk_expr(value, true);
                    }
                }
                _ => {}
            }
        }
    }

    fn walk_variable_declaration(&mut self, stmt: &VariableDeclaration<'a>) {
        let decls = &stmt.declarations;
        let mut all_markers = !decls.is_empty();

        for d in decls {
            let init = d.init.as_ref().map(|i| unwrap_ts(i));
            let (marker_role, is_state_raw, call) = match init {
                Some(Expression::CallExpression(call)) => {
                    let role = match &call.callee {
                        Expression::Identifier(id) => self.is_marker(id.name.as_str()),
                        _ => None,
                    };
                    // `state.raw(v)` — explicit opt-out to a SHALLOW signal.
                    let raw = match &call.callee {
                        Expression::StaticMemberExpression(m) => {
                            matches!(&m.object, Expression::Identifier(obj)
                                if self.is_marker(obj.name.as_str()) == Some(Marker::State))
                                && m.property.name == "raw"
                        }
                        _ => false,
                    };
                    (role, raw, Some(call))
                }
                _ => (None, false, None),
            };

            if marker_role == Some(Marker::State) || is_state_raw {
                if let BindingPattern::BindingIdentifier(id) = &d.id {
                    let call = call.unwrap();
                    let first_arg = call
                        .arguments
                        .first()
                        .and_then(|a| a.as_expression())
                        .map(unwrap_ts);
                    let deep = !is_state_raw
                        && matches!(
                            first_arg,
                            Some(Expression::ObjectExpression(_))
                                | Some(Expression::ArrayExpression(_))
                        );
                    self.used.state = true;
                    let callee_span = call.callee.span();
                    let binding_name = id.name.to_string();
                    if deep {
                        // DEEP state: `signal(createStore(<literal>))`.
                        self.used.store = true;
                        let text = format!("{}({}", self.emit.state, self.emit.store);
                        self.ms.overwrite(callee_span.start, callee_span.end, text);
                        self.ms
                            .append_left(init.unwrap().span().end, ")".to_string());
                        for arg in &call.arguments {
                            self.walk_argument(arg);
                        }
                        self.declare_binding(&binding_name, Bind::Store);
                    } else {
                        let text = self.emit.state.clone();
                        self.ms.overwrite(callee_span.start, callee_span.end, text);
                        for arg in &call.arguments {
                            self.walk_argument(arg);
                        }
                        self.declare_binding(&binding_name, Bind::State);
                    }
                    continue;
                }
            }
            if marker_role == Some(Marker::Derived) {
                if let BindingPattern::BindingIdentifier(id) = &d.id {
                    let call = call.unwrap();
                    self.used.derived = true;
                    let callee_span = call.callee.span();
                    let text = self.emit.derived.clone();
                    self.ms.overwrite(callee_span.start, callee_span.end, text);
                    let binding_name = id.name.to_string();
                    if let Some(arg0) = call.arguments.first() {
                        if let Some(arg_expr) = arg0.as_expression() {
                            let inner = unwrap_ts(arg_expr);
                            match inner {
                                Expression::ArrowFunctionExpression(a) => {
                                    self.walk_tracked_callback_arrow(a)
                                }
                                Expression::FunctionExpression(f) => {
                                    self.walk_tracked_callback_fn(f)
                                }
                                _ => {
                                    let span = arg_expr.span();
                                    self.ms.append_left(span.start, "() => (".to_string());
                                    self.open_tracked_expr_frame(span.start, span.end);
                                    self.walk_expr(arg_expr, true);
                                    self.close_tracked_expr_frame();
                                    self.ms.append_left(span.end, ")".to_string());
                                }
                            }
                        }
                    }
                    self.declare_binding(&binding_name, Bind::Derived);
                    continue;
                }
            }

            all_markers = false;

            // Body-level `const { a, b } = props` inside a component → live reads.
            let fn_info_props: Option<(String, bool)> = self
                .fn_stack
                .last()
                .map(|f| (f.props_var.clone().unwrap_or_default(), f.is_component));
            if let Some((props_var, is_component)) = fn_info_props {
                if is_component && !props_var.is_empty() && decls.len() == 1 {
                    if let (
                        BindingPattern::ObjectPattern(op),
                        Some(Expression::Identifier(init_id)),
                    ) = (&d.id, d.init.as_ref())
                    {
                        if init_id.name == props_var.as_str() {
                            match analyze_simple_props_pattern(self.src, op) {
                                PropsPattern::Simple(entries) => {
                                    self.ms.remove(stmt.span.start, stmt.span.end);
                                    for (key, local, default_text) in entries {
                                        self.declare_binding(
                                            &local,
                                            Bind::Prop {
                                                props_var: props_var.clone(),
                                                key,
                                                default_text,
                                            },
                                        );
                                    }
                                    continue;
                                }
                                PropsPattern::Complex => {
                                    self.warn(
                                        d.id.span().start,
                                        "complex props destructuring (rest / nested / computed) is not rewritten — it captures values ONCE and loses reactivity. Read properties off `props` directly.",
                                    );
                                }
                            }
                        }
                    }
                }
            }

            // Ordinary declaration: init is an expression, id shadows.
            if let Some(init) = &d.init {
                self.walk_expr(init, true);
            }
            self.declare_pattern_as_shadow(&d.id);
        }

        // `let x = state(0)` → `const` — only when every declarator was a marker.
        if all_markers && stmt.kind != VariableDeclarationKind::Const {
            let kind_len = match stmt.kind {
                VariableDeclarationKind::Var | VariableDeclarationKind::Let => 3,
                _ => 5,
            };
            self.ms.overwrite(
                stmt.span.start,
                stmt.span.start + kind_len,
                "const".to_string(),
            );
        }
    }
}

// ─── Expression walking ────────────────────────────────────────────────────

impl<'a> P<'a> {
    fn walk_argument(&mut self, arg: &Argument<'a>) {
        match arg {
            Argument::SpreadElement(s) => self.walk_expr(&s.argument, true),
            _ => {
                if let Some(e) = arg.as_expression() {
                    self.walk_expr(e, true);
                }
            }
        }
    }

    fn walk_expr(&mut self, node: &Expression<'a>, value_used: bool) {
        match node {
            Expression::Identifier(id) => {
                self.rewrite_read(id.name.as_str(), id.span.start, id.span.end);
            }
            Expression::BooleanLiteral(_)
            | Expression::NullLiteral(_)
            | Expression::NumericLiteral(_)
            | Expression::BigIntLiteral(_)
            | Expression::RegExpLiteral(_)
            | Expression::StringLiteral(_)
            | Expression::ThisExpression(_)
            | Expression::Super(_)
            | Expression::ImportMeta(_)
            | Expression::NewTarget(_) => {}
            Expression::ParenthesizedExpression(p) => self.walk_expr(&p.expression, value_used),
            Expression::TSAsExpression(x) => self.walk_expr(&x.expression, value_used),
            Expression::TSSatisfiesExpression(x) => self.walk_expr(&x.expression, value_used),
            Expression::TSNonNullExpression(x) => self.walk_expr(&x.expression, value_used),
            Expression::TSInstantiationExpression(x) => self.walk_expr(&x.expression, value_used),
            Expression::ChainExpression(c) => match &c.expression {
                ChainElement::CallExpression(call) => self.handle_call(call, value_used),
                ChainElement::StaticMemberExpression(m) => self.walk_static_member(m),
                ChainElement::ComputedMemberExpression(m) => self.walk_computed_member(m),
                ChainElement::PrivateFieldExpression(m) => self.walk_expr(&m.object, true),
                ChainElement::TSNonNullExpression(x) => self.walk_expr(&x.expression, value_used),
            },
            Expression::TemplateLiteral(t) => {
                for e in &t.expressions {
                    self.walk_expr(e, true);
                }
            }
            Expression::TaggedTemplateExpression(t) => {
                self.walk_expr(&t.tag, true);
                for e in &t.quasi.expressions {
                    self.walk_expr(e, true);
                }
            }
            Expression::ArrayExpression(a) => {
                for el in &a.elements {
                    match el {
                        ArrayExpressionElement::SpreadElement(s) => {
                            self.walk_expr(&s.argument, true)
                        }
                        ArrayExpressionElement::Elision(_) => {}
                        _ => {
                            if let Some(e) = el.as_expression() {
                                self.walk_expr(e, true);
                            }
                        }
                    }
                }
            }
            Expression::ObjectExpression(o) => {
                for p in &o.properties {
                    match p {
                        ObjectPropertyKind::SpreadProperty(s) => {
                            self.walk_expr(&s.argument, true);
                        }
                        ObjectPropertyKind::ObjectProperty(prop) => {
                            if prop.computed {
                                if let Some(key) = prop.key.as_expression() {
                                    self.walk_expr(key, true);
                                }
                            }
                            if prop.shorthand {
                                // `{ count }` — appending `()` in place would be
                                // invalid: expand.
                                if let Expression::Identifier(id) = &prop.value {
                                    let b = self.lookup(id.name.as_str()).cloned();
                                    match b {
                                        Some(Bind::State)
                                        | Some(Bind::Store)
                                        | Some(Bind::Derived)
                                        | Some(Bind::ImportedState) => {
                                            self.ms.append_left(
                                                id.span.end,
                                                format!(": {}()", id.name),
                                            );
                                            self.record_read(id.name.as_str());
                                        }
                                        Some(Bind::Prop {
                                            props_var,
                                            key,
                                            default_text,
                                        }) => {
                                            let access = format!("{props_var}.{key}");
                                            let text = match default_text {
                                                Some(d) => format!(": ({access} ?? {d})"),
                                                None => format!(": {access}"),
                                            };
                                            self.ms.append_left(id.span.end, text);
                                            self.record_read(id.name.as_str());
                                        }
                                        _ => {}
                                    }
                                    continue;
                                }
                            }
                            match &prop.value {
                                Expression::FunctionExpression(f) => {
                                    self.walk_function_decl(f, None)
                                }
                                Expression::ArrowFunctionExpression(a) => self.walk_arrow(a),
                                other => self.walk_expr(other, true),
                            }
                        }
                    }
                }
            }
            Expression::ArrowFunctionExpression(a) => self.walk_arrow(a),
            Expression::FunctionExpression(f) => self.walk_function_decl(f, None),
            Expression::ClassExpression(c) => self.walk_class(c),
            Expression::CallExpression(call) => self.handle_call(call, value_used),
            Expression::NewExpression(n) => {
                self.walk_expr(&n.callee, true);
                for a in &n.arguments {
                    self.walk_argument(a);
                }
            }
            Expression::StaticMemberExpression(m) => self.walk_static_member(m),
            Expression::ComputedMemberExpression(m) => self.walk_computed_member(m),
            Expression::PrivateFieldExpression(m) => self.walk_expr(&m.object, true),
            Expression::AssignmentExpression(a) => self.rewrite_assignment(a, value_used),
            Expression::UpdateExpression(u) => self.rewrite_update(u, value_used),
            Expression::AwaitExpression(aw) => {
                self.walk_expr(&aw.argument, true);
                self.await_seen += 1;
            }
            Expression::UnaryExpression(u) => self.walk_expr(&u.argument, true),
            Expression::YieldExpression(y) => {
                if let Some(arg) = &y.argument {
                    self.walk_expr(arg, true);
                }
            }
            Expression::BinaryExpression(b) => {
                self.walk_expr(&b.left, true);
                self.walk_expr(&b.right, true);
            }
            Expression::LogicalExpression(l) => {
                self.walk_expr(&l.left, true);
                self.cond_depth += 1;
                self.walk_expr(&l.right, true);
                self.cond_depth -= 1;
            }
            Expression::ConditionalExpression(c) => {
                self.walk_expr(&c.test, true);
                self.cond_depth += 1;
                self.walk_expr(&c.consequent, true);
                self.walk_expr(&c.alternate, true);
                self.cond_depth -= 1;
            }
            Expression::SequenceExpression(s) => {
                let n = s.expressions.len();
                for (i, e) in s.expressions.iter().enumerate() {
                    self.walk_expr(e, value_used && i == n - 1);
                }
            }
            Expression::ImportExpression(imp) => {
                self.walk_expr(&imp.source, true);
            }
            Expression::JSXElement(el) => {
                self.walk_jsx_opening(&el.opening_element);
                for c in &el.children {
                    self.walk_jsx_child(c);
                }
            }
            Expression::JSXFragment(f) => {
                for c in &f.children {
                    self.walk_jsx_child(c);
                }
            }
            _ => {}
        }
    }

    fn walk_static_member(&mut self, m: &StaticMemberExpression<'a>) {
        self.record_store_path_static(&MemberLike::Static(m));
        self.walk_expr(&m.object, true);
    }
    fn walk_computed_member(&mut self, m: &ComputedMemberExpression<'a>) {
        self.record_store_path_static(&MemberLike::Computed(m));
        self.walk_expr(&m.object, true);
        self.walk_expr(&m.expression, true);
    }

    fn handle_call(&mut self, call: &CallExpression<'a>, _value_used: bool) {
        if let Expression::Identifier(id) = &call.callee {
            match self.is_marker(id.name.as_str()) {
                Some(Marker::Effect) => {
                    self.used.effect = true;
                    if id.name != self.emit.effect.as_str() {
                        let text = self.emit.effect.clone();
                        self.ms.overwrite(id.span.start, id.span.end, text);
                    }
                    let arg0 = call
                        .arguments
                        .first()
                        .and_then(|a| a.as_expression())
                        .map(unwrap_ts);
                    match arg0 {
                        Some(Expression::ArrowFunctionExpression(a)) => {
                            self.walk_tracked_callback_arrow(a);
                        }
                        Some(Expression::FunctionExpression(f)) => {
                            self.walk_tracked_callback_fn(f);
                        }
                        _ => {
                            self.warn(call.span.start, "effect() expects a function callback.");
                            for a in &call.arguments {
                                self.walk_argument(a);
                            }
                        }
                    }
                    return;
                }
                Some(role @ (Marker::State | Marker::Derived)) => {
                    let name = if role == Marker::State {
                        "state"
                    } else {
                        "derived"
                    };
                    let msg = format!(
                        "{name}() must initialize a variable declaration (`let x = {name}(…)`); this call is left as-is and will throw at runtime."
                    );
                    self.warn(call.span.start, &msg);
                    for a in &call.arguments {
                        self.walk_argument(a);
                    }
                    return;
                }
                None => {}
            }
        }
        self.walk_expr(&call.callee, true);
        for a in &call.arguments {
            self.walk_argument(a);
        }
    }

    fn walk_jsx_opening(&mut self, opening: &JSXOpeningElement<'a>) {
        for attr in &opening.attributes {
            match attr {
                JSXAttributeItem::SpreadAttribute(s) => self.walk_expr(&s.argument, true),
                JSXAttributeItem::Attribute(a) => {
                    if let Some(value) = &a.value {
                        match value {
                            JSXAttributeValue::ExpressionContainer(c) => {
                                if let Some(e) = c.expression.as_expression() {
                                    self.walk_expr(e, true);
                                }
                            }
                            JSXAttributeValue::Element(el) => {
                                self.walk_jsx_opening(&el.opening_element);
                                for c in &el.children {
                                    self.walk_jsx_child(c);
                                }
                            }
                            JSXAttributeValue::Fragment(f) => {
                                for c in &f.children {
                                    self.walk_jsx_child(c);
                                }
                            }
                            JSXAttributeValue::StringLiteral(_) => {}
                        }
                    }
                }
            }
        }
    }

    fn walk_jsx_child(&mut self, child: &JSXChild<'a>) {
        match child {
            JSXChild::ExpressionContainer(c) => {
                if let Some(e) = c.expression.as_expression() {
                    self.walk_expr(e, true);
                }
            }
            JSXChild::Element(el) => {
                self.walk_jsx_opening(&el.opening_element);
                for c in &el.children {
                    self.walk_jsx_child(c);
                }
            }
            JSXChild::Fragment(f) => {
                for c in &f.children {
                    self.walk_jsx_child(c);
                }
            }
            JSXChild::Spread(s) => self.walk_expr(&s.expression, true),
            JSXChild::Text(_) => {}
        }
    }
}

/// A member expression viewed uniformly for the store-path recorder.
enum MemberLike<'b, 'a> {
    Static(&'b StaticMemberExpression<'a>),
    Computed(&'b ComputedMemberExpression<'a>),
}

impl<'b, 'a> MemberLike<'b, 'a> {
    fn span_end(&self) -> u32 {
        match self {
            MemberLike::Static(m) => m.span.end,
            MemberLike::Computed(m) => m.span.end,
        }
    }
}

impl<'a> P<'a> {
    /// Deep-state total tracking (mirrors `recordStorePathIfStatic`).
    fn record_store_path_static(&mut self, node: &MemberLike<'_, 'a>) {
        if self.track.is_empty() {
            return;
        }
        let end = node.span_end();
        // Walk down the member chain validating static links.
        let mut cur_obj: &Expression = match node {
            MemberLike::Static(m) => {
                if m.optional {
                    return;
                }
                &m.object
            }
            MemberLike::Computed(m) => {
                if m.optional {
                    return;
                }
                let lit = matches!(
                    &m.expression,
                    Expression::NumericLiteral(_) | Expression::StringLiteral(_)
                );
                if !lit {
                    return;
                }
                &m.object
            }
        };
        loop {
            match cur_obj {
                Expression::StaticMemberExpression(m) => {
                    if m.optional {
                        return;
                    }
                    cur_obj = &m.object;
                }
                Expression::ComputedMemberExpression(m) => {
                    if m.optional {
                        return;
                    }
                    let lit = matches!(
                        &m.expression,
                        Expression::NumericLiteral(_) | Expression::StringLiteral(_)
                    );
                    if !lit {
                        return;
                    }
                    cur_obj = &m.object;
                }
                _ => break,
            }
        }
        let Expression::Identifier(root) = cur_obj else {
            return;
        };
        let is_store = matches!(self.lookup(root.name.as_str()), Some(Bind::Store));
        if !is_store {
            return;
        }
        let path = format!("{}(){}", root.name, self.slice(root.span.end, end));
        self.record_path(&path);
    }
}

// ─── Writes ────────────────────────────────────────────────────────────────

fn compound_op(op: AssignmentOperator) -> Option<&'static str> {
    Some(match op {
        AssignmentOperator::Addition => "+",
        AssignmentOperator::Subtraction => "-",
        AssignmentOperator::Multiplication => "*",
        AssignmentOperator::Division => "/",
        AssignmentOperator::Remainder => "%",
        AssignmentOperator::Exponential => "**",
        AssignmentOperator::BitwiseAnd => "&",
        AssignmentOperator::BitwiseOR => "|",
        AssignmentOperator::BitwiseXOR => "^",
        AssignmentOperator::ShiftLeft => "<<",
        AssignmentOperator::ShiftRight => ">>",
        AssignmentOperator::ShiftRightZeroFill => ">>>",
        _ => return None,
    })
}

fn logical_assign_op(op: AssignmentOperator) -> Option<&'static str> {
    Some(match op {
        AssignmentOperator::LogicalAnd => "&&",
        AssignmentOperator::LogicalOr => "||",
        AssignmentOperator::LogicalNullish => "??",
        _ => return None,
    })
}

impl<'a> P<'a> {
    fn rewrite_assignment(&mut self, node: &AssignmentExpression<'a>, value_used: bool) {
        let left = &node.left;

        if let AssignmentTarget::AssignmentTargetIdentifier(id) = left {
            if let Some(target) = self.lookup(id.name.as_str()).cloned() {
                let name = id.name.to_string();
                match target {
                    Bind::Derived => {
                        let msg = format!(
                            "cannot assign to derived value `{name}` — derive it differently or make it state."
                        );
                        self.warn(id.span.start, &msg);
                        self.walk_expr(&node.right, true);
                        return;
                    }
                    Bind::ImportedState => {
                        let msg = format!(
                            "cannot assign to imported state `{name}` — ESM imports are read-only. Export a setter function from the owning module."
                        );
                        self.warn(id.span.start, &msg);
                        self.walk_expr(&node.right, true);
                        return;
                    }
                    Bind::Prop { .. } => {
                        let msg = format!(
                            "cannot assign to prop `{name}` — props flow down; lift the state up."
                        );
                        self.warn(id.span.start, &msg);
                        self.walk_expr(&node.right, true);
                        return;
                    }
                    Bind::Store => {
                        if node.operator == AssignmentOperator::Assign {
                            self.used.store = true;
                            let open = if value_used {
                                format!("({name}.set({}(", self.emit.store)
                            } else {
                                format!("{name}.set({}(", self.emit.store)
                            };
                            self.ms
                                .overwrite(id.span.start, node.right.span().start, open);
                            self.walk_expr(&node.right, true);
                            let close = if value_used {
                                format!(")), {name}())")
                            } else {
                                "))".to_string()
                            };
                            self.ms.append_left(node.span.end, close);
                            return;
                        }
                        let msg = format!(
                            "compound assignment on deep state `{name}` is not supported — assign a full value (`{name} = …`) or mutate a property (`{name}.key = …`)."
                        );
                        self.warn(id.span.start, &msg);
                        self.walk_expr(&node.right, true);
                        return;
                    }
                    Bind::State => {
                        let op = node.operator;
                        if op == AssignmentOperator::Assign {
                            let open = if value_used {
                                format!("({name}.set(")
                            } else {
                                format!("{name}.set(")
                            };
                            self.ms
                                .overwrite(id.span.start, node.right.span().start, open);
                            self.walk_expr(&node.right, true);
                            let close = if value_used {
                                format!("), {name}())")
                            } else {
                                ")".to_string()
                            };
                            self.ms.append_left(node.span.end, close);
                            return;
                        }
                        if let Some(bin) = compound_op(op) {
                            let open = if value_used {
                                format!("({name}.set({name}() {bin} (")
                            } else {
                                format!("{name}.set({name}() {bin} (")
                            };
                            self.ms
                                .overwrite(id.span.start, node.right.span().start, open);
                            self.walk_expr(&node.right, true);
                            let close = if value_used {
                                format!(")), {name}())")
                            } else {
                                "))".to_string()
                            };
                            self.ms.append_left(node.span.end, close);
                            return;
                        }
                        if let Some(logical) = logical_assign_op(op) {
                            let open = if value_used {
                                format!("({name}() {logical} ({name}.set(")
                            } else {
                                format!("{name}() {logical} {name}.set(")
                            };
                            self.ms
                                .overwrite(id.span.start, node.right.span().start, open);
                            self.walk_expr(&node.right, true);
                            let close = if value_used {
                                format!("), {name}()))")
                            } else {
                                ")".to_string()
                            };
                            self.ms.append_left(node.span.end, close);
                            return;
                        }
                        return;
                    }
                    Bind::Shadow => {}
                }
            }
        }

        // Destructuring assignment onto tracked bindings → warn, walk untouched.
        if matches!(
            left,
            AssignmentTarget::ObjectAssignmentTarget(_)
                | AssignmentTarget::ArrayAssignmentTarget(_)
        ) {
            let mut names = FxHashSet::default();
            collect_assignment_target_names(left, &mut names);
            // JS iterates Set insertion order and warns for the FIRST tracked
            // name; source order approximates it — collect in source order.
            let mut ordered: Vec<String> = Vec::new();
            collect_assignment_target_names_ordered(left, &mut ordered);
            for n in &ordered {
                let hit = matches!(
                    self.lookup(n),
                    Some(Bind::State) | Some(Bind::Store) | Some(Bind::Derived)
                );
                if hit {
                    let msg = format!(
                        "destructuring assignment onto plain state `{n}` is not rewritten — assign each binding directly."
                    );
                    self.warn(left.span().start, &msg);
                    break;
                }
            }
        }

        // Member writes whose ROOT is plain state.
        let member: Option<MemberTarget<'_, 'a>> = match left {
            AssignmentTarget::StaticMemberExpression(m) => Some(MemberTarget {
                object: &m.object,
                computed_prop: None,
                is_private: false,
            }),
            AssignmentTarget::ComputedMemberExpression(m) => Some(MemberTarget {
                object: &m.object,
                computed_prop: Some(&m.expression),
                is_private: false,
            }),
            AssignmentTarget::PrivateFieldExpression(m) => Some(MemberTarget {
                object: &m.object,
                computed_prop: None,
                is_private: true,
            }),
            _ => None,
        };
        if let Some(mt) = member {
            let root_name = member_chain_root(mt.object);
            if let Some(root) = root_name {
                let kind = self.lookup(&root).cloned();
                match kind {
                    Some(Bind::Store) => {
                        // Deep state: the proxy's set trap notifies — walk the
                        // CHILDREN so the WRITE target's own path is not
                        // recorded as a read.
                        self.walk_expr(mt.object, true);
                        if let Some(prop) = mt.computed_prop {
                            self.walk_expr(prop, true);
                        }
                        self.walk_expr(&node.right, true);
                        return;
                    }
                    Some(Bind::State) | Some(Bind::Derived) => {
                        let msg = format!(
                            "mutating a property of plain state `{root}` does not notify subscribers — replace the value instead: `{root} = {{ …{root}, key: v }}`, or declare it with a literal object/array initializer to get DEEP state."
                        );
                        self.warn(left.span().start, &msg);
                    }
                    Some(Bind::ImportedState) => {
                        let msg = format!(
                            "mutating a property of imported state `{root}` notifies only if the owning module declared it DEEP (a literal object/array initializer). For shallow state, export a setter from the owning module."
                        );
                        self.warn(left.span().start, &msg);
                    }
                    _ => {}
                }
            }
            // walkExpr(left, true): record path attempt + rewrite root read.
            if !mt.is_private {
                self.record_member_target_path(left);
            }
            self.walk_expr(mt.object, true);
            if let Some(prop) = mt.computed_prop {
                self.walk_expr(prop, true);
            }
            self.walk_expr(&node.right, true);
            return;
        }

        // Everything else: walk both sides (TS-wrapped targets included).
        self.walk_assignment_target_as_expr(left);
        self.walk_expr(&node.right, true);
    }

    /// Mirrors JS `walkExpr(left, false)` for exotic assignment targets.
    fn walk_assignment_target_as_expr(&mut self, target: &AssignmentTarget<'a>) {
        match target {
            AssignmentTarget::TSAsExpression(x) => self.walk_expr(&x.expression, false),
            AssignmentTarget::TSSatisfiesExpression(x) => self.walk_expr(&x.expression, false),
            AssignmentTarget::TSNonNullExpression(x) => self.walk_expr(&x.expression, false),
            AssignmentTarget::TSTypeAssertion(x) => self.walk_expr(&x.expression, false),
            _ => {}
        }
    }

    /// The store-path record the JS `walkExpr(left, true)` performs when the
    /// member-write target's root turns out to be a store binding. Reached
    /// only for NON-store roots in practice (the store branch returns above),
    /// where it no-ops — kept for exactness.
    fn record_member_target_path(&mut self, left: &AssignmentTarget<'a>) {
        match left {
            AssignmentTarget::StaticMemberExpression(m) => {
                self.record_store_path_static(&MemberLike::Static(m));
            }
            AssignmentTarget::ComputedMemberExpression(m) => {
                self.record_store_path_static(&MemberLike::Computed(m));
            }
            _ => {}
        }
    }

    fn rewrite_update(&mut self, node: &UpdateExpression<'a>, value_used: bool) {
        let arg = &node.argument;
        if let SimpleAssignmentTarget::AssignmentTargetIdentifier(id) = arg {
            let target = self.lookup(id.name.as_str()).cloned();
            match target {
                Some(Bind::State) => {
                    let name = id.name.to_string();
                    let bin = if node.operator == UpdateOperator::Increment {
                        "+"
                    } else {
                        "-"
                    };
                    let text = if !value_used {
                        format!("{name}.set({name}() {bin} 1)")
                    } else if node.prefix {
                        format!("({name}.set({name}() {bin} 1), {name}())")
                    } else {
                        // Postfix value is the OLD value — evaluate once via an IIFE.
                        format!("((__v) => ({name}.set(__v {bin} 1), __v))({name}())")
                    };
                    self.ms.overwrite(node.span.start, node.span.end, text);
                    return;
                }
                Some(Bind::Derived)
                | Some(Bind::Prop { .. })
                | Some(Bind::ImportedState)
                | Some(Bind::Store) => {
                    let msg = if matches!(target, Some(Bind::Store)) {
                        let op = if node.operator == UpdateOperator::Increment {
                            "++"
                        } else {
                            "--"
                        };
                        format!(
                            "cannot apply `{op}` to deep state `{}` — mutate a property or assign a full value.",
                            id.name
                        )
                    } else {
                        format!("cannot update `{}` — it is not writable state.", id.name)
                    };
                    self.warn(id.span.start, &msg);
                    return;
                }
                _ => return,
            }
        }
        // Member update targets.
        let member: Option<MemberTarget<'_, 'a>> = match arg {
            SimpleAssignmentTarget::StaticMemberExpression(m) => Some(MemberTarget {
                object: &m.object,
                computed_prop: None,
                is_private: false,
            }),
            SimpleAssignmentTarget::ComputedMemberExpression(m) => Some(MemberTarget {
                object: &m.object,
                computed_prop: Some(&m.expression),
                is_private: false,
            }),
            SimpleAssignmentTarget::PrivateFieldExpression(m) => Some(MemberTarget {
                object: &m.object,
                computed_prop: None,
                is_private: true,
            }),
            _ => None,
        };
        if let Some(mt) = member {
            if let Some(root) = member_chain_root(mt.object) {
                let kind = self.lookup(&root).cloned();
                match kind {
                    Some(Bind::Store) => {
                        self.walk_expr(mt.object, true);
                        if let Some(prop) = mt.computed_prop {
                            self.walk_expr(prop, true);
                        }
                        return;
                    }
                    Some(Bind::State) => {
                        let msg = format!(
                            "mutating a property of plain state `{root}` does not notify subscribers — replace the value instead."
                        );
                        self.warn(arg.span().start, &msg);
                    }
                    Some(Bind::ImportedState) => {
                        let msg = format!(
                            "mutating a property of imported state `{root}` notifies only if the owning module declared it DEEP (a literal object/array initializer)."
                        );
                        self.warn(arg.span().start, &msg);
                    }
                    _ => {}
                }
            }
            // walkExpr(arg, true)
            match arg {
                SimpleAssignmentTarget::StaticMemberExpression(m) => {
                    self.record_store_path_static(&MemberLike::Static(m));
                }
                SimpleAssignmentTarget::ComputedMemberExpression(m) => {
                    self.record_store_path_static(&MemberLike::Computed(m));
                }
                _ => {}
            }
            self.walk_expr(mt.object, true);
            if let Some(prop) = mt.computed_prop {
                self.walk_expr(prop, true);
            }
            return;
        }
        // TS-wrapped targets: JS `walkExpr(arg, valueUsed)` unwraps + rewrites.
        match arg {
            SimpleAssignmentTarget::TSAsExpression(x) => self.walk_expr(&x.expression, value_used),
            SimpleAssignmentTarget::TSSatisfiesExpression(x) => {
                self.walk_expr(&x.expression, value_used)
            }
            SimpleAssignmentTarget::TSNonNullExpression(x) => {
                self.walk_expr(&x.expression, value_used)
            }
            SimpleAssignmentTarget::TSTypeAssertion(x) => self.walk_expr(&x.expression, value_used),
            _ => {}
        }
    }
}

struct MemberTarget<'b, 'a> {
    object: &'b Expression<'a>,
    computed_prop: Option<&'b Expression<'a>>,
    is_private: bool,
}

/// The IDENTIFIER at the root of a member-expression chain, if any.
fn member_chain_root(mut e: &Expression) -> Option<String> {
    loop {
        match e {
            Expression::StaticMemberExpression(m) => e = &m.object,
            Expression::ComputedMemberExpression(m) => e = &m.object,
            Expression::PrivateFieldExpression(m) => e = &m.object,
            Expression::Identifier(id) => return Some(id.name.to_string()),
            _ => return None,
        }
    }
}

/// Source-order collection of assignment-target names (JS Set order parity).
fn collect_assignment_target_names_ordered(target: &AssignmentTarget, into: &mut Vec<String>) {
    let mut set = FxHashSet::default();
    collect_assignment_target_names(target, &mut set);
    // The JS collectPatternNames walks the ESTree pattern in source order and
    // Set preserves first-insertion order. Mirror by re-walking in order.
    fn push(into: &mut Vec<String>, name: &str) {
        if !into.iter().any(|x| x == name) {
            into.push(name.to_string());
        }
    }
    fn from_maybe_default(t: &AssignmentTargetMaybeDefault, into: &mut Vec<String>) {
        match t {
            AssignmentTargetMaybeDefault::AssignmentTargetWithDefault(d) => {
                walk_t(&d.binding, into)
            }
            _ => {
                if let Some(t) = t.as_assignment_target() {
                    walk_t(t, into)
                }
            }
        }
    }
    fn walk_t(t: &AssignmentTarget, into: &mut Vec<String>) {
        match t {
            AssignmentTarget::AssignmentTargetIdentifier(id) => push(into, id.name.as_str()),
            AssignmentTarget::ObjectAssignmentTarget(o) => {
                for p in &o.properties {
                    match p {
                        AssignmentTargetProperty::AssignmentTargetPropertyIdentifier(pi) => {
                            push(into, pi.binding.name.as_str())
                        }
                        AssignmentTargetProperty::AssignmentTargetPropertyProperty(pp) => {
                            from_maybe_default(&pp.binding, into)
                        }
                    }
                }
                if let Some(rest) = &o.rest {
                    walk_t(&rest.target, into);
                }
            }
            AssignmentTarget::ArrayAssignmentTarget(a) => {
                for el in a.elements.iter().flatten() {
                    from_maybe_default(el, into);
                }
                if let Some(rest) = &a.rest {
                    walk_t(&rest.target, into);
                }
            }
            _ => {}
        }
    }
    walk_t(target, into);
    let _ = set;
}

// ─── Entry ─────────────────────────────────────────────────────────────────

/// The Plain Mode pre-pass, native. Returns `None` (JS `null`) when the
/// module is not in the dialect — byte-untouched. Mirrors `transformPlain`.
#[napi]
pub fn transform_plain(
    code: String,
    filename: String,
    known_signals: Option<Vec<String>>,
) -> Option<PlainResult> {
    if !detect_plain(&code) {
        return None;
    }

    let source_type = SourceType::from_path(&filename)
        .unwrap_or_default()
        .with_module(true)
        .with_jsx(true);
    let allocator = Allocator::default();
    let ret = Parser::new(&allocator, &code, source_type).parse();
    if ret.panicked {
        return None; // downstream transform reports the parse error
    }
    let program = &ret.program;

    // ── Module-level scan: directive, marker imports, reactivity import ──
    let mut has_directive = false;
    let mut markers: FxHashMap<String, Marker> = FxHashMap::default();
    let mut strip_ranges: Vec<(u32, u32)> = Vec::new();
    let mut reactivity_import: Option<(u32, u32, Option<u32>)> = None; // (start, end, last spec end)
    let mut reactivity_imported: FxHashSet<String> = FxHashSet::default();

    for d in &program.directives {
        if d.directive == "use plain" {
            has_directive = true;
            strip_ranges.push((d.span.start, d.span.end));
        }
    }
    for stmt in &program.body {
        let Statement::ImportDeclaration(imp) = stmt else {
            continue;
        };
        let source = imp.source.value.as_str();
        if source == PLAIN_SOURCE {
            if let Some(specs) = &imp.specifiers {
                for spec in specs {
                    let ImportDeclarationSpecifier::ImportSpecifier(s) = spec else {
                        continue;
                    };
                    let imported = s.imported.name();
                    let role = match imported.as_str() {
                        "state" => Some(Marker::State),
                        "derived" => Some(Marker::Derived),
                        "effect" => Some(Marker::Effect),
                        _ => None,
                    };
                    if let Some(role) = role {
                        markers.insert(s.local.name.to_string(), role);
                    }
                }
            }
            strip_ranges.push((imp.span.start, imp.span.end));
        } else if source == REACTIVITY_SOURCE && imp.import_kind != ImportOrExportKind::Type {
            let mut last_spec_end: Option<u32> = None;
            if let Some(specs) = &imp.specifiers {
                for spec in specs {
                    last_spec_end = Some(spec.span().end);
                    if let ImportDeclarationSpecifier::ImportSpecifier(s) = spec {
                        if s.import_kind != ImportOrExportKind::Type {
                            reactivity_imported.insert(s.imported.name().to_string());
                        }
                    }
                }
            }
            reactivity_import = Some((imp.span.start, imp.span.end, last_spec_end));
        }
    }

    if !has_directive && markers.is_empty() {
        return None;
    }

    // ── Emit-name selection ──
    let mut module_scope_names: FxHashSet<String> = FxHashSet::default();
    for stmt in &program.body {
        collect_declared_names(stmt, &mut module_scope_names);
    }
    let mut emit = Emit {
        state: "signal".to_string(),
        derived: "computed".to_string(),
        effect: "effect".to_string(),
        store: "createStore".to_string(),
    };
    if module_scope_names.contains("signal") && !reactivity_imported.contains("signal") {
        emit.state = "__plainSignal".to_string();
    }
    if module_scope_names.contains("computed") && !reactivity_imported.contains("computed") {
        emit.derived = "__plainComputed".to_string();
    }
    if module_scope_names.contains("createStore") && !reactivity_imported.contains("createStore") {
        emit.store = "__plainStore".to_string();
    }
    if module_scope_names.contains("effect")
        && !markers.contains_key("effect")
        && !reactivity_imported.contains("effect")
    {
        emit.effect = "__plainEffect".to_string();
    }

    let mut root_scope: FxHashMap<String, Bind> = FxHashMap::default();
    for name in known_signals.unwrap_or_default() {
        root_scope.insert(name, Bind::ImportedState);
    }

    let mut p = P {
        src: &code,
        ms: Magic::default(),
        warnings: Vec::new(),
        scopes: vec![root_scope],
        markers,
        emit,
        used: Used::default(),
        track: Vec::new(),
        func_depth: 0,
        cond_depth: 0,
        await_seen: 0,
        exit_seen: 0,
        fn_stack: Vec::new(),
        saved_track: Vec::new(),
    };

    // ── Run ──
    for stmt in &program.body {
        p.walk_stmt(stmt);
    }

    // Strip the directive + marker imports — CONTENT only.
    for (start, end) in &strip_ranges {
        p.ms.remove(*start, *end);
    }

    // Inject the reactivity imports the rewrites need.
    let mut needed: Vec<String> = Vec::new();
    if p.used.state && !(p.emit.state == "signal" && reactivity_imported.contains("signal")) {
        needed.push(if p.emit.state == "signal" {
            "signal".to_string()
        } else {
            format!("signal as {}", p.emit.state)
        });
    }
    if p.used.derived && !(p.emit.derived == "computed" && reactivity_imported.contains("computed"))
    {
        needed.push(if p.emit.derived == "computed" {
            "computed".to_string()
        } else {
            format!("computed as {}", p.emit.derived)
        });
    }
    if p.used.effect && !(p.emit.effect == "effect" && reactivity_imported.contains("effect")) {
        needed.push(if p.emit.effect == "effect" {
            "effect".to_string()
        } else {
            format!("effect as {}", p.emit.effect)
        });
    }
    if p.used.store
        && !(p.emit.store == "createStore" && reactivity_imported.contains("createStore"))
    {
        needed.push(if p.emit.store == "createStore" {
            "createStore".to_string()
        } else {
            format!("createStore as {}", p.emit.store)
        });
    }
    if !needed.is_empty() {
        let import_text = format!(
            "import {{ {} }} from '{REACTIVITY_SOURCE}'",
            needed.join(", ")
        );
        if let Some((_, _, Some(last_end))) = reactivity_import {
            p.ms.append_left(last_end, format!(", {}", needed.join(", ")));
        } else if let Some((start, _)) = strip_ranges.first() {
            // Reuse a stripped slot — keeps the line count identical.
            p.ms.append_left(*start, import_text);
        } else {
            let at = program.body.first().map(|s| s.span().start).unwrap_or(0);
            p.ms.append_left(at, format!("{import_text}\n"));
        }
    }

    let warnings = std::mem::take(&mut p.warnings);
    let out = p.ms.build(&code);
    Some(PlainResult {
        code: out,
        warnings,
    })
}
