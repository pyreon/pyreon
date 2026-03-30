import { fade, kinetic, scaleIn, slideDown, slideLeft, slideRight, slideUp } from '@pyreon/kinetic'
import type { Preset } from '@pyreon/kinetic-presets'
import {
  compose,
  createBlur,
  createFade,
  createRotate,
  createScale,
  createSlide,
  presets,
  reverse,
  withDelay,
  withDuration,
  withEasing,
} from '@pyreon/kinetic-presets'
import { signal } from '@pyreon/reactivity'

// ---------------------------------------------------------------------------
// Shared inline styles
// ---------------------------------------------------------------------------

const wrapper: Record<string, string> = {
  'max-width': '960px',
  margin: '0 auto',
  padding: '32px 24px',
}

const badge: Record<string, string> = {
  display: 'inline-block',
  padding: '4px 12px',
  'border-radius': '999px',
  background: '#e8f4fd',
  color: '#0070f3',
  'font-size': '0.75rem',
  'font-weight': '600',
  'margin-bottom': '8px',
}

const sectionTitle: Record<string, string> = {
  'font-size': '1.5rem',
  'font-weight': '600',
  margin: '32px 0 16px',
}

const card: Record<string, string> = {
  padding: '24px',
  'border-radius': '12px',
  background: '#f8f9fa',
  border: '1px solid #e9ecef',
  'margin-bottom': '24px',
}

const cardTitle: Record<string, string> = {
  'font-size': '1.125rem',
  'font-weight': '600',
  margin: '0 0 8px',
}

const cardDesc: Record<string, string> = {
  'font-size': '0.875rem',
  color: '#555',
  'line-height': '1.6',
  margin: '0 0 16px',
}

const btn: Record<string, string> = {
  padding: '8px 16px',
  'border-radius': '6px',
  border: '1px solid #ddd',
  background: '#fff',
  cursor: 'pointer',
  'font-size': '13px',
}

const btnPrimary: Record<string, string> = {
  ...btn,
  background: '#0070f3',
  color: '#fff',
  border: '1px solid #0070f3',
}

const btnDanger: Record<string, string> = {
  ...btn,
  background: '#dc3545',
  color: '#fff',
  border: '1px solid #dc3545',
}

const colorBox: Record<string, string> = {
  padding: '32px',
  'border-radius': '8px',
  background: '#0070f3',
  color: '#fff',
  'text-align': 'center',
  'font-weight': '600',
}

const logBox: Record<string, string> = {
  'font-family': "'SF Mono', 'Fira Code', monospace",
  'font-size': '12px',
  padding: '12px',
  background: '#1e1e1e',
  color: '#d4d4d4',
  'border-radius': '6px',
  'margin-top': '12px',
  'max-height': '120px',
  'overflow-y': 'auto',
}

const gridRow: Record<string, string> = {
  display: 'flex',
  gap: '12px',
  'flex-wrap': 'wrap',
  'margin-bottom': '12px',
}

const listItem: Record<string, string> = {
  padding: '12px 16px',
  background: '#fff',
  'border-radius': '6px',
  border: '1px solid #e9ecef',
  'margin-bottom': '8px',
  display: 'flex',
  'align-items': 'center',
  'justify-content': 'space-between',
}

const accordionHeader: Record<string, string> = {
  padding: '12px 16px',
  background: '#fff',
  'border-radius': '6px',
  border: '1px solid #e9ecef',
  cursor: 'pointer',
  'font-weight': '500',
  'margin-bottom': '4px',
  'user-select': 'none',
}

const accordionContent: Record<string, string> = {
  padding: '16px',
  color: '#555',
  'line-height': '1.6',
}

const presetCardStyle: Record<string, string> = {
  padding: '16px',
  background: '#fff',
  'border-radius': '8px',
  border: '1px solid #e9ecef',
  'text-align': 'center',
  'min-width': '140px',
  flex: '1',
}

// ---------------------------------------------------------------------------
// Module-level kinetic components (created once, reused everywhere)
// ---------------------------------------------------------------------------

