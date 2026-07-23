/**
 * The demo catalog this example feeds to `<Workbench>`. It shows the shape a
 * real project (or the `atlas dev` CLI's generated catalog) provides: a flat
 * list of components, each with control metadata + a `render(props, ctx)`.
 *
 * The showcased components (Button / Badge / Text field / Toggle) are ordinary
 * rocketstyle components built on Atlas's exported `el`/`txt` bases — nothing
 * here is workbench-specific. `render` mounts the component for the live control
 * values; `ctx.logAction` feeds the Actions panel and `ctx.setValue` writes a
 * control back (a controlled toggle updating its own `on`).
 */
import { cx, el, hexToRgba, type InputEl, type T, txt, type WorkbenchCatalog } from '@pyreon/atlas/ui'

// ── showcased components (variants / sizes / states dimensions) ─────────────
const btnBase = (t: T) =>
  cx(`font-family:'Public Sans',sans-serif;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:9px;border:1px solid transparent;transition:transform .08s;border-radius:10px;font-size:14.5px;padding:11px 20px;background:${t.accent};color:#fff;box-shadow:0 6px 16px -6px ${hexToRgba(t.accent, 0.6)};`)
const DemoButton = el
  .attrs({ tag: 'button', css: 'display:inline-flex;align-items:center;justify-content:center;' })
  .theme(btnBase)
  .variants((t: T) => ({
    solid: { backgroundColor: t.accent, color: '#fff', boxShadow: `0 6px 16px -6px ${hexToRgba(t.accent, 0.6)}` },
    soft: { backgroundColor: hexToRgba(t.accent, 0.14), color: t.accent, boxShadow: 'none' },
    outline: { backgroundColor: 'transparent', color: t.accent, borderColor: hexToRgba(t.accent, 0.5), boxShadow: 'none' },
    ghost: { backgroundColor: 'transparent', color: t.accent, boxShadow: 'none' },
  }))
  .sizes(() => ({
    sm: { fontSize: '13px', padding: '8px 15px' },
    md: { fontSize: '14.5px', padding: '11px 20px' },
    lg: { fontSize: '16px', padding: '14px 26px' },
  }))

const DemoBadge = el
  .attrs({ tag: 'span', css: 'display:inline-flex;align-items:center;justify-content:center;' })
  .theme((t: T) => cx(`font-family:'Public Sans',sans-serif;font-size:12.5px;font-weight:600;padding:4px 11px;border-radius:20px;display:inline-flex;align-items:center;gap:7px;border:1px solid transparent;background:${hexToRgba(t.accent, 0.14)};color:${t.accent};`))
  .variants((t: T) => ({
    soft: { backgroundColor: hexToRgba(t.accent, 0.14), color: t.accent },
    solid: { backgroundColor: t.accent, color: '#fff' },
    outline: { backgroundColor: 'transparent', color: t.accent, borderColor: hexToRgba(t.accent, 0.5) },
  }))

const IconDot = el.attrs({ tag: 'span' }).theme(() => cx('width:7px;height:7px;border-radius:9px;background:currentColor;display:inline-block;'))

const ToggleRoot = el.attrs({ tag: 'label', css: 'display:inline-flex;align-items:center;justify-content:center;' }).theme((t: T) => cx(`display:inline-flex;align-items:center;gap:11px;cursor:pointer;font-family:'Public Sans',sans-serif;color:${t.text};`))
const ToggleTrack = el
  .attrs({ tag: 'span' })
  .theme((t: T) => cx(`cursor:pointer;width:46px;height:26px;border-radius:20px;position:relative;display:inline-block;transition:background .15s;background:${t.border};`))
  .states((t: T) => ({ on: { backgroundColor: t.accent }, off: {} }))
const ToggleKnob = el
  .attrs({ tag: 'span' })
  .theme(() => cx('position:absolute;top:2px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:left .15s;width:22px;height:22px;left:2px;'))
  .states(() => ({ on: { left: '22px' }, off: {} }))
const ToggleText = txt.attrs({ tag: 'span' }).theme(() => cx('font-size:14px;font-weight:500;'))

