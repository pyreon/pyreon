import { createI18n } from '@pyreon/i18n'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCommands } from '../commands'
import type { Commands } from '../types'
import { createPalette } from '../palette'

const messages = {
  en: { save: 'Save document', open: 'Open file', theme: 'Change theme…' },
  cs: { save: 'Uložit dokument', open: 'Otevřít soubor', theme: 'Změnit motiv…' },
  de: { save: 'Dokument speichern', open: 'Datei öffnen', theme: 'Design ändern…' },
}

describe('titles from @pyreon/i18n', () => {
  let commands: Commands
  beforeEach(() => {
    commands = createCommands()
  })
  afterEach(() => commands.dispose())

  it('switching the locale re-ranks and re-renders: the same query finds other titles, the highlights move, the palette stays open', () => {
    const i18n = createI18n({ locale: 'en', messages })
    commands.register([
      { id: 'save', title: () => i18n.t('save') },
      { id: 'open', title: () => i18n.t('open') },
      { id: 'theme', title: () => i18n.t('theme'), children: [{ id: 'dark', title: 'Dark' }] },
    ])
    const palette = createPalette({ commands, hotkey: false })
    palette.open()
    palette.setQuery('ulo')
    expect(palette.results()).toEqual([])
    palette.setQuery('sav')
    expect(palette.results().map((r) => [r.id, r.title, r.ranges])).toEqual([['save', 'Save document', [[0, 3]]]])

    i18n.locale.set('cs')
    expect(palette.isOpen()).toBe(true)
    expect(palette.results()).toEqual([])
    palette.setQuery('ulo')
    expect(palette.results().map((r) => [r.id, r.title, r.ranges])).toEqual([['save', 'Uložit dokument', [[0, 3]]]])
    // an accent-free query finds an accented title, and the new locale's page title is used
    palette.setQuery('zmenit')
    expect(palette.results().map((r) => r.title)).toEqual(['Změnit motiv…'])

    i18n.locale.set('de')
    palette.setQuery('speich')
    expect(palette.results().map((r) => r.title)).toEqual(['Dokument speichern'])
    palette.dispose()
  })

  it('the page title and the announcement follow the locale', () => {
    const i18n = createI18n({ locale: 'en', messages })
    commands.register({ id: 'theme', title: () => i18n.t('theme'), children: [{ id: 'dark', title: 'Dark' }] })
    const palette = createPalette({ commands, hotkey: false })
    palette.open('theme')
    expect(palette.pageTitle()).toBe('Change theme…')
    i18n.locale.set('cs')
    expect(palette.pageTitle()).toBe('Změnit motiv…')
    palette.dispose()
  })

  it('both locales find both commands for a letter they share', () => {
    const i18n = createI18n({ locale: 'en', messages })
    commands.register([{ id: 'a', title: () => i18n.t('save') }, { id: 'b', title: () => i18n.t('open') }])
    const palette = createPalette({ commands, hotkey: false })
    palette.open()
    palette.setQuery('o')
    const en = palette.results().map((r) => r.id)
    i18n.locale.set('cs')
    const cs = palette.results().map((r) => r.id)
    expect(new Set(en)).toEqual(new Set(['a', 'b']))
    expect(new Set(cs)).toEqual(new Set(['a', 'b']))
    palette.dispose()
  })
})
