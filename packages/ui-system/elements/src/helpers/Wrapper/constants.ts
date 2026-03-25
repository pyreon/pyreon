/**
 * HTML elements that need a two-layer DOM workaround because browsers do not
 * fully support flexbox layout on button, fieldset, and legend elements.
 * @see https://stackoverflow.com/questions/35464067/flexbox-not-working-on-button-or-fieldset-elements
 */
export const INLINE_ELEMENTS_FLEX_FIX = {
  button: true,
  fieldset: true,
  legend: true,
}
