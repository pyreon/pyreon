import { useForm } from '@pyreon/form'
import { mount } from '@pyreon/runtime-dom'
import { type } from 'arktype'
import * as v from 'valibot'
import { z } from 'zod'
import { arktypeField, arktypeSchema } from '../arktype'
import { issuesToRecord } from '../utils'
import { valibotField, valibotSchema } from '../valibot'
import { zodField, zodSchema } from '../zod'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Capture<T>({ fn }: { fn: () => T }) {
  fn()
  return null
}

function mountWith<T>(fn: () => T): { result: T; unmount: () => void } {
  let result: T | undefined
  const el = document.createElement('div')
  document.body.appendChild(el)
  const unmount = mount(
    <Capture
      fn={() => {
        result = fn()
      }}
    />,
    el,
  )
  return {
    result: result!,
    unmount: () => {
      unmount()
      el.remove()
    },
  }
}

// ─── issuesToRecord ──────────────────────────────────────────────────────────

describe('issuesToRecord', () => {
  it('converts issues to a flat record', () => {
    const result = issuesToRecord([
      { path: 'email', message: 'Required' },
      { path: 'password', message: 'Too short' },
    ])
    expect(result).toEqual({ email: 'Required', password: 'Too short' })
  })

  it('first error per field wins', () => {
    const result = issuesToRecord([
      { path: 'email', message: 'Required' },
      { path: 'email', message: 'Invalid format' },
    ])
    expect(result).toEqual({ email: 'Required' })
  })

  it('returns empty object for no issues', () => {
    expect(issuesToRecord([])).toEqual({})
  })
})

// ─── Zod Adapter ─────────────────────────────────────────────────────────────

describe('zodSchema', () => {
  const schema = z.object({
    email: z.string().email('Invalid email'),
    password: z.string().min(8, 'Min 8 chars'),
  })

  it('returns empty record for valid data', async () => {
    const validate = zodSchema(schema)
    const result = await validate({ email: 'a@b.com', password: '12345678' })
    expect(result).toEqual({})
  })

  it('returns field errors for invalid data', async () => {
    const validate = zodSchema(schema)
    const result = await validate({ email: 'bad', password: 'short' })
    expect(result.email).toBe('Invalid email')
    expect(result.password).toBe('Min 8 chars')
  })

  it('returns error for single invalid field', async () => {
    const validate = zodSchema(schema)
    const result = await validate({ email: 'a@b.com', password: 'short' })
    expect(result.email).toBeUndefined()
    expect(result.password).toBe('Min 8 chars')
  })
})

describe('zodField', () => {
  it('returns undefined for valid value', async () => {
    const validate = zodField(z.string().email('Invalid email'))
    expect(await validate('a@b.com', {})).toBeUndefined()
  })

  it('returns error message for invalid value', async () => {
    const validate = zodField(z.string().email('Invalid email'))
    expect(await validate('bad', {})).toBe('Invalid email')
  })

  it('works with number schemas', async () => {
    const validate = zodField(z.number().min(0, 'Must be positive'))
    expect(await validate(-1, {})).toBe('Must be positive')
    expect(await validate(5, {})).toBeUndefined()
  })
})

describe('zod + useForm integration', () => {
  it('validates form with zod schema', async () => {
    const schema = z.object({
      email: z.string().email('Invalid email'),
      password: z.string().min(8, 'Min 8 chars'),
    })

    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { email: '', password: '' },
        schema: zodSchema(schema),
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    const valid = await form.validate()
    expect(valid).toBe(false)
    expect(form.fields.email.error()).toBe('Invalid email')
    expect(form.fields.password.error()).toBe('Min 8 chars')
    unmount()
  })

  it('validates with field-level zod validators', async () => {
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { email: '', age: 0 },
        validators: {
          email: zodField(z.string().email('Invalid')),
          age: zodField(z.number().min(18, 'Must be 18+')),
        },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    const valid = await form.validate()
    expect(valid).toBe(false)
    expect(form.fields.email.error()).toBe('Invalid')
    expect(form.fields.age.error()).toBe('Must be 18+')
    unmount()
  })
})

// ─── Valibot Adapter ─────────────────────────────────────────────────────────

