/**
 * ECMA-402 options → the native formatter plan, for `Intl.DateTimeFormat` /
 * `Intl.NumberFormat` and the `toLocale*String` shapes that construct one.
 *
 * Pure and AST-free: the recognizer (`intl-plugin.ts`) reads the options object
 * into {@link IntlOptionInput}s and this module decides, so the decisions are
 * unit-testable against the spec rather than through the parser.
 *
 * ## Why skeletons
 *
 * V8 (Node, Chrome) does not hold a pattern per option set. It turns the
 * component options (`year`, `month`, `hour`, …) into an ICU SKELETON
 * (`yMMMd`, `jmm`) and asks ICU's DateTimePatternGenerator for the locale's
 * best pattern. Both native platforms expose the same generator —
 * `DateFormatter.setLocalizedDateFormatFromTemplate` on Apple,
 * `android.icu.text.DateTimePatternGenerator` on Android — so lowering the
 * options to the SAME skeleton V8 builds is what makes the native output agree
 * with the web, rather than a hand-written pattern table that would agree for
 * the locales someone happened to write down. The remaining differences are in
 * the locale DATA each platform ships (CLDR versions), not in the algorithm;
 * `intl-differential.test.ts` measures them.
 *
 * ## The supported subset
 *
 * DateTimeFormat: `dateStyle`, `timeStyle`, `timeZone`, `weekday`, `year`,
 * `month`, `day`, `hour`, `minute`, `second`, `hour12`, `hourCycle`,
 * `timeZoneName` (`short` / `long`).
 * NumberFormat: `style` (`decimal` / `currency` / `percent`), `currency`,
 * `currencyDisplay` (`symbol` / `code` / `name`), `minimumFractionDigits`,
 * `maximumFractionDigits`, `minimumIntegerDigits`, `useGrouping` (boolean).
 *
 * Everything else is a NAMED warning and is ignored — never a silent drop.
 */

/** One options-object entry as written: a literal, or a runtime expression (`args[index]`). */
export type IntlOptionInput =
  | { readonly kind: 'static'; readonly value: string | number | boolean }
  | { readonly kind: 'dynamic'; readonly index: number }

/** Which ECMA-402 `ToDateTimeOptions(required, defaults)` the call site implies. */
export type DateTimeEntry =
  /** `new Intl.DateTimeFormat(…)` — required `any`, defaults `date`. */
  | 'DateTimeFormat'
  /** `date.toLocaleDateString(…)` — required `date`, defaults `date`. */
  | 'toLocaleDateString'
  /** `date.toLocaleTimeString(…)` — required `time`, defaults `time`. */
  | 'toLocaleTimeString'
  /** `date.toLocaleString(…)` — required `any`, defaults `all`. */
  | 'toLocaleString'

export interface DateTimePlan {
  readonly kind: 'datetime'
  readonly dateStyle?: string
  readonly timeStyle?: string
  /** The ICU skeleton V8 would build from the component options. */
  readonly skeleton?: string
  readonly timeZone?: IntlOptionInput
}

export interface NumberPlan {
  readonly kind: 'number'
  readonly style: 'decimal' | 'currency' | 'percent'
  readonly currency?: IntlOptionInput
  readonly currencyDisplay?: 'symbol' | 'code' | 'name'
  readonly minimumFractionDigits?: IntlOptionInput
  readonly maximumFractionDigits?: IntlOptionInput
  readonly minimumIntegerDigits?: IntlOptionInput
  readonly useGrouping?: boolean
}

export interface IntlPlanResult<P> {
  /** `null` when the options can never produce a value — JS would throw. */
  readonly plan: P | null
  readonly warnings: string[]
}

const STYLES = new Set(['full', 'long', 'medium', 'short'])

