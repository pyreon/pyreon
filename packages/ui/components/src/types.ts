/**
 * Public prop types for every component exported from `@pyreon/ui-components`.
 *
 * Each alias is derived from the component's own call signature via
 * `ExtractProps<T>` (multi-overload-aware, from `@pyreon/core`), so the
 * types can never drift from the runtime components — dimension props
 * (`state` / `size` / `variant`) keep their literal unions, `.attrs()`
 * defaults stay optional, and `.config({ component: SomeBase })` origins
 * flow the base primitive's props through.
 *
 * Usage:
 * ```ts
 * import type { ButtonProps } from '@pyreon/ui-components'
 * const props: ButtonProps = { state: 'primary', size: 'large' }
 * ```
 *
 * Non-degeneracy (that no alias collapses to the raw rocketstyle chain via
 * `ExtractProps`' fallback branch) is locked by
 * `src/tests/type-exports.test.ts`.
 */
import type { ExtractProps } from '@pyreon/core'

import type Box from './components/Box'
import type Stack from './components/Stack'
import type Group from './components/Group'
import type Center from './components/Center'
import type Divider from './components/Divider'
import type { GridContainer, GridRow, GridCol } from './components/SimpleGrid'
import type AspectRatio from './components/AspectRatio'
import type Title from './components/Title'
import type Paragraph from './components/Paragraph'
import type Button from './components/Button'
import type { CloseButton, IconButton } from './components/Button'
import type ButtonGroup from './components/ButtonGroup'
import type ActionIcon from './components/ActionIcon'
import type Fieldset from './components/Fieldset'
import type { FieldsetLegend } from './components/Fieldset'
import type FormField from './components/FormField'
import type { FieldDescription, FieldError, FieldLabel } from './components/FormField'
import type Input from './components/Input'
import type { Textarea } from './components/Input'
import type PasswordInput from './components/PasswordInput'
import type Checkbox from './components/Checkbox'
import type { CheckboxIndicator } from './components/Checkbox'
import type Radio from './components/Radio'
import type { RadioGroup, RadioIndicator, RadioDot } from './components/Radio'
import type Switch from './components/Switch'
import type { SwitchThumb } from './components/Switch'
import type Select from './components/Select'
import type Slider from './components/Slider'
import type Badge from './components/Badge'
import type Chip from './components/Chip'
import type Card from './components/Card'
import type { CardFooter, CardHeader, CardSection } from './components/Card'
import type Avatar from './components/Avatar'
import type { AvatarGroup } from './components/Avatar'
import type Image from './components/Image'
import type Kbd from './components/Kbd'
import type Table from './components/Table'
import type Timeline from './components/Timeline'
import type { TimelineItem } from './components/Timeline'
import type Code from './components/Code'
import type Highlight from './components/Highlight'
import type Alert from './components/Alert'
import type Notification from './components/Notification'
import type Progress from './components/Progress'
import type Loader from './components/Loader'
import type Skeleton from './components/Skeleton'
import type Indicator from './components/Indicator'
import type Modal from './components/Modal'
import type Drawer from './components/Drawer'
import type Dialog from './components/Dialog'
import type Tooltip from './components/Tooltip'
import type Popover from './components/Popover'
import type HoverCard from './components/HoverCard'
import type Menu from './components/Menu'
import type { MenuItem } from './components/Menu'
import type Tabs from './components/Tabs'
import type { Tab, TabPanel } from './components/Tabs'
import type Breadcrumb from './components/Breadcrumb'
import type { BreadcrumbItem } from './components/Breadcrumb'
import type Pagination from './components/Pagination'
import type { PaginationEllipsis, PaginationItem, PaginationNext, PaginationPrev } from './components/Pagination'
import type NavLink from './components/NavLink'
import type Stepper from './components/Stepper'
import type { Step } from './components/Stepper'
import type Accordion from './components/Accordion'
import type { AccordionItem, AccordionTrigger, AccordionContent } from './components/Accordion'
import type Spoiler from './components/Spoiler'
import type { SpoilerToggle } from './components/Spoiler'
import type Calendar from './components/Calendar'
import type DatePicker from './components/DatePicker'
import type DateRangePicker from './components/DateRangePicker'
import type TimePicker from './components/TimePicker'
import type DateTimePicker from './components/DateTimePicker'
import type MonthPicker from './components/MonthPicker'
import type Combobox from './components/Combobox'
import type Autocomplete from './components/Autocomplete'
import type MultiSelect from './components/MultiSelect'
import type FileUpload from './components/FileUpload'
import type ColorPicker from './components/ColorPicker'
import type ColorSwatch from './components/ColorSwatch'
import type InputGroup from './components/InputGroup'
import type NumberInput from './components/NumberInput'
import type PinInput from './components/PinInput'
import type { PinInputCell } from './components/PinInput'
import type SegmentedControl from './components/SegmentedControl'
import type { SegmentedControlItem } from './components/SegmentedControl'
import type Tree from './components/Tree'
import type { TreeItem } from './components/Tree'
import type VisuallyHidden from './components/VisuallyHidden'

