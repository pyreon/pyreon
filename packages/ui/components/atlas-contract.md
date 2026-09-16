# Component Contract

DERIVED — do not edit. Regenerate with `bun run atlas-guide --update`.

Every component and the exact values each prop accepts. A rename here is a
breaking change for anything written against it, including AI assistants;
the gate exists so this file cannot silently disagree with the source.

Verify a usage before committing to it:

    atlas check <Component> '{"prop":"value"}'

## Accordion
optional: children(text)

## AccordionContent
optional: children(text)

## AccordionItem
optional: children(text)

## AccordionTrigger
optional: children(text)

## ActionIcon
optional: children(text), size(large|medium|small|xLarge|xSmall), state(danger|primary|secondary), variant(filled|outline|subtle|transparent)

## Alert [feedback]
optional: children(text), state(error|info|success|warning), variant(outline|solid|subtle)

## AspectRatio

## Autocomplete
optional: children(text), size(large|medium|small), state(error)

## Avatar [data]
optional: children(text), size(large|medium|small|xLarge|xSmall), variant(circle|rounded)

## AvatarGroup [data, layout]

## Badge [feedback]
optional: children(text), size(large|medium|small), state(error|primary|secondary|success|warning), variant(outline|solid|subtle)

## Box [layout]

## Breadcrumb [navigation]
optional: gap(large|medium|small|xLarge|xxLarge), gapY(large|medium|small|xLarge|xSmall|xxLarge), indent(large|medium|small|xLarge|xxLarge)

## BreadcrumbItem [navigation]
optional: children(text)

## Button [form]
optional: children(text), size(large|medium|small), state(danger|primary|secondary|success), variant(ghost|link|outline|solid|subtle)

## ButtonGroup [form, layout]
optional: gap(large|medium|small|xLarge|xxLarge), gapY(large|medium|small|xLarge|xSmall|xxLarge), indent(large|medium|small|xLarge|xxLarge)

## Calendar
optional: children(text)

## Card [data]
optional: children(text), variant(elevated|filled|outline)

## CardFooter [data]
optional: children(text)

## CardHeader [data]
optional: children(text)

## CardSection [data]

## Center

## Checkbox [form, layout]
optional: children(text), size(large|medium|small)

## CheckboxIndicator [form, layout]
optional: children(text), size(large|medium|small), state(checked)

## Chip [data]
optional: children(text), size(large|medium|small), state(error|primary|secondary|success), variant(filled|outline)

## CloseButton [form]
optional: children(text), size(large|medium|small)

## Code
optional: children(text), variant(block|inline)

## ColorPicker [layout]
optional: children(text)

## ColorSwatch [layout]
optional: children(text), size(large|medium|small)

## Combobox [layout]
optional: children(reactive)
reactive: children

## ComboboxStyled [layout]
optional: children(text), size(large|medium|small), state(error)

## DatePicker
optional: children(text), size(large|medium|small)

## DateRangePicker
optional: children(text), size(large|medium|small)

## DateTimePicker
optional: children(text), size(large|medium|small)

## Dialog [overlay]
optional: children(text), open(boolean), size(medium|small)

## Divider [layout]
optional: size(large|medium|small), variant(dashed|dotted|solid)

## Drawer [navigation]
optional: children(text), open(boolean), size(large|medium|small|xLarge), variant(bottom|left|right|top)

## FieldDescription [form]
optional: children(text)

## FieldError [form]
optional: children(text)

## FieldLabel [form]
optional: children(text), size(large|medium|small)

## Fieldset [form]

## FieldsetLegend [form]
optional: children(text)

## FileUpload
optional: children(text)

## FormField [form]
optional: children(text)

## Group [layout]
optional: gap(large|medium|small|xLarge|xxLarge), gapY(large|medium|small|xLarge|xSmall|xxLarge), indent(large|medium|small|xLarge|xxLarge)

## Highlight
optional: children(text), state(error|primary|success|warning)

## HoverCard [data]
optional: children(text)

