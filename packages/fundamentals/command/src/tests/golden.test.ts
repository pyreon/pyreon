import { describe, expect, it } from 'vitest'
import { rank } from '../core'
import { admin, editor, settings } from './golden-lists'

/**
 * Golden ranking cases from realistic command lists: an editor, an admin app (with Czech, German and Japanese titles) and a
 * settings screen (with emoji). Each row is [list, query, the first results]. A change to the scoring that moves any of them
 * must be a decision: read the new order, and change the row only if the new order is better.
 */
const lists = { editor, admin, settings } as const

const cases: [keyof typeof lists, string, string[]][] = [
  ["editor", "np", ["New Project","Toggle Minimap","Find and Replace"]],
  ["editor", "nf", ["New File","New Folder","Open File…"]],
  ["editor", "save", ["Save","Save As…","Save All"]],
  ["editor", "sa", ["Save","Save As…","Save All"]],
  ["editor", "ts", ["Toggle Sidebar","Go to Symbol…","Run Task"]],
  ["editor", "tsb", ["Toggle Sidebar","Go to Symbol…"]],
  ["editor", "gtf", ["Go to File…","Go to Definition"]],
  ["editor", "gtl", ["Go to Line…","Go to File…","Go to Symbol…"]],
  ["editor", "format", ["Format Document","Format Selection"]],
  ["editor", "theme", ["Change Color Theme","🎨 Select Icon Theme"]],
  ["editor", "git push", ["Git: Push"]],
  ["editor", "push git", ["Git: Push"]],
  ["editor", "tb", ["toggleBold","Git: Create Branch…","insertTable"]],
  ["editor", "bold", ["toggleBold"]],
  ["editor", "win", ["New Window","Close Window","Reload Window"]],
  ["editor", "rename", ["Rename Symbol"]],
  ["editor", "op set", ["Open Settings","Preferences: Open User Settings"]],
  ["editor", "set", ["Open Settings","Preferences: Open User Settings","🎨 Select Icon Theme"]],
  ["editor", "sett", ["Open Settings","Preferences: Open User Settings","insertTable"]],
  ["editor", "deploy", ["🚀 Deploy Preview"]],
  ["editor", "🚀", ["🚀 Deploy Preview"]],
  ["editor", "toggle term", ["Toggle Terminal"]],
  ["admin", "user", ["Create User","Delete User","Import Customers"]],
  ["admin", "cu", ["Create User","Import Customers","Export Customers (CSV)"]],
  ["admin", "inv", ["Invite Teammate","Create Invoice","Export Invoices (CSV)"]],
  ["admin", "csv", ["Export Customers (CSV)","Export Invoices (CSV)"]],
  ["admin", "zakaz", ["Zákaznický příběh","Přehled zákazníků"]],
  ["admin", "prehled", ["Přehled zákazníků"]],
  ["admin", "prida", ["Přidat uživatele"]],
  ["admin", "grosse", ["Größe ändern"]],
  ["admin", "strasse", ["Straßenkarte öffnen"]],
  ["admin", "ubersicht", ["Übersicht"]],
  ["admin", "einst", ["Einstellungen öffnen"]],
  ["admin", "ユーザー", ["ユーザーを追加","ユーザー一覧"]],
  ["admin", "ユザ", ["ユーザーを追加","ユーザー一覧"]],
  ["admin", "ゆーざー", ["ユーザーを追加","ユーザー一覧"]],
  ["admin", "ログ", ["ログアウト"]],
  ["admin", "api", ["Rotate API Key","Manage API Keys","Edit Roles and Permissions"]],
  ["admin", "rk", ["Rotate API Key","Straßenkarte öffnen","Přehled zákazníků"]],
  ["admin", "sign", ["Sign Out","Switch Organisation"]],
  ["settings", "dark", ["Dark Mode"]],
  ["settings", "notif", ["Notifications","Email Notifications","Push Notifications"]],
  ["settings", "push", ["Push Notifications"]],
  ["settings", "tf", ["Two-Factor Authentication","Notifications","Email Notifications"]],
  ["settings", "lang", ["Language"]],
  ["settings", "acc", ["Account","Accessibility","Delete Account"]],
  ["settings", "night", ["🌙 Night Shift"]],
  ["settings", "🌙", ["🌙 Night Shift"]],
  ["settings", "data", ["Data Export"]],
  ["settings", "ex", ["Data Export"]],
  ["settings", "zzz", []],
]

describe('golden ranking cases', () => {
  for (const [name, query, expected] of cases) {
    it(`${name}: ${JSON.stringify(query)}`, () => {
      const got = rank(query, lists[name], (text) => text)
        .slice(0, expected.length)
        .map((r) => r.item)
      expect(got).toEqual(expected)
    })
  }

  it('every list is matched in full for an empty query, in list order', () => {
    for (const list of Object.values(lists)) expect(rank('', list, (t) => t).map((r) => r.item)).toEqual([...list])
  })
})
