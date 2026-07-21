/**
 * Type-export contract for `@pyreon/ui-components` — locks the `<Name>Props`
 * aliases added in src/types.ts.
 *
 * Two layers, both enforced by `tsc --noEmit` (this file is inside the
 * package's typecheck `include`), plus a runtime smoke so `bun run test`
 * exercises the module too:
 *
 * 1. ASSIGNABILITY — a valid dimension value compiles; an invalid literal is
 *    rejected (`@ts-expect-error` — tsc errors on an UNUSED directive, so a
 *    degenerate catch-all type that accepted `state: 'bogus'` would fail the
 *    typecheck, proving the literal unions survive ExtractProps).
 *
 * 2. NON-DEGENERACY — every alias must be a real props object, not
 *    `ExtractProps`' fallback branch (`: T`, the raw component). A degenerate
 *    alias is either the rocketstyle chain (carries `IS_ROCKETSTYLE: true`)
 *    or a bare component function (callable) — `IsDegenerate` flags both.
 *    Each category tuple must extend `false[]`; a `true` anywhere collapses
 *    the conditional to `never` and the `const … = true` line fails to
 *    compile, localizing the failure to its category.
 */
import { describe, expect, it } from 'vitest'
import { Button, Card, Tabs } from '../index'
import type {
  AccordionContentProps,
  AccordionItemProps,
  AccordionProps,
  AccordionTriggerProps,
  ActionIconProps,
  AlertProps,
  AspectRatioProps,
  AutocompleteProps,
  AvatarGroupProps,
  AvatarProps,
  BadgeProps,
  BoxProps,
  BreadcrumbItemProps,
  BreadcrumbProps,
  ButtonGroupProps,
  ButtonProps,
  CalendarProps,
  CardProps,
  CenterProps,
  CheckboxIndicatorProps,
  CheckboxProps,
  ChipProps,
  CloseButtonProps,
  CodeProps,
  ColorPickerProps,
  ColorSwatchProps,
  ComboboxProps,
  DatePickerProps,
  DateRangePickerProps,
  DateTimePickerProps,
  DialogProps,
  DividerProps,
  DrawerProps,
  FieldDescriptionProps,
  FieldErrorProps,
  FieldLabelProps,
  FileUploadProps,
  FormFieldProps,
  GridColProps,
  GridContainerProps,
  GridRowProps,
  GroupProps,
  HighlightProps,
  HoverCardProps,
  IconButtonProps,
  ImageProps,
  IndicatorProps,
  InputGroupProps,
  InputProps,
  KbdProps,
  LoaderProps,
  MenuItemProps,
  MenuProps,
  ModalProps,
  MonthPickerProps,
  MultiSelectProps,
  NavLinkProps,
  NotificationProps,
  NumberInputProps,
  PaginationProps,
  ParagraphProps,
  PinInputCellProps,
  PinInputProps,
  PopoverProps,
  ProgressProps,
  RadioDotProps,
  RadioGroupProps,
  RadioIndicatorProps,
  RadioProps,
  SegmentedControlItemProps,
  SegmentedControlProps,
  SelectProps,
  SkeletonProps,
  SliderProps,
  SpoilerProps,
  SpoilerToggleProps,
  StackProps,
  StepperProps,
  StepProps,
  SwitchProps,
  SwitchThumbProps,
  TableProps,
  TabPanelProps,
  TabProps,
  TabsProps,
  TextareaProps,
  TimelineProps,
  TimePickerProps,
  TitleProps,
  TooltipProps,
  TreeItemProps,
  TreeProps,
  VisuallyHiddenProps,
} from '../index'

// ─── 1. Assignability: valid dimension literals compile ──────────────────────

const buttonOk: ButtonProps = { state: 'primary', size: 'large', variant: 'outline' }

// @ts-expect-error — 'bogus' is not a Button state; the literal union must survive
const buttonBadState: ButtonProps = { state: 'bogus' }

// @ts-expect-error — 'huge' is not a Button size
const buttonBadSize: ButtonProps = { size: 'huge' }

const alertOk: AlertProps = { state: 'error' }
const cardOk: CardProps = {}
const inputOk: InputProps = { state: 'error' }
const tabOk: TabProps = { value: 'tab-1' }
const modalOk: ModalProps = {}

// @ts-expect-error — invalid Alert state literal
const alertBad: AlertProps = { state: 'catastrophic' }

// ─── 2. Non-degeneracy: no alias may be ExtractProps' fallback (the raw
//        component). Degenerate ⇔ carries IS_ROCKETSTYLE (rocketstyle chain)
//        or is callable (bare component function). ──────────────────────────

type IsDegenerate<T> = T extends { IS_ROCKETSTYLE: true }
  ? true
  : T extends (...args: never[]) => unknown
    ? true
    : false

type Ok<T extends false[]> = T extends false[] ? true : never

const layoutOk: Ok<
  [
    IsDegenerate<BoxProps>,
    IsDegenerate<StackProps>,
    IsDegenerate<GroupProps>,
    IsDegenerate<CenterProps>,
    IsDegenerate<DividerProps>,
    IsDegenerate<GridContainerProps>,
    IsDegenerate<GridRowProps>,
    IsDegenerate<GridColProps>,
    IsDegenerate<AspectRatioProps>,
  ]
> = true

const typographyOk: Ok<[IsDegenerate<TitleProps>, IsDegenerate<ParagraphProps>]> = true

const buttonsOk: Ok<
  [
    IsDegenerate<ButtonProps>,
    IsDegenerate<CloseButtonProps>,
    IsDegenerate<IconButtonProps>,
    IsDegenerate<ButtonGroupProps>,
    IsDegenerate<ActionIconProps>,
  ]
