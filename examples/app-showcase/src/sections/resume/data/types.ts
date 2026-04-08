/**
 * Types for the resume section.
 *
 * Mirrors the structure of a typical one-page resume:
 *   • Header — name, headline, contact details
 *   • Summary — short paragraph
 *   • Experience — list of jobs with bullet highlights
 *   • Education — list of degrees
 *   • Skills — flat list of skill names
 */

export interface ContactDetails {
  email: string
  phone: string
  location: string
  website: string
}

export interface ExperienceEntry {
  id: string
  role: string
  company: string
  /** Display range, e.g. "Jan 2024 — present". */
  period: string
  /** Free-form bullet highlights, one per line. */
  highlights: string[]
}

export interface EducationEntry {
  id: string
  degree: string
  school: string
  period: string
}

export interface Resume {
  name: string
  headline: string
  contact: ContactDetails
  summary: string
  experience: ExperienceEntry[]
  education: EducationEntry[]
  skills: string[]
}
