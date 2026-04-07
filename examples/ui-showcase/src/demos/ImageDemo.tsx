import { Image } from '@pyreon/ui-components'

export function ImageDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Image</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Responsive image component with rounded and circle variants.
      </p>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Default</h3>
      <div style="margin-bottom: 24px;">
        <Image
          {...{ src: 'https://picsum.photos/seed/pyreon1/400/200', alt: 'Default image' } as any}
          style="width: 400px; height: 200px; object-fit: cover;"
        />
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Variants</h3>
      <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 24px;">
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">Rounded</p>
          <Image
            {...{ variant: 'rounded', src: 'https://picsum.photos/seed/pyreon2/200/200', alt: 'Rounded image' } as any}
            style="width: 200px; height: 200px; object-fit: cover;"
          />
        </div>
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">Circle</p>
          <Image
            {...{ variant: 'circle', src: 'https://picsum.photos/seed/pyreon3/200/200', alt: 'Circle image' } as any}
            style="width: 200px; height: 200px; object-fit: cover;"
          />
        </div>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Responsive Sizes</h3>
      <div style="display: flex; gap: 16px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 24px;">
        <Image
          {...{ variant: 'rounded', src: 'https://picsum.photos/seed/pyreon4/80/80', alt: 'Small' } as any}
          style="width: 80px; height: 80px; object-fit: cover;"
        />
        <Image
          {...{ variant: 'rounded', src: 'https://picsum.photos/seed/pyreon5/150/150', alt: 'Medium' } as any}
          style="width: 150px; height: 150px; object-fit: cover;"
        />
        <Image
          {...{ variant: 'rounded', src: 'https://picsum.photos/seed/pyreon6/250/150', alt: 'Wide' } as any}
          style="width: 250px; height: 150px; object-fit: cover;"
        />
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Full Width</h3>
      <div style="margin-bottom: 24px;">
        <Image
          {...{ variant: 'rounded', src: 'https://picsum.photos/seed/pyreon7/800/200', alt: 'Full width image' } as any}
          style="width: 100%; height: 200px; object-fit: cover;"
        />
      </div>
    </div>
  )
}