describe('valibotSchema', () => {
  const schema = v.object({
    email: v.pipe(v.string(), v.email('Invalid email')),
    password: v.pipe(v.string(), v.minLength(8, 'Min 8 chars')),
  })

  it('returns empty record for valid data', async () => {
    const validate = valibotSchema(schema, v.safeParseAsync)
    const result = await validate({ email: 'a@b.com', password: '12345678' })
    expect(result).toEqual({})
  })

  it('returns field errors for invalid data', async () => {
    const validate = valibotSchema(schema, v.safeParseAsync)
    const result = await validate({ email: 'bad', password: 'short' })
    expect(result.email).toBe('Invalid email')
    expect(result.password).toBe('Min 8 chars')
  })

  it('works with sync safeParse', async () => {
    const validate = valibotSchema(schema, v.safeParse)
    const result = await validate({ email: 'bad', password: 'short' })
    expect(result.email).toBe('Invalid email')
  })

  it('handles issues without path', async () => {
    // Simulate a safeParse function that returns issues without path
    const mockSafeParse = async () => ({
      success: false as const,
      issues: [{ message: 'Schema-level error' }],
    })
    const validate = valibotSchema({}, mockSafeParse)
    const result = await validate({})
    // Issue without path maps to empty string key
    expect(result['' as keyof typeof result]).toBe('Schema-level error')
  })

  it('handles result with undefined issues array', async () => {
    const mockSafeParse = async () => ({
      success: false as const,
      // issues is undefined
    })
    const validate = valibotSchema({}, mockSafeParse)
    const result = await validate({})
    expect(result).toEqual({})
  })
})

describe('valibotField', () => {
  it('returns undefined for valid value', async () => {
    const validate = valibotField(v.pipe(v.string(), v.email('Invalid email')), v.safeParseAsync)
    expect(await validate('a@b.com', {})).toBeUndefined()
  })

  it('returns error message for invalid value', async () => {
    const validate = valibotField(v.pipe(v.string(), v.email('Invalid email')), v.safeParseAsync)
    expect(await validate('bad', {})).toBe('Invalid email')
  })

  it('handles result with undefined issues', async () => {
    const mockSafeParse = async () => ({
      success: false as const,
    })
    const validate = valibotField({}, mockSafeParse)
    expect(await validate('x', {})).toBeUndefined()
  })
})

describe('valibot + useForm integration', () => {
  it('validates form with valibot schema', async () => {
    const schema = v.object({
      email: v.pipe(v.string(), v.email('Invalid email')),
      password: v.pipe(v.string(), v.minLength(8, 'Min 8 chars')),
    })

    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { email: '', password: '' },
        schema: valibotSchema(schema, v.safeParseAsync),
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    const valid = await form.validate()
    expect(valid).toBe(false)
    expect(form.fields.email.error()).toBe('Invalid email')
    expect(form.fields.password.error()).toBe('Min 8 chars')
    unmount()
  })
})

// ─── ArkType Adapter ─────────────────────────────────────────────────────────

describe('arktypeSchema', () => {
  const schema = type({
    email: 'string.email',
    password: 'string >= 8',
  })

  it('returns empty record for valid data', async () => {
    const validate = arktypeSchema(schema)
    const result = await validate({ email: 'a@b.com', password: '12345678' })
    expect(result).toEqual({})
  })

  it('returns field errors for invalid data', async () => {
    const validate = arktypeSchema(schema)
    const result = await validate({ email: 'bad', password: 'short' })
    expect(result.email).toBeDefined()
    expect(result.password).toBeDefined()
  })
})

describe('arktypeField', () => {
  it('returns undefined for valid value', async () => {
    const validate = arktypeField(type('string.email'))
    expect(await validate('a@b.com', {})).toBeUndefined()
  })

  it('returns error message for invalid value', async () => {
    const validate = arktypeField(type('string.email'))
    const result = await validate('bad', {})
    expect(result).toBeDefined()
    expect(typeof result).toBe('string')
  })
})

describe('zodSchema catch branch', () => {
  it('captures Error when safeParseAsync throws an Error', async () => {
    const throwingSchema = {
      safeParseAsync: () => {
        throw new Error('Zod schema exploded')
      },
      safeParse: () => {
        throw new Error('Zod schema exploded')
      },
    }
    const validate = zodSchema(throwingSchema as any)
    const result = await validate({ email: '', password: '' })
    expect(result['' as keyof typeof result]).toBe('Zod schema exploded')
  })

  it('captures non-Error when safeParseAsync throws a string', async () => {
    const throwingSchema = {
      safeParseAsync: () => {
        throw 'raw string error'
      },
      safeParse: () => {
        throw 'raw string error'
      },
    }
    const validate = zodSchema(throwingSchema as any)
    const result = await validate({ email: '', password: '' })
    expect(result['' as keyof typeof result]).toBe('raw string error')
  })
})

