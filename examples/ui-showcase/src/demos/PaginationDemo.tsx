import { signal } from '@pyreon/reactivity'
import { Pagination, Button } from '@pyreon/ui-components'

export function PaginationDemo() {
  const page1 = signal(1)
  const page2 = signal(3)
  const page3 = signal(1)

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Pagination</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Page navigation with numbered pages and size options.
      </p>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Basic Pagination</h3>
      <div style="margin-bottom: 24px;">
        <Pagination>
          <div style="display: flex; gap: 4px; align-items: center;">
            <Button size="sm" variant="outline" disabled={page1() <= 1} onClick={() => page1.set(page1() - 1)}>Prev</Button>
            {[1, 2, 3, 4, 5].map((p) => (
              <Button
                size="sm"
                {...(page1() === p ? { state: 'primary' } as any : {})}
                variant={page1() === p ? 'solid' : 'ghost'}
                onClick={() => page1.set(p)}
              >
                {p}
              </Button>
            ))}
            <Button size="sm" variant="outline" disabled={page1() >= 5} onClick={() => page1.set(page1() + 1)}>Next</Button>
          </div>
        </Pagination>
        <p style="font-size: 13px; color: #6b7280; margin-top: 8px;">Current page: {() => page1()}</p>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Ellipsis</h3>
      <div style="margin-bottom: 24px;">
        <Pagination>
          <div style="display: flex; gap: 4px; align-items: center;">
            <Button size="sm" variant="outline" disabled={page2() <= 1} onClick={() => page2.set(page2() - 1)}>Prev</Button>
            <Button size="sm" variant={page2() === 1 ? 'solid' : 'ghost'} {...(page2() === 1 ? { state: 'primary' } as any : {})} onClick={() => page2.set(1)}>1</Button>
            <Button size="sm" variant={page2() === 2 ? 'solid' : 'ghost'} {...(page2() === 2 ? { state: 'primary' } as any : {})} onClick={() => page2.set(2)}>2</Button>
            <Button size="sm" variant={page2() === 3 ? 'solid' : 'ghost'} {...(page2() === 3 ? { state: 'primary' } as any : {})} onClick={() => page2.set(3)}>3</Button>
            <span style="padding: 0 8px; color: #9ca3af;">...</span>
            <Button size="sm" variant={page2() === 10 ? 'solid' : 'ghost'} {...(page2() === 10 ? { state: 'primary' } as any : {})} onClick={() => page2.set(10)}>10</Button>
            <Button size="sm" variant="outline" disabled={page2() >= 10} onClick={() => page2.set(page2() + 1)}>Next</Button>
          </div>
        </Pagination>
        <p style="font-size: 13px; color: #6b7280; margin-top: 8px;">Page {() => page2()} of 10</p>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>
      <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px;">
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">Small (sm)</p>
          <Pagination {...{ size: 'sm' } as any}>
            <div style="display: flex; gap: 2px; align-items: center;">
              <Button size="xs" variant="outline">Prev</Button>
              <Button size="xs" {...{ state: 'primary' } as any}>1</Button>
              <Button size="xs" variant="ghost">2</Button>
              <Button size="xs" variant="ghost">3</Button>
              <Button size="xs" variant="outline">Next</Button>
            </div>
          </Pagination>
        </div>
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">Medium (md)</p>
          <Pagination {...{ size: 'md' } as any}>
            <div style="display: flex; gap: 4px; align-items: center;">
              <Button size="sm" variant="outline">Prev</Button>
              <Button size="sm" {...{ state: 'primary' } as any}>1</Button>
              <Button size="sm" variant="ghost">2</Button>
              <Button size="sm" variant="ghost">3</Button>
              <Button size="sm" variant="outline">Next</Button>
            </div>
          </Pagination>
        </div>
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">Large (lg)</p>
          <Pagination {...{ size: 'lg' } as any}>
            <div style="display: flex; gap: 6px; align-items: center;">
              <Button size="md" variant="outline">Prev</Button>
              <Button size="md" {...{ state: 'primary' } as any}>1</Button>
              <Button size="md" variant="ghost">2</Button>
              <Button size="md" variant="ghost">3</Button>
              <Button size="md" variant="outline">Next</Button>
            </div>
          </Pagination>
        </div>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Page Info</h3>
      <div style="margin-bottom: 24px;">
        <div style="display: flex; align-items: center; justify-content: space-between; max-width: 500px;">
          <p style="font-size: 13px; color: #6b7280;">Showing {() => (page3() - 1) * 10 + 1}-{() => Math.min(page3() * 10, 47)} of 47 results</p>
          <Pagination>
            <div style="display: flex; gap: 4px; align-items: center;">
              <Button size="sm" variant="outline" disabled={page3() <= 1} onClick={() => page3.set(page3() - 1)}>Prev</Button>
              {[1, 2, 3, 4, 5].map((p) => (
                <Button
                  size="sm"
                  {...(page3() === p ? { state: 'primary' } as any : {})}
                  variant={page3() === p ? 'solid' : 'ghost'}
                  onClick={() => page3.set(p)}
                >
                  {p}
                </Button>
              ))}
              <Button size="sm" variant="outline" disabled={page3() >= 5} onClick={() => page3.set(page3() + 1)}>Next</Button>
            </div>
          </Pagination>
        </div>
      </div>
    </div>
  )
}
