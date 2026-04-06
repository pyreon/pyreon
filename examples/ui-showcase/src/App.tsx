import { signal } from '@pyreon/reactivity'

// Layout
import { BoxDemo } from './demos/BoxDemo'
import { StackDemo } from './demos/StackDemo'
import { GroupDemo } from './demos/GroupDemo'
import { CenterDemo } from './demos/CenterDemo'
import { DividerDemo } from './demos/DividerDemo'
import { SimpleGridDemo } from './demos/SimpleGridDemo'
import { AspectRatioDemo } from './demos/AspectRatioDemo'

// Typography
import { TitleDemo } from './demos/TitleDemo'
import { ParagraphDemo } from './demos/ParagraphDemo'
import { CodeDemo } from './demos/CodeDemo'
import { HighlightDemo } from './demos/HighlightDemo'

// Buttons
import { ButtonDemo } from './demos/ButtonDemo'
import { IconButtonDemo } from './demos/IconButtonDemo'
import { CloseButtonDemo } from './demos/CloseButtonDemo'
import { ActionIconDemo } from './demos/ActionIconDemo'
import { ButtonGroupDemo } from './demos/ButtonGroupDemo'

// Forms
import { FormFieldDemo } from './demos/FormFieldDemo'
import { InputDemo } from './demos/InputDemo'
import { TextareaDemo } from './demos/TextareaDemo'
import { SelectDemo } from './demos/SelectDemo'
import { CheckboxDemo } from './demos/CheckboxDemo'
import { RadioDemo } from './demos/RadioDemo'
import { SwitchDemo } from './demos/SwitchDemo'
import { SliderDemo } from './demos/SliderDemo'
import { NumberInputDemo } from './demos/NumberInputDemo'
import { PinInputDemo } from './demos/PinInputDemo'
import { ComboboxDemo } from './demos/ComboboxDemo'
import { AutocompleteDemo } from './demos/AutocompleteDemo'
import { MultiSelectDemo } from './demos/MultiSelectDemo'
import { FileUploadDemo } from './demos/FileUploadDemo'
import { InputGroupDemo } from './demos/InputGroupDemo'
import { ColorPickerDemo } from './demos/ColorPickerDemo'
import { ColorSwatchDemo } from './demos/ColorSwatchDemo'
import { SegmentedControlDemo } from './demos/SegmentedControlDemo'

// Data Display
import { BadgeDemo } from './demos/BadgeDemo'
import { ChipDemo } from './demos/ChipDemo'
import { CardDemo } from './demos/CardDemo'
import { AvatarDemo } from './demos/AvatarDemo'
import { IndicatorDemo } from './demos/IndicatorDemo'
import { ImageDemo } from './demos/ImageDemo'
import { KbdDemo } from './demos/KbdDemo'
import { TableDemo } from './demos/TableDemo'
import { TimelineDemo } from './demos/TimelineDemo'

// Feedback
import { AlertDemo } from './demos/AlertDemo'
import { NotificationDemo } from './demos/NotificationDemo'
import { ProgressDemo } from './demos/ProgressDemo'
import { LoaderDemo } from './demos/LoaderDemo'
import { SkeletonDemo } from './demos/SkeletonDemo'

// Overlays
import { ModalDemo } from './demos/ModalDemo'
import { DrawerDemo } from './demos/DrawerDemo'
import { DialogDemo } from './demos/DialogDemo'
import { TooltipDemo } from './demos/TooltipDemo'
import { PopoverDemo } from './demos/PopoverDemo'
import { HoverCardDemo } from './demos/HoverCardDemo'
import { MenuDemo } from './demos/MenuDemo'

// Navigation
import { TabsDemo } from './demos/TabsDemo'
import { BreadcrumbDemo } from './demos/BreadcrumbDemo'
import { PaginationDemo } from './demos/PaginationDemo'
import { NavLinkDemo } from './demos/NavLinkDemo'
import { StepperDemo } from './demos/StepperDemo'

// Disclosure
import { AccordionDemo } from './demos/AccordionDemo'
import { SpoilerDemo } from './demos/SpoilerDemo'

// Date & Time
import { CalendarDemo } from './demos/CalendarDemo'
import { DatePickerDemo } from './demos/DatePickerDemo'
import { DateRangePickerDemo } from './demos/DateRangePickerDemo'

// Advanced
import { TreeDemo } from './demos/TreeDemo'
import { VisuallyHiddenDemo } from './demos/VisuallyHiddenDemo'

