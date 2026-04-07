import { Skeleton } from '@pyreon/ui-components'

export function SkeletonDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Skeleton</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Loading placeholders with text, circle, and rect variants.
      </p>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Variants</h3>
      <div style="display: flex; flex-direction: column; gap: 16px; max-width: 400px; margin-bottom: 24px;">
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">Text</p>
          <Skeleton {...{ variant: 'text' } as any} style="width: 100%; height: 16px;" />
          <div style="height: 6px;" />
          <Skeleton {...{ variant: 'text' } as any} style="width: 80%; height: 16px;" />
          <div style="height: 6px;" />
          <Skeleton {...{ variant: 'text' } as any} style="width: 60%; height: 16px;" />
        </div>
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">Circle</p>
          <div style="display: flex; gap: 12px;">
            <Skeleton {...{ variant: 'circle' } as any} style="width: 32px; height: 32px;" />
            <Skeleton {...{ variant: 'circle' } as any} style="width: 48px; height: 48px;" />
            <Skeleton {...{ variant: 'circle' } as any} style="width: 64px; height: 64px;" />
          </div>
        </div>
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">Rectangle</p>
          <Skeleton {...{ variant: 'rect' } as any} style="width: 100%; height: 120px;" />
        </div>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Card Placeholder</h3>
      <div style="max-width: 350px; padding: 16px; border: 1px solid #e5e7eb; border-radius: 12px; margin-bottom: 24px;">
        <Skeleton {...{ variant: 'rect' } as any} style="width: 100%; height: 160px; margin-bottom: 16px;" />
        <Skeleton {...{ variant: 'text' } as any} style="width: 70%; height: 20px; margin-bottom: 8px;" />
        <Skeleton {...{ variant: 'text' } as any} style="width: 100%; height: 14px; margin-bottom: 4px;" />
        <Skeleton {...{ variant: 'text' } as any} style="width: 90%; height: 14px; margin-bottom: 16px;" />
        <div style="display: flex; gap: 8px;">
          <Skeleton {...{ variant: 'rect' } as any} style="width: 80px; height: 32px;" />
          <Skeleton {...{ variant: 'rect' } as any} style="width: 80px; height: 32px;" />
        </div>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">User Profile Placeholder</h3>
      <div style="display: flex; gap: 16px; align-items: flex-start; max-width: 400px; margin-bottom: 24px;">
        <Skeleton {...{ variant: 'circle' } as any} style="width: 56px; height: 56px; flex-shrink: 0;" />
        <div style="flex: 1;">
          <Skeleton {...{ variant: 'text' } as any} style="width: 50%; height: 18px; margin-bottom: 8px;" />
          <Skeleton {...{ variant: 'text' } as any} style="width: 70%; height: 14px; margin-bottom: 4px;" />
          <Skeleton {...{ variant: 'text' } as any} style="width: 40%; height: 14px;" />
        </div>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Table Placeholder</h3>
      <div style="max-width: 500px; margin-bottom: 24px;">
        <div style="display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
          <Skeleton {...{ variant: 'text' } as any} style="width: 30%; height: 14px;" />
          <Skeleton {...{ variant: 'text' } as any} style="width: 25%; height: 14px;" />
          <Skeleton {...{ variant: 'text' } as any} style="width: 20%; height: 14px;" />
          <Skeleton {...{ variant: 'text' } as any} style="width: 15%; height: 14px;" />
        </div>
        <div style="display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
          <Skeleton {...{ variant: 'text' } as any} style="width: 30%; height: 14px;" />
          <Skeleton {...{ variant: 'text' } as any} style="width: 25%; height: 14px;" />
          <Skeleton {...{ variant: 'text' } as any} style="width: 20%; height: 14px;" />
          <Skeleton {...{ variant: 'text' } as any} style="width: 15%; height: 14px;" />
        </div>
        <div style="display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
          <Skeleton {...{ variant: 'text' } as any} style="width: 30%; height: 14px;" />
          <Skeleton {...{ variant: 'text' } as any} style="width: 25%; height: 14px;" />
          <Skeleton {...{ variant: 'text' } as any} style="width: 20%; height: 14px;" />
          <Skeleton {...{ variant: 'text' } as any} style="width: 15%; height: 14px;" />
        </div>
      </div>
    </div>
  )
}
