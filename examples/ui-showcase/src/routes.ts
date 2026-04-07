import type { RouteRecord } from '@pyreon/router'

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

// Combinations
import { LoginFormDemo } from './demos/LoginFormDemo'
import { DashboardDemo } from './demos/DashboardDemo'
import { SettingsDemo } from './demos/SettingsDemo'
import { EcommerceDemo } from './demos/EcommerceDemo'
import { NotificationCenterDemo } from './demos/NotificationCenterDemo'
import { UserProfileDemo } from './demos/UserProfileDemo'
import { DataTableDemo } from './demos/DataTableDemo'
import { WizardDemo } from './demos/WizardDemo'

export const routes: RouteRecord[] = [
  { path: '/', redirect: '/button' },

  // Layout
  { path: '/box', component: BoxDemo },
  { path: '/stack', component: StackDemo },
  { path: '/group', component: GroupDemo },
  { path: '/center', component: CenterDemo },
  { path: '/divider', component: DividerDemo },
  { path: '/simplegrid', component: SimpleGridDemo },
  { path: '/aspectratio', component: AspectRatioDemo },

  // Typography
  { path: '/title', component: TitleDemo },
  { path: '/paragraph', component: ParagraphDemo },
  { path: '/code', component: CodeDemo },
  { path: '/highlight', component: HighlightDemo },

  // Buttons
  { path: '/button', component: ButtonDemo },
  { path: '/iconbutton', component: IconButtonDemo },
  { path: '/closebutton', component: CloseButtonDemo },
  { path: '/actionicon', component: ActionIconDemo },
  { path: '/buttongroup', component: ButtonGroupDemo },

  // Forms
  { path: '/formfield', component: FormFieldDemo },
  { path: '/input', component: InputDemo },
  { path: '/textarea', component: TextareaDemo },
  { path: '/select', component: SelectDemo },
  { path: '/checkbox', component: CheckboxDemo },
  { path: '/radio', component: RadioDemo },
  { path: '/switch', component: SwitchDemo },
  { path: '/slider', component: SliderDemo },
  { path: '/numberinput', component: NumberInputDemo },
  { path: '/pininput', component: PinInputDemo },
  { path: '/combobox', component: ComboboxDemo },
  { path: '/autocomplete', component: AutocompleteDemo },
  { path: '/multiselect', component: MultiSelectDemo },
  { path: '/fileupload', component: FileUploadDemo },
  { path: '/inputgroup', component: InputGroupDemo },
  { path: '/colorpicker', component: ColorPickerDemo },
  { path: '/colorswatch', component: ColorSwatchDemo },
  { path: '/segmented', component: SegmentedControlDemo },

  // Data Display
  { path: '/badge', component: BadgeDemo },
  { path: '/chip', component: ChipDemo },
  { path: '/card', component: CardDemo },
  { path: '/avatar', component: AvatarDemo },
  { path: '/indicator', component: IndicatorDemo },
  { path: '/image', component: ImageDemo },
  { path: '/kbd', component: KbdDemo },
  { path: '/table', component: TableDemo },
  { path: '/timeline', component: TimelineDemo },

  // Feedback
  { path: '/alert', component: AlertDemo },
  { path: '/notification', component: NotificationDemo },
  { path: '/progress', component: ProgressDemo },
  { path: '/loader', component: LoaderDemo },
  { path: '/skeleton', component: SkeletonDemo },

  // Overlays
  { path: '/modal', component: ModalDemo },
  { path: '/drawer', component: DrawerDemo },
  { path: '/dialog', component: DialogDemo },
  { path: '/tooltip', component: TooltipDemo },
  { path: '/popover', component: PopoverDemo },
  { path: '/hovercard', component: HoverCardDemo },
  { path: '/menu', component: MenuDemo },

  // Navigation
  { path: '/tabs', component: TabsDemo },
  { path: '/breadcrumb', component: BreadcrumbDemo },
  { path: '/pagination', component: PaginationDemo },
  { path: '/navlink', component: NavLinkDemo },
  { path: '/stepper', component: StepperDemo },

  // Disclosure
  { path: '/accordion', component: AccordionDemo },
  { path: '/spoiler', component: SpoilerDemo },

  // Date & Time
  { path: '/calendar', component: CalendarDemo },
  { path: '/datepicker', component: DatePickerDemo },
  { path: '/daterangepicker', component: DateRangePickerDemo },

  // Advanced
  { path: '/tree', component: TreeDemo },
  { path: '/visuallyhidden', component: VisuallyHiddenDemo },

  // Combinations
  { path: '/login', component: LoginFormDemo },
  { path: '/dashboard', component: DashboardDemo },
  { path: '/settings', component: SettingsDemo },
  { path: '/ecommerce', component: EcommerceDemo },
  { path: '/notifications', component: NotificationCenterDemo },
  { path: '/profile', component: UserProfileDemo },
  { path: '/datatable', component: DataTableDemo },
  { path: '/wizard', component: WizardDemo },
]