> = true

const formsOk: Ok<
  [
    IsDegenerate<FormFieldProps>,
    IsDegenerate<FieldDescriptionProps>,
    IsDegenerate<FieldErrorProps>,
    IsDegenerate<FieldLabelProps>,
    IsDegenerate<InputProps>,
    IsDegenerate<TextareaProps>,
    IsDegenerate<CheckboxProps>,
    IsDegenerate<CheckboxIndicatorProps>,
    IsDegenerate<RadioProps>,
    IsDegenerate<RadioGroupProps>,
    IsDegenerate<RadioIndicatorProps>,
    IsDegenerate<RadioDotProps>,
    IsDegenerate<SwitchProps>,
    IsDegenerate<SwitchThumbProps>,
    IsDegenerate<SelectProps>,
    IsDegenerate<SliderProps>,
  ]
> = true

const dataDisplayOk: Ok<
  [
    IsDegenerate<BadgeProps>,
    IsDegenerate<ChipProps>,
    IsDegenerate<CardProps>,
    IsDegenerate<AvatarProps>,
    IsDegenerate<AvatarGroupProps>,
    IsDegenerate<ImageProps>,
    IsDegenerate<KbdProps>,
    IsDegenerate<TableProps>,
    IsDegenerate<TimelineProps>,
    IsDegenerate<CodeProps>,
    IsDegenerate<HighlightProps>,
  ]
> = true

const feedbackOk: Ok<
  [
    IsDegenerate<AlertProps>,
    IsDegenerate<NotificationProps>,
    IsDegenerate<ProgressProps>,
    IsDegenerate<LoaderProps>,
    IsDegenerate<SkeletonProps>,
    IsDegenerate<IndicatorProps>,
  ]
> = true

const overlaysOk: Ok<
  [
    IsDegenerate<ModalProps>,
    IsDegenerate<DrawerProps>,
    IsDegenerate<DialogProps>,
    IsDegenerate<TooltipProps>,
    IsDegenerate<PopoverProps>,
    IsDegenerate<HoverCardProps>,
    IsDegenerate<MenuProps>,
    IsDegenerate<MenuItemProps>,
  ]
> = true

const navigationOk: Ok<
  [
    IsDegenerate<TabsProps>,
    IsDegenerate<TabProps>,
    IsDegenerate<TabPanelProps>,
    IsDegenerate<BreadcrumbProps>,
    IsDegenerate<BreadcrumbItemProps>,
    IsDegenerate<PaginationProps>,
    IsDegenerate<NavLinkProps>,
    IsDegenerate<StepperProps>,
    IsDegenerate<StepProps>,
  ]
> = true

const disclosureOk: Ok<
  [
    IsDegenerate<AccordionProps>,
    IsDegenerate<AccordionItemProps>,
    IsDegenerate<AccordionTriggerProps>,
    IsDegenerate<AccordionContentProps>,
    IsDegenerate<SpoilerProps>,
    IsDegenerate<SpoilerToggleProps>,
  ]
> = true

const dateTimeOk: Ok<
  [
    IsDegenerate<CalendarProps>,
    IsDegenerate<DatePickerProps>,
    IsDegenerate<DateRangePickerProps>,
    IsDegenerate<TimePickerProps>,
    IsDegenerate<DateTimePickerProps>,
    IsDegenerate<MonthPickerProps>,
  ]
> = true

const advancedInputsOk: Ok<
  [
    IsDegenerate<ComboboxProps>,
    IsDegenerate<AutocompleteProps>,
    IsDegenerate<MultiSelectProps>,
    IsDegenerate<FileUploadProps>,
    IsDegenerate<ColorPickerProps>,
    IsDegenerate<ColorSwatchProps>,
    IsDegenerate<InputGroupProps>,
    IsDegenerate<NumberInputProps>,
    IsDegenerate<PinInputProps>,
    IsDegenerate<PinInputCellProps>,
    IsDegenerate<SegmentedControlProps>,
    IsDegenerate<SegmentedControlItemProps>,
  ]
> = true

const dataOk: Ok<
  [IsDegenerate<TreeProps>, IsDegenerate<TreeItemProps>, IsDegenerate<VisuallyHiddenProps>]
> = true

// ─── Runtime smoke (keeps this a genuine vitest file; the type layer above is
//     enforced by `tsc --noEmit`) ────────────────────────────────────────────

describe('type exports', () => {
  it('typed props objects are plain data usable at runtime', () => {
    expect(buttonOk.state).toBe('primary')
    expect(buttonBadState.state).toBe('bogus')
    expect(buttonBadSize.size).toBe('huge')
    expect(alertOk.state).toBe('error')
    expect(alertBad.state).toBe('catastrophic')
    expect(inputOk.state).toBe('error')
    expect(tabOk.value).toBe('tab-1')
    expect(cardOk).toEqual({})
    expect(modalOk).toEqual({})
  })

  it('the components the aliases derive from are callable', () => {
    expect(typeof Button).toBe('function')
    expect(typeof Card).toBe('function')
    expect(typeof Tabs).toBe('function')
  })

  it('non-degeneracy category assertions all held at compile time', () => {
    for (const flag of [
      layoutOk,
      typographyOk,
      buttonsOk,
      formsOk,
      dataDisplayOk,
      feedbackOk,
      overlaysOk,
      navigationOk,
      disclosureOk,
      dateTimeOk,
      advancedInputsOk,
      dataOk,
    ]) {
      expect(flag).toBe(true)
    }
  })
})
