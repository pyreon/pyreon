import { Alert } from '@pyreon/ui-components'

export function AlertDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Alert</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Contextual feedback messages. 4 states (info, success, warning, error) and 3 variants (subtle, solid, outline).
      </p>

      {/* States */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">States</h3>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <Alert {...{ state: 'info' } as any}>
            This is an informational alert — check it out!
          </Alert>
          <Alert {...{ state: 'success' } as any}>
            Success! Your changes have been saved.
          </Alert>
          <Alert {...{ state: 'warning' } as any}>
            Warning — your session will expire in 5 minutes.
          </Alert>
          <Alert {...{ state: 'error' } as any}>
            Error! Something went wrong. Please try again.
          </Alert>
        </div>
      </section>

      {/* Variants */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Variants</h3>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div>
            <p style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">subtle (default)</p>
            <Alert {...{ state: 'info', variant: 'subtle' } as any}>
              Subtle variant with a colored left border.
            </Alert>
          </div>
          <div>
            <p style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">solid</p>
            <Alert {...{ state: 'info', variant: 'solid' } as any}>
              Solid variant without the left border.
            </Alert>
          </div>
          <div>
            <p style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">outline</p>
            <Alert {...{ state: 'info', variant: 'outline' } as any}>
              Outline variant with a border all around.
            </Alert>
          </div>
        </div>
      </section>

      {/* State x Variant Matrix */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">State x Variant Matrix</h3>
        <div style="overflow-x: auto;">
          <table style="border-collapse: separate; border-spacing: 8px; width: 100%;">
            <thead>
              <tr>
                <th style="font-size: 12px; font-weight: 600; text-align: left; padding: 4px 8px; color: #6b7280; width: 80px;"></th>
                <th style="font-size: 12px; font-weight: 600; text-align: center; padding: 4px 8px; color: #6b7280;">subtle</th>
                <th style="font-size: 12px; font-weight: 600; text-align: center; padding: 4px 8px; color: #6b7280;">solid</th>
                <th style="font-size: 12px; font-weight: 600; text-align: center; padding: 4px 8px; color: #6b7280;">outline</th>
              </tr>
            </thead>
            <tbody>
              {(['info', 'success', 'warning', 'error'] as const).map((state) => (
                <tr>
                  <td style="font-size: 12px; font-weight: 600; padding: 4px 8px; color: #6b7280; vertical-align: top;">{state}</td>
                  {(['subtle', 'solid', 'outline'] as const).map((variant) => (
                    <td style="padding: 4px 8px;">
                      <Alert {...{ state, variant } as any}>
                        {state} / {variant}
                      </Alert>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* With Longer Content */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">With Longer Content</h3>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <Alert {...{ state: 'info' } as any}>
            <div>
              <strong style="display: block; margin-bottom: 4px;">Update Available</strong>
              A new version of Pyreon (v3.2.0) is available. This update includes performance improvements,
              bug fixes, and new features for the compiler and runtime.
            </div>
          </Alert>
          <Alert {...{ state: 'warning' } as any}>
            <div>
              <strong style="display: block; margin-bottom: 4px;">Deprecation Notice</strong>
              The `useStore` hook will be removed in v4.0. Please migrate to `defineStore` for improved
              type safety and composition patterns.
            </div>
          </Alert>
          <Alert {...{ state: 'error' } as any}>
            <div>
              <strong style="display: block; margin-bottom: 4px;">Build Failed</strong>
              The production build failed due to a TypeScript error in `packages/core/src/vnode.ts:42`.
              Please fix the type error and try again.
            </div>
          </Alert>
          <Alert {...{ state: 'success' } as any}>
            <div>
              <strong style="display: block; margin-bottom: 4px;">Deployment Complete</strong>
              Your application has been successfully deployed to production. All health checks passed.
            </div>
          </Alert>
        </div>
      </section>

      {/* All States — Outline Variant */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">All States — Outline Variant</h3>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <Alert {...{ state: 'info', variant: 'outline' } as any}>Info outline alert</Alert>
          <Alert {...{ state: 'success', variant: 'outline' } as any}>Success outline alert</Alert>
          <Alert {...{ state: 'warning', variant: 'outline' } as any}>Warning outline alert</Alert>
          <Alert {...{ state: 'error', variant: 'outline' } as any}>Error outline alert</Alert>
        </div>
      </section>

      {/* All States — Solid Variant */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">All States — Solid Variant</h3>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <Alert {...{ state: 'info', variant: 'solid' } as any}>Info solid alert</Alert>
          <Alert {...{ state: 'success', variant: 'solid' } as any}>Success solid alert</Alert>
          <Alert {...{ state: 'warning', variant: 'solid' } as any}>Warning solid alert</Alert>
          <Alert {...{ state: 'error', variant: 'solid' } as any}>Error solid alert</Alert>
        </div>
      </section>
    </div>
  )
}
