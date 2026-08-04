# Component Contract

DERIVED — do not edit. Regenerate with `bun run atlas-guide --update`.

Every component and the exact values each prop accepts. A rename here is a
breaking change for anything written against it, including AI assistants;
the gate exists so this file cannot silently disagree with the source.

Verify a usage before committing to it:

    atlas check <Component> '{"prop":"value"}'

## Accordion

## AccordionContent

## AccordionItem

## AccordionTrigger

## ActionIcon
optional: size(large|medium|small|xLarge|xSmall), state(danger|primary|secondary), variant(filled|outline|subtle|transparent)

## Alert [feedback]
optional: state(error|info|success|warning), variant(outline|solid|subtle)

## AspectRatio

## Autocomplete
optional: size(large|medium|small), state(error)

## Avatar [data]
optional: size(large|medium|small|xLarge|xSmall), variant(circle|rounded)

## AvatarGroup [data, layout]

## Badge [feedback]
optional: size(large|medium|small), state(error|primary|secondary|success|warning), variant(outline|solid|subtle)

## Box [layout]

## Breadcrumb [navigation]
optional: gap(large|medium|small|xLarge|xxLarge), gapY(large|medium|small|xLarge|xSmall|xxLarge), indent(large|medium|small|xLarge|xxLarge)

## BreadcrumbItem [navigation]

## Button [form]
optional: size(large|medium|small), state(danger|primary|secondary|success), variant(ghost|link|outline|solid|subtle)

## ButtonGroup [form, layout]
optional: gap(large|medium|small|xLarge|xxLarge), gapY(large|medium|small|xLarge|xSmall|xxLarge), indent(large|medium|small|xLarge|xxLarge)

## Calendar

## Card [data]
optional: variant(elevated|filled|outline)

## CardFooter [data]

## CardHeader [data]

## CardSection [data]

## Center

## Checkbox [form, layout]
optional: size(large|medium|small)

## CheckboxIndicator [form, layout]
optional: size(large|medium|small), state(checked)

## Chip [data]
optional: size(large|medium|small), state(error|primary|secondary|success), variant(filled|outline)

## CloseButton [form]
optional: size(large|medium|small)

## Code
optional: variant(block|inline)

## ColorPicker [layout]

## ColorSwatch [layout]
optional: size(large|medium|small)

## Combobox [layout]
optional: children(reactive)
reactive: children

## ComboboxStyled [layout]
optional: size(large|medium|small), state(error)

## DatePicker
optional: size(large|medium|small)

## DateRangePicker
optional: size(large|medium|small)

## DateTimePicker
optional: size(large|medium|small)

## Dialog [overlay]
optional: size(medium|small)

## Divider [layout]
optional: size(large|medium|small), variant(dashed|dotted|solid)

## Drawer [navigation]
optional: size(large|medium|small|xLarge), variant(bottom|left|right|top)

## FieldDescription [form]

## FieldError [form]

## FieldLabel [form]
optional: size(large|medium|small)

## Fieldset [form]

## FieldsetLegend [form]

## FileUpload

## FormField [form]

## Group [layout]
optional: gap(large|medium|small|xLarge|xxLarge), gapY(large|medium|small|xLarge|xSmall|xxLarge), indent(large|medium|small|xLarge|xxLarge)

## Highlight
optional: state(error|primary|success|warning)

## HoverCard [data]

## IconButton [form]
optional: size(large|medium|small)

## Image
optional: variant(circle|rounded)

## Indicator
optional: size(large|medium|small), state(error|primary|success|warning)

## Input [form]
optional: size(large|medium|small), state(error|success), variant(filled|outline|underline)

## InputGroup [form, layout]

## Kbd

## Loader [feedback]
optional: size(large|medium|small|xLarge), state(primary|secondary)

## Menu [navigation]

## MenuItem [navigation]
optional: size(medium|small)

## Modal [overlay]
optional: size(full|large|medium|small|xLarge)

## MonthPicker

## MultiSelect [form]
optional: size(large|medium|small)

## NavLink [navigation]
optional: state(active)

## Notification [feedback]
optional: state(error|info|success|warning)

## NumberInput [form]
optional: size(large|medium|small)

## Pagination [navigation]
optional: size(large|medium|small)

## PaginationEllipsis [navigation]

## PaginationItem [navigation]
optional: state(active)

## PaginationNext [navigation]
optional: state(active)

## PaginationPrev [navigation]
optional: state(active)

## Paragraph
optional: size(large|medium|small)

## PasswordInput [form]
optional: defaultVisible(boolean), hideLabel(text), onVisibleChange(reactive), showLabel(text), visible(boolean)
reactive: onVisibleChange

## PinInput [form]
optional: size(large|medium|small)

## PinInputCell [form]
optional: size(large|medium|small)

## Popover [overlay]

## Progress [feedback]
optional: size(large|medium|small), state(error|primary|success)

## Radio [form]
optional: size(large|medium|small)

## RadioDot [form]
optional: size(large|medium|small), state(checked)

## RadioGroup [form, layout]
optional: variant(horizontal|vertical)

## RadioIndicator [form]
optional: size(large|medium|small), state(checked)

## RangeSlider [form]
optional: children(reactive)
reactive: children

## Rating
optional: children(reactive)
reactive: children

## RingProgress [feedback]
required: value(unknown)
optional: children(unknown), color(color), size(number), thickness(number), trackColor(text)

## ScrollArea
optional: variant(both|horizontal|vertical)

## SegmentedControl
optional: size(large|medium|small)

## SegmentedControlItem
optional: size(large|medium|small), state(active)

## Select [form]
optional: size(large|medium|small), state(error)

## Skeleton [feedback]
optional: variant(circle|rect|text)

## Slider [form]
optional: size(large|medium|small)

## Spoiler

## SpoilerToggle [form]

## Stack [layout]
optional: gap(large|medium|small|xLarge|xxLarge), gapY(large|medium|small|xLarge|xSmall|xxLarge), indent(large|medium|small|xLarge|xxLarge)

## Step
optional: state(active|completed|default)

## Stepper
optional: variant(horizontal|vertical)

## Switch [form]
optional: size(large|medium|small)

## SwitchThumb [form]
optional: size(large|medium|small), state(checked)

## Tab [navigation]
optional: variant(enclosed|line|pills)

## Table [data, navigation]
optional: size(compact|default|relaxed), variant(bordered|simple|striped)

## TabList [data, navigation]

## TabPanel [navigation]

## Tabs [navigation]
optional: variant(enclosed|line|pills)

## TagsInput [data, form]
optional: children(reactive)
reactive: children

## Textarea [form]
optional: size(large|medium|small), state(error|success), variant(filled|outline|underline)

## Timeline

## TimelineItem
optional: state(active|completed)

## TimePicker
optional: size(large|medium|small)

## Title
optional: size(h1|h2|h3|h4|h5|h6)

## Tooltip [feedback]

## Tree [data]
optional: children(reactive)
reactive: children

## TreeItem [data]
optional: state(selected)

## VisuallyHidden
