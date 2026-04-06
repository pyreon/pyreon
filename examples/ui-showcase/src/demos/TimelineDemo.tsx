import { Timeline } from '@pyreon/ui-components'

export function TimelineDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Timeline</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Vertical timeline for displaying chronological events with a left border.
      </p>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Basic Timeline</h3>
      <div style="margin-bottom: 24px;">
        <Timeline>
          <div style="padding-bottom: 24px; position: relative;">
            <div style="position: absolute; left: -29px; top: 4px; width: 12px; height: 12px; border-radius: 50%; background: #3b82f6; border: 2px solid white;" />
            <p style="font-weight: 600; margin-bottom: 4px;">Project kickoff</p>
            <p style="font-size: 13px; color: #6b7280;">January 15, 2026</p>
            <p style="font-size: 14px; margin-top: 8px;">Initial planning and team assembly for the new project.</p>
          </div>
          <div style="padding-bottom: 24px; position: relative;">
            <div style="position: absolute; left: -29px; top: 4px; width: 12px; height: 12px; border-radius: 50%; background: #3b82f6; border: 2px solid white;" />
            <p style="font-weight: 600; margin-bottom: 4px;">Design phase complete</p>
            <p style="font-size: 13px; color: #6b7280;">February 28, 2026</p>
            <p style="font-size: 14px; margin-top: 8px;">All wireframes and mockups approved by stakeholders.</p>
          </div>
          <div style="padding-bottom: 24px; position: relative;">
            <div style="position: absolute; left: -29px; top: 4px; width: 12px; height: 12px; border-radius: 50%; background: #16a34a; border: 2px solid white;" />
            <p style="font-weight: 600; margin-bottom: 4px;">Beta release</p>
            <p style="font-size: 13px; color: #6b7280;">March 20, 2026</p>
            <p style="font-size: 14px; margin-top: 8px;">First public beta launched to early adopters.</p>
          </div>
          <div style="position: relative;">
            <div style="position: absolute; left: -29px; top: 4px; width: 12px; height: 12px; border-radius: 50%; background: #9ca3af; border: 2px solid white;" />
            <p style="font-weight: 600; margin-bottom: 4px; color: #9ca3af;">Production launch</p>
            <p style="font-size: 13px; color: #9ca3af;">April 15, 2026 (upcoming)</p>
            <p style="font-size: 14px; margin-top: 8px; color: #9ca3af;">Scheduled production deployment and public announcement.</p>
          </div>
        </Timeline>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Activity Feed</h3>
      <div style="margin-bottom: 24px;">
        <Timeline>
          <div style="padding-bottom: 20px; position: relative;">
            <div style="position: absolute; left: -29px; top: 4px; width: 12px; height: 12px; border-radius: 50%; background: #16a34a; border: 2px solid white;" />
            <p style="font-size: 14px;"><strong>Alice</strong> merged pull request <span style="color: #3b82f6;">#142</span></p>
            <p style="font-size: 12px; color: #9ca3af;">2 minutes ago</p>
          </div>
          <div style="padding-bottom: 20px; position: relative;">
            <div style="position: absolute; left: -29px; top: 4px; width: 12px; height: 12px; border-radius: 50%; background: #eab308; border: 2px solid white;" />
            <p style="font-size: 14px;"><strong>Bob</strong> requested review on <span style="color: #3b82f6;">#143</span></p>
            <p style="font-size: 12px; color: #9ca3af;">15 minutes ago</p>
          </div>
          <div style="padding-bottom: 20px; position: relative;">
            <div style="position: absolute; left: -29px; top: 4px; width: 12px; height: 12px; border-radius: 50%; background: #ef4444; border: 2px solid white;" />
            <p style="font-size: 14px;"><strong>CI</strong> failed on branch <code>feat/dark-mode</code></p>
            <p style="font-size: 12px; color: #9ca3af;">1 hour ago</p>
          </div>
          <div style="position: relative;">
            <div style="position: absolute; left: -29px; top: 4px; width: 12px; height: 12px; border-radius: 50%; background: #3b82f6; border: 2px solid white;" />
            <p style="font-size: 14px;"><strong>Carol</strong> commented on issue <span style="color: #3b82f6;">#98</span></p>
            <p style="font-size: 12px; color: #9ca3af;">3 hours ago</p>
          </div>
        </Timeline>
      </div>
    </div>
  )
}
