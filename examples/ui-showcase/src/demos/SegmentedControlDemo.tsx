import { signal } from '@pyreon/reactivity'
import { SegmentedControl } from '@pyreon/ui-components'

export function SegmentedControlDemo() {
  const view = signal('list')
  const period = signal('monthly')
  const theme = signal('light')

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">SegmentedControl</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Inline option group for mutually exclusive selections with controlled state.
      </p>

      {/* Basic controlled */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Basic Controlled</h3>
      <div style="margin-bottom: 32px; max-width: 400px;">
        <SegmentedControl style="display: inline-flex; background: #f3f4f6; border-radius: 8px; padding: 2px;">
          {['list', 'grid', 'table'].map((option) => (
            <button
              onClick={() => view.set(option)}
              style={`padding: 6px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.15s; ${view() === option ? 'background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); font-weight: 500;' : 'background: transparent; color: #6b7280;'}`}
            >
              {option.charAt(0).toUpperCase() + option.slice(1)}
            </button>
          ))}
        </SegmentedControl>
        <p style="color: #6b7280; font-size: 14px; margin-top: 8px;">
          View: {() => view()}
        </p>
      </div>

      {/* Pricing toggle */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Pricing Period</h3>
      <div style="margin-bottom: 32px; max-width: 400px;">
        <SegmentedControl style="display: inline-flex; background: #f3f4f6; border-radius: 8px; padding: 2px;">
          {['monthly', 'yearly'].map((option) => (
            <button
              onClick={() => period.set(option)}
              style={`padding: 8px 24px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.15s; ${period() === option ? 'background: #3b82f6; color: white; font-weight: 500;' : 'background: transparent; color: #6b7280;'}`}
            >
              {option.charAt(0).toUpperCase() + option.slice(1)}
              {option === 'yearly' ? ' (Save 20%)' : ''}
            </button>
          ))}
        </SegmentedControl>
        <p style="color: #6b7280; font-size: 14px; margin-top: 8px;">
          Period: {() => period()}
        </p>
      </div>

      {/* Theme switcher */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Theme Switcher</h3>
      <div style="margin-bottom: 32px; max-width: 400px;">
        <SegmentedControl style="display: inline-flex; background: #f3f4f6; border-radius: 8px; padding: 2px;">
          {['light', 'dark', 'system'].map((option) => (
            <button
              onClick={() => theme.set(option)}
              style={`padding: 6px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.15s; ${theme() === option ? 'background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); font-weight: 500;' : 'background: transparent; color: #6b7280;'}`}
            >
              {option.charAt(0).toUpperCase() + option.slice(1)}
            </button>
          ))}
        </SegmentedControl>
      </div>

      {/* Sizes */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>
      <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 32px;">
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">Small</p>
          <SegmentedControl size="sm" style="display: inline-flex; background: #f3f4f6; border-radius: 6px; padding: 2px;">
            {['A', 'B', 'C'].map((opt, i) => (
              <button style={`padding: 4px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; ${i === 0 ? 'background: white; box-shadow: 0 1px 2px rgba(0,0,0,0.1);' : 'background: transparent; color: #6b7280;'}`}>
                {opt}
              </button>
            ))}
          </SegmentedControl>
        </div>
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">Medium</p>
          <SegmentedControl size="md" style="display: inline-flex; background: #f3f4f6; border-radius: 8px; padding: 2px;">
            {['A', 'B', 'C'].map((opt, i) => (
              <button style={`padding: 6px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; ${i === 0 ? 'background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1);' : 'background: transparent; color: #6b7280;'}`}>
                {opt}
              </button>
            ))}
          </SegmentedControl>
        </div>
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">Large</p>
          <SegmentedControl size="lg" style="display: inline-flex; background: #f3f4f6; border-radius: 10px; padding: 3px;">
            {['A', 'B', 'C'].map((opt, i) => (
              <button style={`padding: 8px 24px; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; ${i === 0 ? 'background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1);' : 'background: transparent; color: #6b7280;'}`}>
                {opt}
              </button>
            ))}
          </SegmentedControl>
        </div>
      </div>

      {/* Many options */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Many Options</h3>
      <div style="margin-bottom: 32px;">
        <SegmentedControl style="display: inline-flex; background: #f3f4f6; border-radius: 8px; padding: 2px; flex-wrap: wrap;">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => (
            <button style={`padding: 6px 12px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; ${i === 0 ? 'background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); font-weight: 500;' : 'background: transparent; color: #6b7280;'}`}>
              {day}
            </button>
          ))}
        </SegmentedControl>
      </div>
    </div>
  )
}
