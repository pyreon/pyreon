import { ButtonGroup, Button } from '@pyreon/ui-components'

export function ButtonGroupDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">ButtonGroup</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Groups multiple buttons together with attached or separated layout variants.
      </p>

      {/* Attached Variant */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Variant: attached</h3>
        <ButtonGroup {...{ variant: 'attached' } as any}>
          <Button {...{ state: 'primary', size: 'md' } as any}>Left</Button>
          <Button {...{ state: 'primary', size: 'md' } as any}>Center</Button>
          <Button {...{ state: 'primary', size: 'md' } as any}>Right</Button>
        </ButtonGroup>
      </section>

      {/* Separated Variant */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Variant: separated</h3>
        <ButtonGroup {...{ variant: 'separated' } as any}>
          <Button {...{ state: 'primary', size: 'md' } as any}>Left</Button>
          <Button {...{ state: 'primary', size: 'md' } as any}>Center</Button>
          <Button {...{ state: 'primary', size: 'md' } as any}>Right</Button>
        </ButtonGroup>
      </section>

      {/* Attached with Different States */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Attached — Different States</h3>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <ButtonGroup {...{ variant: 'attached' } as any}>
            <Button {...{ state: 'primary', size: 'sm' } as any}>Primary</Button>
            <Button {...{ state: 'primary', size: 'sm' } as any}>Primary</Button>
            <Button {...{ state: 'primary', size: 'sm' } as any}>Primary</Button>
          </ButtonGroup>
          <ButtonGroup {...{ variant: 'attached' } as any}>
            <Button {...{ state: 'secondary', size: 'sm' } as any}>Secondary</Button>
            <Button {...{ state: 'secondary', size: 'sm' } as any}>Secondary</Button>
            <Button {...{ state: 'secondary', size: 'sm' } as any}>Secondary</Button>
          </ButtonGroup>
          <ButtonGroup {...{ variant: 'attached' } as any}>
            <Button {...{ state: 'danger', size: 'sm' } as any}>Danger</Button>
            <Button {...{ state: 'danger', size: 'sm' } as any}>Danger</Button>
            <Button {...{ state: 'danger', size: 'sm' } as any}>Danger</Button>
          </ButtonGroup>
          <ButtonGroup {...{ variant: 'attached' } as any}>
            <Button {...{ state: 'success', size: 'sm' } as any}>Success</Button>
            <Button {...{ state: 'success', size: 'sm' } as any}>Success</Button>
            <Button {...{ state: 'success', size: 'sm' } as any}>Success</Button>
          </ButtonGroup>
        </div>
      </section>

      {/* Separated with Different States */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Separated — Different States</h3>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <ButtonGroup {...{ variant: 'separated' } as any}>
            <Button {...{ state: 'primary', size: 'sm' } as any}>Primary</Button>
            <Button {...{ state: 'primary', size: 'sm' } as any}>Primary</Button>
            <Button {...{ state: 'primary', size: 'sm' } as any}>Primary</Button>
          </ButtonGroup>
          <ButtonGroup {...{ variant: 'separated' } as any}>
            <Button {...{ state: 'secondary', size: 'sm' } as any}>Secondary</Button>
            <Button {...{ state: 'secondary', size: 'sm' } as any}>Secondary</Button>
            <Button {...{ state: 'secondary', size: 'sm' } as any}>Secondary</Button>
          </ButtonGroup>
        </div>
      </section>

      {/* Attached with Outline Buttons */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Attached — Outline Variant</h3>
        <ButtonGroup {...{ variant: 'attached' } as any}>
          <Button {...{ state: 'primary', variant: 'outline', size: 'md' } as any}>Day</Button>
          <Button {...{ state: 'primary', variant: 'outline', size: 'md' } as any}>Week</Button>
          <Button {...{ state: 'primary', variant: 'outline', size: 'md' } as any}>Month</Button>
          <Button {...{ state: 'primary', variant: 'outline', size: 'md' } as any}>Year</Button>
        </ButtonGroup>
      </section>

      {/* Different Sizes */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Attached — Size Variations</h3>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((size) => (
            <div style="display: flex; align-items: center; gap: 12px;">
              <span style="font-size: 12px; color: #6b7280; min-width: 24px;">{size}</span>
              <ButtonGroup {...{ variant: 'attached' } as any}>
                <Button {...{ state: 'primary', size } as any}>A</Button>
                <Button {...{ state: 'primary', size } as any}>B</Button>
                <Button {...{ state: 'primary', size } as any}>C</Button>
              </ButtonGroup>
            </div>
          ))}
        </div>
      </section>

      {/* Mixed Button States in Group */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Mixed States in Group</h3>
        <ButtonGroup {...{ variant: 'separated' } as any}>
          <Button {...{ state: 'success', size: 'md' } as any}>Approve</Button>
          <Button {...{ state: 'secondary', size: 'md' } as any}>Skip</Button>
          <Button {...{ state: 'danger', size: 'md' } as any}>Reject</Button>
        </ButtonGroup>
      </section>

      {/* Variant Comparison */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Variant Comparison</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
          <div>
            <p style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #9ca3af; margin-bottom: 8px;">attached</p>
            <ButtonGroup {...{ variant: 'attached' } as any}>
              <Button {...{ state: 'primary', size: 'sm' } as any}>One</Button>
              <Button {...{ state: 'primary', size: 'sm' } as any}>Two</Button>
              <Button {...{ state: 'primary', size: 'sm' } as any}>Three</Button>
            </ButtonGroup>
          </div>
          <div>
            <p style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #9ca3af; margin-bottom: 8px;">separated</p>
            <ButtonGroup {...{ variant: 'separated' } as any}>
              <Button {...{ state: 'primary', size: 'sm' } as any}>One</Button>
              <Button {...{ state: 'primary', size: 'sm' } as any}>Two</Button>
              <Button {...{ state: 'primary', size: 'sm' } as any}>Three</Button>
            </ButtonGroup>
          </div>
        </div>
      </section>
    </div>
  )
}