// Layout
export type BoxProps = ExtractProps<typeof Box>
export type StackProps = ExtractProps<typeof Stack>
export type GroupProps = ExtractProps<typeof Group>
export type CenterProps = ExtractProps<typeof Center>
export type DividerProps = ExtractProps<typeof Divider>
export type GridContainerProps = ExtractProps<typeof GridContainer>
export type GridRowProps = ExtractProps<typeof GridRow>
export type GridColProps = ExtractProps<typeof GridCol>
export type AspectRatioProps = ExtractProps<typeof AspectRatio>

// Typography
export type TitleProps = ExtractProps<typeof Title>
export type ParagraphProps = ExtractProps<typeof Paragraph>

// Buttons
export type ButtonProps = ExtractProps<typeof Button>
export type CloseButtonProps = ExtractProps<typeof CloseButton>
export type IconButtonProps = ExtractProps<typeof IconButton>
export type ButtonGroupProps = ExtractProps<typeof ButtonGroup>
export type ActionIconProps = ExtractProps<typeof ActionIcon>

// Forms
export type FieldsetProps = ExtractProps<typeof Fieldset>
export type FieldsetLegendProps = ExtractProps<typeof FieldsetLegend>
export type PasswordInputProps = ExtractProps<typeof PasswordInput>
export type FormFieldProps = ExtractProps<typeof FormField>
export type FieldDescriptionProps = ExtractProps<typeof FieldDescription>
export type FieldErrorProps = ExtractProps<typeof FieldError>
export type FieldLabelProps = ExtractProps<typeof FieldLabel>
export type InputProps = ExtractProps<typeof Input>
export type TextareaProps = ExtractProps<typeof Textarea>
export type CheckboxProps = ExtractProps<typeof Checkbox>
export type CheckboxIndicatorProps = ExtractProps<typeof CheckboxIndicator>
export type RadioProps = ExtractProps<typeof Radio>
export type RadioGroupProps = ExtractProps<typeof RadioGroup>
export type RadioIndicatorProps = ExtractProps<typeof RadioIndicator>
export type RadioDotProps = ExtractProps<typeof RadioDot>
export type SwitchProps = ExtractProps<typeof Switch>
export type SwitchThumbProps = ExtractProps<typeof SwitchThumb>
export type SelectProps = ExtractProps<typeof Select>
export type SliderProps = ExtractProps<typeof Slider>

// Data Display
export type BadgeProps = ExtractProps<typeof Badge>
export type ChipProps = ExtractProps<typeof Chip>
export type CardProps = ExtractProps<typeof Card>
export type CardFooterProps = ExtractProps<typeof CardFooter>
export type CardHeaderProps = ExtractProps<typeof CardHeader>
export type CardSectionProps = ExtractProps<typeof CardSection>
export type AvatarProps = ExtractProps<typeof Avatar>
export type AvatarGroupProps = ExtractProps<typeof AvatarGroup>
export type ImageProps = ExtractProps<typeof Image>
export type KbdProps = ExtractProps<typeof Kbd>
export type TableProps = ExtractProps<typeof Table>
export type TimelineProps = ExtractProps<typeof Timeline>
export type TimelineItemProps = ExtractProps<typeof TimelineItem>
export type CodeProps = ExtractProps<typeof Code>
export type HighlightProps = ExtractProps<typeof Highlight>