// Basic presets from @pyreon/kinetic
const FadeDiv = kinetic('div').preset(fade)
const ScaleInDiv = kinetic('div').preset(scaleIn)
const SlideUpDiv = kinetic('div').preset(slideUp)
const SlideDownDiv = kinetic('div').preset(slideDown)
const SlideLeftDiv = kinetic('div').preset(slideLeft)
const SlideRightDiv = kinetic('div').preset(slideRight)

// Custom style-object animation
const SpringPanel = kinetic('div')
  .enter({ opacity: 0, transform: 'scale(0.9)' })
  .enterTo({ opacity: 1, transform: 'scale(1)' })
  .enterTransition('all 400ms cubic-bezier(0.34, 1.56, 0.64, 1)')
  .leave({ opacity: 1, transform: 'scale(1)' })
  .leaveTo({ opacity: 0, transform: 'scale(0.9)' })
  .leaveTransition('all 250ms ease-in')

// Class-based animation
const _ClassFadeDiv = kinetic('div')
  .enterClass({ active: 'transition-opacity duration-300', from: 'opacity-0', to: 'opacity-100' })
  .leaveClass({ active: 'transition-opacity duration-200', from: 'opacity-100', to: 'opacity-0' })

// Modal elements
const Backdrop = kinetic('div').preset(fade)
const Dialog = kinetic('div')
  .enter({ opacity: 0, transform: 'scale(0.9) translateY(20px)' })
  .enterTo({ opacity: 1, transform: 'scale(1) translateY(0)' })
  .enterTransition('all 350ms cubic-bezier(0.34, 1.56, 0.64, 1)')
  .leave({ opacity: 1, transform: 'scale(1) translateY(0)' })
  .leaveTo({ opacity: 0, transform: 'scale(0.95) translateY(10px)' })
  .leaveTransition('all 200ms ease-in')

// Collapse
const AccordionCollapse = kinetic('div').collapse()
const BouncyCollapse = kinetic('div').collapse({
  transition: 'height 500ms cubic-bezier(0.34, 1.56, 0.64, 1)',
})

// Stagger
const StaggerMenu = kinetic('div').preset(slideUp).stagger({ interval: 75 })
const StaggerNotifications = kinetic('div')
  .preset(fade)
  .stagger({ interval: 100, reverseLeave: true })
const _StaggerCardGrid = kinetic('div').preset(scaleIn).stagger({ interval: 50 })

// Group (key-based)
const GroupList = kinetic('div').preset(fade).group()
const ToastGroup = kinetic('div').preset(slideRight).group()

// Factory-created components
const FactoryFadeUp = kinetic('div').preset(createFade({ direction: 'up', distance: 24 }))
const FactorySlideRight = kinetic('div').preset(createSlide({ direction: 'right', distance: 32 }))
const FactoryScaleSpring = kinetic('div').preset(
  createScale({ from: 0.5, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }),
)
const FactoryRotate = kinetic('div').preset(createRotate({ degrees: 30, duration: 400 }))
const FactoryBlurScale = kinetic('div').preset(createBlur({ amount: 12, scale: 0.95 }))

// Composition utilities
const ComposedFadeSlide = kinetic('div').preset(compose(presets.fade, presets.slideUp))
const SlowFade = kinetic('div').preset(withDuration(presets.fade, 800, 500))
const SpringEased = kinetic('div').preset(
  withEasing(presets.scaleIn, 'cubic-bezier(0.34, 1.56, 0.64, 1)'),
)
const DelayedFade = kinetic('div').preset(withDelay(presets.fadeUp, 200, 0))
const ReversedSlide = kinetic('div').preset(reverse(presets.slideUp))

// All 122 presets as components (dynamically)
const presetComponents: Record<string, ReturnType<typeof kinetic>> = Object.fromEntries(
  Object.entries(presets).map(([name, preset]) => [name, kinetic('div').preset(preset as Preset)]),
)

