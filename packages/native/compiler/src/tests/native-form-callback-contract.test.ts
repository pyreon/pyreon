import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const source = `import { useForm } from '@pyreon/form'
import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
export function FormCallbackContract() {
  const last = signal('')
  const form = useForm({
    initialValues: { name: '', code: '' },
    validators: { name: (v) => v ? '' : 'required', code: (v) => v.length === 2 ? '' : 'two UTF-16 units' },
    onSubmit: ({ name }) => {
      if (!name) return
      return last.set(name)
    },
  })
  return <Stack><Text>{last()}</Text><Button onPress={() => form.submit()}>Save</Button></Stack>
}`

it.each(['swift', 'kotlin'] as const)(
  '%s emits a Boolean condition for string validators',
  (target) => {
    const result = transform(source, { target })
    expect(result.warnings).toEqual([])
    expect(result.code).toContain(target === 'swift' ? '!(v).isEmpty' : '(v).isNotEmpty()')
  },
)

it('Kotlin emits local submit returns and evaluates the returned write before exiting', () => {
  const result = transform(source, { target: 'kotlin' })
  expect(result.code).toContain('onSubmit = __pyreonSubmit@ {')
  expect(result.code).toContain('return@__pyreonSubmit')
  expect(result.code).toMatch(/last = name\s+return@__pyreonSubmit/)
  expect(result.code).not.toContain('return last =')
})

it('Swift typechecks string validators and submit control flow', (ctx) => {
  if (!isSwiftcAvailable()) return ctx.skip()
  const result = validateSwiftWithStubs(transform(source, { target: 'swift' }).code)
  expect(result.ok, result.error).toBe(true)
})

it('Kotlin compiles string validators and submit control flow', (ctx) => {
  if (!isKotlincAvailable()) return ctx.skip()
  const result = validateKotlin(transform(source, { target: 'kotlin' }).code)
  expect(result.ok, result.error).toBe(true)
})

it('Swift validator length counts UTF-16 units like JavaScript', () => {
  expect(transform(source, { target: 'swift' }).code).toContain('v.utf16.count == 2')
})