const FieldRoot = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:column;align-items:stretch;' }).theme(() => cx("width:260px;text-align:left;font-family:'Public Sans',sans-serif;"))
const FieldLabel = txt.attrs({ tag: 'label' }).theme((t: T) => cx(`display:block;font-size:12.5px;font-weight:600;margin-bottom:6px;color:${t.text};`))
const FieldInput = (el
  .attrs({ tag: 'input' })
  .theme((t: T) => cx(`width:100%;font-family:'Public Sans',sans-serif;font-size:14px;padding:10px 13px;border-radius:9px;outline:none;color:${t.text};background:${t.bg};border:1.5px solid ${t.border};`))
  .states((t: T) => ({
    focus: { borderColor: t.accent, boxShadow: `0 0 0 3px ${hexToRgba(t.accent, 0.18)}` },
    error: { borderColor: t.danger, boxShadow: '0 0 0 3px rgba(224,91,91,.15)' },
    default: {},
  }))) as unknown as InputEl
const FieldHelper = txt
  .attrs({ tag: 'div' })
  .theme((t: T) => cx(`font-size:11.5px;margin-top:6px;color:${t.muted};`))
  .states((t: T) => ({ error: { color: t.danger }, default: {} }))

// ── the catalog ─────────────────────────────────────────────────────────────
export const demoCatalog: WorkbenchCatalog = {
  components: [
    {
      id: 'button', name: 'Button', group: 'Foundations', status: 'stable',
      desc: 'The primary action trigger, in four visual variants and three sizes.',
      controls: [
        { key: 'label', label: 'Label', type: 'text', default: 'Get started' },
        { key: 'variant', label: 'Variant', type: 'enum', options: ['solid', 'soft', 'outline', 'ghost'], default: 'solid' },
        { key: 'size', label: 'Size', type: 'enum', options: ['sm', 'md', 'lg'], default: 'md' },
        { key: 'icon', label: 'Leading icon', type: 'bool', default: false },
      ],
      render: (v, ctx) => (
        <DemoButton variant={v.variant as never} size={v.size as never} onClick={() => ctx.logAction('onClick', `Button "${String(v.label)}"`)}>
          {v.icon ? <IconDot /> : null}
          {String(v.label)}
        </DemoButton>
      ),
    },
    {
      id: 'badge', name: 'Badge', group: 'Foundations', status: 'stable',
      desc: 'Compact status and metadata labels.',
      controls: [
        { key: 'label', label: 'Label', type: 'text', default: 'New' },
        { key: 'variant', label: 'Variant', type: 'enum', options: ['soft', 'solid', 'outline'], default: 'soft' },
        { key: 'dot', label: 'Leading dot', type: 'bool', default: true },
      ],
      render: (v) => (
        <DemoBadge variant={v.variant as never}>
          {v.dot ? <IconDot /> : null}
          {String(v.label)}
        </DemoBadge>
      ),
    },
    {
      id: 'input', name: 'Text field', group: 'Foundations', status: 'stable',
      desc: 'Single-line text entry with label, helper text and validation states.',
      controls: [
        { key: 'label', label: 'Label', type: 'text', default: 'Email address' },
        { key: 'placeholder', label: 'Placeholder', type: 'text', default: 'you@studio.com' },
        { key: 'state', label: 'State', type: 'enum', options: ['default', 'focus', 'error'], default: 'default' },
        { key: 'helper', label: 'Helper', type: 'text', default: 'We will never share it.' },
      ],
      render: (v) => {
        const st = String(v.state)
        const err = st === 'error'
        return (
          <FieldRoot>
            <FieldLabel>{String(v.label)}</FieldLabel>
            <FieldInput state={st as never} placeholder={String(v.placeholder)} />
            <FieldHelper state={err ? 'error' : 'default'}>{err ? 'Please enter a valid email.' : String(v.helper)}</FieldHelper>
          </FieldRoot>
        )
      },
    },
    {
      id: 'toggle', name: 'Toggle', group: 'Foundations', status: 'stable', isNew: true,
      desc: 'Binary on/off switch for settings and preferences.',
      controls: [
        { key: 'label', label: 'Label', type: 'text', default: 'Enable notifications' },
        { key: 'on', label: 'On', type: 'bool', default: true },
      ],
      render: (v, ctx) => {
        const on = v.on ? 'on' : 'off'
        return (
          <ToggleRoot>
            <ToggleTrack state={on} onClick={() => { ctx.setValue('on', !v.on); ctx.logAction('onChange', `Toggle → ${!v.on}`) }}>
              <ToggleKnob state={on} />
            </ToggleTrack>
            <ToggleText>{String(v.label)}</ToggleText>
          </ToggleRoot>
        )
      },
    },
  ],
}