/** Component option → the skeleton letters V8 emits for each accepted value. */
const COMPONENT_SKELETON: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  weekday: { narrow: 'EEEEE', short: 'EEE', long: 'EEEE' },
  year: { numeric: 'y', '2-digit': 'yy' },
  month: { numeric: 'M', '2-digit': 'MM', narrow: 'MMMMM', short: 'MMM', long: 'MMMM' },
  day: { numeric: 'd', '2-digit': 'dd' },
  minute: { numeric: 'm', '2-digit': 'mm' },
  second: { numeric: 's', '2-digit': 'ss' },
  timeZoneName: { short: 'z', long: 'zzzz' },
}
/** Skeleton order — the generator ignores it, a stable one keeps the emit deterministic. */
const SKELETON_ORDER = ['weekday', 'year', 'month', 'day', 'hour', 'minute', 'second', 'timeZoneName']

const DATE_COMPONENTS = ['weekday', 'year', 'month', 'day']
const TIME_COMPONENTS = ['hour', 'minute', 'second']

/** Options ECMA-402 defines that this lowering does not carry. */
const DATETIME_UNSUPPORTED: Readonly<Record<string, string>> = {
  era: 'there is no era field in the native pattern request',
  dayPeriod: 'the native pattern generators have no flexible day-period ("in the morning") request',
  fractionalSecondDigits: 'fractional seconds are not requested from the native pattern generators',
  calendar: 'only the locale default calendar is lowered',
  numberingSystem: 'only the locale default numbering system is lowered',
  formatMatcher: 'the native generators always use best-fit matching',
  localeMatcher: 'the native platforms always use best-fit locale matching',
}

const NUMBER_UNSUPPORTED: Readonly<Record<string, string>> = {
  notation: 'compact / scientific / engineering notation is not lowered',
  compactDisplay: 'compact notation is not lowered',
  signDisplay: 'the native formatters are not asked for a custom sign display',
  unit: '`style: "unit"` is not lowered',
  unitDisplay: '`style: "unit"` is not lowered',
  minimumSignificantDigits: 'significant-digit rounding is not lowered',
  maximumSignificantDigits: 'significant-digit rounding is not lowered',
  roundingMode: 'only the ECMA-402 default rounding (half-expand) is lowered',
  roundingPriority: 'significant-digit rounding is not lowered',
  roundingIncrement: 'rounding increments are not lowered',
  trailingZeroDisplay: 'trailing-zero stripping is not lowered',
  currencySign: '`currencySign: "accounting"` is not lowered',
  numberingSystem: 'only the locale default numbering system is lowered',
  localeMatcher: 'the native platforms always use best-fit locale matching',
}

/** A component option must be a literal: it decides the skeleton, which is baked at compile time. */
function staticChoice(
  where: string,
  key: string,
  v: IntlOptionInput,
  allowed: ReadonlySet<string> | readonly string[],
  warnings: string[],
): string | undefined {
  const values = [...allowed]
  if (v.kind === 'dynamic') {
    warnings.push(
      `${where} \`${key}\` must be a string literal (${values.map((x) => `"${x}"`).join(' / ')}) — it selects the native pattern at compile time, so a runtime value cannot lower. The option is IGNORED on iOS and Android.`,
    )
    return undefined
  }
  if (typeof v.value !== 'string' || !values.includes(v.value)) {
    warnings.push(
      `${where} \`${key}: ${JSON.stringify(v.value)}\` is not a supported value (${values.map((x) => `"${x}"`).join(' / ')}). The option is IGNORED on iOS and Android.`,
    )
    return undefined
  }
  return v.value
}

/**
 * Plan a date/time formatter. `entry` decides the ECMA-402 defaults: a bare
 * `new Intl.DateTimeFormat()` formats the date only, `toLocaleTimeString()`
 * the time only, `date.toLocaleString()` both.
 */
