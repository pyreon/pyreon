
    import { createI18n } from '@pyreon/i18n/core'
    import { signal } from '@pyreon/reactivity'
    import { Stack, Text } from '@pyreon/primitives'
    export function App() {
      const i18n = createI18n({
        locale: 'en',
        messages: { en: { greet: 'Hello {{name}}!', items_one: '{{count}} item', items_other: '{{count}} items' } },
      })
      const count = signal<number>(2)
      return (
        <Stack>
          <Text>{i18n.t('greet', { name: 'Ada' })}</Text>
          <Text>{i18n.t('items', { count: count() })}</Text>
        </Stack>
      )
    }
  