// Preset categories for gallery
const PRESET_CATEGORIES = [
  {
    name: 'Fades',
    items: [
      'fade',
      'fadeUp',
      'fadeDown',
      'fadeLeft',
      'fadeRight',
      'fadeUpBig',
      'fadeDownBig',
      'fadeLeftBig',
      'fadeRightBig',
      'fadeScale',
      'fadeUpLeft',
      'fadeUpRight',
      'fadeDownLeft',
      'fadeDownRight',
    ],
  },
  {
    name: 'Slides',
    items: [
      'slideUp',
      'slideDown',
      'slideLeft',
      'slideRight',
      'slideUpBig',
      'slideDownBig',
      'slideLeftBig',
      'slideRightBig',
    ],
  },
  {
    name: 'Scales',
    items: [
      'scaleIn',
      'scaleOut',
      'scaleUp',
      'scaleDown',
      'scaleInUp',
      'scaleInDown',
      'scaleInLeft',
      'scaleInRight',
    ],
  },
  {
    name: 'Zooms',
    items: [
      'zoomIn',
      'zoomOut',
      'zoomInUp',
      'zoomInDown',
      'zoomInLeft',
      'zoomInRight',
      'zoomOutUp',
      'zoomOutDown',
      'zoomOutLeft',
      'zoomOutRight',
    ],
  },
  {
    name: 'Flips',
    items: [
      'flipX',
      'flipY',
      'flipXReverse',
      'flipYReverse',
      'flipDiagonal',
      'flipDiagonalReverse',
    ],
  },
  {
    name: 'Rotations',
    items: [
      'rotateIn',
      'rotateInReverse',
      'rotateInUp',
      'rotateInDown',
      'spinIn',
      'spinInReverse',
      'scaleRotateIn',
      'newspaperIn',
    ],
  },
  {
    name: 'Bounce & Spring',
    items: [
      'bounceIn',
      'bounceInUp',
      'bounceInDown',
      'bounceInLeft',
      'bounceInRight',
      'springIn',
      'popIn',
      'rubberIn',
      'squishX',
      'squishY',
    ],
  },
  {
    name: 'Blur',
    items: ['blurIn', 'blurInUp', 'blurInDown', 'blurInLeft', 'blurInRight', 'blurScale'],
  },
  { name: 'Puff', items: ['puffIn', 'puffOut'] },
  {
    name: 'Clip Path',
    items: [
      'clipTop',
      'clipBottom',
      'clipLeft',
      'clipRight',
      'clipCircle',
      'clipCenter',
      'clipDiamond',
      'clipCorner',
    ],
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

// ---------------------------------------------------------------------------
// ID counters
// ---------------------------------------------------------------------------

let nextId = 4
let toastId = 0

// ---------------------------------------------------------------------------
// Demo sections
// ---------------------------------------------------------------------------

function PresetShowcase() {
  const shows = {
    fade: signal(true),
    scaleIn: signal(true),
    slideUp: signal(true),
    slideDown: signal(true),
    slideLeft: signal(true),
    slideRight: signal(true),
  }

  const components = {
    fade: FadeDiv,
    scaleIn: ScaleInDiv,
    slideUp: SlideUpDiv,
    slideDown: SlideDownDiv,
    slideLeft: SlideLeftDiv,
    slideRight: SlideRightDiv,
  }

  return (
    <div style={card}>
      <div style={cardTitle}>Built-in Presets</div>
      <div style={cardDesc}>Six presets included in @pyreon/kinetic core. Click to toggle.</div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {Object.keys(shows).map((name) => (
          <button
            type="button"
            style={btn}
            onClick={() => (shows as any)[name].update((v: boolean) => !v)}
          >
            {name}
          </button>
        ))}
      </div>
      <div style={gridRow}>
        {Object.entries(components).map(([name, Comp]) => (
          <div style={{ flex: '1', minWidth: '140px' }}>
            <Comp show={() => (shows as any)[name]()} style={colorBox}>
              {name}
            </Comp>
          </div>
        ))}
      </div>
    </div>
  )
}

function StyleObjectDemo() {
  const show = signal(true)

  return (
    <div style={card}>
      <div style={cardTitle}>Style Object API</div>
      <div style={cardDesc}>
        Build animations inline with .enter(), .enterTo(), .enterTransition() chain methods.
      </div>
      <button type="button" style={btn} onClick={() => show.update((v) => !v)}>
        Toggle
      </button>
      <div style={{ marginTop: '16px' }}>
        <SpringPanel show={() => show()} style={colorBox}>
          Spring scale animation via style objects
        </SpringPanel>
      </div>
    </div>
  )
}

function AppearDemo() {
  const show = signal(true)

  return (
    <div style={card}>
      <div style={cardTitle}>Appear on Mount</div>
      <div style={cardDesc}>
        The <code>appear</code> prop triggers the enter animation on first mount.
      </div>
      <button type="button" style={btn} onClick={() => show.update((v) => !v)}>
        Toggle
      </button>
      <div style={{ marginTop: '16px' }}>
        <FadeDiv show={() => show()} appear style={colorBox}>
          I animated in on mount!
        </FadeDiv>
      </div>
    </div>
  )
}

function UnmountDemo() {
  const showUnmount = signal(true)
  const showHide = signal(true)

  return (
    <div style={card}>
      <div style={cardTitle}>Unmount vs Hide</div>
      <div style={cardDesc}>
        <code>unmount=true</code> removes from DOM. <code>unmount=false</code> sets display:none.
      </div>
      <div style={gridRow}>
        <div style={{ flex: '1' }}>
          <button type="button" style={btn} onClick={() => showUnmount.update((v) => !v)}>
            Toggle unmount
          </button>
          <div style={{ marginTop: '12px' }}>
            <FadeDiv show={() => showUnmount()} style={colorBox}>
              Unmount (removed from DOM)
            </FadeDiv>
          </div>
        </div>
        <div style={{ flex: '1' }}>
          <button type="button" style={btn} onClick={() => showHide.update((v) => !v)}>
            Toggle hide
          </button>
          <div style={{ marginTop: '12px' }}>
            <FadeDiv show={() => showHide()} unmount={false} style={colorBox}>
              Hide (display:none)
            </FadeDiv>
          </div>
        </div>
      </div>
    </div>
  )
}

function LifecycleDemo() {
  const show = signal(true)
  const logs = signal<string[]>([])

  const addLog = (msg: string) => {
    logs.update((prev) => [...prev, `${new Date().toLocaleTimeString()} — ${msg}`])
  }

  return (
    <div style={card}>
      <div style={cardTitle}>Lifecycle Callbacks</div>
      <div style={cardDesc}>
        onEnter, onAfterEnter, onLeave, onAfterLeave fire during transitions.
      </div>
      <button type="button" style={btn} onClick={() => show.update((v) => !v)}>
        Toggle
      </button>
      <button type="button" style={{ ...btn, marginLeft: '8px' }} onClick={() => logs.set([])}>
        Clear log
      </button>
      <div style={{ marginTop: '16px' }}>
        <FadeDiv
          show={() => show()}
          onEnter={() => addLog('onEnter')}
          onAfterEnter={() => addLog('onAfterEnter')}
          onLeave={() => addLog('onLeave')}
          onAfterLeave={() => addLog('onAfterLeave')}
          style={colorBox}
        >
          Watch the log below
        </FadeDiv>
      </div>
      <div style={logBox}>
        {() => (logs().length === 0 ? 'No events yet...' : logs().map((log) => <div>{log}</div>))}
      </div>
    </div>
  )
}

function ChainingDemo() {
  const show = signal(true)

  // Immutable chaining — branching from a base
  const Base = kinetic('div')
    .enter({ opacity: 0 })
    .enterTo({ opacity: 1 })
    .enterTransition('opacity 300ms ease-out')
  const WithSlide = Base.enter({ opacity: 0, transform: 'translateY(20px)' })
    .enterTo({ opacity: 1, transform: 'translateY(0)' })
    .enterTransition('all 300ms ease-out')
  const WithScale = Base.enter({ opacity: 0, transform: 'scale(0.8)' })
    .enterTo({ opacity: 1, transform: 'scale(1)' })
    .enterTransition('all 400ms cubic-bezier(0.34, 1.56, 0.64, 1)')

  return (
    <div style={card}>
      <div style={cardTitle}>Immutable Chaining</div>
      <div style={cardDesc}>
        Chain methods return new components. Branch from a base to create variants.
      </div>
      <button type="button" style={btn} onClick={() => show.update((v) => !v)}>
        Toggle all
      </button>
      <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
        <div style={{ flex: '1' }}>
          <Base show={() => show()} style={colorBox}>
            Base (fade)
          </Base>
        </div>
        <div style={{ flex: '1' }}>
          <WithSlide show={() => show()} style={colorBox}>
            + Slide
          </WithSlide>
        </div>
        <div style={{ flex: '1' }}>
          <WithScale show={() => show()} style={colorBox}>
            + Scale
          </WithScale>
        </div>
      </div>
    </div>
  )
}

function CollapseDemo() {
  const openIndex = signal<number | null>(0)

  const items = [
    {
      title: 'What is Kinetic?',
      content:
        'A CSS-first animation library for Pyreon. Enter/exit transitions, stagger, collapse, and list reconciliation in ~3KB.',
    },
    {
      title: 'How does it work?',
      content:
        'Kinetic delegates interpolation to the CSS transition engine (compositor thread for transform/opacity) and handles orchestration — mount/unmount lifecycle, stagger timing, and height measurement.',
    },
    {
      title: 'What about accessibility?',
      content:
        'Kinetic automatically detects prefers-reduced-motion: reduce. When enabled, animations are skipped instantly — callbacks still fire, but no visual animation occurs.',
    },
    {
      title: 'Can I create custom presets?',
      content:
        'Yes! A preset is just an object with enter/leave styles and transitions. You can also use factories (createFade, createSlide, etc.) for parameterized presets.',
    },
  ]

  return (
    <div style={card}>
      <div style={cardTitle}>Collapse / Accordion</div>
      <div style={cardDesc}>
        Height-based animation with overflow:hidden. Measures scrollHeight automatically.
      </div>
      {items.map((item, i) => (
        <div>
          <button
            type="button"
            style={accordionHeader}
            onClick={() => openIndex.set(openIndex() === i ? null : i)}
          >
            {() => (openIndex() === i ? '\u25BC ' : '\u25B6 ')}
            {item.title}
          </button>
          <AccordionCollapse show={() => openIndex() === i}>
            <div style={accordionContent}>{item.content}</div>
          </AccordionCollapse>
        </div>
      ))}
    </div>
  )
}

function CollapseCustomDemo() {
  const open = signal(false)

  return (
    <div style={card}>
      <div style={cardTitle}>Custom Collapse Easing</div>
      <div style={cardDesc}>Spring-style bounce on expand using cubic-bezier overshoot curve.</div>
      <button type="button" style={btn} onClick={() => open.update((v) => !v)}>
        {() => (open() ? 'Collapse' : 'Expand')}
      </button>
      <div style={{ marginTop: '12px' }}>
        <BouncyCollapse show={() => open()}>
          <div style={accordionContent}>
            This content bounces into view with a spring-like cubic-bezier curve. The height
            transition uses <code>cubic-bezier(0.34, 1.56, 0.64, 1)</code>
            which overshoots before settling.
          </div>
        </BouncyCollapse>
      </div>
    </div>
  )
}

function GroupDemo() {
  const items = signal([
    { id: 1, text: 'Item 1' },
    { id: 2, text: 'Item 2' },
    { id: 3, text: 'Item 3' },
  ])

  const addItem = () => {
    items.update((prev) => [...prev, { id: nextId++, text: `Item ${nextId - 1}` }])
  }

  const removeItem = (id: number) => {
    items.update((prev) => prev.filter((item) => item.id !== id))
  }

  const shuffle = () => {
    items.update((prev) => {
      const arr = [...prev]
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
      }
      return arr
    })
  }

  return (
    <div style={card}>
      <div style={cardTitle}>Group (Key-Based List)</div>
      <div style={cardDesc}>
        Adding a child triggers enter animation. Removing triggers leave + unmount. No show prop
        needed.
      </div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button type="button" style={btnPrimary} onClick={addItem}>
          Add Item
        </button>
        <button type="button" style={btn} onClick={shuffle}>
          Shuffle
        </button>
        <button type="button" style={btnDanger} onClick={() => items.set([])}>
          Clear All
        </button>
      </div>
      <GroupList>
        {() =>
          items().map((item) => (
            <div key={item.id} style={listItem}>
              <span>{item.text}</span>
              <button type="button" style={btn} onClick={() => removeItem(item.id)}>
                Remove
              </button>
            </div>
          ))
        }
      </GroupList>
    </div>
  )
}

function StaggerDemo() {
  const show = signal(true)
  const menuItems = ['Dashboard', 'Analytics', 'Settings', 'Profile', 'Help', 'Logout']

  return (
    <div style={card}>
      <div style={cardTitle}>Stagger</div>
      <div style={cardDesc}>
        Staggered entrance at 75ms intervals. Each child animates in sequence.
      </div>
      <button type="button" style={btn} onClick={() => show.update((v) => !v)}>
        {() => (show() ? 'Hide Menu' : 'Show Menu')}
      </button>
      <div style={{ marginTop: '16px' }}>
        <StaggerMenu show={() => show()}>
          {menuItems.map((item) => (
            <div key={item} style={listItem}>
              <span>{item}</span>
            </div>
          ))}
        </StaggerMenu>
      </div>
    </div>
  )
}

function StaggerReverseDemo() {
  const show = signal(true)

  return (
    <div style={card}>
      <div style={cardTitle}>Stagger with Reverse Leave</div>
      <div style={cardDesc}>
        Items stagger in top-to-bottom, but leave bottom-to-top (reverseLeave: true).
      </div>
      <button type="button" style={btn} onClick={() => show.update((v) => !v)}>
        Toggle
      </button>
      <div style={{ marginTop: '16px' }}>
        <StaggerNotifications show={() => show()}>
          {['New message received', 'File uploaded successfully', 'Settings saved'].map((msg) => (
            <div key={msg} style={{ ...listItem, background: '#f0f7ff', borderColor: '#b8daff' }}>
              {msg}
            </div>
          ))}
        </StaggerNotifications>
      </div>
    </div>
  )
}

function ModalDemo() {
  const open = signal(false)

  return (
    <div style={card}>
      <div style={cardTitle}>Modal Pattern</div>
      <div style={cardDesc}>Backdrop (fade) + Dialog (spring scale) composed together.</div>
      <button type="button" style={btnPrimary} onClick={() => open.set(true)}>
        Open Modal
      </button>
      <Backdrop
        show={() => open()}
        style={{
          position: 'fixed',
          inset: '0',
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: '1000',
        }}
        onClick={() => open.set(false)}
      >
        <Dialog
          show={() => open()}
          style={{
            background: '#fff',
            padding: '32px',
            borderRadius: '12px',
            maxWidth: '420px',
            width: '90%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}
          onClick={(e: Event) => e.stopPropagation()}
        >
          <h3 style={{ margin: '0 0 8px' }}>Modal Title</h3>
          <p style={{ color: '#555', margin: '0 0 24px', lineHeight: '1.6' }}>
            This modal uses a fade backdrop and a spring-scaled dialog. Click outside or the button
            below to close.
          </p>
          <button type="button" style={btnPrimary} onClick={() => open.set(false)}>
            Close
          </button>
        </Dialog>
      </Backdrop>
    </div>
  )
}

function ToastDemo() {
  const toasts = signal<Array<{ id: number; message: string }>>([])

  const addToast = () => {
    const id = toastId++
    const messages = [
      'File saved successfully',
      'New notification',
      'Upload complete',
      'Settings updated',
    ]
    const message = messages[id % messages.length]
    toasts.update((prev) => [...prev, { id, message }])
    setTimeout(() => {
      toasts.update((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }

  return (
    <div style={card}>
      <div style={cardTitle}>Toast Notifications</div>
      <div style={cardDesc}>
        Real-world toast pattern using group mode. Toasts auto-dismiss after 3 seconds.
      </div>
      <button type="button" style={btnPrimary} onClick={addToast}>
        Add Toast
      </button>
      <div style={{ position: 'relative', minHeight: '100px', marginTop: '16px' }}>
        <ToastGroup>
          {() =>
            toasts().map((toast) => (
              <div
                key={toast.id}
                style={{
                  padding: '12px 16px',
                  background: '#198754',
                  color: '#fff',
                  borderRadius: '8px',
                  marginBottom: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>{toast.message}</span>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '18px',
                  }}
                  onClick={() => toasts.update((prev) => prev.filter((t) => t.id !== toast.id))}
                >
                  {'\u00d7'}
                </button>
              </div>
            ))
          }
        </ToastGroup>
      </div>
    </div>
  )
}

function TabsDemo() {
  const activeTab = signal(0)
  const tabs = ['Overview', 'Features', 'API']
  const content = [
    "Kinetic is a CSS-first animation library for Pyreon. It delegates all interpolation to the browser's CSS transition engine.",
    '122 presets, 5 factories, 5 composition utilities. Supports transition, collapse, stagger, and group modes.',
    'kinetic(tag) returns a chainable builder. Use .preset(), .enter(), .collapse(), .stagger(), .group() to configure.',
  ]

  return (
    <div style={card}>
      <div style={cardTitle}>Tab Panels</div>
      <div style={cardDesc}>Cross-fade between tab content using FadeDiv.</div>
      <div
        style={{
          display: 'flex',
          gap: '0',
          marginBottom: '16px',
          borderBottom: '2px solid #e9ecef',
        }}
      >
        {tabs.map((tab, i) => (
          <button
            type="button"
            style={() => ({
              padding: '8px 20px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              borderBottom: activeTab() === i ? '2px solid #0070f3' : '2px solid transparent',
              color: activeTab() === i ? '#0070f3' : '#666',
              marginBottom: '-2px',
            })}
            onClick={() => activeTab.set(i)}
          >
            {tab}
          </button>
        ))}
      </div>
      {content.map((text, i) => (
        <FadeDiv show={() => activeTab() === i}>
          <div style={{ padding: '16px', color: '#555', lineHeight: '1.6' }}>{text}</div>
        </FadeDiv>
      ))}
    </div>
  )
}

function FactoryDemo() {
  const show = signal(true)

  const factories = [
    { name: 'createFade', comp: FactoryFadeUp, desc: 'direction: up, distance: 24' },
    { name: 'createSlide', comp: FactorySlideRight, desc: 'direction: right, distance: 32' },
    { name: 'createScale', comp: FactoryScaleSpring, desc: 'from: 0.5, spring easing' },
    { name: 'createRotate', comp: FactoryRotate, desc: 'degrees: 30, 400ms' },
    { name: 'createBlur', comp: FactoryBlurScale, desc: 'amount: 12, scale: 0.95' },
  ]

  return (
    <div style={card}>
      <div style={cardTitle}>Factories</div>
      <div style={cardDesc}>
        Configurable factory functions for creating custom presets with parameters.
      </div>
      <button type="button" style={btn} onClick={() => show.update((v) => !v)}>
        Toggle all
      </button>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '16px' }}>
        {factories.map(({ name, comp: Comp, desc }) => (
          <div style={{ flex: '1', minWidth: '160px' }}>
            <Comp show={() => show()} style={colorBox}>
              <div style={{ fontSize: '13px', fontWeight: '600' }}>{name}</div>
              <div style={{ fontSize: '11px', marginTop: '4px', opacity: '0.8' }}>{desc}</div>
            </Comp>
          </div>
        ))}
      </div>
    </div>
  )
}

function CompositionDemo() {
  const show = signal(true)

  const compositions = [
    { name: 'compose()', comp: ComposedFadeSlide, desc: 'fade + slideUp merged' },
    { name: 'withDuration()', comp: SlowFade, desc: '800ms enter, 500ms leave' },
    { name: 'withEasing()', comp: SpringEased, desc: 'spring cubic-bezier' },
    { name: 'withDelay()', comp: DelayedFade, desc: '200ms enter delay' },
    { name: 'reverse()', comp: ReversedSlide, desc: 'slideUp enter/leave swapped' },
  ]

  return (
    <div style={card}>
      <div style={cardTitle}>Composition Utilities</div>
      <div style={cardDesc}>
        Compose presets, override timing, easing, delay, or reverse enter/leave.
      </div>
      <button type="button" style={btn} onClick={() => show.update((v) => !v)}>
        Toggle all
      </button>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '16px' }}>
        {compositions.map(({ name, comp: Comp, desc }) => (
          <div style={{ flex: '1', minWidth: '160px' }}>
            <Comp show={() => show()} style={colorBox}>
              <div style={{ fontSize: '13px', fontWeight: '600' }}>{name}</div>
              <div style={{ fontSize: '11px', marginTop: '4px', opacity: '0.8' }}>{desc}</div>
            </Comp>
          </div>
        ))}
      </div>
    </div>
  )
}

function PresetCard(props: { name: string }) {
  const show = signal(true)
  const Comp = presetComponents[props.name]

  if (!Comp) return <div style={presetCardStyle}>{props.name} (not found)</div>

  return (
    <div style={presetCardStyle}>
      <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px', color: '#333' }}>
        {props.name}
      </div>
      <button
        type="button"
        style={{ ...btn, fontSize: '11px', padding: '4px 10px', marginBottom: '8px' }}
        onClick={() => show.update((v) => !v)}
      >
        Toggle
      </button>
      <Comp show={() => show()}>
        <div
          style={{
            padding: '16px 8px',
            background: '#0070f3',
            color: '#fff',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: '500',
          }}
        >
          {props.name}
        </div>
      </Comp>
    </div>
  )
}

function KineticPresetsGallery() {
  const openCategory = signal<string | null>(null)

  return (
    <div style={card}>
      <div style={cardTitle}>All 122 Presets</div>
      <div style={cardDesc}>Click a category to expand and toggle individual presets.</div>
      {PRESET_CATEGORIES.map((cat) => (
        <div>
          <button
            type="button"
            style={accordionHeader}
            onClick={() => openCategory.set(openCategory() === cat.name ? null : cat.name)}
          >
            {() => (openCategory() === cat.name ? '\u25BC ' : '\u25B6 ')}
            {cat.name} ({cat.items.length})
          </button>
          <AccordionCollapse show={() => openCategory() === cat.name}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', padding: '12px 0' }}>
              {cat.items.map((name) => (
                <PresetCard name={name} />
              ))}
            </div>
          </AccordionCollapse>
        </div>
      ))}
    </div>
  )
}

function ToggleAllPresets() {
  const show = signal(true)

  return (
    <div style={card}>
      <div style={cardTitle}>Stress Test: Toggle All 122 Presets</div>
      <div style={cardDesc}>Toggle all preset components simultaneously.</div>
      <button type="button" style={btnPrimary} onClick={() => show.update((v) => !v)}>
        {() => (show() ? 'Hide All' : 'Show All')}
      </button>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '16px' }}>
        {Object.entries(presetComponents).map(([name, Comp]) => (
          <Comp show={() => show()}>
            <div
              style={{
                padding: '6px 10px',
                background: '#0070f3',
                color: '#fff',
                borderRadius: '4px',
                fontSize: '10px',
                whiteSpace: 'nowrap',
              }}
            >
              {name}
            </div>
          </Comp>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export function App() {
  return (
    <div style={wrapper}>
      <span style={badge}>Vite + @pyreon/kinetic</span>
      <h1 style={{ fontSize: '2rem', fontWeight: '700', margin: '8px 0 4px' }}>
        Kinetic Animation Examples
      </h1>
      <p style={{ fontSize: '1rem', color: '#666', margin: '0 0 32px' }}>
        CSS-first animations — enter/exit transitions, stagger, collapse, and list reconciliation
      </p>

      <h2 style={sectionTitle}>Basic Transitions</h2>
      <PresetShowcase />
      <StyleObjectDemo />
      <AppearDemo />
      <UnmountDemo />
      <LifecycleDemo />
      <ChainingDemo />

      <h2 style={sectionTitle}>Collapse</h2>
      <CollapseDemo />
      <CollapseCustomDemo />

      <h2 style={sectionTitle}>Stagger</h2>
      <StaggerDemo />
      <StaggerReverseDemo />

      <h2 style={sectionTitle}>Group (Key-Based Lists)</h2>
      <GroupDemo />

      <h2 style={sectionTitle}>Real-World Patterns</h2>
      <ModalDemo />
      <ToastDemo />
      <TabsDemo />

      <h2 style={sectionTitle}>Factories</h2>
      <FactoryDemo />

      <h2 style={sectionTitle}>Composition Utilities</h2>
      <CompositionDemo />

      <h2 style={sectionTitle}>Preset Gallery</h2>
      <KineticPresetsGallery />
      <ToggleAllPresets />
    </div>
  )
}
