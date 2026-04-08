import { sections } from '../sections'
import {
  FeatureChip,
  FeatureChips,
  FootnoteParagraph,
  LeadParagraph,
  PageSubtitle,
  PageTitle,
  PageWide,
  SectionCard,
  SectionCardDisabled,
  SectionCardHead,
  SectionCardLink,
  SectionCardTagline,
  SectionCardTitle,
  SectionGrid,
  SoonBadge,
  StatCard,
  StatGrid,
  StatLabel,
  StatValue,
} from '../styles'

const stats = [
  { value: String(sections.length), label: 'Sections' },
  { value: String(sections.filter((s) => s.available).length), label: 'Available' },
  { value: '1', label: 'Zero app' },
  { value: '0', label: 'Build step (dev)' },
]

export default function HomePage() {
  return (
    <PageWide>
      <PageTitle>Pyreon App Showcase</PageTitle>
      <LeadParagraph>
        A single Pyreon Zero app hosting multiple real-world feature areas — todos, blog, dashboard,
        chat, kanban, forms, e-commerce, and more. Every section is built with the same stack and
        showcases a focused slice of the framework, so you can compare patterns side by side.
      </LeadParagraph>

      <StatGrid>
        {stats.map((s) => (
          <StatCard>
            <StatValue>{s.value}</StatValue>
            <StatLabel>{s.label}</StatLabel>
          </StatCard>
        ))}
      </StatGrid>

      <PageSubtitle>Sections</PageSubtitle>
      <SectionGrid>
        {sections.map((s) => {
          const card = (
            <SectionCard>
              <SectionCardHead>
                <SectionCardTitle>
                  {s.label} {s.available ? '→' : ''}
                </SectionCardTitle>
                {s.available ? null : <SoonBadge>soon</SoonBadge>}
              </SectionCardHead>
              <SectionCardTagline>{s.tagline}</SectionCardTagline>
              <FeatureChips>
                {s.features.map((f) => (
                  <FeatureChip>{f}</FeatureChip>
                ))}
              </FeatureChips>
            </SectionCard>
          )
          if (s.available) {
            return <SectionCardLink to={s.path}>{card}</SectionCardLink>
          }
          return <SectionCardDisabled>{card}</SectionCardDisabled>
        })}
      </SectionGrid>

      <FootnoteParagraph>
        Each section ships in its own PR. Use the sidebar to jump between available sections.
      </FootnoteParagraph>
    </PageWide>
  )
}

export const meta = {
  title: 'Pyreon App Showcase',
}
