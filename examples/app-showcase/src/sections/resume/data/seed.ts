import type { Resume } from './types'

/** Seed resume so the preview is populated on first load. */
export const SEED_RESUME: Resume = {
  name: 'Aisha Aldridge',
  headline: 'Senior product engineer · TypeScript · UI systems',
  contact: {
    email: 'aisha@example.dev',
    phone: '+1 (555) 014-2871',
    location: 'Brooklyn, NY',
    website: 'aldridge.dev',
  },
  summary:
    'Product engineer with 9 years building reactive UIs and design systems. Recently focused on signal-based frameworks, performance budgets, and dragging large React codebases into the modern era.',
  experience: [
    {
      id: 'exp-1',
      role: 'Staff product engineer',
      company: 'Pyreon Studio',
      period: 'Jun 2024 — present',
      highlights: [
        'Led the @pyreon/ui-system rewrite — 75 components, three layers, full theming',
        'Cut p95 first-paint by 60% by inlining route metadata at build time',
        'Mentored four engineers through the senior promo cycle',
      ],
    },
    {
      id: 'exp-2',
      role: 'Senior frontend engineer',
      company: 'Acme Engineering',
      period: 'Mar 2021 — May 2024',
      highlights: [
        'Owned the migration from Webpack to Vite — saved 4 minutes per CI build',
        'Built a typed form library that replaced four legacy implementations',
        'Wrote the company-wide accessibility audit playbook',
      ],
    },
    {
      id: 'exp-3',
      role: 'Frontend engineer',
      company: 'Coastal Software',
      period: 'Aug 2018 — Feb 2021',
      highlights: [
        'Shipped a real-time dashboard used by 12k internal users',
        'Open-sourced a charting library with 800+ stars',
      ],
    },
  ],
  education: [
    {
      id: 'edu-1',
      degree: 'B.S. Computer Science',
      school: 'Stony Brook University',
      period: '2014 — 2018',
    },
  ],
  skills: [
    'TypeScript',
    'Pyreon',
    'React',
    'Vite',
    'CSS-in-JS',
    'Design systems',
    'Web performance',
    'Accessibility',
    'Mentoring',
  ],
}