// Combinations — real-world patterns
import { LoginFormDemo } from './demos/LoginFormDemo'
import { DashboardDemo } from './demos/DashboardDemo'
import { SettingsDemo } from './demos/SettingsDemo'
import { EcommerceDemo } from './demos/EcommerceDemo'
import { NotificationCenterDemo } from './demos/NotificationCenterDemo'
import { UserProfileDemo } from './demos/UserProfileDemo'
import { DataTableDemo } from './demos/DataTableDemo'
import { WizardDemo } from './demos/WizardDemo'

// ─── Navigation structure ────────────────────────────────────────────────────

interface NavItem {
  id: string
  label: string
  component: () => any
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: 'Layout',
    items: [
      { id: 'box', label: 'Box', component: BoxDemo },
      { id: 'stack', label: 'Stack', component: StackDemo },
      { id: 'group', label: 'Group', component: GroupDemo },
      { id: 'center', label: 'Center', component: CenterDemo },
      { id: 'divider', label: 'Divider', component: DividerDemo },
      { id: 'simplegrid', label: 'SimpleGrid', component: SimpleGridDemo },
      { id: 'aspectratio', label: 'AspectRatio', component: AspectRatioDemo },
    ],
  },
  {
    label: 'Typography',
    items: [
      { id: 'title', label: 'Title', component: TitleDemo },
      { id: 'paragraph', label: 'Paragraph', component: ParagraphDemo },
      { id: 'code', label: 'Code', component: CodeDemo },
      { id: 'highlight', label: 'Highlight', component: HighlightDemo },
    ],
  },
  {
    label: 'Buttons',
    items: [
      { id: 'button', label: 'Button', component: ButtonDemo },
      { id: 'iconbutton', label: 'IconButton', component: IconButtonDemo },
      { id: 'closebutton', label: 'CloseButton', component: CloseButtonDemo },
      { id: 'actionicon', label: 'ActionIcon', component: ActionIconDemo },
      { id: 'buttongroup', label: 'ButtonGroup', component: ButtonGroupDemo },
    ],
  },
  {
    label: 'Forms',
    items: [
      { id: 'formfield', label: 'FormField', component: FormFieldDemo },
      { id: 'input', label: 'Input', component: InputDemo },
      { id: 'textarea', label: 'Textarea', component: TextareaDemo },
      { id: 'select', label: 'Select', component: SelectDemo },
      { id: 'checkbox', label: 'Checkbox', component: CheckboxDemo },
      { id: 'radio', label: 'Radio', component: RadioDemo },
      { id: 'switch', label: 'Switch', component: SwitchDemo },
      { id: 'slider', label: 'Slider', component: SliderDemo },
      { id: 'numberinput', label: 'NumberInput', component: NumberInputDemo },
      { id: 'pininput', label: 'PinInput', component: PinInputDemo },
      { id: 'combobox', label: 'Combobox', component: ComboboxDemo },
      { id: 'autocomplete', label: 'Autocomplete', component: AutocompleteDemo },
      { id: 'multiselect', label: 'MultiSelect', component: MultiSelectDemo },
      { id: 'fileupload', label: 'FileUpload', component: FileUploadDemo },
      { id: 'inputgroup', label: 'InputGroup', component: InputGroupDemo },
      { id: 'colorpicker', label: 'ColorPicker', component: ColorPickerDemo },
      { id: 'colorswatch', label: 'ColorSwatch', component: ColorSwatchDemo },
      { id: 'segmented', label: 'SegmentedControl', component: SegmentedControlDemo },
    ],
  },
  {
    label: 'Data Display',
    items: [
      { id: 'badge', label: 'Badge', component: BadgeDemo },
      { id: 'chip', label: 'Chip', component: ChipDemo },
      { id: 'card', label: 'Card', component: CardDemo },
      { id: 'avatar', label: 'Avatar', component: AvatarDemo },
      { id: 'indicator', label: 'Indicator', component: IndicatorDemo },
      { id: 'image', label: 'Image', component: ImageDemo },
      { id: 'kbd', label: 'Kbd', component: KbdDemo },
      { id: 'table', label: 'Table', component: TableDemo },
      { id: 'timeline', label: 'Timeline', component: TimelineDemo },
    ],
  },
  {
    label: 'Feedback',
    items: [
      { id: 'alert', label: 'Alert', component: AlertDemo },
      { id: 'notification', label: 'Notification', component: NotificationDemo },
      { id: 'progress', label: 'Progress', component: ProgressDemo },
      { id: 'loader', label: 'Loader', component: LoaderDemo },
      { id: 'skeleton', label: 'Skeleton', component: SkeletonDemo },
    ],
  },
  {
    label: 'Overlays',
    items: [
      { id: 'modal', label: 'Modal', component: ModalDemo },
      { id: 'drawer', label: 'Drawer', component: DrawerDemo },
      { id: 'dialog', label: 'Dialog', component: DialogDemo },
      { id: 'tooltip', label: 'Tooltip', component: TooltipDemo },
      { id: 'popover', label: 'Popover', component: PopoverDemo },
      { id: 'hovercard', label: 'HoverCard', component: HoverCardDemo },
      { id: 'menu', label: 'Menu', component: MenuDemo },
    ],
  },
  {
    label: 'Navigation',
    items: [
      { id: 'tabs', label: 'Tabs', component: TabsDemo },
      { id: 'breadcrumb', label: 'Breadcrumb', component: BreadcrumbDemo },
      { id: 'pagination', label: 'Pagination', component: PaginationDemo },
      { id: 'navlink', label: 'NavLink', component: NavLinkDemo },
      { id: 'stepper', label: 'Stepper', component: StepperDemo },
    ],
  },
  {
    label: 'Disclosure',
    items: [
      { id: 'accordion', label: 'Accordion', component: AccordionDemo },
      { id: 'spoiler', label: 'Spoiler', component: SpoilerDemo },
    ],
  },
  {
    label: 'Date & Time',
    items: [
      { id: 'calendar', label: 'Calendar', component: CalendarDemo },
      { id: 'datepicker', label: 'DatePicker', component: DatePickerDemo },
      { id: 'daterangepicker', label: 'DateRangePicker', component: DateRangePickerDemo },
    ],
  },
  {
    label: 'Advanced',
    items: [
      { id: 'tree', label: 'Tree', component: TreeDemo },
      { id: 'visuallyhidden', label: 'VisuallyHidden', component: VisuallyHiddenDemo },
    ],
  },
  {
    label: 'Real-World Examples',
    items: [
      { id: 'login', label: 'Login Form', component: LoginFormDemo },
      { id: 'dashboard', label: 'Dashboard', component: DashboardDemo },
      { id: 'settings', label: 'Settings Page', component: SettingsDemo },
      { id: 'ecommerce', label: 'Product Grid', component: EcommerceDemo },
      { id: 'notifications', label: 'Notification Center', component: NotificationCenterDemo },
      { id: 'profile', label: 'User Profile', component: UserProfileDemo },
      { id: 'datatable', label: 'Data Table', component: DataTableDemo },
      { id: 'wizard', label: 'Multi-Step Wizard', component: WizardDemo },
    ],
  },
]