export function planDateTime(
  entry: DateTimeEntry,
  options: ReadonlyMap<string, IntlOptionInput>,
): IntlPlanResult<DateTimePlan> {
  const where = entry === 'DateTimeFormat' ? '`Intl.DateTimeFormat` option' : `\`${entry}\` option`
  const warnings: string[] = []
  const required = entry === 'toLocaleDateString' ? 'date' : entry === 'toLocaleTimeString' ? 'time' : 'any'
  const defaults =
    entry === 'toLocaleTimeString' ? 'time' : entry === 'toLocaleString' ? 'all' : 'date'

  let dateStyle: string | undefined
  let timeStyle: string | undefined
  let timeZone: IntlOptionInput | undefined
  let hour12: boolean | undefined
  let hourCycle: string | undefined
  const components = new Map<string, string>()

  for (const [key, v] of options) {
    if (key === 'dateStyle' || key === 'timeStyle') {
      const s = staticChoice(where, key, v, STYLES, warnings)
      if (key === 'dateStyle') dateStyle = s
      else timeStyle = s
    } else if (key === 'timeZone') {
      if (v.kind === 'static' && typeof v.value !== 'string') {
        warnings.push(`${where} \`timeZone\` must be an IANA zone name string. The option is IGNORED on iOS and Android.`)
      } else {
        timeZone = v
      }
    } else if (key === 'hour12') {
      if (v.kind === 'static' && typeof v.value === 'boolean') hour12 = v.value
      else
        warnings.push(
          `${where} \`hour12\` must be a boolean literal — it selects the hour field at compile time. The option is IGNORED on iOS and Android.`,
        )
    } else if (key === 'hourCycle') {
      hourCycle = staticChoice(where, key, v, ['h11', 'h12', 'h23', 'h24'], warnings)
    } else if (key === 'hour') {
      const s = staticChoice(where, key, v, ['numeric', '2-digit'], warnings)
      if (s !== undefined) components.set('hour', s)
    } else if (key in COMPONENT_SKELETON) {
      const s = staticChoice(where, key, v, Object.keys(COMPONENT_SKELETON[key]!), warnings)
      if (s !== undefined) components.set(key, s)
    } else if (key in DATETIME_UNSUPPORTED) {
      warnings.push(`${where} \`${key}\` has no native lowering — ${DATETIME_UNSUPPORTED[key]}. The option is IGNORED on iOS and Android.`)
    } else {
      warnings.push(
        `${where} \`${key}\` is not a DateTimeFormat option the native lowering knows (supported: dateStyle, timeStyle, timeZone, weekday, year, month, day, hour, minute, second, hour12, hourCycle, timeZoneName). It is IGNORED on iOS and Android.`,
      )
    }
  }

  const hasStyle = dateStyle !== undefined || timeStyle !== undefined
  // ECMA-402 throws a TypeError for a style combined with a component, and for
  // the wrong style on the date-only / time-only entry points. Mirror the throw
  // as a compile-time diagnostic rather than inventing a precedence.
  if (hasStyle && components.size > 0) {
    warnings.push(
      `${where}s combine \`dateStyle\`/\`timeStyle\` with component options (${[...components.keys()].join(', ')}) — JavaScript throws a TypeError for this, so there is nothing to lower. Use either the styles or the components.`,
    )
    return { plan: null, warnings }
  }
  if (required === 'date' && timeStyle !== undefined) {
    warnings.push('`toLocaleDateString` with `timeStyle` throws a TypeError in JavaScript — there is nothing to lower.')
    return { plan: null, warnings }
  }
  if (required === 'time' && dateStyle !== undefined) {
    warnings.push('`toLocaleTimeString` with `dateStyle` throws a TypeError in JavaScript — there is nothing to lower.')
    return { plan: null, warnings }
  }
  if (hasStyle) {
    return {
      plan: {
        kind: 'datetime',
        ...(dateStyle !== undefined ? { dateStyle } : {}),
        ...(timeStyle !== undefined ? { timeStyle } : {}),
        ...(timeZone !== undefined ? { timeZone } : {}),
      },
      warnings,
    }
  }

  // ToDateTimeOptions: defaults apply only when NO component of the required
  // kind was asked for.
  const hasDate = DATE_COMPONENTS.some((k) => components.has(k))
  const hasTime = TIME_COMPONENTS.some((k) => components.has(k))
  let needDefaults = true
  if ((required === 'date' || required === 'any') && hasDate) needDefaults = false
  if ((required === 'time' || required === 'any') && hasTime) needDefaults = false
  if (needDefaults && (defaults === 'date' || defaults === 'all')) {
    for (const k of ['year', 'month', 'day']) components.set(k, 'numeric')
  }
  if (needDefaults && (defaults === 'time' || defaults === 'all')) {
    for (const k of ['hour', 'minute', 'second']) components.set(k, 'numeric')
  }

  let skeleton = ''
  for (const key of SKELETON_ORDER) {
    const value = components.get(key)
    if (value === undefined) continue
    if (key === 'hour') {
      // `j` is "the locale's preferred hour"; hour12 / hourCycle pin it.
      const letter =
        hourCycle === 'h11'
          ? 'K'
          : hourCycle === 'h12'
            ? 'h'
            : hourCycle === 'h23'
              ? 'H'
              : hourCycle === 'h24'
                ? 'k'
                : hour12 === true
                  ? 'h'
                  : hour12 === false
                    ? 'H'
                    : 'j'
      skeleton += value === '2-digit' ? letter + letter : letter
    } else {
      skeleton += COMPONENT_SKELETON[key]![value]!
    }
  }
  if ((hour12 !== undefined || hourCycle !== undefined) && !components.has('hour')) {
    warnings.push(`${where} \`${hour12 !== undefined ? 'hour12' : 'hourCycle'}\` without \`hour\` has no effect.`)
  }
  return {
    plan: { kind: 'datetime', skeleton, ...(timeZone !== undefined ? { timeZone } : {}) },
    warnings,
  }
}

