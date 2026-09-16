import { h, type VNodeChild } from '@pyreon/core'
import { theme } from '@pyreon/ui-theme'
import { PyreonUI } from '@pyreon/ui-core'
import type {
  CalendarState,
  ColorPickerState,
  ComboboxState,
  FileUploadState,
  PinInputState,
  SpoilerState,
} from '@pyreon/ui-primitives'
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  BreadcrumbItem,
  Button,
  MenuItem,
  PaginationItem,
  PaginationNext,
  PaginationPrev,
  PinInputCell,
  Radio,
  SegmentedControlItem,
  SpoilerToggle,
  Step,
  Tab,
  TabList,
  TabPanel,
  TimelineItem,
} from './src'

/**
 * Atlas configuration for `@pyreon/ui-components`.
 *
 * `theme` is what makes the rocketstyle chains readable at all: a chain's
 * dimension VALUES (`state: primary | secondary | …`) live inside
 * `.states((t) => …)` callbacks, so they are data, not types — the only way to
 * know them is to run the chain against a real theme.
 *
 * `wrapper` is a COMPONENT, not a function of children. Writing it as
 * `(children) => h(PyreonUI, …, children)` type-checks against `unknown` and
 * is wrong: Atlas mounts it as a component, so the parameter receives the
 * PROPS OBJECT, which then reaches `h()` as a child and produces
 * `Component <PyreonUI> returned an invalid value` on every scenario.
 */

// A render-prop child is a FUNCTION, so `h` runs per mount — every mount gets
// fresh vnodes, and the same scenario can be mounted by the scan, hydrated by
// the parity check, and re-rendered by the canvas without sharing a tree.
const any = (c: unknown) => c as never

const LONG =
  'Pyreon components run once and stay reactive through signals. This paragraph is long enough to need a ' +
  'spoiler: it keeps going past the collapsed height so the toggle has something to reveal, and then a little ' +
  'further still, because a spoiler with nothing hidden is just a paragraph.'

const FRUIT = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry', disabled: true },
  { value: 'date', label: 'Date' },
]

/** The body a combobox-family base renders — input + listbox, WAI-ARIA wired by the base. */
const comboBody = (s: ComboboxState): VNodeChild =>
  h('div', { style: 'position:relative;min-width:240px' }, [
    h('input', s.inputProps()),
    h('ul', { ...s.listboxProps(), style: 'margin:4px 0 0;padding:4px;list-style:none' }, () =>
      s.filtered().map((o, i) => h('li', s.getOptionProps(o.value, i), o.label)),
    ),
  ])

/**
 * Authored scenarios. Derivation seeds content by the tag a component renders
 * as — a `<button>` gets a label, an `<img>` a source — but a base that takes
 * a RENDER-PROP child (`children: (state) => …`) or DATA (`options`, `data`,
 * `rows`) renders nothing without it, and no seed can invent that shape. These
 * supply it. An authored `Default` is the state the canvas opens on; authored
 * args merge OVER the derived seed, key by key.
 */
