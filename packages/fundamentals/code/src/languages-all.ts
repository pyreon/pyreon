/**
 * `@pyreon/code/languages-all` — register every built-in grammar.
 *
 * Import this ONCE, for its side effect, when the editor needs a language the
 * core does not register by default (the core ships the JavaScript family and
 * JSON — see `./languages`):
 *
 * ```ts
 * import '@pyreon/code/languages-all'
 * ```
 *
 * It lives behind its own entry precisely so that importing it is a decision:
 * a bundler's dep scanner follows every specifier below at build /
 * dev-server-start time, so this module is what the ~eighteen
 * `@codemirror/lang-*` packages cost. An editor that only shows TS/TSX/JSON
 * never reaches this file and never pays for them.
 *
 * `ruby` and `shell` come from `@codemirror/legacy-modes` (CodeMirror 5-era
 * StreamLanguage grammars) wrapped via `StreamLanguage.define` — the modern
 * `@codemirror/lang-*` packages do not cover them.
 */
import { StreamLanguage } from '@codemirror/language'
import { registerLanguage } from './languages'

registerLanguage('html', () => import('@codemirror/lang-html').then((m) => m.html()))
registerLanguage('css', () => import('@codemirror/lang-css').then((m) => m.css()))
registerLanguage('markdown', () => import('@codemirror/lang-markdown').then((m) => m.markdown()))
registerLanguage('python', () => import('@codemirror/lang-python').then((m) => m.python()))
registerLanguage('rust', () => import('@codemirror/lang-rust').then((m) => m.rust()))
registerLanguage('sql', () => import('@codemirror/lang-sql').then((m) => m.sql()))
registerLanguage('xml', () => import('@codemirror/lang-xml').then((m) => m.xml()))
registerLanguage('yaml', () => import('@codemirror/lang-yaml').then((m) => m.yaml()))
registerLanguage('cpp', () => import('@codemirror/lang-cpp').then((m) => m.cpp()))
registerLanguage('java', () => import('@codemirror/lang-java').then((m) => m.java()))
registerLanguage('go', () => import('@codemirror/lang-go').then((m) => m.go()))
registerLanguage('php', () => import('@codemirror/lang-php').then((m) => m.php()))
registerLanguage('ruby', () =>
  import('@codemirror/legacy-modes/mode/ruby').then((m) => StreamLanguage.define(m.ruby)),
)
registerLanguage('shell', () =>
  import('@codemirror/legacy-modes/mode/shell').then((m) => StreamLanguage.define(m.shell)),
)
