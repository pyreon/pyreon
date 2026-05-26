import { expect, test } from '@playwright/test'

/**
 * native-todomvc-web e2e — locks the runtime contract for the Phase D
 * web example (PR #947).
 *
 * The `verify-modes` cell asserts BUILD output (testid + Field placeholder
 * baked into the JS bundle). This spec asserts the RUNTIME — that
 * `@pyreon/primitives`' DOM impls actually wire up correctly in a real
 * browser. Coverage per primitive:
 *
 *   - <Stack> / <Inline>      — layout containers render structural DOM
 *   - <Field onChangeText onSubmit> — input + Enter-to-submit add a todo
 *   - <Checkbox>              — DOM shim toggles done state via onChange
 *   - <Button onPress>        — filter switches drive the visible signal
 *   - <For each by>           — keyed list reconciles per-todo
 *   - <Show when>             — `Clear completed` gates on hasCompleted
 *
 * Together with `verify-modes ui-showcase × spa` (build artifact gate)
 * + the unit tests in `@pyreon/primitives`, this completes the three-layer
 * coverage triad: build / unit / runtime.
 *
 * Each spec resets localStorage upfront so cross-test state can't leak
 * (the source uses `useStorage` which persists to localStorage by key
 * `pyreon-todomvc:todos`).
 */

const LS_KEY = 'pyreon-todomvc:todos'

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // SSR / first-render — ignore
    }
  }, LS_KEY)
})

test.describe('native-todomvc-web — Phase D runtime contract', () => {
  test('mounts the canonical-primitives TodoMVC into #app', async ({
    page,
  }) => {
    const response = await page.goto('/')
    expect(response?.status()).toBe(200)
    // Bootstrap shell carries one testid from index.html.
    await expect(page.getByTestId('app-root')).toBeVisible()
    // Root <Stack data-testid="todo-app"> forwards through to the DOM via
    // @pyreon/primitives' HtmlPassthroughProps (#953 closed the
    // data-* forwarding gap).
    await expect(page.getByTestId('todo-app')).toBeVisible()
    // Field's placeholder string + remaining counter render via the
    // @pyreon/primitives runtime.
    await expect(page.getByPlaceholder('What needs to be done?')).toBeVisible()
    await expect(page.getByText('0 remaining')).toBeVisible()
  })

  test('<Field onChangeText> + onSubmit (Enter) adds a todo + clears the input', async ({
    page,
  }) => {
    await page.goto('/')
    const field = page.getByPlaceholder('What needs to be done?')
    await field.fill('Buy milk')
    await field.press('Enter')
    // Todo appears via <For each={visible}>; "1 remaining" via remaining
    // computed; field clears via addTodo's draft.set('') — the
    // reactive binding on <Field value={draft}> propagates the cleared
    // signal back to the input.value property. Root cause + fix locked
    // in this PR's regression test (`value as getter (Pyreon compiler
    // _rp shape)` spec in primitives.browser.test.tsx).
    await expect(page.getByText('Buy milk')).toBeVisible()
    await expect(page.getByText('1 remaining')).toBeVisible()
    await expect(field).toHaveValue('')
  })

  test('<Checkbox> toggles done state via onChange (the DOM shim)', async ({
    page,
  }) => {
    await page.goto('/')
    const field = page.getByPlaceholder('What needs to be done?')
    await field.fill('Walk dog')
    await field.press('Enter')
    await expect(page.getByText('1 remaining')).toBeVisible()
    // The <Checkbox> shim renders as <input type="checkbox">.
    const cb = page.locator('input[type="checkbox"]')
    await expect(cb).toHaveCount(1)
    await cb.click()
    // Toggling done reduces remaining count via the remaining computed.
    await expect(page.getByText('0 remaining')).toBeVisible()
  })

  test('<Button onPress> filter switches drive the visible computed', async ({
    page,
  }) => {
    await page.goto('/')
    const field = page.getByPlaceholder('What needs to be done?')
    await field.fill('Active task')
    await field.press('Enter')
    // Field auto-clears after submit (the reactive binding closes the
    // loop). Just type the next todo directly.
    await field.fill('Done task')
    await field.press('Enter')
    // Mark second todo done.
    await page.locator('input[type="checkbox"]').nth(1).click()
    // Both todos visible under default 'all' filter.
    await expect(page.getByText('Active task')).toBeVisible()
    await expect(page.getByText('Done task')).toBeVisible()

    // 'Active' filter — only un-done remains. `exact: true` because
    // "Active task" todo text would otherwise match the Active button.
    await page.getByRole('button', { name: 'Active', exact: true }).click()
    await expect(page.getByText('Active task')).toBeVisible()
    await expect(page.getByText('Done task')).not.toBeVisible()

    // 'Completed' filter — only done remains. `exact: true` because
    // "Clear completed" button would otherwise collide.
    await page
      .getByRole('button', { name: 'Completed', exact: true })
      .click()
    await expect(page.getByText('Active task')).not.toBeVisible()
    await expect(page.getByText('Done task')).toBeVisible()

    // 'All' — both visible again.
    await page.getByRole('button', { name: 'All', exact: true }).click()
    await expect(page.getByText('Active task')).toBeVisible()
    await expect(page.getByText('Done task')).toBeVisible()
  })

  test('<Show when={hasCompleted}> reveals Clear completed; click removes done items', async ({
    page,
  }) => {
    await page.goto('/')
    const field = page.getByPlaceholder('What needs to be done?')
    await field.fill('Keep me')
    await field.press('Enter')
    await field.fill('Remove me')
    await field.press('Enter')

    // hasCompleted is false → Clear completed hidden via <Show>.
    await expect(
      page.getByRole('button', { name: 'Clear completed' }),
    ).not.toBeVisible()

    // Mark second todo done → hasCompleted flips true.
    await page.locator('input[type="checkbox"]').nth(1).click()
    const clearBtn = page.getByRole('button', { name: 'Clear completed' })
    await expect(clearBtn).toBeVisible()

    // Clicking the canonical <Button onPress> calls clearCompleted →
    // filters out done items.
    await clearBtn.click()
    await expect(page.getByText('Keep me')).toBeVisible()
    await expect(page.getByText('Remove me')).not.toBeVisible()
    // <Show> hides Clear completed again (hasCompleted is false now).
    await expect(clearBtn).not.toBeVisible()
  })
})