/** Navigation structure for the sidebar. */
export const navGroups = [
  { label: 'Layout', items: [
    { path: '/box', label: 'Box' }, { path: '/stack', label: 'Stack' }, { path: '/group', label: 'Group' },
    { path: '/center', label: 'Center' }, { path: '/divider', label: 'Divider' },
    { path: '/simplegrid', label: 'SimpleGrid' }, { path: '/aspectratio', label: 'AspectRatio' },
  ]},
  { label: 'Typography', items: [
    { path: '/title', label: 'Title' }, { path: '/paragraph', label: 'Paragraph' },
    { path: '/code', label: 'Code' }, { path: '/highlight', label: 'Highlight' },
  ]},
  { label: 'Buttons', items: [
    { path: '/button', label: 'Button' }, { path: '/iconbutton', label: 'IconButton' },
    { path: '/closebutton', label: 'CloseButton' }, { path: '/actionicon', label: 'ActionIcon' },
    { path: '/buttongroup', label: 'ButtonGroup' },
  ]},
  { label: 'Forms', items: [
    { path: '/formfield', label: 'FormField' }, { path: '/input', label: 'Input' },
    { path: '/textarea', label: 'Textarea' }, { path: '/select', label: 'Select' },
    { path: '/checkbox', label: 'Checkbox' }, { path: '/radio', label: 'Radio' },
    { path: '/switch', label: 'Switch' }, { path: '/slider', label: 'Slider' },
    { path: '/numberinput', label: 'NumberInput' }, { path: '/pininput', label: 'PinInput' },
    { path: '/combobox', label: 'Combobox' }, { path: '/autocomplete', label: 'Autocomplete' },
    { path: '/multiselect', label: 'MultiSelect' }, { path: '/fileupload', label: 'FileUpload' },
    { path: '/inputgroup', label: 'InputGroup' }, { path: '/colorpicker', label: 'ColorPicker' },
    { path: '/colorswatch', label: 'ColorSwatch' }, { path: '/segmented', label: 'SegmentedControl' },
  ]},
  { label: 'Data Display', items: [
    { path: '/badge', label: 'Badge' }, { path: '/chip', label: 'Chip' }, { path: '/card', label: 'Card' },
    { path: '/avatar', label: 'Avatar' }, { path: '/indicator', label: 'Indicator' },
    { path: '/image', label: 'Image' }, { path: '/kbd', label: 'Kbd' },
    { path: '/table', label: 'Table' }, { path: '/timeline', label: 'Timeline' },
  ]},
  { label: 'Feedback', items: [
    { path: '/alert', label: 'Alert' }, { path: '/notification', label: 'Notification' },
    { path: '/progress', label: 'Progress' }, { path: '/loader', label: 'Loader' },
    { path: '/skeleton', label: 'Skeleton' },
  ]},
  { label: 'Overlays', items: [
    { path: '/modal', label: 'Modal' }, { path: '/drawer', label: 'Drawer' },
    { path: '/dialog', label: 'Dialog' }, { path: '/tooltip', label: 'Tooltip' },
    { path: '/popover', label: 'Popover' }, { path: '/hovercard', label: 'HoverCard' },
    { path: '/menu', label: 'Menu' },
  ]},
  { label: 'Navigation', items: [
    { path: '/tabs', label: 'Tabs' }, { path: '/breadcrumb', label: 'Breadcrumb' },
    { path: '/pagination', label: 'Pagination' }, { path: '/navlink', label: 'NavLink' },
    { path: '/stepper', label: 'Stepper' },
  ]},
  { label: 'Disclosure', items: [
    { path: '/accordion', label: 'Accordion' }, { path: '/spoiler', label: 'Spoiler' },
  ]},
  { label: 'Date & Time', items: [
    { path: '/calendar', label: 'Calendar' }, { path: '/datepicker', label: 'DatePicker' },
    { path: '/daterangepicker', label: 'DateRangePicker' },
  ]},
  { label: 'Advanced', items: [
    { path: '/tree', label: 'Tree' }, { path: '/visuallyhidden', label: 'VisuallyHidden' },
  ]},
  { label: 'Real-World Examples', items: [
    { path: '/login', label: 'Login Form' }, { path: '/dashboard', label: 'Dashboard' },
    { path: '/settings', label: 'Settings Page' }, { path: '/ecommerce', label: 'Product Grid' },
    { path: '/notifications', label: 'Notification Center' }, { path: '/profile', label: 'User Profile' },
    { path: '/datatable', label: 'Data Table' }, { path: '/wizard', label: 'Multi-Step Wizard' },
  ]},
]
