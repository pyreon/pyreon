import { disabledState, el, focusRing, tones } from '../../factory'
import { SwitchBase } from '@pyreon/ui-primitives'

const Switch = el.config({ name: 'Switch', component: SwitchBase })
  .theme((t, m) => ({
    // The base renders a <button>: reset the UA's outset border, or the
    // switch draws a 2px bevel instead of a track.
    borderWidth: 0,
    borderStyle: 'none',
    // Medium dimensions in the base so an un-sized <Switch> is a real track.
    width: '36px',
    height: '20px',
    flexShrink: 0,
    // Off track: the control boundary tone (≥ 3:1 against the page).
    backgroundColor: tones(t, m).border,
    borderRadius: t.borderRadius.pill,
    cursor: 'pointer',
    transition: t.transition.fast,
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px',
    hover: {
      backgroundColor: tones(t, m).placeholder,
    },
    focus: focusRing(t),
    disabled: { ...disabledState(), pointerEvents: 'none' },
    // Read by the thumb/checked layer below (mode already resolved).
    switchOnColor: t.color.system.primary.base,
    switchThumbColor: t.color.system.light.base,
  }))
  .sizes(() => ({
    small: { width: '28px', height: '16px' },
    medium: { width: '36px', height: '20px' },
    large: { width: '44px', height: '24px' },
  }))
  // The checked track follows the base's `data-checked` (the old theme coloured
  // it on `:active`, i.e. only while the pointer was held down), and a thumb is
  // drawn as `::after` unless the consumer composes `SwitchThumb`.
  .styles(
    ((css: (s: TemplateStringsArray, ...v: unknown[]) => unknown) => css`
      ${({ $rocketstyle: s }: { $rocketstyle: { switchOnColor?: string; switchThumbColor?: string } }) => css`
        &[data-checked] {
          background-color: ${s.switchOnColor};
        }
        &:not(:has([data-switch-thumb]))::after {
          content: '';
          position: absolute;
          top: 2px;
          left: 2px;
          height: calc(100% - 4px);
          aspect-ratio: 1;
          border-radius: 50%;
          background-color: ${s.switchThumbColor};
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.3);
          transition: left 0.15s ease, transform 0.15s ease;
        }
        &[data-checked]:not(:has([data-switch-thumb]))::after {
          left: calc(100% - 2px);
          transform: translateX(-100%);
        }
      `}
    `) as never,
  )

export default Switch

export const SwitchThumb = el
  .config({ name: 'SwitchThumb' })
  .attrs({ tag: 'span', 'data-switch-thumb': '' } as never)
  .theme((t) => ({
    width: '16px',
    height: '16px',
    borderRadius: t.borderRadius.pill,
    backgroundColor: t.color.system.light.base,
    boxShadow: t.shadows.small,
    transition: t.transition.fast,
    transform: 'translateX(0)',
  }))
  .states(() => ({
    checked: {
      transform: 'translateX(20px)',
    },
  }))
  .sizes(() => ({
    small: {
      width: '12px',
      height: '12px',
    },
    medium: {
      width: '16px',
      height: '16px',
    },
    large: {
      width: '20px',
      height: '20px',
    },
  }))
