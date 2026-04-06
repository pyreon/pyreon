import {
  Card,
  Title,
  Paragraph,
  Badge,
  Button,
  Avatar,
  Chip,
  Stepper,
  Step,
  Timeline,
  Divider,
} from '@pyreon/ui-components'

const skills = [
  'TypeScript', 'Pyreon', 'Signals', 'CSS-in-JS', 'Node.js',
  'PostgreSQL', 'Redis', 'Docker', 'CI/CD', 'SSR',
]

const profileSteps = [
  { label: 'Basic Info', completed: true },
  { label: 'Avatar', completed: true },
  { label: 'Bio', completed: true },
  { label: 'Skills', completed: false },
  { label: 'Socials', completed: false },
]

const activityItems = [
  { title: 'Merged PR #142', description: 'Refactored signal batching for 15% perf improvement.', time: '2 hours ago', type: 'success' },
  { title: 'Commented on issue #87', description: 'Provided a detailed SSR hydration fix proposal.', time: '5 hours ago', type: 'info' },
  { title: 'Created branch feat/ui-library', description: 'Started work on the new component library.', time: '1 day ago', type: 'info' },
  { title: 'Released v2.4.0', description: 'Shipped router middleware, signal HMR, and 12 new hooks.', time: '3 days ago', type: 'success' },
  { title: 'Reviewed PR #138', description: 'Left feedback on the new form validation approach.', time: '5 days ago', type: 'warning' },
]

const stats = [
  { label: 'Commits', value: '1,247' },
  { label: 'PRs Merged', value: '186' },
  { label: 'Reviews', value: '342' },
  { label: 'Issues Closed', value: '89' },
]

export function UserProfileDemo() {
  const completedSteps = profileSteps.filter((s) => s.completed).length

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">User Profile</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        A user profile page composed from Card, Avatar, Badge, Stepper, Chip, Timeline, and Button.
      </p>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; max-width: 900px;">
        {/* Left Column — Profile Card */}
        <div style="display: flex; flex-direction: column; gap: 24px;">
          <Card {...{ variant: 'elevated' } as any}>
            <div style="text-align: center; margin-bottom: 20px;">
              <div style="display: flex; justify-content: center; margin-bottom: 12px;">
                <Avatar {...{ size: 'xl' } as any}>VB</Avatar>
              </div>
              <Title {...{ size: 'h4' } as any}>Vit Bokisch</Title>
              <Paragraph {...{ size: 'sm', style: 'color: #6b7280; margin-top: 4px;' } as any}>
                @vitbokisch
              </Paragraph>
              <div style="display: flex; justify-content: center; gap: 8px; margin-top: 8px;">
                <Badge {...{ state: 'primary', size: 'sm' } as any}>Core Maintainer</Badge>
                <Badge {...{ state: 'success', size: 'sm', variant: 'subtle' } as any}>Online</Badge>
              </div>
            </div>

            <Paragraph {...{ size: 'sm', style: 'color: #4b5563; text-align: center; margin-bottom: 20px;' } as any}>
              Building the fastest signal-based UI framework. Passionate about performance, DX, and pushing the boundaries of web development.
            </Paragraph>

            <div style="display: flex; gap: 8px; justify-content: center;">
              <Button {...{ state: 'primary', size: 'sm' } as any}>Edit Profile</Button>
              <Button {...{ state: 'secondary', variant: 'outline', size: 'sm' } as any}>Message</Button>
            </div>
          </Card>

          {/* Stats */}
          <Card {...{ variant: 'outline' } as any}>
            <Title {...{ size: 'h6', style: 'margin-bottom: 12px;' } as any}>Contribution Stats</Title>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
              {stats.map((stat) => (
                <div style="text-align: center; padding: 8px;">
                  <Title {...{ size: 'h4' } as any}>{stat.value}</Title>
                  <Paragraph {...{ size: 'sm', style: 'color: #6b7280; margin-top: 2px;' } as any}>{stat.label}</Paragraph>
                </div>
              ))}
            </div>
          </Card>

          {/* Skills */}
          <Card {...{ variant: 'outline' } as any}>
            <Title {...{ size: 'h6', style: 'margin-bottom: 12px;' } as any}>Skills</Title>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
              {skills.map((skill) => (
                <Chip {...{ size: 'sm', variant: 'outline' } as any}>{skill}</Chip>
              ))}
            </div>
          </Card>
        </div>

        {/* Right Column — Profile Completion + Activity */}
        <div style="display: flex; flex-direction: column; gap: 24px;">
          {/* Profile Completion */}
          <Card {...{ variant: 'outline' } as any}>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <Title {...{ size: 'h6' } as any}>Profile Completion</Title>
              <Badge {...{ state: 'primary', size: 'sm' } as any}>
                {completedSteps}/{profileSteps.length} steps
              </Badge>
            </div>
            <Stepper variant="horizontal">
              <div style="display: flex; align-items: flex-start; gap: 0; width: 100%;">
                {profileSteps.map((step, i) => (
                  <>
                    <div style="display: flex; flex-direction: column; align-items: center; flex: 0 0 auto;">
                      <Step {...{ state: step.completed ? 'completed' : 'default' } as any}>
                        <span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; font-size: 12px;">
                          {step.completed ? '\u2713' : i + 1}
                        </span>
                      </Step>
                      <p style={`font-size: 11px; margin-top: 6px; text-align: center; color: ${step.completed ? '#16a34a' : '#9ca3af'};`}>
                        {step.label}
                      </p>
                    </div>
                    {i < profileSteps.length - 1 && (
                      <div style={`flex: 1; height: 2px; margin-top: 14px; background: ${step.completed ? '#16a34a' : '#e5e7eb'};`} />
                    )}
                  </>
                ))}
              </div>
            </Stepper>
          </Card>

          {/* Activity Timeline */}
          <Card {...{ variant: 'elevated' } as any}>
            <Title {...{ size: 'h6', style: 'margin-bottom: 16px;' } as any}>Recent Activity</Title>
            <Timeline>
              {activityItems.map((item, i) => (
                <div style="display: flex; gap: 12px; padding-bottom: 20px;">
                  <div style="flex-shrink: 0; position: relative;">
                    <div
                      style={`width: 10px; height: 10px; border-radius: 50%; margin-top: 4px; background: ${item.type === 'success' ? '#16a34a' : item.type === 'warning' ? '#eab308' : '#3b82f6'};`}
                    />
                    {i < activityItems.length - 1 && (
                      <div style="position: absolute; top: 16px; left: 4px; width: 2px; height: calc(100% - 4px); background: #e5e7eb;" />
                    )}
                  </div>
                  <div>
                    <Paragraph {...{ size: 'sm', style: 'font-weight: 600;' } as any}>{item.title}</Paragraph>
                    <Paragraph {...{ size: 'sm', style: 'color: #6b7280; margin-top: 2px;' } as any}>
                      {item.description}
                    </Paragraph>
                    <Paragraph {...{ size: 'sm', style: 'color: #9ca3af; margin-top: 4px; font-size: 12px;' } as any}>
                      {item.time}
                    </Paragraph>
                  </div>
                </div>
              ))}
            </Timeline>
          </Card>
        </div>
      </div>
    </div>
  )
}
