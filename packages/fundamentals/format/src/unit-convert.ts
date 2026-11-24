/**
 * Unit formatting with a conversion in front: shared by `@pyreon/format/units` (the active locale) and
 * `@pyreon/format/units/core` (an explicit locale). Pure: no `@pyreon/*` import. `formatUnit` and `unitFormatter` of the main
 * entries never reach this file, so the conversion table is paid for only by an app that imports it.
 */
import { convert, measurementSystem, systemUnit } from './convert'
import type { Core, KindDef } from './formatter'
import { isUsable, unitIn, unitKind } from './number'
import type { ConvertedUnitOptions, NumberInput, Unit, UnitOptions, UnitPreset } from './types'

type Spec = ConvertedUnitOptions & { unit: Unit }

/** The unit to format in: `convertTo`, else the system's (`'auto'` is the locale's), else the unit itself. */
function targetOf(unit: string, options: ConvertedUnitOptions | undefined, locale: string): string {
  if (options?.convertTo !== undefined) return options.convertTo
  const system = options?.system

  if (system === undefined) return unit

  return systemUnit(unit as Unit, system === 'auto' ? measurementSystem(locale === '' ? undefined : locale) : system)
}

/** The options that reach `Intl`: the conversion keys are data, not formatting options (and stay out of the cache key). */
function formatting(options: ConvertedUnitOptions | UnitPreset | undefined): UnitOptions | UnitPreset | undefined {
  if (typeof options !== 'object' || options === null) return options
  const { convertTo: _to, system: _system, ...rest } = options

  return rest
}

function converted(value: NumberInput, from: string, to: string): NumberInput {
  return to === from || !isUsable(value) ? value : convert(Number(value), from as Unit, to as Unit)
}

/** Format `value` (in `unit`) after converting it; `locale` is the resolved locale (`''` is the runtime default). */
export function convertedUnitIn(locale: string, value: NumberInput, unit: Unit, options: ConvertedUnitOptions | UnitPreset | undefined): string {
  const o = typeof options === 'object' && options !== null ? options : undefined
  const target = targetOf(unit, o, locale)

  return unitIn(locale, converted(value, unit, target), target as Unit, formatting(options))
}

/** Spec of the converted formatter: the unit and its options (the conversion keys stay in the spec). */
export function convertedSpec(unit: Unit, options: ConvertedUnitOptions | UnitPreset | undefined): Spec {
  const base = typeof options === 'string' ? { unitDisplay: options } : (options ?? {})

  return { ...base, unit }
}

const MAX_TARGETS = 8

export const convertedUnitKind: KindDef<'unit'> = {
  create(spec, locale) {
    const s = spec as Readonly<Spec>
    const { convertTo: _to, system: _system, ...rest } = s
    const cores = new Map<string, Core<NumberInput>>()
    const coreFor = (target: string): Core<NumberInput> => {
      let core = cores.get(target)

      if (core === undefined) {
        if (cores.size >= MAX_TARGETS) cores.clear()
        core = unitKind.create({ ...rest, unit: target as Unit }, locale, () => '')
        cores.set(target, core)
      }

      return core
    }
    const target = (): string => targetOf(s.unit, s, locale())

    return {
      call: (value) => {
        const t = target()

        return coreFor(t).call(converted(value, s.unit, t))
      },
      parts: (value) => {
        const t = target()

        return (coreFor(t).parts as (v: NumberInput) => readonly unknown[])(converted(value, s.unit, t))
      },
      range: (start, end) => {
        const t = target()

        return (coreFor(t).range as (a: NumberInput, b: NumberInput) => string)(converted(start, s.unit, t), converted(end, s.unit, t))
      },
    }
  },
}