// Feedback
export type AlertProps = ExtractProps<typeof Alert>
export type NotificationProps = ExtractProps<typeof Notification>
export type ProgressProps = ExtractProps<typeof Progress>
export type LoaderProps = ExtractProps<typeof Loader>
export type SkeletonProps = ExtractProps<typeof Skeleton>

// Indicators
export type IndicatorProps = ExtractProps<typeof Indicator>

// Overlays
export type ModalProps = ExtractProps<typeof Modal>
export type DrawerProps = ExtractProps<typeof Drawer>
export type DialogProps = ExtractProps<typeof Dialog>
export type TooltipProps = ExtractProps<typeof Tooltip>
export type PopoverProps = ExtractProps<typeof Popover>
export type HoverCardProps = ExtractProps<typeof HoverCard>
export type MenuProps = ExtractProps<typeof Menu>
export type MenuItemProps = ExtractProps<typeof MenuItem>

// Navigation
export type TabsProps = ExtractProps<typeof Tabs>
export type TabProps = ExtractProps<typeof Tab>
export type TabPanelProps = ExtractProps<typeof TabPanel>
export type BreadcrumbProps = ExtractProps<typeof Breadcrumb>
export type BreadcrumbItemProps = ExtractProps<typeof BreadcrumbItem>
export type PaginationProps = ExtractProps<typeof Pagination>
export type PaginationEllipsisProps = ExtractProps<typeof PaginationEllipsis>
export type PaginationItemProps = ExtractProps<typeof PaginationItem>
export type PaginationNextProps = ExtractProps<typeof PaginationNext>
export type PaginationPrevProps = ExtractProps<typeof PaginationPrev>
export type NavLinkProps = ExtractProps<typeof NavLink>
export type StepperProps = ExtractProps<typeof Stepper>
export type StepProps = ExtractProps<typeof Step>

// Disclosure
export type AccordionProps = ExtractProps<typeof Accordion>
export type AccordionItemProps = ExtractProps<typeof AccordionItem>
export type AccordionTriggerProps = ExtractProps<typeof AccordionTrigger>
export type AccordionContentProps = ExtractProps<typeof AccordionContent>
export type SpoilerProps = ExtractProps<typeof Spoiler>
export type SpoilerToggleProps = ExtractProps<typeof SpoilerToggle>

// Date & Time
export type CalendarProps = ExtractProps<typeof Calendar>
export type DatePickerProps = ExtractProps<typeof DatePicker>
export type DateRangePickerProps = ExtractProps<typeof DateRangePicker>
export type TimePickerProps = ExtractProps<typeof TimePicker>
export type DateTimePickerProps = ExtractProps<typeof DateTimePicker>
export type MonthPickerProps = ExtractProps<typeof MonthPicker>

// Advanced Inputs
export type ComboboxProps = ExtractProps<typeof Combobox>
export type AutocompleteProps = ExtractProps<typeof Autocomplete>
export type MultiSelectProps = ExtractProps<typeof MultiSelect>
export type FileUploadProps = ExtractProps<typeof FileUpload>
export type ColorPickerProps = ExtractProps<typeof ColorPicker>
export type ColorSwatchProps = ExtractProps<typeof ColorSwatch>
export type InputGroupProps = ExtractProps<typeof InputGroup>
export type NumberInputProps = ExtractProps<typeof NumberInput>
export type PinInputProps = ExtractProps<typeof PinInput>
export type PinInputCellProps = ExtractProps<typeof PinInputCell>
export type SegmentedControlProps = ExtractProps<typeof SegmentedControl>
export type SegmentedControlItemProps = ExtractProps<typeof SegmentedControlItem>

// Data
export type TreeProps = ExtractProps<typeof Tree>
export type TreeItemProps = ExtractProps<typeof TreeItem>

// Accessibility
export type VisuallyHiddenProps = ExtractProps<typeof VisuallyHidden>
