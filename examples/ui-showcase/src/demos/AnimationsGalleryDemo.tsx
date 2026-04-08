import { kinetic } from '@pyreon/kinetic'
import { type Preset, presets } from '@pyreon/kinetic-presets'
import { signal } from '@pyreon/reactivity'
import { Button, Title, Paragraph } from '@pyreon/ui-components'

// Build all 122 preset components once
const presetComponents: Record<string, ReturnType<typeof kinetic>> = Object.fromEntries(
  Object.entries(presets).map(([name, preset]) => [name, kinetic('div').preset(preset as Preset)]),
)

const PRESET_CATEGORIES: Array<{ name: string; items: string[] }> = [
  {
    name: 'Fades',
    items: [
      'fade', 'fadeUp', 'fadeDown', 'fadeLeft', 'fadeRight',
      'fadeUpBig', 'fadeDownBig', 'fadeLeftBig', 'fadeRightBig',
      'fadeScale', 'fadeUpLeft', 'fadeUpRight', 'fadeDownLeft', 'fadeDownRight',
    ],
  },
  {
    name: 'Slides',
    items: ['slideUp', 'slideDown', 'slideLeft', 'slideRight', 'slideUpBig', 'slideDownBig', 'slideLeftBig', 'slideRightBig'],
  },
  {
    name: 'Scales',
    items: ['scaleIn', 'scaleOut', 'scaleUp', 'scaleDown', 'scaleInUp', 'scaleInDown', 'scaleInLeft', 'scaleInRight'],
  },
  {
    name: 'Zooms',
    items: ['zoomIn', 'zoomOut', 'zoomInUp', 'zoomInDown', 'zoomInLeft', 'zoomInRight', 'zoomOutUp', 'zoomOutDown', 'zoomOutLeft', 'zoomOutRight'],
  },
  {
    name: 'Flips',
    items: ['flipX', 'flipY', 'flipXReverse', 'flipYReverse', 'flipDiagonal', 'flipDiagonalReverse'],
  },
  {
    name: 'Rotations',
    items: ['rotateIn', 'rotateInReverse', 'rotateInUp', 'rotateInDown', 'spinIn', 'spinInReverse', 'scaleRotateIn', 'newspaperIn'],
  },
  {
    name: 'Bounce & Spring',
    items: ['bounceIn', 'bounceInUp', 'bounceInDown', 'bounceInLeft', 'bounceInRight', 'springIn', 'popIn', 'rubberIn', 'squishX', 'squishY'],
  },
  {
    name: 'Blur',
    items: ['blurIn', 'blurInUp', 'blurInDown', 'blurInLeft', 'blurInRight', 'blurScale'],
  },
  { name: 'Puff', items: ['puffIn', 'puffOut'] },
  {
    name: 'Clip Path',
    items: ['clipTop', 'clipBottom', 'clipLeft', 'clipRight', 'clipCircle', 'clipCenter', 'clipDiamond', 'clipCorner'],
  },
  {
    name: 'Perspective',
    items: ['perspectiveUp', 'perspectiveDown', 'perspectiveLeft', 'perspectiveRight'],
  },
  { name: 'Tilt', items: ['tiltInUp', 'tiltInDown', 'tiltInLeft', 'tiltInRight'] },
  { name: 'Swing', items: ['swingInTop', 'swingInBottom', 'swingInLeft', 'swingInRight'] },
  { name: 'Slit', items: ['slitHorizontal', 'slitVertical'] },
  { name: 'Swirl', items: ['swirlIn', 'swirlInReverse'] },
  { name: 'Back', items: ['backInUp', 'backInDown', 'backInLeft', 'backInRight'] },
  { name: 'Light Speed', items: ['lightSpeedInLeft', 'lightSpeedInRight'] },
  { name: 'Roll', items: ['rollInLeft', 'rollInRight'] },
  { name: 'Fly', items: ['flyInUp', 'flyInDown', 'flyInLeft', 'flyInRight'] },
  { name: 'Float', items: ['floatUp', 'floatDown', 'floatLeft', 'floatRight'] },
  { name: 'Push', items: ['pushInLeft', 'pushInRight'] },
  { name: 'Expand', items: ['expandX', 'expandY'] },
  { name: 'Skew', items: ['skewIn', 'skewInReverse', 'skewInY', 'skewInYReverse'] },
  { name: 'Drop & Rise', items: ['drop', 'rise'] },
]

// Build a single signal per preset (created once at module scope)
const showSignals: Record<string, ReturnType<typeof signal<boolean>>> = {}
for (const cat of PRESET_CATEGORIES) {
  for (const name of cat.items) {
    showSignals[name] = signal(true)
  }
}

const cellStyle =
  'padding: 16px; background: #0070f3; color: white; border-radius: 6px; text-align: center; font-size: 11px; font-weight: 600; cursor: pointer;'

function PresetCell(props: { name: string }) {
  const Comp = presetComponents[props.name]
  const sig = showSignals[props.name]
  if (!Comp || !sig) return null
  return (
    <Comp show={() => sig()} style={cellStyle} onClick={() => sig.set(!sig())}>
      {props.name}
    </Comp>
  )
}

function CategorySection(props: { name: string; items: string[] }) {
  const open = signal(true)
  const toggleAll = () => {
    const target = !props.items.every((n) => showSignals[n]?.())
    for (const n of props.items) showSignals[n]?.set(target)
  }
  return (
    <div style="margin-bottom: 24px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <button
          type="button"
          onClick={() => open.set(!open())}
          style="background: none; border: none; cursor: pointer; font-size: 16px; font-weight: 600; padding: 4px 0;"
        >
          {() => (open() ? '▼' : '▶')} {props.name}{' '}
          <span style="font-size: 12px; color: #6b7280; font-weight: 400;">({props.items.length})</span>
        </button>
        <Button state="secondary" size="small" onClick={toggleAll}>
          Toggle all
        </Button>
      </div>
      {() =>
        open() ? (
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px;">
            {props.items.map((name) => (
              <PresetCell name={name} />
            ))}
          </div>
        ) : null
      }
    </div>
  )
}

export function AnimationsGalleryDemo() {
  const totalCount = PRESET_CATEGORIES.reduce((sum, c) => sum + c.items.length, 0)

  const toggleAll = () => {
    const target = !Object.values(showSignals).every((s) => s())
    for (const s of Object.values(showSignals)) s.set(target)
  }

  return (
    <div>
      <Title size="h2" style="margin-bottom: 12px">Preset Gallery</Title>
      <Paragraph style="margin-bottom: 16px">
        All <strong>{totalCount} presets</strong> from `@pyreon/kinetic-presets` in one place. Click any cell to toggle, or use category headers to expand/collapse and toggle a whole group.
      </Paragraph>
      <Button state="primary" onClick={toggleAll} style="margin-bottom: 24px;">
        Toggle ALL presets
      </Button>

      {PRESET_CATEGORIES.map((cat) => (
        <CategorySection name={cat.name} items={cat.items} />
      ))}
    </div>
  )
}
