import { Code, Paragraph } from '@pyreon/ui-components'

export function CodeDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Code</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Monospace text component with inline and block variants for displaying code.
      </p>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Inline Variant</h3>
        <Paragraph {...{ size: 'md' } as any}>
          Use the <Code {...{ variant: 'inline' } as any}>signal()</Code> function to create a reactive value.
          Call <Code {...{ variant: 'inline' } as any}>signal.set(newValue)</Code> to update it.
          Read the value by calling <Code {...{ variant: 'inline' } as any}>signal()</Code> as a function.
        </Paragraph>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Block Variant</h3>
        <Code {...{ variant: 'block' } as any}>
{`import { signal, computed } from '@pyreon/reactivity'

const count = signal(0)
const doubled = computed(() => count() * 2)

count.set(5)
console.log(doubled()) // 10`}
        </Code>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Multiple Inline Examples</h3>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <Paragraph {...{ size: 'md' } as any}>
            Variable: <Code {...{ variant: 'inline' } as any}>const name = "Pyreon"</Code>
          </Paragraph>
          <Paragraph {...{ size: 'md' } as any}>
            Function: <Code {...{ variant: 'inline' } as any}>{'function hello() { }'}</Code>
          </Paragraph>
          <Paragraph {...{ size: 'md' } as any}>
            Type: <Code {...{ variant: 'inline' } as any}>{'Signal<number>'}</Code>
          </Paragraph>
          <Paragraph {...{ size: 'md' } as any}>
            Command: <Code {...{ variant: 'inline' } as any}>bun run test</Code>
          </Paragraph>
          <Paragraph {...{ size: 'md' } as any}>
            Path: <Code {...{ variant: 'inline' } as any}>packages/core/src/index.ts</Code>
          </Paragraph>
        </div>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Block — JSX Example</h3>
        <Code {...{ variant: 'block' } as any}>
{`export function Counter() {
  const count = signal(0)

  return (
    <div>
      <p>Count: {count()}</p>
      <button onClick={() => count.update(n => n + 1)}>
        Increment
      </button>
    </div>
  )
}`}
        </Code>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Block — Short Snippet</h3>
        <Code {...{ variant: 'block' } as any}>
          {'bun add @pyreon/core @pyreon/reactivity @pyreon/runtime-dom'}
        </Code>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Variant Comparison</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
          <div>
            <p style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #9ca3af; margin-bottom: 8px;">inline</p>
            <Paragraph {...{ size: 'md' } as any}>
              The <Code {...{ variant: 'inline' } as any}>h()</Code> function creates VNodes.
            </Paragraph>
          </div>
          <div>
            <p style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #9ca3af; margin-bottom: 8px;">block</p>
            <Code {...{ variant: 'block' } as any}>{'const vnode = h("div", null, "Hello")'}</Code>
          </div>
        </div>
      </section>
    </div>
  )
}
