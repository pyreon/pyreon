---
title: Coming from Angular
description: Angular's signals (v16+) are nearly identical to Pyreon's — the reactive API transfers almost 1:1. The porting work is class components + templates + DI → function components + JSX + context.
---

If you've used Angular signals (v16+), you already know Pyreon's reactivity — the `signal` / `computed` / `effect` API is **nearly identical**. What changes is the surrounding model: Angular's class components, decorators, HTML templates, dependency injection, and RxJS become Pyreon's **function components, JSX, signals, and context**. (There's no Angular compat layer — this is a rewrite — but the reactive core is the closest match of any framework.)

## Reactivity: almost the same API

```ts
// Angular
count = signal(0)
count()              // read
count.set(1)         // write
count.update((c) => c + 1)
doubled = computed(() => count() * 2)
effect(() => console.log(count()))
```

```ts
// Pyreon — read/write/update/computed/effect are the same shapes
const count = signal(0)
count()              // read
count.set(1)         // write
count.update((c) => c + 1)
const doubled = computed(() => count() * 2)
effect(() => console.log(count()))
```

The signal muscle memory transfers directly. The difference is **where** they live: in Angular they're class fields; in Pyreon they're `const`s in a function component body (which runs once).

## API map

| Angular | Pyreon | Notes |
| --- | --- | --- |
| `signal(v)` | `signal(v)` | same: `s()`, `s.set()`, `s.update()` |
| `computed(fn)` | `computed(fn)` | same |
| `effect(fn)` | `effect(fn)` | same auto-tracked effect |
| `@Component` class | function component | `function Foo(props) { return <…/> }` |
| `@Input()` | `props.x` | read in a reactive scope |
| `@Output()` / `EventEmitter` | callback prop | `props.onChange?.(value)` |
| `ngOnInit` | `onMount` | runs after mount |
| `ngOnDestroy` | `onUnmount` / cleanup return | return cleanup from `onMount` |
| services + DI | `@pyreon/store` / context | singleton stores or `provide`/`useContext` |
| RxJS streams | signals / `@pyreon/rx` | `@pyreon/rx` is signal-aware (filter/map/debounce…) |
| Angular Router | `@pyreon/router` | loaders, guards, typed search params |
| Angular Universal | `@pyreon/zero` | fs-routing, SSR/SSG/ISR, adapters |

## Templates → JSX

```html
<!-- Angular -->
<button [class.active]="isOn()" (click)="toggle()">{{ label() }}</button>
<li *ngFor="let row of rows()">{{ row.label }}</li>
<p *ngIf="show()">Hi</p>
```

```tsx
// Pyreon
<button class={{ active: isOn() }} onClick={toggle}>{() => label()}</button>
<For each={rows} by={(row) => row.id}>{(row) => <li>{row.label}</li>}</For>
{() => (show() ? <p>Hi</p> : null)}   // or <Show when={show}><p>Hi</p></Show>
```

`{{ x() }}` → `{() => x()}`; `[prop]` → `prop={...}`; `(event)` → `onEvent`; `*ngIf` → `<Show>` / ternary; `*ngFor` → keyed `<For>`; `[(ngModel)]` → `value={s} onInput={(e) => s.set(e.currentTarget.value)}`.

## A side-by-side

```ts
// Angular
@Component({ template: `<button (click)="inc()">{{ count() }} / {{ doubled() }}</button>` })
class Counter {
  count = signal(0)
  doubled = computed(() => this.count() * 2)
  inc() { this.count.update((c) => c + 1) }
}
```

```tsx
// Pyreon
function Counter() {
  const count = signal(0)
  const doubled = computed(() => count() * 2)
  return <button onClick={() => count.update((c) => c + 1)}>{() => `${count()} / ${doubled()}`}</button>
}
```

## RxJS

Much of what RxJS does for synchronous UI state, signals + `computed` + `effect` do directly. For stream-like transforms over reactive collections (filter, map, debounce, throttle, groupBy), `@pyreon/rx` is the signal-aware equivalent — its operators take a signal and return a `Computed`.

## Cheat sheet

- `signal` / `computed` / `effect` — identical API (read `s()`, write `s.set()` / `s.update()`)
- `@Component` class → function component; `@Input` → `props`; `@Output` → callback prop
- `ngOnInit` → `onMount`; `ngOnDestroy` → `onUnmount`; services/DI → `@pyreon/store` / context
- `*ngIf` → `<Show>`; `*ngFor` → `<For each={s} by={...}>`; `[(ngModel)]` → `value`+`onInput`
- RxJS → signals + `@pyreon/rx`; Angular Router → `@pyreon/router`; Universal → `@pyreon/zero`

Angular signal users get the closest reactivity match of any framework; the work is converting classes + HTML templates into function components + JSX.

## Related

- [Why Pyreon](/docs/why-pyreon) · [Rx](/docs/rx)
- [Reactivity in Depth](/docs/guides/reactivity-in-depth)
