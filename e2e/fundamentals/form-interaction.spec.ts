import { expect, test } from '@playwright/test'

/**
 * Real form-INTERACTION e2e for the FormDemo (`@pyreon/form` useForm +
 * useField + useFormState) — drives the exact behaviors the form perf round
 * (#1700) rewrote: blur validation (the inlined `setTouched` path), POST-FAILED-
 * SUBMIT live revalidation (the validation logic moved OUT of the removed
 * per-field `effect()` INTO `setValue`), the `isDirty` count, and end-to-end
 * submit. The nav-sweep in `playground.spec.ts` only proves the demo MOUNTS;
 * these prove it WORKS in a real browser.
 *
 * FormDemo: validateOn:'blur', fields name/email/password (+ newsletter
 * checkbox), validators (name required / email must include '@' / password
 * >=8). Errors render in `.error` divs gated on `showError` (touched + error).
 */

const NAME = 'input[placeholder="Your name"]'
const EMAIL = 'input[type="email"]'
const PASSWORD = 'input[type="password"]'

test.describe('FormDemo interaction — @pyreon/form', () => {
  test('blur on an empty required field shows its validation error', async ({ page }) => {
    await page.goto('/form')
    await page.locator(NAME).focus()
    await page.locator(NAME).blur() // validateOn:'blur' → validate the field
    await expect(page.getByText('Name is required')).toBeVisible()
  })

  test('post-failed-submit: typing into a field clears its error LIVE (the moved effect logic)', async ({ page }) => {
    await page.goto('/form')
    // Submit with everything empty → handleSubmit validates ALL fields,
    // marks them touched, submitCount → 1.
    await page.getByRole('button', { name: 'Register' }).click()
    await expect(page.getByText('Name is required')).toBeVisible()
    await expect(page.getByText('Email is required')).toBeVisible()
    await expect(page.getByText('Password is required')).toBeVisible()

    // Now type a VALID email. submitCount > 0 → setValue revalidates inline
    // (this is exactly the behavior moved from the removed per-field effect).
    // The email error must clear WITHOUT a blur.
    await page.locator(EMAIL).fill('ada@example.com')
    await expect(page.getByText('Email is required')).toBeHidden()
    await expect(page.getByText('Must be a valid email')).toBeHidden()
    // Untouched-by-typing fields keep their errors.
    await expect(page.getByText('Name is required')).toBeVisible()

    // Typing an INVALID email re-surfaces the format error live.
    await page.locator(EMAIL).fill('nope')
    await expect(page.getByText('Must be a valid email')).toBeVisible()
  })

  test('isDirty badge flips on edit and resets with Reset', async ({ page }) => {
    await page.goto('/form')
    await expect(page.locator('.badge', { hasText: 'Pristine' })).toBeVisible()
    await page.locator(NAME).fill('Ada')
    await expect(page.locator('.badge', { hasText: 'Dirty' })).toBeVisible()
    await page.getByRole('button', { name: 'Reset' }).click()
    await expect(page.locator('.badge', { hasText: 'Pristine' })).toBeVisible()
    // value cleared too
    await expect(page.locator(NAME)).toHaveValue('')
  })

  test('valid input submits end-to-end (onSubmit fires, Submitted Data renders)', async ({ page }) => {
    await page.goto('/form')
    await page.locator(NAME).fill('Ada')
    await page.locator(EMAIL).fill('ada@example.com')
    await page.locator(PASSWORD).fill('password123')
    await page.getByRole('button', { name: 'Register' }).click()
    // onSubmit awaits 500ms then sets `submitted` → the section appears with
    // the submitted JSON (proves getSubmitValues returned the typed values).
    await expect(page.getByText('Submitted Data')).toBeVisible({ timeout: 4000 })
    await expect(page.locator('pre', { hasText: 'ada@example.com' })).toBeVisible()
    // submit count badge incremented
    await expect(page.locator('.badge', { hasText: 'Submits: 1' })).toBeVisible()
  })

  test('Clear Errors removes shown errors without changing values', async ({ page }) => {
    await page.goto('/form')
    await page.getByRole('button', { name: 'Register' }).click()
    await expect(page.getByText('Name is required')).toBeVisible()
    await page.getByRole('button', { name: 'Clear Errors' }).click()
    await expect(page.getByText('Name is required')).toBeHidden()
  })
})
