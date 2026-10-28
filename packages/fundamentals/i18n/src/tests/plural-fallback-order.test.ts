import { createI18n } from '../create-i18n'

// The plural candidate order has to satisfy two conventions at once:
//
//   1. i18next-style: the BARE key is the singular / `one` form, so
//      `{ item, item_other }` is a complete English message pair.
//   2. CLDR (#3981): a category with no message of its own (Czech `few`)
//      falls back to the `_other` PLURAL form before the bare key, so an
//      untranslated `few` shows a plural, not the singular.
//
// v0.53 satisfied (1); the first cut of (2) tried `key_other` before the
// bare key for EVERY category, `one` included, so `t('item', { count: 1 })`
// over `{ item, item_other }` returned "1 items". These specs pin both.

function make(locale: string, messages: Record<string, string>) {
  return createI18n({ locale, messages: { [locale]: messages } })
}

describe('plural fallback order', () => {
  describe('bare key is the singular (one) form', () => {
    const pair = { item: '{{count}} item', item_other: '{{count}} items' }

    it('count 1 resolves the bare key, not _other', () => {
      expect(make('en', pair).t('item', { count: 1 })).toBe('1 item')
    })

    it('count 2 / 0 resolve _other', () => {
      const i18n = make('en', pair)
      expect(i18n.t('item', { count: 2 })).toBe('2 items')
      expect(i18n.t('item', { count: 0 })).toBe('0 items')
    })

    it('an explicit _one still wins over the bare key', () => {
      const i18n = make('en', { ...pair, item_one: 'one item' })
      expect(i18n.t('item', { count: 1 })).toBe('one item')
    })

    it('French 0 (CLDR one) takes the bare singular, not _other', () => {
      expect(make('fr', pair).t('item', { count: 0 })).toBe('0 item')
    })

    it('one falls back to _other only when NO singular form exists', () => {
      expect(make('en', { item_other: '{{count}} items' }).t('item', { count: 1 })).toBe('1 items')
    })
  })

  describe('non-one categories prefer the plural form', () => {
    const cs = { file: '{{count}} soubor', file_other: '{{count}} souborů' }

    it('Czech few with no _few falls back to _other, not the bare singular', () => {
      expect(make('cs', cs).t('file', { count: 3 })).toBe('3 souborů')
    })

    it('Czech many (fractional) falls back to _other', () => {
      expect(make('cs', cs).t('file', { count: 1.5 })).toBe('1.5 souborů')
    })

    it('Czech few uses _few when present', () => {
      expect(make('cs', { ...cs, file_few: '{{count}} soubory' }).t('file', { count: 3 })).toBe(
        '3 soubory',
      )
    })

    it('Czech one resolves the bare singular', () => {
      expect(make('cs', cs).t('file', { count: 1 })).toBe('1 soubor')
    })

    it('explicit _zero wins at count 0; absent, English 0 takes _other', () => {
      expect(
        make('en', { item: 'x', item_other: 'many', item_zero: 'none' }).t('item', { count: 0 }),
      ).toBe('none')
      expect(make('en', { item: 'x', item_other: 'many' }).t('item', { count: 0 })).toBe('many')
    })

    it('a bare key alone serves every count', () => {
      const i18n = make('cs', { file: 'files' })
      for (const n of [0, 1, 3, 5, 1.5]) expect(i18n.t('file', { count: n })).toBe('files')
    })
  })

  describe('with context', () => {
    const msgs = {
      friend: 'a friend',
      friend_other: '{{count}} friends',
      friend_male: 'a boyfriend',
      friend_male_other: '{{count}} boyfriends',
    }

    it('count 1 resolves the bare context form', () => {
      expect(make('en', msgs).t('friend', { context: 'male', count: 1 })).toBe('a boyfriend')
    })

    it('count 2 resolves the context plural', () => {
      expect(make('en', msgs).t('friend', { context: 'male', count: 2 })).toBe('2 boyfriends')
    })

    it('count 1 prefers ANY singular (plain bare key) over the context plural', () => {
      const i18n = make('en', { friend: 'a friend', friend_male_other: '{{count}} boyfriends' })
      expect(i18n.t('friend', { context: 'male', count: 1 })).toBe('a friend')
    })

    it('unknown context falls back to the plain forms', () => {
      const i18n = make('en', msgs)
      expect(i18n.t('friend', { context: 'nope', count: 1 })).toBe('a friend')
      expect(i18n.t('friend', { context: 'nope', count: 3 })).toBe('3 friends')
    })

    it('non-one with context keeps v0.53 context-major order', () => {
      // `few` with only the context singular + a plain plural: context wins (unchanged).
      const i18n = make('cs', { file_x: 'x-singular', file_other: 'plain plural' })
      expect(i18n.t('file', { context: 'x', count: 3 })).toBe('x-singular')
    })
  })
})
