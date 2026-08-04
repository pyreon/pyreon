# Agent Guide

Minimal correct usage per component. Use ONLY the listed prop values.

Verify before you commit to a usage:

    atlas check <Component> '{"prop":"value"}'

It exits non-zero and names the problem — an invalid value (with the
nearest legal one), an unknown prop, a wrong type, a missing required prop.

Scenario labels are literal. `[pass]` means a check ran and passed;
`[unverified]` means nothing examined it — it is not a weaker pass, and it
is not evidence the usage is correct.

## Combobox [layout]
optional: children(()=>…)
reactive (pass a signal accessor): children

## PasswordInput [form]
optional: visible(bool), defaultVisible(bool), onVisibleChange(()=>…), showLabel(text), hideLabel(text)
reactive (pass a signal accessor): onVisibleChange
correct: {"showLabel":""}

## RangeSlider [form]
optional: children(()=>…)
reactive (pass a signal accessor): children

## Rating
optional: children(()=>…)
reactive (pass a signal accessor): children

## RingProgress [feedback]
required: value(unknown)
optional: size(number), thickness(number), color(color), trackColor(text), children(unknown)
correct: {"trackColor":""}

## TagsInput [form, data]
optional: children(()=>…)
reactive (pass a signal accessor): children

## Tree [data]
optional: children(()=>…)
reactive (pass a signal accessor): children
avoid: "Default" — threw while mounted: undefined is not an object (evaluating 'nodes') (Effect effect)

## AccordionItem

## AccordionTrigger

## AccordionContent

## AvatarGroup [layout, data]

## BreadcrumbItem [navigation]

## IconButton [form]
optional: size(small|medium|large)
correct: {"size":"small"}

## CloseButton [form]
optional: size(small|medium|large)
correct: {"size":"small"}

## CardSection [data]

## CardHeader [data]

## CardFooter [data]

## CheckboxIndicator [form, layout]
optional: state(checked), size(small|medium|large)
correct: {"state":"checked","size":"small"}

## ComboboxStyled [layout]
optional: state(error), size(small|medium|large)
correct: {"state":"error","size":"small"}

## FieldsetLegend [form]

## FieldLabel [form]
optional: size(small|medium|large)
correct: {"size":"small"}

## FieldError [form]

## FieldDescription [form]

## Textarea [form]
optional: state(error|success), size(small|medium|large), variant(outline|filled|underline)
correct: {"state":"error","size":"small","variant":"outline"}

## MenuItem [navigation]
optional: size(small|medium)
correct: {"size":"small"}

## PaginationItem [navigation]
optional: state(active)
correct: {"state":"active"}

## PaginationPrev [navigation]
optional: state(active)
correct: {"state":"active"}

## PaginationNext [navigation]
optional: state(active)
correct: {"state":"active"}

## PaginationEllipsis [navigation]

## PinInputCell [form]
optional: size(small|medium|large)
correct: {"size":"small"}

## RadioGroup [form, layout]
optional: variant(vertical|horizontal)
correct: {"variant":"vertical"}

## RadioIndicator [form]
optional: state(checked), size(small|medium|large)
correct: {"state":"checked","size":"small"}

## RadioDot [form]
optional: state(checked), size(small|medium|large)
correct: {"state":"checked","size":"small"}

## SegmentedControlItem
optional: state(active), size(small|medium|large)
correct: {"state":"active","size":"small"}

## SpoilerToggle [form]

## Step
optional: state(active|completed|default)
correct: {"state":"active"}

## SwitchThumb [form]
optional: state(checked), size(small|medium|large)
correct: {"state":"checked","size":"small"}

## TabList [navigation, data]

## Tab [navigation]
optional: variant(line|enclosed|pills)
correct: {"variant":"line"}

## TabPanel [navigation]

## TimelineItem
optional: state(active|completed)
correct: {"state":"active"}

## TreeItem [data]
optional: state(selected)
correct: {"state":"selected"}

## Box [layout]

## Stack [layout]
optional: indent(small|medium|large|xLarge|xxLarge), gap(small|medium|large|xLarge|xxLarge), gapY(xSmall|small|medium|large|xLarge|xxLarge)
correct: {"indent":"small","gap":"small","gapY":"xSmall"}

## Group [layout]
optional: indent(small|medium|large|xLarge|xxLarge), gap(small|medium|large|xLarge|xxLarge), gapY(xSmall|small|medium|large|xLarge|xxLarge)
correct: {"indent":"small","gap":"small","gapY":"xSmall"}

## Center

## Divider [layout]
optional: size(small|medium|large), variant(solid|dashed|dotted)
correct: {"size":"small","variant":"solid"}

## AspectRatio

## Title
optional: size(h1|h2|h3|h4|h5|h6)
correct: {"size":"h1"}

## Paragraph
optional: size(small|medium|large)
correct: {"size":"small"}

## Button [form]
optional: state(primary|secondary|danger|success), size(small|medium|large), variant(solid|outline|subtle|ghost|link)
correct: {"state":"primary","size":"small","variant":"solid"}