describe('zodField catch branch', () => {
  it('captures Error when safeParseAsync throws an Error', async () => {
    const throwingSchema = {
      safeParseAsync: () => {
        throw new Error('Zod field exploded')
      },
      safeParse: () => {
        throw new Error('Zod field exploded')
      },
    }
    const validate = zodField(throwingSchema as any)
    const result = await validate('test', {})
    expect(result).toBe('Zod field exploded')
  })

  it('captures non-Error when safeParseAsync throws a string', async () => {
    const throwingSchema = {
      safeParseAsync: () => {
        throw 'raw zod field error'
      },
      safeParse: () => {
        throw 'raw zod field error'
      },
    }
    const validate = zodField(throwingSchema as any)
    const result = await validate('test', {})
    expect(result).toBe('raw zod field error')
  })
})

describe('valibotSchema catch branch', () => {
  it('captures Error when safeParse function throws an Error', async () => {
    const throwingParse = () => {
      throw new Error('Valibot schema exploded')
    }
    const validate = valibotSchema({}, throwingParse)
    const result = await validate({ email: '', password: '' })
    expect(result['' as keyof typeof result]).toBe('Valibot schema exploded')
  })

  it('captures non-Error when safeParse function throws a string', async () => {
    const throwingParse = () => {
      throw 'raw valibot schema error'
    }
    const validate = valibotSchema({}, throwingParse)
    const result = await validate({ email: '', password: '' })
    expect(result['' as keyof typeof result]).toBe('raw valibot schema error')
  })
})

describe('valibotField catch branch', () => {
  it('captures Error when safeParse function throws an Error', async () => {
    const throwingParse = () => {
      throw new Error('Valibot field exploded')
    }
    const validate = valibotField({}, throwingParse)
    const result = await validate('test', {})
    expect(result).toBe('Valibot field exploded')
  })

  it('captures non-Error when safeParse function throws a string', async () => {
    const throwingParse = () => {
      throw 'raw valibot field error'
    }
    const validate = valibotField({}, throwingParse)
    const result = await validate('test', {})
    expect(result).toBe('raw valibot field error')
  })
})

describe('arktypeSchema catch branch', () => {
  it('captures Error when schema function throws an Error', async () => {
    const throwingSchema = () => {
      throw new Error('ArkType schema exploded')
    }
    const validate = arktypeSchema(throwingSchema)
    const result = await validate({ email: '', password: '' })
    expect(result['' as keyof typeof result]).toBe('ArkType schema exploded')
  })

  it('captures non-Error when schema function throws a string', async () => {
    const throwingSchema = () => {
      throw 'raw arktype schema error'
    }
    const validate = arktypeSchema(throwingSchema)
    const result = await validate({ email: '', password: '' })
    expect(result['' as keyof typeof result]).toBe('raw arktype schema error')
  })
})

describe('arktypeField catch branch', () => {
  it('captures Error when schema function throws an Error', async () => {
    const throwingSchema = () => {
      throw new Error('ArkType field exploded')
    }
    const validate = arktypeField(throwingSchema)
    const result = await validate('test', {})
    expect(result).toBe('ArkType field exploded')
  })

  it('captures non-Error when schema function throws a string', async () => {
    const throwingSchema = () => {
      throw 'raw arktype field error'
    }
    const validate = arktypeField(throwingSchema)
    const result = await validate('test', {})
    expect(result).toBe('raw arktype field error')
  })
})

describe('arktype + useForm integration', () => {
  it('validates form with arktype schema', async () => {
    const schema = type({
      email: 'string.email',
      password: 'string >= 8',
    })

    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { email: '', password: '' },
        schema: arktypeSchema(schema),
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    const valid = await form.validate()
    expect(valid).toBe(false)
    expect(form.fields.email!.error()).toBeDefined()
    expect(form.fields.password!.error()).toBeDefined()
    unmount()
  })
})
