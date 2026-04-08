import { signal } from '@pyreon/reactivity'
import { defineStore } from '@pyreon/store'
import { SEED_RESUME } from './data/seed'
import type { ContactDetails, EducationEntry, ExperienceEntry, Resume } from './data/types'

/**
 * Resume store.
 *
 * Single signal holds the entire resume; the form binds to nested
 * fields via small updater helpers. Both the form pane AND the live
 * preview pane re-render on every store change because the same
 * signal is read by both.
 */
export const useResume = defineStore('resume', () => {
  const resume = signal<Resume>(SEED_RESUME)

  // ── Top-level fields ───────────────────────────────────────────────
  function setName(value: string) {
    resume.set({ ...resume(), name: value })
  }
  function setHeadline(value: string) {
    resume.set({ ...resume(), headline: value })
  }
  function setSummary(value: string) {
    resume.set({ ...resume(), summary: value })
  }
  function setContact<K extends keyof ContactDetails>(field: K, value: ContactDetails[K]) {
    resume.set({ ...resume(), contact: { ...resume().contact, [field]: value } })
  }

  // ── Experience array ────────────────────────────────────────────────
  function addExperience() {
    const entry: ExperienceEntry = {
      id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'New role',
      company: 'Company',
      period: '2026 — present',
      highlights: ['What you did and the impact it had.'],
    }
    resume.set({ ...resume(), experience: [...resume().experience, entry] })
  }
  function updateExperience<K extends keyof Omit<ExperienceEntry, 'id'>>(
    id: string,
    field: K,
    value: ExperienceEntry[K],
  ) {
    resume.set({
      ...resume(),
      experience: resume().experience.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    })
  }
  function removeExperience(id: string) {
    resume.set({ ...resume(), experience: resume().experience.filter((e) => e.id !== id) })
  }

  // ── Education array ─────────────────────────────────────────────────
  function addEducation() {
    const entry: EducationEntry = {
      id: `edu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      degree: 'New degree',
      school: 'School',
      period: '20XX — 20XX',
    }
    resume.set({ ...resume(), education: [...resume().education, entry] })
  }
  function updateEducation<K extends keyof Omit<EducationEntry, 'id'>>(
    id: string,
    field: K,
    value: EducationEntry[K],
  ) {
    resume.set({
      ...resume(),
      education: resume().education.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    })
  }
  function removeEducation(id: string) {
    resume.set({ ...resume(), education: resume().education.filter((e) => e.id !== id) })
  }

  // ── Skills (flat list) ──────────────────────────────────────────────
  function setSkills(value: string[]) {
    resume.set({ ...resume(), skills: value })
  }

  function reset() {
    resume.set(SEED_RESUME)
  }

  return {
    resume,
    setName,
    setHeadline,
    setSummary,
    setContact,
    addExperience,
    updateExperience,
    removeExperience,
    addEducation,
    updateEducation,
    removeEducation,
    setSkills,
    reset,
  }
})
