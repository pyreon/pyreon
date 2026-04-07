import { Image } from '@pyreon/ui-components'

export function ImageDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px;">Image</h2>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Rounded (default)</h3>
      <div style="display: flex; gap: 16px; margin-bottom: 24px;">
        <Image src="https://picsum.photos/200/200?random=1" alt="Sample image 1" variant="rounded" width={200} height={200} loading="lazy" />
        <Image src="https://picsum.photos/200/200?random=2" alt="Sample image 2" variant="rounded" width={200} height={200} loading="lazy" />
      </div>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Circle</h3>
      <div style="display: flex; gap: 16px; margin-bottom: 24px;">
        <Image src="https://picsum.photos/150/150?random=3" alt="Circle image 1" variant="circle" width={150} height={150} loading="lazy" />
        <Image src="https://picsum.photos/150/150?random=4" alt="Circle image 2" variant="circle" width={150} height={150} loading="lazy" />
      </div>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Different Sizes</h3>
      <div style="display: flex; gap: 16px; align-items: end; margin-bottom: 24px;">
        <Image src="https://picsum.photos/80/80?random=5" alt="Small" variant="rounded" width={80} height={80} loading="lazy" />
        <Image src="https://picsum.photos/120/120?random=6" alt="Medium" variant="rounded" width={120} height={120} loading="lazy" />
        <Image src="https://picsum.photos/200/120?random=7" alt="Wide" variant="rounded" width={200} height={120} loading="lazy" />
      </div>
    </div>
  )
}
