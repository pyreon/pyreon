import type { RouteRecord } from '@pyreon/router'

// Core
import { ButtonDemo } from './demos/ButtonDemo'
import { InputDemo } from './demos/InputDemo'
import { CardDemo } from './demos/CardDemo'
import { AlertDemo } from './demos/AlertDemo'
import { BadgeDemo } from './demos/BadgeDemo'

// Layout
import { StackDemo } from './demos/StackDemo'
import { GroupDemo } from './demos/GroupDemo'
import { DividerDemo } from './demos/DividerDemo'
import { BreadcrumbDemo } from './demos/BreadcrumbDemo'
import { TitleDemo } from './demos/TitleDemo'
import { BoxDemo } from './demos/BoxDemo'
import { CenterDemo } from './demos/CenterDemo'
import { ButtonGroupDemo } from './demos/ButtonGroupDemo'

// Typography
import { ParagraphDemo } from './demos/ParagraphDemo'
import { CodeDemo } from './demos/CodeDemo'
import { HighlightDemo } from './demos/HighlightDemo'
import { KbdDemo } from './demos/KbdDemo'

// Forms
import { CheckboxDemo } from './demos/CheckboxDemo'
import { RadioDemo } from './demos/RadioDemo'
import { SwitchDemo } from './demos/SwitchDemo'
import { SelectDemo } from './demos/SelectDemo'
import { SliderDemo } from './demos/SliderDemo'

// Data Display
import { AvatarDemo } from './demos/AvatarDemo'
import { ChipDemo } from './demos/ChipDemo'
import { ImageDemo } from './demos/ImageDemo'

// Feedback
import { NotificationDemo } from './demos/NotificationDemo'
import { ProgressDemo } from './demos/ProgressDemo'
import { LoaderDemo } from './demos/LoaderDemo'

// Navigation
import { NavLinkDemo } from './demos/NavLinkDemo'
import { AccordionDemo } from './demos/AccordionDemo'
import { TabsDemo } from './demos/TabsDemo'

// Complex
import { CalendarDemo } from './demos/CalendarDemo'
import { ComboboxDemo } from './demos/ComboboxDemo'
import { ModalDemo } from './demos/ModalDemo'
import { TableDemo } from './demos/TableDemo'

export const routes: RouteRecord[] = [
  { path: '/', redirect: '/button', component: () => null },

  // Core
  { path: '/button', component: ButtonDemo },
  { path: '/input', component: InputDemo },
  { path: '/card', component: CardDemo },
  { path: '/alert', component: AlertDemo },
  { path: '/badge', component: BadgeDemo },

  // Layout
  { path: '/stack', component: StackDemo },
  { path: '/group', component: GroupDemo },
  { path: '/divider', component: DividerDemo },
  { path: '/breadcrumb', component: BreadcrumbDemo },
  { path: '/title', component: TitleDemo },
  { path: '/box', component: BoxDemo },
  { path: '/center', component: CenterDemo },
  { path: '/buttongroup', component: ButtonGroupDemo },

  // Typography
  { path: '/paragraph', component: ParagraphDemo },
  { path: '/code', component: CodeDemo },
  { path: '/highlight', component: HighlightDemo },
  { path: '/kbd', component: KbdDemo },

  // Forms
  { path: '/checkbox', component: CheckboxDemo },
  { path: '/radio', component: RadioDemo },
  { path: '/switch', component: SwitchDemo },
  { path: '/select', component: SelectDemo },
  { path: '/slider', component: SliderDemo },

  // Data Display
  { path: '/avatar', component: AvatarDemo },
  { path: '/chip', component: ChipDemo },
  { path: '/image', component: ImageDemo },

  // Feedback
  { path: '/notification', component: NotificationDemo },
  { path: '/progress', component: ProgressDemo },
  { path: '/loader', component: LoaderDemo },

  // Navigation
  { path: '/navlink', component: NavLinkDemo },
  { path: '/accordion', component: AccordionDemo },
  { path: '/tabs', component: TabsDemo },

  // Complex
  { path: '/calendar', component: CalendarDemo },
  { path: '/combobox', component: ComboboxDemo },
  { path: '/modal', component: ModalDemo },
  { path: '/table', component: TableDemo },
]

export const navGroups = [
  {
    label: 'Core',
    items: [
      { path: '/button', label: 'Button' },
      { path: '/input', label: 'Input' },
      { path: '/card', label: 'Card' },
      { path: '/alert', label: 'Alert' },
      { path: '/badge', label: 'Badge' },
    ],
  },
  {
    label: 'Layout',
    items: [
      { path: '/box', label: 'Box' },
      { path: '/stack', label: 'Stack' },
      { path: '/group', label: 'Group' },
      { path: '/center', label: 'Center' },
      { path: '/divider', label: 'Divider' },
      { path: '/breadcrumb', label: 'Breadcrumb' },
      { path: '/buttongroup', label: 'ButtonGroup' },
    ],
  },
  {
    label: 'Typography',
    items: [
      { path: '/title', label: 'Title' },
      { path: '/paragraph', label: 'Paragraph' },
      { path: '/code', label: 'Code' },
      { path: '/highlight', label: 'Highlight' },
      { path: '/kbd', label: 'Kbd' },
    ],
  },
  {
    label: 'Forms',
    items: [
      { path: '/checkbox', label: 'Checkbox' },
      { path: '/radio', label: 'Radio' },
      { path: '/switch', label: 'Switch' },
      { path: '/select', label: 'Select' },
      { path: '/slider', label: 'Slider' },
    ],
  },
  {
    label: 'Data Display',
    items: [
      { path: '/avatar', label: 'Avatar' },
      { path: '/chip', label: 'Chip' },
      { path: '/image', label: 'Image' },
    ],
  },
  {
    label: 'Feedback',
    items: [
      { path: '/notification', label: 'Notification' },
      { path: '/progress', label: 'Progress' },
      { path: '/loader', label: 'Loader' },
    ],
  },
  {
    label: 'Navigation',
    items: [
      { path: '/navlink', label: 'NavLink' },
      { path: '/accordion', label: 'Accordion' },
      { path: '/tabs', label: 'Tabs' },
    ],
  },
  {
    label: 'Complex',
    items: [
      { path: '/calendar', label: 'Calendar' },
      { path: '/combobox', label: 'Combobox' },
      { path: '/modal', label: 'Modal' },
      { path: '/table', label: 'Table' },
    ],
  },
]
