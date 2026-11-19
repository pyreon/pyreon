/**
 * Whether an object theme value is a breakpoint map (`{ xs: …, md: … }`).
 * Only a PLAIN object is: any other object is a single value. A `css\`…\``
 * result (`CSSResult`, a class instance) passed as an Element's `css` prop
 * used to be walked as a breakpoint map, every breakpoint came out empty, and
 * the CSS was silently dropped.
 */
export const isBreakpointMap = (value: object): boolean => {
  const proto = Object.getPrototypeOf(value)

  return proto === Object.prototype || proto === null
}