const allItems = navGroups.flatMap((g) => g.items)
const activePage = signal('button')

export function App() {
  const ActiveComponent = () => {
    const item = allItems.find((i) => i.id === activePage())
    return item ? item.component() : null
  }

  return (
    <div style="display: flex; min-height: 100vh;">
      {/* Sidebar */}
      <nav style="width: 240px; border-right: 1px solid #e5e7eb; padding: 16px 0; overflow-y: auto; position: fixed; top: 0; bottom: 0; background: white;">
        <div style="padding: 0 16px 16px; border-bottom: 1px solid #e5e7eb; margin-bottom: 8px;">
          <h1 style="font-size: 18px; font-weight: 700; color: #111827;">Pyreon UI</h1>
          <span style="font-size: 12px; color: #9ca3af;">75 components</span>
        </div>

        {navGroups.map((group) => (
          <div style="margin-bottom: 8px;">
            <div style="padding: 4px 16px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af;">
              {group.label}
            </div>
            {group.items.map((item) => (
              <button
                style={`display: block; width: 100%; text-align: left; padding: 4px 16px 4px 24px; font-size: 13px; border: none; cursor: pointer; background: ${activePage() === item.id ? '#eff6ff' : 'transparent'}; color: ${activePage() === item.id ? '#2563eb' : '#374151'}; font-weight: ${activePage() === item.id ? '500' : '400'};`}
                onClick={() => activePage.set(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* Main content */}
      <main style="margin-left: 240px; flex: 1; padding: 32px 40px; max-width: 900px;">
        {() => <ActiveComponent />}
      </main>
    </div>
  )
}
