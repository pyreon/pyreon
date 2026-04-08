import type { ContactDetails, EducationEntry, ExperienceEntry } from './data/types'
import { useResume } from './store'
import {
  AddEntryButton,
  EntryHeader,
  EntryRemove,
  EntryRoleInput,
  EntryRow,
  FieldGrid,
  FieldGroup,
  FieldLabel,
  Section,
  SectionTitle,
  SpacedFieldGroup,
  Textarea,
  TextInput,
} from './styled'

/**
 * Resume form. Bound directly to the resume store via small named
 * components per repeating section — same pattern as the invoice
 * builder, where wrapping `arr.map()` in a sibling component avoids
 * the `VNodeChildAtom` narrowing inside rocketstyle child slots.
 */
export function ResumeForm() {
  const r = useResume()
  const { store } = r

  return (
    <>
      {/* ── Header / contact ───────────────────────────────────── */}
      <Section>
        <SectionTitle>Header</SectionTitle>
        <FieldGroup>
          <FieldLabel for="name">Full name</FieldLabel>
          <TextInput
            id="name"
            type="text"
            value={() => store.resume().name}
            onInput={(e: Event) => store.setName((e.target as HTMLInputElement).value)}
          />
        </FieldGroup>
        <SpacedFieldGroup>
          <FieldLabel for="headline">Headline</FieldLabel>
          <TextInput
            id="headline"
            type="text"
            value={() => store.resume().headline}
            onInput={(e: Event) => store.setHeadline((e.target as HTMLInputElement).value)}
          />
        </SpacedFieldGroup>
      </Section>

      <Section>
        <SectionTitle>Contact</SectionTitle>
        <ContactFields />
      </Section>

      {/* ── Summary ────────────────────────────────────────────── */}
      <Section>
        <SectionTitle>Summary</SectionTitle>
        <Textarea
          value={() => store.resume().summary}
          onInput={(e: Event) => store.setSummary((e.target as HTMLTextAreaElement).value)}
          placeholder="Two or three sentences about who you are and what you do best."
        />
      </Section>

      {/* ── Experience ─────────────────────────────────────────── */}
      <Section>
        <SectionTitle>Experience</SectionTitle>
        <ExperienceList />
        <AddEntryButton type="button" onClick={() => store.addExperience()}>
          + Add experience
        </AddEntryButton>
      </Section>

      {/* ── Education ──────────────────────────────────────────── */}
      <Section>
        <SectionTitle>Education</SectionTitle>
        <EducationList />
        <AddEntryButton type="button" onClick={() => store.addEducation()}>
          + Add degree
        </AddEntryButton>
      </Section>

      {/* ── Skills ─────────────────────────────────────────────── */}
      <Section>
        <SectionTitle>Skills</SectionTitle>
        <FieldGroup>
          <FieldLabel for="skills">Skills (one per line)</FieldLabel>
          <Textarea
            id="skills"
            value={() => store.resume().skills.join('\n')}
            onInput={(e: Event) =>
              store.setSkills(
                (e.target as HTMLTextAreaElement).value.split('\n').filter(Boolean),
              )
            }
            placeholder="TypeScript&#10;Pyreon&#10;Performance"
          />
        </FieldGroup>
      </Section>
    </>
  )
}

/**
 * Contact fields rendered as a 2x2 grid. Pulled into its own component
 * so the loop body stays out of `<Section>`'s child slot, sidestepping
 * the rocketstyle `VNodeChildAtom` narrowing for nested function
 * children.
 */
function ContactFields() {
  const r = useResume()
  const fields: Array<{ key: keyof ContactDetails; label: string; type: string }> = [
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Phone', type: 'tel' },
    { key: 'location', label: 'Location', type: 'text' },
    { key: 'website', label: 'Website', type: 'text' },
  ]
  return (
    <FieldGrid>
      {fields.map((f) => (
        <FieldGroup>
          <FieldLabel for={`contact-${f.key}`}>{f.label}</FieldLabel>
          <TextInput
            id={`contact-${f.key}`}
            type={f.type}
            value={() => r.store.resume().contact[f.key]}
            onInput={(e: Event) =>
              r.store.setContact(f.key, (e.target as HTMLInputElement).value)
            }
          />
        </FieldGroup>
      ))}
    </FieldGrid>
  )
}

/**
 * Reactive list of experience entries. Same pattern as the invoice
 * `LineItemList` — sibling component returning a function from its
 * body so Pyreon's runtime treats it as a reactive children accessor.
 */
function ExperienceList() {
  const r = useResume()
  return () =>
    r.store.resume().experience.map((entry: ExperienceEntry) => (
      <EntryRow>
        <EntryHeader>
          <EntryRoleInput
            type="text"
            placeholder="Role"
            value={entry.role}
            onInput={(e: Event) =>
              r.store.updateExperience(entry.id, 'role', (e.target as HTMLInputElement).value)
            }
          />
          <EntryRemove
            type="button"
            title="Remove"
            onClick={() => r.store.removeExperience(entry.id)}
          >
            ×
          </EntryRemove>
        </EntryHeader>
        <TextInput
          type="text"
          placeholder="Company"
          value={entry.company}
          onInput={(e: Event) =>
            r.store.updateExperience(entry.id, 'company', (e.target as HTMLInputElement).value)
          }
        />
        <TextInput
          type="text"
          placeholder="Period"
          value={entry.period}
          onInput={(e: Event) =>
            r.store.updateExperience(entry.id, 'period', (e.target as HTMLInputElement).value)
          }
        />
        <Textarea
          placeholder="Highlights — one bullet per line"
          value={entry.highlights.join('\n')}
          onInput={(e: Event) =>
            r.store.updateExperience(
              entry.id,
              'highlights',
              (e.target as HTMLTextAreaElement).value.split('\n').filter(Boolean),
            )
          }
        />
      </EntryRow>
    ))
}

function EducationList() {
  const r = useResume()
  return () =>
    r.store.resume().education.map((entry: EducationEntry) => (
      <EntryRow>
        <EntryHeader>
          <EntryRoleInput
            type="text"
            placeholder="Degree"
            value={entry.degree}
            onInput={(e: Event) =>
              r.store.updateEducation(entry.id, 'degree', (e.target as HTMLInputElement).value)
            }
          />
          <EntryRemove
            type="button"
            title="Remove"
            onClick={() => r.store.removeEducation(entry.id)}
          >
            ×
          </EntryRemove>
        </EntryHeader>
        <TextInput
          type="text"
          placeholder="School"
          value={entry.school}
          onInput={(e: Event) =>
            r.store.updateEducation(entry.id, 'school', (e.target as HTMLInputElement).value)
          }
        />
        <TextInput
          type="text"
          placeholder="Period"
          value={entry.period}
          onInput={(e: Event) =>
            r.store.updateEducation(entry.id, 'period', (e.target as HTMLInputElement).value)
          }
        />
      </EntryRow>
    ))
}
