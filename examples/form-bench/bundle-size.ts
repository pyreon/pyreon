#!/usr/bin/env bun
/**
 * Bundle-size dimension — the second half of the real-world form story.
 *
 * Speed alone is half the picture (METHODOLOGY.md §honesty). This measures, per
 * framework, the **gzipped weight of a minimal 12-field validated form**:
 *
 *   - BASELINE  — just the framework runtime + a trivial mount.
 *   - FULL      — runtime + the form library + its zod adapter + a 12-field
 *                 form with `register`/`Field` bindings + validation wired.
 *   - DELTA     — FULL − BASELINE = the marginal cost of *adding forms* to an
 *                 app that already ships the framework (the honest number; the
 *                 runtime is a sunk cost the app pays regardless).
 *
 * zod is in every FULL entry, so it cancels in every DELTA — the comparison is
 * the form library's own wiring, fair across columns. Real production minify
 * (Bun.build, NODE_ENV=production) + gzip, the bytes a user actually downloads.
 *
 * Run: bun bundle-size.ts
 */
import { gzipSync } from 'node:zlib'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Minimal local ambient for the Bun bundler global (this is a bun-run script;
// the example's tsconfig doesn't pull @types/bun). Same pattern as the repo's
// scripts/check-import-budgets.ts.
declare const Bun: {
  build(opts: {
    entrypoints: string[]
    target?: string
    minify?: boolean
    define?: Record<string, string>
  }): Promise<{
    success: boolean
    logs: { message: string }[]
    outputs: { kind: string; text(): Promise<string> }[]
  }>
}

const HERE = dirname(fileURLToPath(import.meta.url))
const TMP = join(HERE, '.bundle-tmp')

// The 12-field zod schema, inlined so each entry is self-contained (the build
// tree-shakes from a real module graph, not the shared/ test helpers).
const SCHEMA = `z.object({
  first: z.string().min(1), last: z.string().min(1),
  email: z.string().regex(/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/), phone: z.string().min(7),
  street: z.string().min(1), city: z.string().min(1),
  zip: z.string().regex(/^\\d{5}$/), country: z.string().min(2),
  age: z.string().regex(/^\\d{1,3}$/), username: z.string().min(3),
  password: z.string().min(8), bio: z.string().max(500),
})`
const NAMES = `['first','last','email','phone','street','city','zip','country','age','username','password','bio']`
const EMPTY = `Object.fromEntries(${NAMES}.map(n=>[n,'']))`

interface Entry {
  framework: string
  baseline: string
  full: string
}

const ENTRIES: Entry[] = [
  {
    framework: 'Pyreon',
    baseline: `import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
mount(h('div', null, 'x'), document.body)`,
    full: `import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { useForm } from '@pyreon/form'
import { zodSchema } from '@pyreon/validation/zod'
import { z } from 'zod'
const schema = ${SCHEMA}
function Form(){
  const f = useForm({ initialValues: ${EMPTY}, schema: zodSchema(schema), validateOn: 'change', onSubmit(){} })
  return h('form', null, ...${NAMES}.map((n)=>{ const r=f.register(n); return h('input', { value: ()=>r.value(), onInput: r.onInput, onBlur: r.onBlur }) }))
}
mount(h(Form, null), document.body)`,
  },
  {
    framework: 'React Hook Form',
    baseline: `import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
createRoot(document.body).render(createElement('div', null, 'x'))`,
    full: `import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
const schema = ${SCHEMA}
function Form(){
  const { register } = useForm({ defaultValues: ${EMPTY}, resolver: zodResolver(schema), mode: 'onChange' })
  return createElement('form', null, ${NAMES}.map((n)=>createElement('input', { key:n, ...register(n) })))
}
createRoot(document.body).render(createElement(Form))`,
  },
  {
    framework: 'TanStack Form',
    baseline: `import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
createRoot(document.body).render(createElement('div', null, 'x'))`,
    full: `import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
const schema = ${SCHEMA}
function Form(){
  const form = useForm({ defaultValues: ${EMPTY}, validators: { onChange: schema } })
  return createElement('form', null, ${NAMES}.map((n)=>createElement(form.Field, { key:n, name:n, children:(field)=>createElement('input', { value: field.state.value, onChange:(e)=>field.handleChange(e.target.value), onBlur: field.handleBlur }) })))
}
createRoot(document.body).render(createElement(Form))`,
  },
  {
    framework: 'Formik',
    baseline: `import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
createRoot(document.body).render(createElement('div', null, 'x'))`,
    full: `import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { useFormik } from 'formik'
import { z } from 'zod'
const schema = ${SCHEMA}
function Form(){
  const formik = useFormik({ initialValues: ${EMPTY}, validate:(v)=>{ const r=schema.safeParse(v); if(r.success) return {}; const e={}; for(const i of r.error.issues){ const k=i.path[0]; if(k&&!e[k]) e[k]=i.message } return e }, onSubmit(){} })
  return createElement('form', null, ${NAMES}.map((n)=>createElement('input', { key:n, name:n, value:formik.values[n], onChange:formik.handleChange, onBlur:formik.handleBlur })))
}
createRoot(document.body).render(createElement(Form))`,
  },
  {
    framework: 'Vue (vee-validate)',
    baseline: `import { createApp, h } from 'vue'
createApp({ render: () => h('div', null, 'x') }).mount(document.body)`,
    full: `import { createApp, defineComponent, h } from 'vue'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'
const schema = ${SCHEMA}
const Comp = defineComponent({ setup(){
  const form = useForm({ validationSchema: toTypedSchema(schema), initialValues: ${EMPTY} })
  const fields = ${NAMES}.map((n)=>{ const [model] = form.defineField(n); return { n, model } })
  return () => h('form', null, fields.map(({n, model})=>h('input', { name:n, value: model.value, onInput:(e)=>{ model.value = e.target.value } })))
} })
createApp(Comp).mount(document.body)`,
  },
  {
    framework: 'Solid (modular-forms)',
    baseline: `import { render } from 'solid-js/web'
render(() => { const d = document.createElement('div'); d.textContent = 'x'; return d }, document.body)`,
    full: `import { createComponent } from 'solid-js'
import { insert, render } from 'solid-js/web'
import { createForm, zodForm } from '@modular-forms/solid'
import { z } from 'zod'
const schema = ${SCHEMA}
render(() => {
  const [, { Field }] = createForm({ initialValues: ${EMPTY}, validate: zodForm(schema) })
  const formEl = document.createElement('form')
  insert(formEl, () => ${NAMES}.map((n)=>createComponent(Field, { name:n, children:(field, props)=>{ const i=document.createElement('input'); i.name=n; props.ref(i); i.addEventListener('input', props.onInput); return i } })))
  return formEl
}, document.body)`,
  },
]

const gz = (code: string) => gzipSync(Buffer.from(code), { level: 9 }).length
const kb = (bytes: number) => (bytes / 1024).toFixed(1)

async function buildGz(name: string, source: string): Promise<number | null> {
  const file = join(TMP, `${name}.tsx`)
  writeFileSync(file, source)
  const out = await Bun.build({
    entrypoints: [file],
    target: 'browser',
    minify: true,
    define: { 'process.env.NODE_ENV': '"production"' },
    // Bundle everything (no externals) so the gz reflects the full shipped weight.
  })
  if (!out.success) {
    console.error(`[bundle-size] ${name} build failed:`, out.logs.map((l) => l.message).join('; '))
    return null
  }
  const artifact = out.outputs.find((o) => o.kind === 'entry-point')
  if (!artifact) return null
  return gz(await artifact.text())
}

async function main(): Promise<void> {
  rmSync(TMP, { recursive: true, force: true })
  mkdirSync(TMP, { recursive: true })
  try {
    console.log(`\nFORM BUNDLE SIZE — gzipped, production-minified (Bun.build)`)
    console.log(`BASELINE = runtime only · FULL = runtime + form lib + zod adapter + 12-field validated form`)
    console.log(`DELTA = FULL − BASELINE = the marginal cost of adding a validated form (zod cancels)\n`)
    console.log(['framework', 'baseline', 'full', 'delta (form)'].map((h, i) => h.padEnd(i === 0 ? 20 : 16)).join(''))
    console.log('─'.repeat(68))
    const rows: { framework: string; baseline: number | null; full: number | null; delta: number | null }[] = []
    for (const e of ENTRIES) {
      const baseline = await buildGz(`${e.framework.replace(/\s+/g, '-')}-baseline`, e.baseline)
      const full = await buildGz(`${e.framework.replace(/\s+/g, '-')}-full`, e.full)
      const delta = baseline != null && full != null ? full - baseline : null
      rows.push({ framework: e.framework, baseline, full, delta })
      const cell = (b: number | null) => (b == null ? 'n/a' : `${kb(b)} KB`).padEnd(16)
      console.log(
        e.framework.padEnd(20) +
          cell(baseline) +
          cell(full) +
          (delta == null ? 'n/a' : `${kb(delta)} KB`),
      )
    }
    const best = Math.min(...rows.map((r) => r.delta ?? Infinity))
    console.log(`\nMarginal form cost (DELTA), smallest first:`)
    for (const r of [...rows].sort((a, b) => (a.delta ?? Infinity) - (b.delta ?? Infinity))) {
      if (r.delta == null) continue
      console.log(`  ${r.framework.padEnd(20)} ${kb(r.delta)} KB  (${(r.delta / best).toFixed(1)}×)`)
    }
    console.log(
      `\nNote: DELTA is the honest "what do forms add" number — the runtime (BASELINE) is a sunk cost.`,
    )
  } finally {
    rmSync(TMP, { recursive: true, force: true })
  }
}

void main()
