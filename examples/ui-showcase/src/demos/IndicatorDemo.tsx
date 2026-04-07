import { Avatar, Indicator } from '@pyreon/ui-components'

export function IndicatorDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Indicator</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Status indicator dot with states, sizes, and positioning on other elements.
      </p>

      {/* States */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">States</h3>
      <div style="display: flex; gap: 24px; align-items: center; margin-bottom: 32px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <Indicator {...{ state: 'success' } as any} style="width: 10px; height: 10px; border-radius: 50%; background: #22c55e;" />
          <span style="font-size: 14px;">Online</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <Indicator {...{ state: 'warning' } as any} style="width: 10px; height: 10px; border-radius: 50%; background: #eab308;" />
          <span style="font-size: 14px;">Away</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <Indicator {...{ state: 'error' } as any} style="width: 10px; height: 10px; border-radius: 50%; background: #ef4444;" />
          <span style="font-size: 14px;">Busy</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <Indicator style="width: 10px; height: 10px; border-radius: 50%; background: #9ca3af;" />
          <span style="font-size: 14px;">Offline</span>
        </div>
      </div>

      {/* Sizes */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>
      <div style="display: flex; gap: 24px; align-items: center; margin-bottom: 32px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <Indicator size="sm" style="width: 6px; height: 6px; border-radius: 50%; background: #22c55e;" />
          <span style="font-size: 14px;">Small</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <Indicator size="md" style="width: 10px; height: 10px; border-radius: 50%; background: #22c55e;" />
          <span style="font-size: 14px;">Medium</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <Indicator size="lg" style="width: 14px; height: 14px; border-radius: 50%; background: #22c55e;" />
          <span style="font-size: 14px;">Large</span>
        </div>
      </div>

      {/* Positioned on avatars */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">On Avatars (Positioned)</h3>
      <div style="display: flex; gap: 24px; align-items: center; margin-bottom: 32px;">
        {/* Online */}
        <div style="position: relative; display: inline-block;">
          <Avatar style="width: 48px; height: 48px; border-radius: 50%; background: #3b82f6; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600;">
            VB
          </Avatar>
          <Indicator {...{ state: 'success' } as any} style="position: absolute; bottom: 1px; right: 1px; width: 12px; height: 12px; border-radius: 50%; background: #22c55e; border: 2px solid white;" />
        </div>

        {/* Away */}
        <div style="position: relative; display: inline-block;">
          <Avatar style="width: 48px; height: 48px; border-radius: 50%; background: #ef4444; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600;">
            JS
          </Avatar>
          <Indicator {...{ state: 'warning' } as any} style="position: absolute; bottom: 1px; right: 1px; width: 12px; height: 12px; border-radius: 50%; background: #eab308; border: 2px solid white;" />
        </div>

        {/* Busy */}
        <div style="position: relative; display: inline-block;">
          <Avatar style="width: 48px; height: 48px; border-radius: 50%; background: #22c55e; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600;">
            DP
          </Avatar>
          <Indicator {...{ state: 'error' } as any} style="position: absolute; bottom: 1px; right: 1px; width: 12px; height: 12px; border-radius: 50%; background: #ef4444; border: 2px solid white;" />
        </div>

        {/* Offline */}
        <div style="position: relative; display: inline-block;">
          <Avatar style="width: 48px; height: 48px; border-radius: 50%; background: #8b5cf6; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600;">
            MK
          </Avatar>
          <Indicator style="position: absolute; bottom: 1px; right: 1px; width: 12px; height: 12px; border-radius: 50%; background: #9ca3af; border: 2px solid white;" />
        </div>
      </div>

      {/* Top-right position */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Top-Right Position</h3>
      <div style="display: flex; gap: 24px; align-items: center; margin-bottom: 32px;">
        <div style="position: relative; display: inline-block;">
          <Avatar style="width: 48px; height: 48px; border-radius: 50%; background: #f97316; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600;">
            AT
          </Avatar>
          <Indicator {...{ state: 'error' } as any} style="position: absolute; top: -2px; right: -2px; width: 14px; height: 14px; border-radius: 50%; background: #ef4444; border: 2px solid white; display: flex; align-items: center; justify-content: center; font-size: 8px; color: white; font-weight: 700;">
            3
          </Indicator>
        </div>

        <div style="position: relative; display: inline-block;">
          <Avatar style="width: 48px; height: 48px; border-radius: 50%; background: #3b82f6; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600;">
            NR
          </Avatar>
          <Indicator {...{ state: 'success' } as any} style="position: absolute; top: -2px; right: -2px; width: 14px; height: 14px; border-radius: 50%; background: #22c55e; border: 2px solid white;" />
        </div>
      </div>

      {/* On other elements */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">On Other Elements</h3>
      <div style="display: flex; gap: 24px; align-items: center; margin-bottom: 32px;">
        {/* On icon */}
        <div style="position: relative; display: inline-block;">
          <div style="width: 40px; height: 40px; background: #f3f4f6; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 20px;">
            B
          </div>
          <Indicator {...{ state: 'error' } as any} style="position: absolute; top: -3px; right: -3px; width: 16px; height: 16px; border-radius: 50%; background: #ef4444; border: 2px solid white; display: flex; align-items: center; justify-content: center; font-size: 9px; color: white; font-weight: 700;">
            5
          </Indicator>
        </div>

        {/* On card */}
        <div style="position: relative; display: inline-block;">
          <div style="padding: 12px 24px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 14px;">
            Inbox
          </div>
          <Indicator {...{ state: 'error' } as any} style="position: absolute; top: -4px; right: -4px; width: 10px; height: 10px; border-radius: 50%; background: #ef4444; border: 2px solid white;" />
        </div>
      </div>

      {/* Indicator row */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Status Legend</h3>
      <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 32px; max-width: 200px;">
        {[
          { label: 'Active', color: '#22c55e', state: 'success' },
          { label: 'Idle', color: '#eab308', state: 'warning' },
          { label: 'Do Not Disturb', color: '#ef4444', state: 'error' },
          { label: 'Offline', color: '#9ca3af', state: 'default' },
        ].map((status) => (
          <div style="display: flex; align-items: center; gap: 10px; padding: 6px 0;">
            <Indicator {...{ state: status.state } as any} style={`width: 8px; height: 8px; border-radius: 50%; background: ${status.color}; flex-shrink: 0;`} />
            <span style="font-size: 14px;">{status.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