const scenarios = {
  Tree: [
    {
      name: 'Default',
      args: {
        data: [
          {
            id: 'src',
            label: 'src',
            children: [
              { id: 'components', label: 'components', children: [{ id: 'button', label: 'Button.tsx' }] },
              { id: 'index', label: 'index.ts' },
            ],
          },
          { id: 'readme', label: 'README.md' },
        ],
        defaultExpanded: ['src', 'components'],
        'aria-label': 'Files',
      },
    },
  ],
  Combobox: [{ name: 'Default', args: { placeholder: 'Pick a fruit', options: FRUIT } }],
  ComboboxStyled: [
    { name: 'Default', args: { options: FRUIT, placeholder: 'Pick a fruit', children: comboBody } },
  ],
  Autocomplete: [
    { name: 'Default', args: { options: FRUIT, placeholder: 'Search fruit…', children: comboBody } },
  ],
  MultiSelect: [
    { name: 'Default', args: { options: FRUIT, defaultValue: ['apple', 'date'], children: comboBody } },
  ],
  TagsInput: [{ name: 'Default', args: { defaultValue: ['pyreon', 'signals'] } }],
  RangeSlider: [{ name: 'Default', args: { defaultValue: [20, 60], min: 0, max: 100, 'aria-label': 'Price range' } }],
  RingProgress: [{ name: 'Default', args: { value: 65, 'aria-label': 'Upload progress', children: '65%' } }],
  Spoiler: [
    {
      name: 'Default',
      args: {
        maxHeight: 48,
        children: (s: SpoilerState) =>
          h('div', s.rootProps(), [
            h('div', s.clipProps(), h('p', { ...s.contentProps(), style: 'margin:0;max-width:420px' }, LONG)),
            h(any(SpoilerToggle), s.toggleProps(), () => (s.expanded() ? 'Show less' : 'Show more')),
          ]),
      },
    },
  ],
  PinInput: [
    {
      name: 'Default',
      args: {
        length: 4,
        defaultValue: '12',
        'aria-label': 'One-time code',
        children: (s: PinInputState) =>
          h('div', { ...s.rootProps(), style: 'display:flex;gap:8px' }, Array.from({ length: 4 }, (_, i) => h(any(PinInputCell), s.getCellProps(i)))),
      },
    },
  ],
  Calendar: [
    {
      name: 'Default',
      args: {
        // A FIXED month, so the snapshot and the docs are stable — `today` is
        // still marked by the base, but the grid never rolls over.
        defaultValue: { year: 2026, month: 2, day: 14 },
        'aria-label': 'Pick a date',
        children: (s: CalendarState & {
          rootProps: () => Record<string, unknown>
          gridProps: () => Record<string, unknown>
          rowProps: Record<string, unknown>
          columnHeaderProps: Record<string, unknown>
          getDayProps: (day: { date: { day: number } }) => Record<string, unknown>
        }) =>
          h('div', { ...s.rootProps(), style: 'display:inline-block;padding:12px' }, [
            h('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px' }, [
              h('button', { type: 'button', 'aria-label': 'Previous month', onClick: () => s.prevMonth() }, '‹'),
              h('strong', {}, () => s.monthLabel()),
              h('button', { type: 'button', 'aria-label': 'Next month', onClick: () => s.nextMonth() }, '›'),
            ]),
            h('table', { ...s.gridProps(), style: 'border-collapse:collapse;text-align:center' }, [
              h('thead', {}, h('tr', s.rowProps, s.weekdays().map((d) => h('th', { ...s.columnHeaderProps, style: 'padding:4px 6px;font-weight:600' }, d)))),
              h('tbody', {}, () =>
                s.days().map((week) =>
                  h('tr', s.rowProps, week.map((day) => h('td', { style: 'padding:0' }, h('button', { ...s.getDayProps(day), type: 'button', style: `width:32px;height:32px;border:0;background:${day.isSelected ? '#3b82f6' : 'transparent'};color:${day.isSelected ? '#fff' : day.isCurrentMonth ? 'inherit' : '#999'};border-radius:6px` }, String(day.date.day))))),
                ),
              ),
            ]),
          ]),
      },
    },
  ],
  ColorPicker: [
    {
      name: 'Default',
      args: {
        defaultValue: '#3b82f6',
        children: (s: ColorPickerState) =>
          h('div', { ...s.groupProps(), style: 'display:flex;align-items:center;gap:12px' }, [
            h('div', { 'aria-hidden': 'true', style: () => `width:48px;height:48px;border-radius:8px;background:${s.hex()}` }),
            h('input', { type: 'text', 'aria-label': 'Hex colour', value: () => s.hex(), onInput: (e: Event) => s.setHex((e.target as HTMLInputElement).value) }),
            h('input', { type: 'range', ...s.hueSliderProps(), 'aria-label': 'Hue' }),
          ]),
      },
    },
  ],
  FileUpload: [
    {
      name: 'Default',
      args: {
        label: 'Attachments',
        accept: ['image/*', '.pdf'],
        // The hidden `<input>` is a SIBLING of the drop zone, not a child: the
        // zone's click opens the picker by clicking the input, and an input
        // inside the zone would bubble that click straight back into the zone.
        children: (s: FileUploadState) =>
          h('div', { style: 'min-width:280px' }, [
            h('div', { ...s.dropZoneProps, style: 'padding:24px;border:2px dashed #999;border-radius:8px;text-align:center' }, [
              h('p', { style: 'margin:0 0 8px' }, 'Drop files here'),
              h('p', { style: 'margin:0;font-size:12px' }, () => `${s.files().length} file(s) selected`),
            ]),
            h('input', { ...s.inputProps, ref: s.inputRef }),
          ]),
      },
    },
  ],
  Dialog: [{ name: 'Default', args: { open: true, 'aria-label': 'Confirm', children: 'Delete this project? This cannot be undone.' } }],
  Modal: [{ name: 'Default', args: { open: true, 'aria-label': 'Settings', children: 'Modal body' } }],
  Drawer: [{ name: 'Default', args: { open: true, 'aria-label': 'Navigation', children: 'Drawer body' } }],
  Select: [
    {
      name: 'Default',
      args: {
        'aria-label': 'Fruit',
        children: () => FRUIT.map((o) => h('option', { value: o.value, disabled: o.disabled }, o.label)),
      },
    },
  ],
  Table: [
    {
      name: 'Default',
      args: {
        children: () => [
          h('thead', {}, h('tr', {}, ['Item', 'Qty', 'Price'].map((c) => h('th', { style: 'text-align:left;padding:6px 8px' }, c)))),
          h(
            'tbody',
            {},
            [
              ['Keyboard', '1', '$89'],
              ['Monitor', '2', '$540'],
              ['Cable', '4', '$24'],
            ].map((row) => h('tr', {}, row.map((c) => h('td', { style: 'padding:6px 8px' }, c)))),
          ),
        ],
      },
    },
  ],
  Tabs: [
    {
      name: 'Default',
      args: {
        defaultValue: 'overview',
        children: () => [
          h(any(TabList), { 'aria-label': 'Sections' }, [
            h(any(Tab), { value: 'overview' }, 'Overview'),
            h(any(Tab), { value: 'features' }, 'Features'),
            h(any(Tab), { value: 'pricing' }, 'Pricing'),
          ]),
          h(any(TabPanel), { value: 'overview' }, 'Welcome to the overview panel.'),
          h(any(TabPanel), { value: 'features' }, 'Signals, rocketstyle, SSR — and more.'),
          h(any(TabPanel), { value: 'pricing' }, 'Open source, free to use.'),
        ],
      },
    },
  ],
  Accordion: [
    {
      name: 'Default',
      args: {
        defaultValue: 'what',
        children: () => [
          h(any(AccordionItem), { value: 'what' }, [
            h(any(AccordionTrigger), {}, 'What is Pyreon?'),
            h(any(AccordionContent), {}, 'A signal-based UI framework: components run once, the DOM updates itself.'),
          ]),
          h(any(AccordionItem), { value: 'why' }, [
            h(any(AccordionTrigger), {}, 'Why rocketstyle?'),
            h(any(AccordionContent), {}, 'Styling as a chain of dimensions — states, sizes, variants — with one theme.'),
          ]),
        ],
      },
    },
  ],
  Menu: [
    {
      name: 'Default',
      args: {
        'aria-label': 'Actions',
        children: () => [
          h(any(MenuItem), {}, 'Rename'),
          h(any(MenuItem), {}, 'Duplicate'),
          h(any(MenuItem), { state: 'danger' }, 'Delete'),
        ],
      },
    },
  ],
  Stepper: [
    {
      name: 'Default',
      args: {
        children: () => [
          h(any(Step), { state: 'completed' }, 'Account'),
          h(any(Step), { state: 'active' }, 'Payment'),
          h(any(Step), {}, 'Review'),
        ],
      },
    },
  ],
  Timeline: [
    {
      name: 'Default',
      args: {
        children: () => [
          h(any(TimelineItem), { state: 'completed' }, 'Order placed'),
          h(any(TimelineItem), { state: 'completed' }, 'Shipped'),
          h(any(TimelineItem), {}, 'Delivered'),
        ],
      },
    },
  ],
  Pagination: [
    {
      name: 'Default',
      args: {
        children: () => [
          h(any(PaginationPrev), {}, '‹'),
          h(any(PaginationItem), {}, '1'),
          h(any(PaginationItem), { state: 'active' }, '2'),
          h(any(PaginationItem), {}, '3'),
          h(any(PaginationNext), {}, '›'),
        ],
      },
    },
  ],
  Breadcrumb: [
    {
      name: 'Default',
      args: {
        children: () => [
          h(any(BreadcrumbItem), {}, 'Home'),
          h(any(BreadcrumbItem), {}, 'Projects'),
          h(any(BreadcrumbItem), { 'aria-current': 'page' }, 'Atlas'),
        ],
      },
    },
  ],
  SegmentedControl: [
    {
      name: 'Default',
      args: {
        children: () => [
          h(any(SegmentedControlItem), { state: 'active' }, 'Day'),
          h(any(SegmentedControlItem), {}, 'Week'),
          h(any(SegmentedControlItem), {}, 'Month'),
        ],
      },
    },
  ],
  RadioGroup: [
    {
      name: 'Default',
      args: {
        'aria-label': 'Plan',
        children: () => [
          h(any(Radio), { value: 'free' }, 'Free'),
          h(any(Radio), { value: 'pro' }, 'Pro'),
          h(any(Radio), { value: 'team' }, 'Team'),
        ],
      },
    },
  ],
  ButtonGroup: [
    {
      name: 'Default',
      args: {
        children: () => [
          h(any(Button), { variant: 'outline' }, 'Cancel'),
          h(any(Button), {}, 'Save'),
        ],
      },
    },
  ],
}

export default {
  theme,
  wrapper: (props: { children?: unknown }) => h(PyreonUI, { theme }, props.children),
  scenarios,
  /**
   * Overlays return `null` on the server, and a Node scan evaluates
   * `isServer` before any DOM exists — so their empty render there is the
   * harness's, not theirs. `atlas verify-browser` judges them.
   */
  browserOnly: ['Dialog', 'Drawer', 'Modal'],
  /** Parts render nothing alone; the canvas shows them inside their parent. */
  parts: {
    TabPanel: 'Tabs',
    Tab: 'Tabs',
    TabList: 'Tabs',
    AccordionContent: 'Accordion',
    AccordionItem: 'Accordion',
    AccordionTrigger: 'Accordion',
    CheckboxIndicator: 'Checkbox',
    RadioIndicator: 'Radio',
    RadioDot: 'Radio',
    SwitchThumb: 'Switch',
  },
}