/** Plan a number formatter. `where` names the call site in diagnostics. */
export function planNumber(
  where: string,
  options: ReadonlyMap<string, IntlOptionInput>,
): IntlPlanResult<NumberPlan> {
  const warnings: string[] = []
  let style: NumberPlan['style'] = 'decimal'
  let currency: IntlOptionInput | undefined
  let currencyDisplay: NumberPlan['currencyDisplay']
  let minimumFractionDigits: IntlOptionInput | undefined
  let maximumFractionDigits: IntlOptionInput | undefined
  let minimumIntegerDigits: IntlOptionInput | undefined
  let useGrouping: boolean | undefined

  const digits = (key: string, v: IntlOptionInput, lo: number, hi: number): IntlOptionInput | undefined => {
    if (v.kind === 'dynamic') return v
    if (typeof v.value !== 'number' || !Number.isInteger(v.value) || v.value < lo || v.value > hi) {
      warnings.push(
        `${where} \`${key}: ${JSON.stringify(v.value)}\` is out of range — JavaScript throws a RangeError (an integer from ${lo} to ${hi} is required). The option is IGNORED on iOS and Android.`,
      )
      return undefined
    }
    return v
  }

  for (const [key, v] of options) {
    if (key === 'style') {
      const s = staticChoice(where, key, v, ['decimal', 'currency', 'percent'], warnings)
      if (s !== undefined) style = s as NumberPlan['style']
    } else if (key === 'currency') {
      if (v.kind === 'static' && (typeof v.value !== 'string' || !/^[A-Za-z]{3}$/.test(v.value))) {
        warnings.push(`${where} \`currency\` must be an ISO 4217 code ("USD") — JavaScript throws a RangeError. The option is IGNORED on iOS and Android.`)
      } else {
        currency = v.kind === 'static' ? { kind: 'static', value: String(v.value).toUpperCase() } : v
      }
    } else if (key === 'currencyDisplay') {
      if (v.kind === 'static' && v.value === 'narrowSymbol') {
        warnings.push(
          `${where} \`currencyDisplay: "narrowSymbol"\` has no native formatter equivalent — the locale's regular symbol is used on iOS and Android.`,
        )
        currencyDisplay = 'symbol'
      } else {
        currencyDisplay = staticChoice(where, key, v, ['symbol', 'code', 'name'], warnings) as
          | NumberPlan['currencyDisplay']
          | undefined
      }
    } else if (key === 'minimumFractionDigits') {
      minimumFractionDigits = digits(key, v, 0, 100)
    } else if (key === 'maximumFractionDigits') {
      maximumFractionDigits = digits(key, v, 0, 100)
    } else if (key === 'minimumIntegerDigits') {
      minimumIntegerDigits = digits(key, v, 1, 21)
    } else if (key === 'useGrouping') {
      if (v.kind === 'static' && typeof v.value === 'boolean') useGrouping = v.value
      else if (v.kind === 'static' && (v.value === 'always' || v.value === 'auto')) useGrouping = true
      else
        warnings.push(
          `${where} \`useGrouping\` must be \`true\`, \`false\`, "always" or "auto" as a literal. The option is IGNORED on iOS and Android.`,
        )
    } else if (key in NUMBER_UNSUPPORTED) {
      warnings.push(`${where} \`${key}\` has no native lowering — ${NUMBER_UNSUPPORTED[key]}. The option is IGNORED on iOS and Android.`)
    } else {
      warnings.push(
        `${where} \`${key}\` is not a NumberFormat option the native lowering knows (supported: style, currency, currencyDisplay, minimumFractionDigits, maximumFractionDigits, minimumIntegerDigits, useGrouping). It is IGNORED on iOS and Android.`,
      )
    }
  }

  if (style === 'currency' && currency === undefined) {
    warnings.push(`${where} \`style: "currency"\` without \`currency\` throws a TypeError in JavaScript — there is nothing to lower.`)
    return { plan: null, warnings }
  }
  if (
    minimumFractionDigits?.kind === 'static' &&
    maximumFractionDigits?.kind === 'static' &&
    (minimumFractionDigits.value as number) > (maximumFractionDigits.value as number)
  ) {
    warnings.push(
      `${where} \`minimumFractionDigits\` is greater than \`maximumFractionDigits\` — JavaScript throws a RangeError, so there is nothing to lower.`,
    )
    return { plan: null, warnings }
  }
  if (style !== 'currency' && (currency !== undefined || currencyDisplay !== undefined)) {
    // JS accepts and ignores these outside the currency style; say so.
    warnings.push(`${where} \`currency\`/\`currencyDisplay\` only apply with \`style: "currency"\` — ignored, as in JavaScript.`)
    currency = undefined
    currencyDisplay = undefined
  }

  return {
    plan: {
      kind: 'number',
      style,
      ...(currency !== undefined ? { currency } : {}),
      ...(currencyDisplay !== undefined ? { currencyDisplay } : {}),
      ...(minimumFractionDigits !== undefined ? { minimumFractionDigits } : {}),
      ...(maximumFractionDigits !== undefined ? { maximumFractionDigits } : {}),
      ...(minimumIntegerDigits !== undefined ? { minimumIntegerDigits } : {}),
      ...(useGrouping !== undefined ? { useGrouping } : {}),
    },
    warnings,
  }
}


