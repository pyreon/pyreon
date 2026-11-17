/**
 * Anonymized content for the showcase. Plain lorem ipsum + procedurally
 * generated fake company/role names. Deterministic — no Math.random —
 * so SSR output is stable and matches client hydration.
 *
 * Images use picsum.photos with seed strings for deterministic placeholders.
 */

const LOREM_SENTENCES = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
  'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse.',
  'Excepteur sint occaecat cupidatat non proident, sunt in culpa.',
  'At vero eos et accusamus et iusto odio dignissimos ducimus.',
  'Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit.',
  'Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet.',
]

export const loremShort = LOREM_SENTENCES[0]
export const loremMedium = LOREM_SENTENCES.slice(0, 3).join(' ')
export const loremLong = LOREM_SENTENCES.join(' ')

// ─── Fake entities — stable, deterministic ─────────────────────────────────

const COMPANIES = [
  'Acme Corp',
  'Globex Systems',
  'Initech',
  'Hooli',
  'Vandelay Industries',
  'Pied Piper',
  'Wayne Enterprises',
  'Stark Industries',
  'Umbrella Corp',
  'Cyberdyne Systems',
  'Aperture Science',
  'Tyrell Corp',
]

const ROLES = [
  'Frontend Engineer',
  'Senior Engineer',
  'Staff Engineer',
  'Engineering Lead',
  'Tech Lead',
  'Platform Engineer',
  'UI Architect',
  'Frontend Architect',
]

const DATES = [
  '2024 — Present',
  '2022 — 2024',
  '2020 — 2022',
  '2018 — 2020',
  '2016 — 2018',
  '2014 — 2016',
  '2012 — 2014',
  '2010 — 2012',
]

const DUTIES = [
  'Built and maintained a design system used by 12+ product teams.',
  'Led the migration from SPA to SSR for a 500k-user application.',
  'Reduced page load time by 60% through bundle splitting and preloading.',
  'Introduced TypeScript across the frontend org, 150+ files.',
  'Mentored three junior engineers into mid-level roles.',
  'Owned the component library, shipped 40+ production components.',
  'Rewrote the checkout flow, lifting conversion by 8%.',
  'Implemented a11y audits and fixed 200+ issues.',
  'Designed the auth layer with session rotation and refresh tokens.',
  'Instrumented core vitals and built a perf dashboard.',
]

export interface WorkItem {
  company: string
  role: string
  date: string
  duties: string[]
  imageSeed: string
}

export const workItems: WorkItem[] = COMPANIES.slice(0, 8).map((company, i) => ({
  company,
  role: ROLES[i % ROLES.length]!,
  date: DATES[i % DATES.length]!,
  duties: [DUTIES[i % DUTIES.length]!, DUTIES[(i + 3) % DUTIES.length]!, DUTIES[(i + 6) % DUTIES.length]!],
  imageSeed: `work-${company.replace(/\s+/g, '-').toLowerCase()}`,
}))

// ─── Logos (random square images) ──────────────────────────────────────────

export const logos = COMPANIES.slice(0, 10).map((name) => ({
  name,
  seed: `logo-${name.replace(/\s+/g, '-').toLowerCase()}`,
}))

// ─── Skills / badges ───────────────────────────────────────────────────────

export const badges = [
  'TypeScript',
  'React',
  'Vue',
  'Svelte',
  'Solid',
  'Pyreon',
  'CSS',
  'GraphQL',
  'Node',
  'Bun',
  'Vite',
  'esbuild',
  'Playwright',
  'Vitest',
  'Docker',
  'Kubernetes',
]

// ─── Timeline (education-shaped) ────────────────────────────────────────────

export interface TimelineItem {
  title: string
  subtitle: string
  date: string
  description: string
  imageSeed: string
}

const INSTITUTIONS = [
  'Alpha University',
  'Beta Institute',
  'Gamma College',
  'Delta Academy',
]

const DEGREES = [
  'B.Sc. Computer Science',
  'M.Sc. Software Engineering',
  'Ph.D. Computer Science',
  'Advanced Coursework',
]

export const timelineItems: TimelineItem[] = INSTITUTIONS.map((inst, i) => ({
  title: DEGREES[i % DEGREES.length]!,
  subtitle: inst,
  date: `${2010 + i * 2} — ${2012 + i * 2}`,
  description: LOREM_SENTENCES[i % LOREM_SENTENCES.length]!,
  imageSeed: `edu-${inst.replace(/\s+/g, '-').toLowerCase()}`,
}))
