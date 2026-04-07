import { signal } from '@pyreon/reactivity'
import {
  Card,
  Title,
  Paragraph,
  Badge,
  Button,
  Input,
  Checkbox,
  Radio,
  RadioGroup,
  Slider,
  Progress,
  Alert,
  Stepper,
  Step,
  FormField,
  FieldLabel,
  FieldDescription,
  Divider,
} from '@pyreon/ui-components'

const TOTAL_STEPS = 4

const stepLabels = ['Account', 'Plan', 'Review', 'Complete']

export function WizardDemo() {
  const activeStep = signal(1)
  const name = signal('')
  const email = signal('')
  const plan = signal('pro')
  const teamSize = signal(5)
  const agreedToTerms = signal(false)

  const progress = () => Math.round(((activeStep() - 1) / (TOTAL_STEPS - 1)) * 100)

  const canProceed = () => {
    const step = activeStep()
    if (step === 1) return name().trim().length > 0 && email().includes('@')
    if (step === 2) return plan() !== ''
    if (step === 3) return agreedToTerms()
    return false
  }

  const goNext = () => {
    if (activeStep() < TOTAL_STEPS) activeStep.update((s) => s + 1)
  }

  const goBack = () => {
    if (activeStep() > 1) activeStep.update((s) => s - 1)
  }

  const planDetails = () => {
    if (plan() === 'starter') return { name: 'Starter', price: '$9/mo', features: 'Up to 3 team members, 5 projects, email support' }
    if (plan() === 'pro') return { name: 'Pro', price: '$29/mo', features: 'Up to 20 team members, unlimited projects, priority support' }
    return { name: 'Enterprise', price: '$99/mo', features: 'Unlimited team members, custom integrations, dedicated account manager' }
  }

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Wizard Form</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        A multi-step wizard using Stepper, Progress, FormField, RadioGroup, Slider, Checkbox, Card, Alert, and Button.
      </p>

      <div style="max-width: 600px;">
        {/* Progress bar */}
        <div style="margin-bottom: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <Paragraph {...{ size: 'sm', style: 'color: #6b7280;' } as any}>
              {() => `Step ${activeStep()} of ${TOTAL_STEPS}`}
            </Paragraph>
            <Paragraph {...{ size: 'sm', style: 'color: #6b7280;' } as any}>
              {() => `${progress()}% complete`}
            </Paragraph>
          </div>
          <Progress {...{ value: progress(), state: 'primary', size: 'sm' } as any} />
        </div>

        {/* Stepper */}
        <div style="margin-bottom: 24px;">
          <Stepper variant="horizontal">
            <div style="display: flex; align-items: flex-start; gap: 0; width: 100%;">
              {stepLabels.map((label, i) => {
                const stepNum = i + 1
                return (
                  <>
                    <div style="display: flex; flex-direction: column; align-items: center; flex: 0 0 auto;">
                      <Step
                        {...{
                          state:
                            stepNum < activeStep()
                              ? 'completed'
                              : stepNum === activeStep()
                                ? 'active'
                                : 'default',
                        } as any}
                      >
                        <span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; font-size: 12px;">
                          {() => stepNum < activeStep() ? '\u2713' : stepNum}
                        </span>
                      </Step>
                      <p
                        style={`font-size: 11px; margin-top: 6px; text-align: center; color: ${
                          stepNum < activeStep()
                            ? '#16a34a'
                            : stepNum === activeStep()
                              ? '#3b82f6'
                              : '#9ca3af'
                        }; font-weight: ${stepNum === activeStep() ? '600' : '400'};`}
                      >
                        {label}
                      </p>
                    </div>
                    {i < stepLabels.length - 1 && (
                      <div
                        style={`flex: 1; height: 2px; margin-top: 14px; background: ${
                          stepNum < activeStep() ? '#16a34a' : '#e5e7eb'
                        };`}
                      />
                    )}
                  </>
                )
              })}
            </div>
          </Stepper>
        </div>

        {/* Step Content */}
        <Card {...{ variant: 'elevated' } as any}>
          {/* Step 1: Account Info */}
          {() =>
            activeStep() === 1 ? (
              <div>
                <Title {...{ size: 'h5', style: 'margin-bottom: 4px;' } as any}>Account Information</Title>
                <Paragraph {...{ size: 'sm', style: 'color: #6b7280; margin-bottom: 20px;' } as any}>
                  Let's start with the basics. Tell us who you are.
                </Paragraph>

                <div style="display: flex; flex-direction: column; gap: 16px;">
                  <FormField>
                    <FieldLabel>Full Name</FieldLabel>
                    <Input
                      placeholder="John Doe"
                      value={name()}
                      onInput={(e: Event) => name.set((e.target as HTMLInputElement).value)}
                    />
                    <FieldDescription>This will be your display name.</FieldDescription>
                  </FormField>

                  <FormField>
                    <FieldLabel>Email Address</FieldLabel>
                    <Input
                      type="email"
                      placeholder="john@company.com"
                      value={email()}
                      onInput={(e: Event) => email.set((e.target as HTMLInputElement).value)}
                    />
                    <FieldDescription>We'll send your login credentials here.</FieldDescription>
                  </FormField>
                </div>
              </div>
            ) : null
          }

          {/* Step 2: Plan Selection */}
          {() =>
            activeStep() === 2 ? (
              <div>
                <Title {...{ size: 'h5', style: 'margin-bottom: 4px;' } as any}>Choose Your Plan</Title>
                <Paragraph {...{ size: 'sm', style: 'color: #6b7280; margin-bottom: 20px;' } as any}>
                  Select a plan that fits your team's needs.
                </Paragraph>

                <div style="margin-bottom: 24px;">
                  <RadioGroup
                    value={plan()}
                    onChange={(v: string) => plan.set(v)}
                  >
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                      <div style="display: flex; align-items: flex-start; gap: 10px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px;">
                        <Radio value="starter" />
                        <div>
                          <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-weight: 600;">Starter</span>
                            <Badge {...{ state: 'secondary', size: 'sm' } as any}>$9/mo</Badge>
                          </div>
                          <Paragraph {...{ size: 'sm', style: 'color: #6b7280; margin-top: 2px;' } as any}>
                            Up to 3 team members, 5 projects, email support.
                          </Paragraph>
                        </div>
                      </div>
                      <div style="display: flex; align-items: flex-start; gap: 10px; padding: 12px; border: 2px solid #3b82f6; border-radius: 8px; background: #f0f7ff;">
                        <Radio value="pro" />
                        <div>
                          <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-weight: 600;">Pro</span>
                            <Badge {...{ state: 'primary', size: 'sm' } as any}>$29/mo</Badge>
                            <Badge {...{ state: 'success', size: 'sm', variant: 'subtle' } as any}>Popular</Badge>
                          </div>
                          <Paragraph {...{ size: 'sm', style: 'color: #6b7280; margin-top: 2px;' } as any}>
                            Up to 20 team members, unlimited projects, priority support.
                          </Paragraph>
                        </div>
                      </div>
                      <div style="display: flex; align-items: flex-start; gap: 10px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px;">
                        <Radio value="enterprise" />
                        <div>
                          <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-weight: 600;">Enterprise</span>
                            <Badge {...{ state: 'secondary', size: 'sm' } as any}>$99/mo</Badge>
                          </div>
                          <Paragraph {...{ size: 'sm', style: 'color: #6b7280; margin-top: 2px;' } as any}>
                            Unlimited team members, custom integrations, dedicated manager.
                          </Paragraph>
                        </div>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                <Divider />

                <div style="margin-top: 20px;">
                  <FormField>
                    <FieldLabel>Team Size</FieldLabel>
                    <div style="display: flex; align-items: center; gap: 16px;">
                      <div style="flex: 1;">
                        <Slider
                          {...{ min: 1, max: 50, step: 1 } as any}
                          value={teamSize()}
                          onChange={(v: number) => teamSize.set(v)}
                        />
                      </div>
                      <Badge {...{ state: 'primary', size: 'md' } as any}>
                        {() => `${teamSize()} members`}
                      </Badge>
                    </div>
                    <FieldDescription>How many people will use the platform?</FieldDescription>
                  </FormField>
                </div>
              </div>
            ) : null
          }

          {/* Step 3: Review & Confirm */}
          {() =>
            activeStep() === 3 ? (
              <div>
                <Title {...{ size: 'h5', style: 'margin-bottom: 4px;' } as any}>Review & Confirm</Title>
                <Paragraph {...{ size: 'sm', style: 'color: #6b7280; margin-bottom: 20px;' } as any}>
                  Please review your selections before submitting.
                </Paragraph>

                <Card {...{ variant: 'filled' } as any}>
                  <div style="display: flex; flex-direction: column; gap: 12px;">
                    <div style="display: flex; justify-content: space-between;">
                      <Paragraph {...{ size: 'sm', style: 'color: #6b7280;' } as any}>Name</Paragraph>
                      <Paragraph {...{ size: 'sm', style: 'font-weight: 600;' } as any}>{() => name() || '--'}</Paragraph>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                      <Paragraph {...{ size: 'sm', style: 'color: #6b7280;' } as any}>Email</Paragraph>
                      <Paragraph {...{ size: 'sm', style: 'font-weight: 600;' } as any}>{() => email() || '--'}</Paragraph>
                    </div>
                    <Divider />
                    <div style="display: flex; justify-content: space-between;">
                      <Paragraph {...{ size: 'sm', style: 'color: #6b7280;' } as any}>Plan</Paragraph>
                      <div style="display: flex; align-items: center; gap: 8px;">
                        <Paragraph {...{ size: 'sm', style: 'font-weight: 600;' } as any}>{() => planDetails().name}</Paragraph>
                        <Badge {...{ state: 'primary', size: 'sm' } as any}>{() => planDetails().price}</Badge>
                      </div>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                      <Paragraph {...{ size: 'sm', style: 'color: #6b7280;' } as any}>Team Size</Paragraph>
                      <Paragraph {...{ size: 'sm', style: 'font-weight: 600;' } as any}>{() => `${teamSize()} members`}</Paragraph>
                    </div>
                  </div>
                </Card>

                <div style="display: flex; align-items: center; gap: 10px; margin-top: 20px;">
                  <Checkbox
                    checked={agreedToTerms()}
                    onChange={() => agreedToTerms.update((v) => !v)}
                  />
                  <Paragraph {...{ size: 'sm' } as any}>
                    I agree to the{' '}
                    <a href="#" style="color: #3b82f6; text-decoration: none;" onClick={(e: Event) => e.preventDefault()}>
                      Terms of Service
                    </a>{' '}
                    and{' '}
                    <a href="#" style="color: #3b82f6; text-decoration: none;" onClick={(e: Event) => e.preventDefault()}>
                      Privacy Policy
                    </a>
                    .
                  </Paragraph>
                </div>
              </div>
            ) : null
          }

          {/* Step 4: Confirmation */}
          {() =>
            activeStep() === 4 ? (
              <div>
                <Alert {...{ state: 'success' } as any}>
                  <span style="font-weight: 600;">Account created successfully!</span> Welcome aboard.
                </Alert>
                <div style="text-align: center; margin-top: 24px;">
                  <div style="font-size: 48px; margin-bottom: 12px;">🎉</div>
                  <Title {...{ size: 'h4', style: 'margin-bottom: 8px;' } as any}>You're All Set!</Title>
                  <Paragraph {...{ size: 'sm', style: 'color: #6b7280; max-width: 360px; margin: 0 auto;' } as any}>
                    Your {() => planDetails().name} plan is now active with {() => teamSize()} team member slots. We've sent a confirmation email to {() => email()}.
                  </Paragraph>
                  <div style="margin-top: 20px;">
                    <Button {...{ state: 'primary', size: 'md' } as any}>Go to Dashboard</Button>
                  </div>
                </div>
              </div>
            ) : null
          }
        </Card>

        {/* Navigation Buttons */}
        {() =>
          activeStep() < 4 ? (
            <div style="display: flex; justify-content: space-between; margin-top: 16px;">
              <Button
                {...{ state: 'secondary', variant: 'ghost', size: 'md' } as any}
                disabled={activeStep() === 1}
                onClick={goBack}
              >
                Back
              </Button>
              <Button
                {...{ state: 'primary', size: 'md' } as any}
                disabled={!canProceed()}
                onClick={goNext}
              >
                {() => (activeStep() === 3 ? 'Submit' : 'Next')}
              </Button>
            </div>
          ) : null
        }
      </div>
    </div>
  )
}