## ButtonGroup [form, layout]
optional: indent(small|medium|large|xLarge|xxLarge), gap(small|medium|large|xLarge|xxLarge), gapY(xSmall|small|medium|large|xLarge|xxLarge)
correct: {"indent":"small","gap":"small","gapY":"xSmall"}

## ActionIcon
optional: state(primary|secondary|danger), size(xSmall|small|medium|large|xLarge), variant(filled|outline|subtle|transparent)
correct: {"state":"primary","size":"xSmall","variant":"filled"}

## Fieldset [form]

## FormField [form]

## Input [form]
optional: state(error|success), size(small|medium|large), variant(outline|filled|underline)
correct: {"state":"error","size":"small","variant":"outline"}

## Checkbox [form, layout]
optional: size(small|medium|large)
correct: {"size":"small"}

## Radio [form]
optional: size(small|medium|large)
correct: {"size":"small"}

## Switch [form]
optional: size(small|medium|large)
correct: {"size":"small"}

## Select [form]
optional: state(error), size(small|medium|large)
correct: {"state":"error","size":"small"}

## Slider [form]
optional: size(small|medium|large)
correct: {"size":"small"}

## Badge [feedback]
optional: state(primary|secondary|success|error|warning), size(small|medium|large), variant(solid|outline|subtle)
correct: {"state":"primary","size":"small","variant":"solid"}

## Chip [data]
optional: state(primary|secondary|success|error), size(small|medium|large), variant(filled|outline)
correct: {"state":"primary","size":"small","variant":"filled"}

## Card [data]
optional: variant(elevated|outline|filled)
correct: {"variant":"elevated"}

## Avatar [data]
optional: size(xSmall|small|medium|large|xLarge), variant(circle|rounded)
correct: {"size":"xSmall","variant":"circle"}

## Image
optional: variant(rounded|circle)
correct: {"variant":"rounded"}

## Kbd

## Table [navigation, data]
optional: size(compact|default|relaxed), variant(simple|striped|bordered)
correct: {"size":"compact","variant":"simple"}

## Timeline

## Code
optional: variant(inline|block)
correct: {"variant":"inline"}

## Highlight
optional: state(primary|success|warning|error)
correct: {"state":"primary"}

## Alert [feedback]
optional: state(info|success|warning|error), variant(subtle|solid|outline)
correct: {"state":"info","variant":"subtle"}

## Notification [feedback]
optional: state(info|success|warning|error)
correct: {"state":"info"}

## Progress [feedback]
optional: state(primary|success|error), size(small|medium|large)
correct: {"state":"primary","size":"small"}

## Loader [feedback]
optional: state(primary|secondary), size(small|medium|large|xLarge)
correct: {"state":"primary","size":"small"}

## ScrollArea
optional: variant(vertical|horizontal|both)
correct: {"variant":"vertical"}

## Skeleton [feedback]
optional: variant(text|circle|rect)
correct: {"variant":"text"}

## Indicator
optional: state(primary|success|error|warning), size(small|medium|large)
correct: {"state":"primary","size":"small"}

## Modal [overlay]
optional: size(small|medium|large|xLarge|full)
correct: {"size":"small"}

## Drawer [navigation]
optional: size(small|medium|large|xLarge), variant(left|right|top|bottom)
correct: {"size":"small","variant":"left"}

## Dialog [overlay]
optional: size(small|medium)
correct: {"size":"small"}

## Tooltip [feedback]

## Popover [overlay]

## HoverCard [data]

## Menu [navigation]

## Tabs [navigation]
optional: variant(line|enclosed|pills)
correct: {"variant":"line"}

## Breadcrumb [navigation]
optional: indent(small|medium|large|xLarge|xxLarge), gap(small|medium|large|xLarge|xxLarge), gapY(xSmall|small|medium|large|xLarge|xxLarge)
correct: {"indent":"small","gap":"small","gapY":"xSmall"}

## Pagination [navigation]
optional: size(small|medium|large)
correct: {"size":"small"}

## NavLink [navigation]
optional: state(active)
correct: {"state":"active"}

## Stepper
optional: variant(horizontal|vertical)
correct: {"variant":"horizontal"}

## Accordion

## Spoiler

## Calendar

## DatePicker
optional: size(small|medium|large)
correct: {"size":"small"}

## DateRangePicker
optional: size(small|medium|large)
correct: {"size":"small"}

## TimePicker
optional: size(small|medium|large)
correct: {"size":"small"}

## DateTimePicker
optional: size(small|medium|large)
correct: {"size":"small"}

## MonthPicker

## Autocomplete
optional: state(error), size(small|medium|large)
correct: {"state":"error","size":"small"}

## MultiSelect [form]
optional: size(small|medium|large)
correct: {"size":"small"}

## FileUpload

## ColorPicker [layout]

## ColorSwatch [layout]
optional: size(small|medium|large)
correct: {"size":"small"}

## InputGroup [form, layout]

## NumberInput [form]
optional: size(small|medium|large)
correct: {"size":"small"}

## PinInput [form]
optional: size(small|medium|large)
correct: {"size":"small"}

## SegmentedControl
optional: size(small|medium|large)
correct: {"size":"small"}

## VisuallyHidden
