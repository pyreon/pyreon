import { signal } from '@pyreon/reactivity'
import {
  // Layout
  Box,
  Stack,
  Group,
  Center,
  Divider,
  // Typography
  Title,
  Paragraph,
  Code,
  Highlight,
  // Buttons
  Button,
  IconButton,
  CloseButton,
  ActionIcon,
  // Forms
  FormField,
  FieldLabel,
  FieldError,
  Input,
  Textarea,
  Checkbox,
  Radio,
  RadioGroup,
  Switch,
  Select,
  Slider,
  // Data Display
  Badge,
  Chip,
  Card,
  Avatar,
  AvatarGroup,
  Kbd,
  // Feedback
  Alert,
  Progress,
  Loader,
  Skeleton,
  // Navigation
  Tabs,
  Tab,
  TabPanel,
  Breadcrumb,
  BreadcrumbItem,
  NavLink,
  // Disclosure
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@pyreon/ui-components'
import { ButtonsSection } from './sections/Buttons'
import { FormsSection } from './sections/Forms'
import { DataDisplaySection } from './sections/DataDisplay'
import { FeedbackSection } from './sections/Feedback'
import { NavigationSection } from './sections/Navigation'
import { OverlaySection } from './sections/Overlays'

const activeSection = signal('buttons')

const sections = [
  { id: 'buttons', label: 'Buttons' },
  { id: 'forms', label: 'Forms' },
  { id: 'data', label: 'Data Display' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'overlays', label: 'Overlays' },
] as const

export function App() {
  return (
    <div style="max-width: 1200px; margin: 0 auto; padding: 32px 24px;">
      <Title size="h1">Pyreon UI Showcase</Title>
      <Paragraph style="color: #6b7280; margin-bottom: 32px;">
        75 components built on rocketstyle — token-based themes, dark mode, accessible.
      </Paragraph>

      {/* Section navigation */}
      <div style="display: flex; gap: 8px; margin-bottom: 32px; flex-wrap: wrap;">
        {sections.map((s) => (
          <Button
            state={activeSection() === s.id ? 'primary' : undefined}
            variant={activeSection() === s.id ? 'solid' : 'ghost'}
            size="sm"
            onClick={() => activeSection.set(s.id)}
          >
            {s.label}
          </Button>
        ))}
      </div>

      <Divider />

      <div style="margin-top: 32px;">
        {() => {
          switch (activeSection()) {
            case 'buttons':
              return <ButtonsSection />
            case 'forms':
              return <FormsSection />
            case 'data':
              return <DataDisplaySection />
            case 'feedback':
              return <FeedbackSection />
            case 'navigation':
              return <NavigationSection />
            case 'overlays':
              return <OverlaySection />
            default:
              return <ButtonsSection />
          }
        }}
      </div>
    </div>
  )
}
