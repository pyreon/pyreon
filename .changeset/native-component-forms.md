---
'@pyreon/native-compiler': minor
---

Native: components compile however they are declared, and props destructuring lowers. Before this, only `function App()` / `export function App()` became a native component, and the other common spellings failed with no warning:

- `export default function App()` emitted nothing at all;
- `const Card = (props: P) => …` became a closure or a prop-less helper that `<Card title="x" />` could not construct;
- `const { title, count: n } = props` in a component body emitted `let __pyDestr0 = props`, a `props` that does not exist natively;
- a destructured parameter with a rename or a default (`function Card({ title, size = 'm' }: P)`) declared no props at all.

Arrow and function-expression components and default-exported components are now rewritten into the `function` declaration the compiler lowers, and each destructured prop reads its field (`size = 'm'` becomes `props.size ?? 'm'`). The emitted Swift and Kotlin typecheck. Shapes the rewrite cannot reproduce faithfully — an anonymous default export, an async or generic component, a component typed on its name (`const Card: FC<P>`), a rest element or nested pattern in the props — are refused with a named warning instead of compiling to code that does not build.