/**
 * The runtime constructor's arguments for a plan, in emit order — the ONE
 * mapping from a plan to `PyreonDateTimeFormat(…)` / `PyreonNumberFormat(…)`
 * parameters, shared by the emitter and the differential test. Defaults the
 * runtime already applies (`style: "decimal"`, `currencyDisplay: "symbol"`,
 * `useGrouping: true`) are left out.
 */
export function planArguments(plan: DateTimePlan | NumberPlan): Array<readonly [string, IntlOptionInput]> {
  const out: Array<readonly [string, IntlOptionInput]> = []
  const put = (name: string, v: IntlOptionInput | string | boolean | undefined): void => {
    if (v === undefined) return
    out.push([name, typeof v === 'object' ? v : { kind: 'static', value: v }])
  }
  if (plan.kind === 'datetime') {
    put('dateStyle', plan.dateStyle)
    put('timeStyle', plan.timeStyle)
    put('skeleton', plan.skeleton)
    put('timeZone', plan.timeZone)
  } else {
    if (plan.style !== 'decimal') put('style', plan.style)
    put('currency', plan.currency)
    if (plan.currencyDisplay !== undefined && plan.currencyDisplay !== 'symbol') put('currencyDisplay', plan.currencyDisplay)
    put('minimumFractionDigits', plan.minimumFractionDigits)
    put('maximumFractionDigits', plan.maximumFractionDigits)
    put('minimumIntegerDigits', plan.minimumIntegerDigits)
    if (plan.useGrouping === false) put('useGrouping', false)
  }
  return out
}
