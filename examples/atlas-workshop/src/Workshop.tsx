/**
 * The Atlas Component Workshop — composed from rocketstyle components, themed
 * through styler's reactive `ThemeProvider`. No inline styles; every visual
 * element is a rocketstyle component from `./components`.
 *
 * rocketstyle dimension props (`state`/`variant`/`size`) take VALUES, not
 * accessors — the compiler wraps the reactive signal read in the expression
 * (`state={selId() === c.id ? 'active' : 'idle'}`). Signal reads are inlined so
 * the compiler can see them.
 */
import { Show, onMount } from '@pyreon/core'
import { computed, signal } from '@pyreon/reactivity'
import { ThemeProvider } from '@pyreon/styler'
import * as C from './components'
import { ALL, compById, defaultValues, GROUPS, searchIds, totalCount, type Comp, type Control } from './registry'
import { THEMES, tokens } from './theme'

export function Workshop() {
  const brandId = signal('ember')
  const dark = signal(true)
  const selId = signal('button')
  const query = signal('')
  const zoom = signal(1)
  const values = signal<Record<string, Record<string, unknown>>>({})
  const view = signal<'canvas' | 'docs' | 'lab'>('canvas')

  const brand = computed(() => THEMES.find((b) => b.id === brandId()) ?? THEMES[0]!)
  const theme = computed(() => tokens(brand(), dark()))
  const sel = computed(() => compById(selId()))
  const vals = computed(() => {
    const ov = values()[selId()]
    return ov ? { ...defaultValues(sel()), ...ov } : defaultValues(sel())
  })
  const visibleGroups = computed(() => {
    const ids = new Set(searchIds(query()))
    return GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => ids.has(i.id)) })).filter((g) => g.items.length > 0)
  })
  const noResults = computed(() => visibleGroups().length === 0)

  const setValue = (id: string, key: string, v: unknown) => {
    const cur = values()[id]
    values.set({ ...values(), [id]: cur ? { ...cur, [key]: v } : { [key]: v } })
  }
  const reset = () => values.set({ ...values(), [selId()]: {} })

  const addon = signal<'controls' | 'actions'>('controls')
  const actions = signal<{ id: number; name: string; detail: string; t: string }[]>([])
  let actionSeq = 0
  const logAction = (name: string, detail: string) => {
    actionSeq += 1
    actions.set([{ id: actionSeq, name, detail, t: new Date().toLocaleTimeString([], { hour12: false }) }, ...actions()].slice(0, 24))
  }
  const clearActions = () => actions.set([])

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      const typing = tag === 'input' || tag === 'textarea'
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        document.querySelector<HTMLInputElement>('input[data-search]')?.focus()
        return
      }
      if (e.key === 'Escape' && query()) query.set('')
      if (typing) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const ids = searchIds(query())
        if (!ids.length) return
        e.preventDefault()
        let i = ids.indexOf(selId())
        i = e.key === 'ArrowDown' ? Math.min(ids.length - 1, i + 1) : Math.max(0, i - 1)
        selId.set(ids[i]!)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ── the live preview (re-created whenever the component or values change) ──
  const preview = () => {
    const id = selId()
    const v = vals()
    if (id === 'button') {
      return (
        <C.DemoButton variant={v.variant as never} size={v.size as never} onClick={() => logAction('onClick', `Button "${String(v.label)}"`)}>
          {v.icon ? <C.IconDot /> : null}
          {String(v.label)}
        </C.DemoButton>
      )
    }
    if (id === 'badge') {
      return (
        <C.DemoBadge variant={v.variant as never}>
          {v.dot ? <C.IconDot /> : null}
          {String(v.label)}
        </C.DemoBadge>
      )
    }
    if (id === 'toggle') {
      const on = v.on ? 'on' : 'off'
      return (
        <C.ToggleRoot>
          <C.ToggleTrack state={on} onClick={() => { setValue('toggle', 'on', !v.on); logAction('onChange', `Toggle → ${!v.on}`) }}>
            <C.ToggleKnob state={on} />
          </C.ToggleTrack>
          <C.ToggleText>{String(v.label)}</C.ToggleText>
        </C.ToggleRoot>
      )
    }
    const st = String(v.state)
    const err = st === 'error'
    return (
      <C.FieldRoot>
        <C.FieldLabel>{String(v.label)}</C.FieldLabel>
        <C.FieldInput state={st as never} placeholder={String(v.placeholder)} />
        <C.FieldHelper state={err ? 'error' : 'default'}>{err ? 'Please enter a valid email.' : String(v.helper)}</C.FieldHelper>
      </C.FieldRoot>
    )
  }

  // ── a single control row ────────────────────────────────────────────────
  const control = (ctrl: Control) => (
    <C.CtrlRow>
      <C.CtrlHead>
        <C.CtrlLabel>{ctrl.label}</C.CtrlLabel>
        <C.CtrlType>{ctrl.type}</C.CtrlType>
      </C.CtrlHead>
      {ctrl.type === 'text' ? (
        <C.TextInput placeholder={String(defaultValues(sel())[ctrl.key] ?? '')} onInput={(e: Event) => setValue(selId(), ctrl.key, (e.target as HTMLInputElement).value)} />
      ) : ctrl.type === 'enum' ? (
        <C.EnumWrap>
          {(ctrl.options ?? []).map((opt) => (
            <C.EnumBtn state={vals()[ctrl.key] === opt ? 'active' : 'idle'} onClick={() => setValue(selId(), ctrl.key, opt)}>
              {opt}
            </C.EnumBtn>
          ))}
        </C.EnumWrap>
      ) : (
        <C.Switch state={vals()[ctrl.key] ? 'on' : 'off'} onClick={() => setValue(selId(), ctrl.key, !vals()[ctrl.key])}>
          <C.Knob state={vals()[ctrl.key] ? 'on' : 'off'} />
        </C.Switch>
      )}
    </C.CtrlRow>
  )

  // ── sidebar group ───────────────────────────────────────────────────────
  const group = (g: { group: string; num: string; items: readonly Comp[] }) => (
    <>
      <C.GroupLabel>
        <C.GroupNum>{g.num}</C.GroupNum>
        {g.group}
      </C.GroupLabel>
      {g.items.map((c) => (
        <C.CompBtn state={selId() === c.id ? 'active' : 'idle'} onClick={() => selId.set(c.id)}>
          <C.CompBar state={selId() === c.id ? 'active' : 'idle'} />
          <C.CompName>{c.name}</C.CompName>
          {c.isNew ? <C.NewTag>NEW</C.NewTag> : null}
        </C.CompBtn>
      ))}
    </>
  )

  // ── autodocs: a generated usage snippet + the props table ────────────────
  const usage = () => {
    const c = sel()
    const v = vals()
    const attrs = c.controls
      .map((ct) => {
        const val = v[ct.key]
        if (ct.type === 'bool') return val ? ct.key : ''
        if (typeof val === 'string' && val) return `${ct.key}="${val}"`
        return ''
      })
      .filter(Boolean)
    return `<${c.name}${attrs.length ? ' ' + attrs.join(' ') : ''} />`
  }

  const docsView = () => {
    const c = sel()
    return (
      <C.DocsWrap>
        <C.DocsArticle>
          <C.DocsTitleRow>
            <C.DocsTitle>{c.name}</C.DocsTitle>
            <C.DocsStatus>{c.status}</C.DocsStatus>
          </C.DocsTitleRow>
          <C.DocsDesc>{c.desc}</C.DocsDesc>
          <C.DocsPreview>{() => preview()}</C.DocsPreview>
          <C.DocsH2>Props</C.DocsH2>
          <C.PropsTable>
            <C.PropsHead>
              <C.HeadCell>NAME</C.HeadCell>
              <C.HeadCell>TYPE</C.HeadCell>
              <C.HeadCell>DEFAULT</C.HeadCell>
            </C.PropsHead>
            {c.controls.map((ct) => (
              <C.PropsRow>
                <C.PropName>{ct.key}</C.PropName>
                <C.PropKind>{ct.type}</C.PropKind>
                <C.PropDef>{String(ct.default)}</C.PropDef>
              </C.PropsRow>
            ))}
          </C.PropsTable>
          <C.DocsH2>Usage</C.DocsH2>
          <C.UsagePre>{usage()}</C.UsagePre>
        </C.DocsArticle>
      </C.DocsWrap>
    )
  }

  // ── theme lab: the selected component across every theme × light/dark ────
  const labView = () => (
    <C.LabWrap>
      <C.LabGrid>
        {THEMES.flatMap((b) =>
          [true, false].map((d) => (
            <ThemeProvider theme={tokens(b, d) as never}>
              <C.LabTile>
                <C.LabTileHead>
                  <C.LabTileName>{b.name}</C.LabTileName>
                  <C.LabTileMode>{d ? 'dark' : 'light'}</C.LabTileMode>
                </C.LabTileHead>
                <C.LabTileBody>{() => preview()}</C.LabTileBody>
              </C.LabTile>
            </ThemeProvider>
          )),
        )}
      </C.LabGrid>
    </C.LabWrap>
  )

  return (
    <ThemeProvider theme={theme() as never}>
      <C.Shell>
        {/* TOP BAR */}
        <C.TopBar>
          <C.BrandRow>
            <C.BrandMark>
              <C.BrandGlyph />
            </C.BrandMark>
            <C.Col>
              <C.BrandText>atlas</C.BrandText>
              <C.BrandSub>workshop · v0.1</C.BrandSub>
            </C.Col>
          </C.BrandRow>

          <C.Segment>
            <C.SegBtn state={view() === 'canvas' ? 'active' : 'idle'} onClick={() => view.set('canvas')}>
              Canvas
            </C.SegBtn>
            <C.SegBtn state={view() === 'docs' ? 'active' : 'idle'} onClick={() => view.set('docs')}>
              Docs
            </C.SegBtn>
            <C.SegBtn state={view() === 'lab' ? 'active' : 'idle'} onClick={() => view.set('lab')}>
              Theme Lab
            </C.SegBtn>
          </C.Segment>

          <C.Segment>
            {THEMES.map((t) => (
              <C.SegBtn state={brandId() === t.id ? 'active' : 'idle'} onClick={() => brandId.set(t.id)}>
                {t.name}
              </C.SegBtn>
            ))}
          </C.Segment>

          <C.SearchWrap>
            <C.SearchInner>
              <C.SearchIcon>⌕</C.SearchIcon>
              <C.SearchInput data-search onInput={(e: Event) => query.set((e.target as HTMLInputElement).value)} placeholder="Search components…" />
              <C.Kbd>⌘K</C.Kbd>
            </C.SearchInner>
          </C.SearchWrap>

          <C.RightRow>
            <C.IconButton onClick={() => dark.set(!dark())} title="Toggle theme">
              {() => (dark() ? '☾' : '☀')}
            </C.IconButton>
            <C.Avatar>DS</C.Avatar>
          </C.RightRow>
        </C.TopBar>

        {/* BODY */}
        <C.Body>
          {/* SIDEBAR */}
          <C.Sidebar>
            <C.SideHead>
              <C.SideLabel>components</C.SideLabel>
              <C.CountPill>{totalCount}</C.CountPill>
            </C.SideHead>
            <C.SideList>
              {() => visibleGroups().map((g) => group(g))}
              <Show when={() => noResults()}>
                <C.Empty>no matches</C.Empty>
              </Show>
            </C.SideList>
            <C.SideFoot>
              <C.OkDot />
              Tokens synced · ↑↓ to browse
            </C.SideFoot>
          </C.Sidebar>

          {/* MAIN — canvas view */}
          <Show when={() => view() === 'canvas'}>
          <C.Main>
            <C.CanvasBar>
              <C.Col>
                <C.CanvasName>{() => sel().name}</C.CanvasName>
                <C.CanvasPath>{() => `components/${selId()}`}</C.CanvasPath>
              </C.Col>
              <C.Spacer />
              <C.Segment>
                <C.ZoomBtn onClick={() => zoom.set(Math.max(0.5, +(zoom() - 0.1).toFixed(2)))}>−</C.ZoomBtn>
                <C.ZoomLabel>{() => `${Math.round(zoom() * 100)}%`}</C.ZoomLabel>
                <C.ZoomBtn onClick={() => zoom.set(Math.min(2, +(zoom() + 0.1).toFixed(2)))}>+</C.ZoomBtn>
              </C.Segment>
            </C.CanvasBar>

            <C.Stage>
              <C.Frame>
                <C.FrameChrome>{() => `${brand().name} · ${dark() ? 'dark' : 'light'}`}</C.FrameChrome>
                <C.PreviewSurface>{() => preview()}</C.PreviewSurface>
              </C.Frame>
            </C.Stage>
          </C.Main>
          </Show>

          {/* ADDON PANEL (canvas view) */}
          <Show when={() => view() === 'canvas'}>
          <C.AddonPanel>
            <C.AddonTabs>
              <C.SegBtn state={addon() === 'controls' ? 'active' : 'idle'} onClick={() => addon.set('controls')}>Controls</C.SegBtn>
              <C.SegBtn state={addon() === 'actions' ? 'active' : 'idle'} onClick={() => addon.set('actions')}>Actions</C.SegBtn>
            </C.AddonTabs>
            <C.AddonBody>
              <Show when={() => addon() === 'controls'}>
                <>
                  {() => sel().controls.map((ctrl) => control(ctrl))}
                  <C.ResetBtn onClick={reset}>Reset to defaults</C.ResetBtn>
                </>
              </Show>
              <Show when={() => addon() === 'actions'}>
                <>
                  <C.ActionsHead>
                    <C.ActionsHint>Interact with the preview to log events.</C.ActionsHint>
                    <C.ClearBtn onClick={clearActions}>Clear</C.ClearBtn>
                  </C.ActionsHead>
                  <Show when={() => actions().length === 0}>
                    <C.ActionsEmpty>No events yet — click the component.</C.ActionsEmpty>
                  </Show>
                  {() =>
                    actions().map((ev) => (
                      <C.ActionRow>
                        <C.ActionName>{ev.name}</C.ActionName>
                        <C.ActionDetail>{ev.detail}</C.ActionDetail>
                        <C.ActionTime>{ev.t}</C.ActionTime>
                      </C.ActionRow>
                    ))
                  }
                </>
              </Show>
            </C.AddonBody>
          </C.AddonPanel>
          </Show>

          {/* DOCS view */}
          <Show when={() => view() === 'docs'}>{() => docsView()}</Show>

          {/* THEME LAB view */}
          <Show when={() => view() === 'lab'}>{() => labView()}</Show>
        </C.Body>

        {/* STATUS BAR */}
        <C.StatusBar>
          <C.StatusText>{() => `components/${selId()}`}</C.StatusText>
          <C.StatusDim>·</C.StatusDim>
          <C.StatusText>{() => `${brand().name} theme`}</C.StatusText>
          <C.Spacer />
          <C.StatusText>{`${ALL.length} components`}</C.StatusText>
        </C.StatusBar>
      </C.Shell>
    </ThemeProvider>
  )
}
