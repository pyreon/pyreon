import { signal } from '@pyreon/reactivity'
import { Stepper, Step, Button } from '@pyreon/ui-components'

export function StepperDemo() {
  const currentStep = signal(2)

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Stepper</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Step indicators for multi-step workflows with completed, active, and default states.
      </p>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Horizontal</h3>
      <div style="margin-bottom: 24px;">
        <Stepper variant="horizontal">
          <Step {...{ state: 'completed' } as any}>
            <span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px;">1</span>
          </Step>
          <div style="flex: 1; height: 2px; background: #e5e7eb; align-self: center;" />
          <Step {...{ state: 'active' } as any}>
            <span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px;">2</span>
          </Step>
          <div style="flex: 1; height: 2px; background: #e5e7eb; align-self: center;" />
          <Step {...{ state: 'default' } as any}>
            <span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px;">3</span>
          </Step>
          <div style="flex: 1; height: 2px; background: #e5e7eb; align-self: center;" />
          <Step {...{ state: 'default' } as any}>
            <span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px;">4</span>
          </Step>
        </Stepper>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Labels</h3>
      <div style="margin-bottom: 24px;">
        <div style="display: flex; align-items: flex-start; gap: 0;">
          <div style="display: flex; flex-direction: column; align-items: center; flex: 1;">
            <Step {...{ state: 'completed' } as any}>
              <span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px;">1</span>
            </Step>
            <p style="font-size: 12px; margin-top: 8px; color: #16a34a;">Account</p>
          </div>
          <div style="flex: 1; height: 2px; background: #16a34a; margin-top: 14px;" />
          <div style="display: flex; flex-direction: column; align-items: center; flex: 1;">
            <Step {...{ state: 'completed' } as any}>
              <span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px;">2</span>
            </Step>
            <p style="font-size: 12px; margin-top: 8px; color: #16a34a;">Profile</p>
          </div>
          <div style="flex: 1; height: 2px; background: #e5e7eb; margin-top: 14px;" />
          <div style="display: flex; flex-direction: column; align-items: center; flex: 1;">
            <Step {...{ state: 'active' } as any}>
              <span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px;">3</span>
            </Step>
            <p style="font-size: 12px; margin-top: 8px; font-weight: 600; color: #3b82f6;">Payment</p>
          </div>
          <div style="flex: 1; height: 2px; background: #e5e7eb; margin-top: 14px;" />
          <div style="display: flex; flex-direction: column; align-items: center; flex: 1;">
            <Step {...{ state: 'default' } as any}>
              <span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px;">4</span>
            </Step>
            <p style="font-size: 12px; margin-top: 8px; color: #9ca3af;">Review</p>
          </div>
        </div>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Vertical</h3>
      <div style="margin-bottom: 24px;">
        <Stepper variant="vertical">
          <div style="display: flex; gap: 12px; align-items: flex-start; padding-bottom: 24px;">
            <Step {...{ state: 'completed' } as any}>
              <span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px;">1</span>
            </Step>
            <div>
              <p style="font-weight: 500;">Create account</p>
              <p style="font-size: 13px; color: #6b7280;">Sign up with your email.</p>
            </div>
          </div>
          <div style="display: flex; gap: 12px; align-items: flex-start; padding-bottom: 24px;">
            <Step {...{ state: 'completed' } as any}>
              <span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px;">2</span>
            </Step>
            <div>
              <p style="font-weight: 500;">Verify email</p>
              <p style="font-size: 13px; color: #6b7280;">Check your inbox for verification link.</p>
            </div>
          </div>
          <div style="display: flex; gap: 12px; align-items: flex-start; padding-bottom: 24px;">
            <Step {...{ state: 'active' } as any}>
              <span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px;">3</span>
            </Step>
            <div>
              <p style="font-weight: 500; color: #3b82f6;">Set up profile</p>
              <p style="font-size: 13px; color: #6b7280;">Add your name and avatar.</p>
            </div>
          </div>
          <div style="display: flex; gap: 12px; align-items: flex-start;">
            <Step {...{ state: 'default' } as any}>
              <span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px;">4</span>
            </Step>
            <div>
              <p style="font-weight: 500; color: #9ca3af;">Start using app</p>
              <p style="font-size: 13px; color: #9ca3af;">You are all set!</p>
            </div>
          </div>
        </Stepper>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Interactive</h3>
      <div style="margin-bottom: 16px;">
        <Stepper variant="horizontal">
          {[1, 2, 3, 4].map((step) => (
            <>
              {step > 1 && <div style={`flex: 1; height: 2px; align-self: center; background: ${step <= currentStep() ? '#16a34a' : '#e5e7eb'};`} />}
              <Step {...{ state: step < currentStep() ? 'completed' : step === currentStep() ? 'active' : 'default' } as any}>
                <span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px;">
                  {() => step < currentStep() ? '\u2713' : step}
                </span>
              </Step>
            </>
          ))}
        </Stepper>
      </div>
      <div style="display: flex; gap: 8px; margin-bottom: 24px;">
        <Button size="sm" variant="outline" disabled={currentStep() <= 1} onClick={() => currentStep.set(currentStep() - 1)}>Back</Button>
        <Button size="sm" {...{ state: 'primary' } as any} disabled={currentStep() >= 4} onClick={() => currentStep.set(currentStep() + 1)}>Next</Button>
        <span style="font-size: 13px; color: #6b7280; align-self: center; margin-left: 8px;">Step {() => currentStep()} of 4</span>
      </div>
    </div>
  )
}
