import { initTestConfig } from '@pyreon/test-utils'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import * as exports from '../index'

let cleanup: () => void
beforeAll(() => {
  cleanup = initTestConfig()
})
afterAll(() => cleanup())

const ALL_COMPONENTS = [
  // Layout
  'Box', 'Stack', 'Group', 'Center', 'Divider', 'GridContainer', 'GridRow', 'GridCol', 'AspectRatio',
  // Typography
  'Title', 'Paragraph',
  // Buttons
  'Button', 'IconButton', 'CloseButton', 'ButtonGroup', 'ActionIcon',
  // Forms
  'FormField', 'FieldLabel', 'FieldError', 'FieldDescription',
  'Input', 'Textarea', 'Checkbox', 'Radio', 'RadioGroup', 'Switch', 'Select', 'Slider',
  // Data Display
  'Badge', 'Chip', 'Card', 'Avatar', 'AvatarGroup', 'Image', 'Kbd', 'Table', 'Timeline', 'Code', 'Highlight',
  // Feedback
  'Alert', 'Notification', 'Progress', 'Loader', 'Skeleton',
  // Indicators
  'Indicator',
  // Overlays
  'Modal', 'Drawer', 'Dialog', 'Tooltip', 'Popover', 'HoverCard', 'Menu', 'MenuItem',
  // Navigation
  'Tabs', 'Tab', 'TabPanel', 'Breadcrumb', 'BreadcrumbItem', 'Pagination', 'NavLink', 'Stepper', 'Step',
  // Disclosure
  'Accordion', 'AccordionItem', 'AccordionTrigger', 'AccordionContent', 'Spoiler',
  // Date & Time
  'Calendar', 'DatePicker', 'DateRangePicker', 'TimePicker', 'DateTimePicker', 'MonthPicker',
  // Advanced Inputs
  'Combobox', 'Autocomplete', 'MultiSelect', 'FileUpload', 'ColorPicker', 'ColorSwatch',
  'InputGroup', 'NumberInput', 'PinInput', 'SegmentedControl', 'SegmentedControlItem',
  // Data
  'Tree', 'TreeItem',
  // Accessibility
  'VisuallyHidden',
] as const

describe('All components are exported', () => {
  for (const name of ALL_COMPONENTS) {
    it(`exports ${name}`, () => {
      expect((exports as Record<string, unknown>)[name]).toBeDefined()
      expect(typeof (exports as Record<string, unknown>)[name]).toBe('function')
    })
  }
})

describe('Rocketstyle components have IS_ROCKETSTYLE', () => {
  const rocketstyleComponents = [
    'Box', 'Stack', 'Group', 'Center', 'Divider', 'AspectRatio',
    'Title', 'Paragraph',
    'Button', 'IconButton', 'CloseButton', 'ButtonGroup', 'ActionIcon',
    'FormField', 'FieldLabel', 'FieldError', 'FieldDescription',
    'Input', 'Textarea', 'Checkbox', 'Radio', 'RadioGroup', 'Switch', 'Select', 'Slider',
    'Badge', 'Chip', 'Card', 'Avatar', 'AvatarGroup', 'Image', 'Kbd', 'Table', 'Timeline', 'Code', 'Highlight',
    'Alert', 'Notification', 'Progress', 'Loader', 'Skeleton',
    'Indicator',
    'Modal', 'Drawer', 'Dialog', 'Tooltip', 'Popover', 'HoverCard', 'Menu', 'MenuItem',
    'Tabs', 'Tab', 'TabPanel', 'Breadcrumb', 'BreadcrumbItem', 'Pagination', 'NavLink', 'Stepper', 'Step',
    'Accordion', 'AccordionItem', 'AccordionTrigger', 'AccordionContent', 'Spoiler',
    'Calendar', 'DatePicker', 'DateRangePicker', 'TimePicker', 'DateTimePicker', 'MonthPicker',
    'Combobox', 'Autocomplete', 'MultiSelect', 'FileUpload', 'ColorPicker', 'ColorSwatch',
    'InputGroup', 'NumberInput', 'PinInput', 'SegmentedControl',
    'Tree',
    'VisuallyHidden',
  ] as const

  for (const name of rocketstyleComponents) {
    it(`${name} has IS_ROCKETSTYLE`, () => {
      const comp = (exports as Record<string, any>)[name]
      expect(comp.IS_ROCKETSTYLE).toBe(true)
    })
  }
})

describe('Rocketstyle components have displayName', () => {
  const namedComponents = [
    'Box', 'Stack', 'Group', 'Center', 'Divider',
    'Title', 'Paragraph',
    'Button', 'Badge', 'Card', 'Alert',
  ] as const

  for (const name of namedComponents) {
    it(`${name} has displayName "${name}"`, () => {
      const comp = (exports as Record<string, any>)[name]
      expect(comp.displayName).toBe(name)
    })
  }
})

describe('Export count', () => {
  it('exports at least 58 components', () => {
    const count = Object.keys(exports).length
    expect(count).toBeGreaterThanOrEqual(58)
  })
})
