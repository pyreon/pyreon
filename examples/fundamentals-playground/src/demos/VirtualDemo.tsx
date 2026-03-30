import { signal } from "@pyreon/reactivity";
import { useVirtualizer } from "@pyreon/virtual";

const items = Array.from({ length: 10000 }, (_, i) => ({
  id: i,
  label: `Item ${i + 1}`,
  color: `hsl(${(i * 7) % 360}, 70%, 92%)`,
}));

export function VirtualDemo() {
  const parentRef = signal<HTMLElement | null>(null);

  const { virtualItems, totalSize, isScrolling } = useVirtualizer(() => ({
    count: items.length,
    getScrollElement: () => parentRef(),
    estimateSize: () => 40,
    overscan: 10,
  }));

  return (
    <div>
      <h2>Virtual</h2>
      <p class="desc">
        TanStack Virtual adapter. Renders 10,000 items efficiently — only visible rows exist in the
        DOM.
      </p>

      <div class="section">
        <h3>
          Virtual List ({items.length.toLocaleString()} items)
          {() =>
            isScrolling() ? (
              <span class="badge blue" style="margin-left: 8px">
                scrolling
              </span>
            ) : null
          }
        </h3>
        <p style="font-size: 13px; color: #666; margin-bottom: 8px">
          Rendered: {() => virtualItems().length} / {items.length.toLocaleString()}
        </p>

        <div
          ref={(el: HTMLElement) => parentRef.set(el)}
          style="height: 400px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px"
        >
          <div style={`height: ${totalSize()}px; width: 100%; position: relative`}>
            {() =>
              virtualItems().map((vRow) => {
                const item = items[vRow.index]!;
                return (
                  <div
                    key={vRow.key}
                    style={`
                      position: absolute;
                      top: 0;
                      left: 0;
                      width: 100%;
                      height: ${vRow.size}px;
                      transform: translateY(${vRow.start}px);
                      display: flex;
                      align-items: center;
                      padding: 0 16px;
                      border-bottom: 1px solid #f0f0f0;
                      background: ${item.color};
                      font-size: 14px;
                    `}
                  >
                    <strong style="min-width: 80px; color: #666">#{item.id + 1}</strong>
                    {item.label}
                  </div>
                );
              })
            }
          </div>
        </div>
      </div>
    </div>
  );
}
