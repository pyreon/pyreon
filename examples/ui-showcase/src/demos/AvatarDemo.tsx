import { Avatar, AvatarGroup } from '@pyreon/ui-components'

export function AvatarDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Avatar</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        User avatar with image, initials, sizes, shapes, and AvatarGroup for overlapping display.
      </p>

      {/* Sizes */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>
      <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 32px;">
        <Avatar size="sm" style="width: 32px; height: 32px; border-radius: 50%; background: #e0e7ff; color: #4338ca; font-size: 12px; display: flex; align-items: center; justify-content: center; font-weight: 600;">
          SM
        </Avatar>
        <Avatar size="md" style="width: 40px; height: 40px; border-radius: 50%; background: #e0e7ff; color: #4338ca; font-size: 14px; display: flex; align-items: center; justify-content: center; font-weight: 600;">
          MD
        </Avatar>
        <Avatar size="lg" style="width: 56px; height: 56px; border-radius: 50%; background: #e0e7ff; color: #4338ca; font-size: 18px; display: flex; align-items: center; justify-content: center; font-weight: 600;">
          LG
        </Avatar>
      </div>

      {/* Circle shape */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Circle (default)</h3>
      <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 32px;">
        <Avatar style="width: 48px; height: 48px; border-radius: 50%; background: #fecaca; color: #991b1b; display: flex; align-items: center; justify-content: center; font-weight: 600;">
          AB
        </Avatar>
        <Avatar style="width: 48px; height: 48px; border-radius: 50%; background: #bbf7d0; color: #166534; display: flex; align-items: center; justify-content: center; font-weight: 600;">
          CD
        </Avatar>
        <Avatar style="width: 48px; height: 48px; border-radius: 50%; background: #bfdbfe; color: #1e40af; display: flex; align-items: center; justify-content: center; font-weight: 600;">
          EF
        </Avatar>
        <Avatar style="width: 48px; height: 48px; border-radius: 50%; background: #e9d5ff; color: #6b21a8; display: flex; align-items: center; justify-content: center; font-weight: 600;">
          GH
        </Avatar>
      </div>

      {/* Rounded shape */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Rounded</h3>
      <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 32px;">
        <Avatar {...{ variant: 'rounded' } as any} style="width: 48px; height: 48px; border-radius: 8px; background: #fef3c7; color: #92400e; display: flex; align-items: center; justify-content: center; font-weight: 600;">
          JK
        </Avatar>
        <Avatar {...{ variant: 'rounded' } as any} style="width: 48px; height: 48px; border-radius: 8px; background: #ccfbf1; color: #0f766e; display: flex; align-items: center; justify-content: center; font-weight: 600;">
          LM
        </Avatar>
        <Avatar {...{ variant: 'rounded' } as any} style="width: 48px; height: 48px; border-radius: 8px; background: #fce7f3; color: #9d174d; display: flex; align-items: center; justify-content: center; font-weight: 600;">
          NP
        </Avatar>
      </div>

      {/* Initials */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Initials</h3>
      <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 32px;">
        <Avatar style="width: 48px; height: 48px; border-radius: 50%; background: #3b82f6; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 16px;">
          VB
        </Avatar>
        <Avatar style="width: 48px; height: 48px; border-radius: 50%; background: #ef4444; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 16px;">
          JS
        </Avatar>
        <Avatar style="width: 48px; height: 48px; border-radius: 50%; background: #22c55e; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 16px;">
          DP
        </Avatar>
        <Avatar style="width: 48px; height: 48px; border-radius: 50%; background: #8b5cf6; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 16px;">
          MK
        </Avatar>
        <Avatar style="width: 48px; height: 48px; border-radius: 50%; background: #f97316; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 16px;">
          AT
        </Avatar>
      </div>

      {/* Avatar group with overlap */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">AvatarGroup (Overlapping)</h3>
      <div style="margin-bottom: 32px;">
        <AvatarGroup style="display: flex;">
          {[
            { initials: 'VB', bg: '#3b82f6' },
            { initials: 'JS', bg: '#ef4444' },
            { initials: 'DP', bg: '#22c55e' },
            { initials: 'MK', bg: '#8b5cf6' },
            { initials: '+3', bg: '#6b7280' },
          ].map((user, i) => (
            <Avatar style={`width: 40px; height: 40px; border-radius: 50%; background: ${user.bg}; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 13px; border: 2px solid white; margin-left: ${i > 0 ? '-10px' : '0'};`}>
              {user.initials}
            </Avatar>
          ))}
        </AvatarGroup>
      </div>

      {/* Large avatar group */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Large AvatarGroup</h3>
      <div style="margin-bottom: 32px;">
        <AvatarGroup style="display: flex;">
          {[
            { initials: 'A', bg: '#ef4444' },
            { initials: 'B', bg: '#f97316' },
            { initials: 'C', bg: '#eab308' },
            { initials: 'D', bg: '#22c55e' },
            { initials: 'E', bg: '#3b82f6' },
            { initials: 'F', bg: '#8b5cf6' },
            { initials: '+12', bg: '#6b7280' },
          ].map((user, i) => (
            <Avatar style={`width: 48px; height: 48px; border-radius: 50%; background: ${user.bg}; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px; border: 3px solid white; margin-left: ${i > 0 ? '-12px' : '0'};`}>
              {user.initials}
            </Avatar>
          ))}
        </AvatarGroup>
      </div>

      {/* With fallback */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Fallback (No Image)</h3>
      <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 32px;">
        <Avatar style="width: 48px; height: 48px; border-radius: 50%; background: #f3f4f6; color: #6b7280; display: flex; align-items: center; justify-content: center; font-size: 20px;">
          ?
        </Avatar>
        <Avatar style="width: 48px; height: 48px; border-radius: 50%; background: #f3f4f6; color: #6b7280; display: flex; align-items: center; justify-content: center; font-size: 14px;">
          N/A
        </Avatar>
      </div>
    </div>
  )
}