## IconButton [form]
optional: children(text), size(large|medium|small)

## Image
optional: alt(text), src(text), variant(circle|rounded)

## Indicator
optional: children(text), size(large|medium|small), state(error|primary|success|warning)

## Input [form]
optional: placeholder(text), size(large|medium|small), state(error|success), variant(filled|outline|underline)

## InputGroup [form, layout]

## Kbd
optional: children(text)

## Loader [feedback]
optional: children(text), size(large|medium|small|xLarge), state(primary|secondary)

## Menu [navigation]
optional: children(text)

## MenuItem [navigation]
optional: children(text), size(medium|small)

## Modal [overlay]
optional: children(text), open(boolean), size(full|large|medium|small|xLarge)

## MonthPicker
optional: children(text)

## MultiSelect [form]
optional: children(text), size(large|medium|small)

## NavLink [navigation]
optional: children(text), state(active)

## Notification [feedback]
optional: children(text), state(error|info|success|warning)

## NumberInput [form]
optional: children(text), size(large|medium|small)

## Pagination [navigation]
optional: size(large|medium|small)

## PaginationEllipsis [navigation]
optional: children(text)

## PaginationItem [navigation]
optional: children(text), state(active)

## PaginationNext [navigation]
optional: children(text), state(active)

## PaginationPrev [navigation]
optional: children(text), state(active)

## Paragraph
optional: children(text), size(large|medium|small)

## PasswordInput [form]
optional: defaultVisible(boolean), hideLabel(text), onVisibleChange(reactive), showLabel(text), visible(boolean)
reactive: onVisibleChange

## PinInput [form]
optional: children(text), size(large|medium|small)

## PinInputCell [form]
optional: placeholder(text), size(large|medium|small)

## Popover [overlay]
optional: children(text)

## Progress [feedback]
optional: children(text), size(large|medium|small), state(error|primary|success)

## Radio [form]
optional: children(text), size(large|medium|small)

## RadioDot [form]
optional: children(text), size(large|medium|small), state(checked)

## RadioGroup [form, layout]
optional: variant(horizontal|vertical)

## RadioIndicator [form]
optional: children(text), size(large|medium|small), state(checked)

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
optional: children(text), size(large|medium|small)

## SegmentedControlItem
optional: children(text), size(large|medium|small), state(active)

## Select [form]
optional: size(large|medium|small), state(error)

## Skeleton [feedback]
optional: children(text), variant(circle|rect|text)

## Slider [form]
optional: children(text), size(large|medium|small)

## Spoiler
optional: children(text)

## SpoilerToggle [form]
optional: children(text)

## Stack [layout]
optional: gap(large|medium|small|xLarge|xxLarge), gapY(large|medium|small|xLarge|xSmall|xxLarge), indent(large|medium|small|xLarge|xxLarge)

## Step
optional: children(text), state(active|completed|default)

## Stepper
optional: variant(horizontal|vertical)

## Switch [form]
optional: children(text), size(large|medium|small)

## SwitchThumb [form]
optional: children(text), size(large|medium|small), state(checked)

## Tab [navigation]
optional: children(text), variant(enclosed|line|pills)

## Table [data, navigation]
optional: size(compact|default|relaxed), variant(bordered|simple|striped)

## TabList [data, navigation]
optional: children(text)

## TabPanel [navigation]

## Tabs [navigation]
optional: children(text), variant(enclosed|line|pills)

## TagsInput [data, form]
optional: children(reactive)
reactive: children

## Textarea [form]
optional: placeholder(text), size(large|medium|small), state(error|success), variant(filled|outline|underline)

## Timeline
optional: children(text)

## TimelineItem
optional: children(text), state(active|completed)

## TimePicker
optional: children(text), size(large|medium|small)

## Title
optional: children(text), size(h1|h2|h3|h4|h5|h6)

## Tooltip [feedback]
optional: children(text)

## Tree [data]
optional: children(reactive)
reactive: children

## TreeItem [data]
optional: children(text), state(selected)

## VisuallyHidden
optional: children(text)
