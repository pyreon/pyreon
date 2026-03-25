import { mount } from "@pyreon/runtime-dom"
import type { FormState } from "../index"
import {
  FormProvider,
  useField,
  useFieldArray,
  useForm,
  useFormContext,
  useFormState,
  useWatch,
} from "../index"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Capture<T>({ fn }: { fn: () => T }) {
  fn()
  return null
}

function mountWith<T>(fn: () => T): { result: T; unmount: () => void } {
  let result: T | undefined
  const el = document.createElement("div")
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

type LoginForm = {
  email: string
  password: string
}

// ─── useForm ─────────────────────────────────────────────────────────────────

describe("useForm", () => {
  it("initializes with correct values", () => {
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { email: "test@test.com", password: "" },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    expect(form.fields.email.value()).toBe("test@test.com")
    expect(form.fields.password.value()).toBe("")
    expect(form.isValid()).toBe(true)
    expect(form.isDirty()).toBe(false)
    expect(form.isSubmitting()).toBe(false)
    expect(form.submitCount()).toBe(0)
    unmount()
  })

  it("setValue updates field value and marks dirty", () => {
    const { result: form, unmount } = mountWith(() =>
      useForm<LoginForm>({
        initialValues: { email: "", password: "" },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    form.fields.email.setValue("hello@world.com")
    expect(form.fields.email.value()).toBe("hello@world.com")
    expect(form.fields.email.dirty()).toBe(true)
    expect(form.isDirty()).toBe(true)
    unmount()
  })

  it("setTouched marks field as touched", () => {
    const { result: form, unmount } = mountWith(() =>
      useForm<LoginForm>({
        initialValues: { email: "", password: "" },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    expect(form.fields.email.touched()).toBe(false)
    form.fields.email.setTouched()
    expect(form.fields.email.touched()).toBe(true)
    unmount()
  })

  it("field-level validation on blur", async () => {
    const { result: form, unmount } = mountWith(() =>
      useForm<LoginForm>({
        initialValues: { email: "", password: "" },
        validators: {
          email: (v) => (!v ? "Required" : undefined),
        },
        onSubmit: () => {
          /* noop */
        },
        validateOn: "blur",
      }),
    )

    // No error initially
    expect(form.fields.email.error()).toBeUndefined()

    // Trigger blur
    form.fields.email.setTouched()
    await new Promise((r) => setTimeout(r, 0))

    expect(form.fields.email.error()).toBe("Required")
    expect(form.isValid()).toBe(false)

    // Fix the value
    form.fields.email.setValue("test@test.com")
    form.fields.email.setTouched()
    await new Promise((r) => setTimeout(r, 0))

    expect(form.fields.email.error()).toBeUndefined()
    expect(form.isValid()).toBe(true)
    unmount()
  })

  it("field-level validation on change", async () => {
    const { result: form, unmount } = mountWith(() =>
      useForm<LoginForm>({
        initialValues: { email: "", password: "" },
        validators: {
          email: (v) => (!v ? "Required" : undefined),
        },
        onSubmit: () => {
          /* noop */
        },
        validateOn: "change",
      }),
    )

    // Error should be set immediately via effect
    await new Promise((r) => setTimeout(r, 0))
    expect(form.fields.email.error()).toBe("Required")

    form.fields.email.setValue("hello")
    await new Promise((r) => setTimeout(r, 0))
    expect(form.fields.email.error()).toBeUndefined()
    unmount()
  })

  it("handleSubmit validates and calls onSubmit when valid", async () => {
    let submitted: LoginForm | undefined
    const { result: form, unmount } = mountWith(() =>
      useForm<LoginForm>({
        initialValues: { email: "a@b.com", password: "12345678" },
        validators: {
          email: (v) => (!v ? "Required" : undefined),
          password: (v) => (v.length < 8 ? "Too short" : undefined),
        },
        onSubmit: (values) => {
          submitted = values
        },
      }),
    )

    await form.handleSubmit()
    expect(submitted).toEqual({ email: "a@b.com", password: "12345678" })
    expect(form.submitCount()).toBe(1)
    unmount()
  })

  it("handleSubmit does not call onSubmit when invalid", async () => {
    let called = false
    const { result: form, unmount } = mountWith(() =>
      useForm<LoginForm>({
        initialValues: { email: "", password: "" },
        validators: {
          email: (v) => (!v ? "Required" : undefined),
        },
        onSubmit: () => {
          called = true
        },
      }),
    )

    await form.handleSubmit()
    expect(called).toBe(false)
    expect(form.submitCount()).toBe(1)
    expect(form.fields.email.error()).toBe("Required")
    expect(form.fields.email.touched()).toBe(true)
    unmount()
  })

  it("handleSubmit sets isSubmitting during async onSubmit", async () => {
    const states: boolean[] = []
    const { result: form, unmount } = mountWith(() =>
      useForm<LoginForm>({
        initialValues: { email: "a@b.com", password: "12345678" },
        onSubmit: async () => {
          states.push(form.isSubmitting())
          await new Promise((r) => setTimeout(r, 10))
        },
      }),
    )

    const submitPromise = form.handleSubmit()
    // Should not be submitting yet at this exact moment (microtask)
    await submitPromise
    expect(states[0]).toBe(true)
    expect(form.isSubmitting()).toBe(false)
    unmount()
  })

  it("schema validation runs after field validators", async () => {
    let submitted = false
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { password: "12345678", confirmPassword: "12345679" },
        schema: (values) => {
          const errors: Partial<Record<"password" | "confirmPassword", string>> = {}
          if (values.password !== values.confirmPassword) {
            errors.confirmPassword = "Passwords must match"
          }
          return errors
        },
        onSubmit: () => {
          submitted = true
        },
      }),
    )

    await form.handleSubmit()
    expect(submitted).toBe(false)
    expect(form.fields.confirmPassword.error()).toBe("Passwords must match")

    // Fix the value
    form.fields.confirmPassword.setValue("12345678")
    await form.handleSubmit()
    expect(submitted).toBe(true)
    unmount()
  })

  it("values() returns all current values", () => {
    const { result: form, unmount } = mountWith(() =>
      useForm<LoginForm>({
        initialValues: { email: "a@b.com", password: "secret" },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    expect(form.values()).toEqual({ email: "a@b.com", password: "secret" })
    form.fields.email.setValue("new@email.com")
    expect(form.values()).toEqual({
      email: "new@email.com",
      password: "secret",
    })
    unmount()
  })

  it("errors() returns all current errors", async () => {
    const { result: form, unmount } = mountWith(() =>
      useForm<LoginForm>({
        initialValues: { email: "", password: "" },
        validators: {
          email: (v) => (!v ? "Required" : undefined),
          password: (v) => (!v ? "Required" : undefined),
        },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    await form.validate()
    expect(form.errors()).toEqual({
      email: "Required",
      password: "Required",
    })
    unmount()
  })

  it("reset() restores initial values and clears state", async () => {
    const { result: form, unmount } = mountWith(() =>
      useForm<LoginForm>({
        initialValues: { email: "", password: "" },
        validators: {
          email: (v) => (!v ? "Required" : undefined),
        },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    form.fields.email.setValue("changed")
    form.fields.email.setTouched()
    await form.handleSubmit()

    form.reset()
    expect(form.fields.email.value()).toBe("")
    expect(form.fields.email.error()).toBeUndefined()
    expect(form.fields.email.touched()).toBe(false)
    expect(form.fields.email.dirty()).toBe(false)
    expect(form.submitCount()).toBe(0)
    unmount()
  })

  it("validate() returns true when all valid", async () => {
    const { result: form, unmount } = mountWith(() =>
      useForm<LoginForm>({
        initialValues: { email: "test@test.com", password: "12345678" },
        validators: {
          email: (v) => (!v ? "Required" : undefined),
        },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    const valid = await form.validate()
    expect(valid).toBe(true)
    unmount()
  })

  it("async validators work", async () => {
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { username: "taken" },
        validators: {
          username: async (v) => {
            await new Promise((r) => setTimeout(r, 5))
            return v === "taken" ? "Already taken" : undefined
          },
        },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    const valid = await form.validate()
    expect(valid).toBe(false)
    expect(form.fields.username.error()).toBe("Already taken")
    unmount()
  })

  it("setting value back to initial clears dirty", () => {
    const { result: form, unmount } = mountWith(() =>
      useForm<LoginForm>({
        initialValues: { email: "original", password: "" },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    form.fields.email.setValue("changed")
    expect(form.fields.email.dirty()).toBe(true)

    form.fields.email.setValue("original")
    expect(form.fields.email.dirty()).toBe(false)
    expect(form.isDirty()).toBe(false)
    unmount()
  })

  it("cross-field validation — validators receive all form values", async () => {
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { password: "abc123", confirmPassword: "different" },
        validators: {
          confirmPassword: (value, allValues) =>
            value !== allValues.password ? "Passwords must match" : undefined,
        },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    const valid = await form.validate()
    expect(valid).toBe(false)
    expect(form.fields.confirmPassword.error()).toBe("Passwords must match")

    form.fields.confirmPassword.setValue("abc123")
    const valid2 = await form.validate()
    expect(valid2).toBe(true)
    expect(form.fields.confirmPassword.error()).toBeUndefined()
    unmount()
  })

  it("register() returns value signal and event handlers", () => {
    const { result: form, unmount } = mountWith(() =>
      useForm<LoginForm>({
        initialValues: { email: "", password: "" },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    const props = form.register("email")
    expect(props.value).toBe(form.fields.email.value)
    expect(typeof props.onInput).toBe("function")
    expect(typeof props.onBlur).toBe("function")
    unmount()
  })

  it("register() onInput updates field value", () => {
    const { result: form, unmount } = mountWith(() =>
      useForm<LoginForm>({
        initialValues: { email: "", password: "" },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    const props = form.register("email")
    const fakeEvent = { target: { value: "test@test.com" } } as unknown as Event
    props.onInput(fakeEvent)

    expect(form.fields.email.value()).toBe("test@test.com")
    expect(form.fields.email.dirty()).toBe(true)
    unmount()
  })

  it("register() onBlur marks field as touched and validates", async () => {
    const { result: form, unmount } = mountWith(() =>
      useForm<LoginForm>({
        initialValues: { email: "", password: "" },
        validators: {
          email: (v) => (!v ? "Required" : undefined),
        },
        onSubmit: () => {
          /* noop */
        },
        validateOn: "blur",
      }),
    )

    const props = form.register("email")
    props.onBlur()
    await new Promise((r) => setTimeout(r, 0))

    expect(form.fields.email.touched()).toBe(true)
    expect(form.fields.email.error()).toBe("Required")
    unmount()
  })

  it("setFieldError sets a single field error", () => {
    const { result: form, unmount } = mountWith(() =>
      useForm<LoginForm>({
        initialValues: { email: "", password: "" },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    form.setFieldError("email", "Server error: email taken")
    expect(form.fields.email.error()).toBe("Server error: email taken")
    expect(form.isValid()).toBe(false)

    form.setFieldError("email", undefined)
    expect(form.fields.email.error()).toBeUndefined()
    expect(form.isValid()).toBe(true)
    unmount()
  })

  it("setErrors sets multiple field errors at once", () => {
    const { result: form, unmount } = mountWith(() =>
      useForm<LoginForm>({
        initialValues: { email: "", password: "" },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    form.setErrors({
      email: "Invalid email",
      password: "Too weak",
    })
    expect(form.fields.email.error()).toBe("Invalid email")
    expect(form.fields.password.error()).toBe("Too weak")
    expect(form.isValid()).toBe(false)
    unmount()
  })

  it("debounceMs delays validation", async () => {
    let callCount = 0
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { name: "" },
        validators: {
          name: (v) => {
            callCount++
            return !v ? "Required" : undefined
          },
        },
        onSubmit: () => {
          /* noop */
        },
        validateOn: "blur",
        debounceMs: 50,
      }),
    )

    // Trigger multiple rapid blurs
    form.fields.name.setTouched()
    form.fields.name.setTouched()
    form.fields.name.setTouched()

    // Should not have validated yet
    await new Promise((r) => setTimeout(r, 10))
    expect(callCount).toBe(0)

    // After debounce period, should have validated once
    await new Promise((r) => setTimeout(r, 60))
    expect(callCount).toBe(1)
    expect(form.fields.name.error()).toBe("Required")
    unmount()
  })

  it("validate() bypasses debounce for immediate validation", async () => {
    let callCount = 0
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { name: "" },
        validators: {
          name: (v) => {
            callCount++
            return !v ? "Required" : undefined
          },
        },
        onSubmit: () => {
          /* noop */
        },
        debounceMs: 500,
      }),
    )

    // Direct validate() should run immediately regardless of debounce
    const valid = await form.validate()
    expect(valid).toBe(false)
    expect(callCount).toBe(1)
    unmount()
  })

  it("setFieldValue sets a field value from the form level", () => {
    const { result: form, unmount } = mountWith(() =>
      useForm<LoginForm>({
        initialValues: { email: "", password: "" },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    form.setFieldValue("email", "new@email.com")
    expect(form.fields.email.value()).toBe("new@email.com")
    expect(form.fields.email.dirty()).toBe(true)
    unmount()
  })

  it("clearErrors clears all field errors", async () => {
    const { result: form, unmount } = mountWith(() =>
      useForm<LoginForm>({
        initialValues: { email: "", password: "" },
        validators: {
          email: (v) => (!v ? "Required" : undefined),
          password: (v) => (!v ? "Required" : undefined),
        },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    await form.validate()
    expect(form.isValid()).toBe(false)

    form.clearErrors()
    expect(form.fields.email.error()).toBeUndefined()
    expect(form.fields.password.error()).toBeUndefined()
    expect(form.isValid()).toBe(true)
    unmount()
  })

  it("resetField resets a single field without affecting others", () => {
    const { result: form, unmount } = mountWith(() =>
      useForm<LoginForm>({
        initialValues: { email: "", password: "" },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    form.fields.email.setValue("changed")
    form.fields.password.setValue("changed")
    form.fields.email.setTouched()

    form.resetField("email")
    expect(form.fields.email.value()).toBe("")
    expect(form.fields.email.dirty()).toBe(false)
    expect(form.fields.email.touched()).toBe(false)
    // Password should be unaffected
    expect(form.fields.password.value()).toBe("changed")
    expect(form.fields.password.dirty()).toBe(true)
    unmount()
  })

  it("isValidating tracks async validation state", async () => {
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { name: "" },
        validators: {
          name: async (v) => {
            await new Promise((r) => setTimeout(r, 20))
            return !v ? "Required" : undefined
          },
        },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    expect(form.isValidating()).toBe(false)
    const validatePromise = form.validate()
    expect(form.isValidating()).toBe(true)
    await validatePromise
    expect(form.isValidating()).toBe(false)
    unmount()
  })

  it("handleSubmit calls preventDefault on event", async () => {
    const { result: form, unmount } = mountWith(() =>
      useForm<LoginForm>({
        initialValues: { email: "a@b.com", password: "12345678" },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    let preventDefaultCalled = false
    const fakeEvent = {
      preventDefault: () => {
        preventDefaultCalled = true
      },
    } as unknown as Event

    await form.handleSubmit(fakeEvent)
    expect(preventDefaultCalled).toBe(true)
    unmount()
  })

  it("register() with checkbox type uses checked property", () => {
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { remember: false },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    const props = form.register("remember", { type: "checkbox" })
    expect(props.checked).toBeDefined()
    expect(props.checked!()).toBe(false)

    // Simulate checkbox change
    const fakeEvent = {
      target: { checked: true, value: "on" },
    } as unknown as Event
    props.onInput(fakeEvent)

    expect(form.fields.remember.value()).toBe(true)
    expect(props.checked!()).toBe(true)
    unmount()
  })

  it("register() with number type uses valueAsNumber when valid", () => {
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { age: 0 },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    const props = form.register("age", { type: "number" })

    // Simulate input with a valid number
    const validEvent = {
      target: { value: "25", valueAsNumber: 25 },
    } as unknown as Event
    props.onInput(validEvent)
    expect(form.fields.age.value()).toBe(25)

    // Simulate input with NaN (e.g. empty string) — falls back to target.value
    const nanEvent = {
      target: { value: "", valueAsNumber: NaN },
    } as unknown as Event
    props.onInput(nanEvent)
    expect(form.fields.age.value()).toBe("")
    unmount()
  })

  it("register() returns same props for repeated calls (memoized)", () => {
    const { result: form, unmount } = mountWith(() =>
      useForm<LoginForm>({
        initialValues: { email: "", password: "" },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    const first = form.register("email")
    const second = form.register("email")
    expect(first).toBe(second)
    unmount()
  })

  it("submitError captures onSubmit errors", async () => {
    const { result: form, unmount } = mountWith(() =>
      useForm<LoginForm>({
        initialValues: { email: "a@b.com", password: "12345678" },
        onSubmit: async () => {
          throw new Error("Server error")
        },
      }),
    )

    expect(form.submitError()).toBeUndefined()
    await form.handleSubmit().catch(() => {
      /* expected */
    })
    expect(form.submitError()).toBeInstanceOf(Error)
    expect((form.submitError() as Error).message).toBe("Server error")

    // Reset clears submitError
    form.reset()
    expect(form.submitError()).toBeUndefined()
    unmount()
  })

  it("dirty detection works for object field values", () => {
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { address: { city: "NYC", zip: "10001" } },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    // Same structure = not dirty
    form.fields.address.setValue({ city: "NYC", zip: "10001" })
    expect(form.fields.address.dirty()).toBe(false)

    // Different structure = dirty
    form.fields.address.setValue({ city: "LA", zip: "90001" })
    expect(form.fields.address.dirty()).toBe(true)
    unmount()
  })

  it("dirty detection works for array field values", () => {
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { tags: ["a", "b"] },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    // Same array = not dirty
    form.fields.tags.setValue(["a", "b"])
    expect(form.fields.tags.dirty()).toBe(false)

    // Different array = dirty
    form.fields.tags.setValue(["a", "b", "c"])
    expect(form.fields.tags.dirty()).toBe(true)
    unmount()
  })
})

// ─── useFieldArray ───────────────────────────────────────────────────────────

describe("useFieldArray", () => {
  it("initializes with provided values", () => {
    const { result: arr, unmount } = mountWith(() => useFieldArray(["a", "b", "c"]))

    expect(arr.length()).toBe(3)
    expect(arr.values()).toEqual(["a", "b", "c"])
    unmount()
  })

  it("initializes empty by default", () => {
    const { result: arr, unmount } = mountWith(() => useFieldArray<string>())

    expect(arr.length()).toBe(0)
    expect(arr.values()).toEqual([])
    unmount()
  })

  it("append adds to end", () => {
    const { result: arr, unmount } = mountWith(() => useFieldArray(["a"]))

    arr.append("b")
    expect(arr.values()).toEqual(["a", "b"])
    expect(arr.length()).toBe(2)
    unmount()
  })

  it("prepend adds to start", () => {
    const { result: arr, unmount } = mountWith(() => useFieldArray(["b"]))

    arr.prepend("a")
    expect(arr.values()).toEqual(["a", "b"])
    unmount()
  })

  it("insert at index", () => {
    const { result: arr, unmount } = mountWith(() => useFieldArray(["a", "c"]))

    arr.insert(1, "b")
    expect(arr.values()).toEqual(["a", "b", "c"])
    unmount()
  })

  it("remove by index", () => {
    const { result: arr, unmount } = mountWith(() => useFieldArray(["a", "b", "c"]))

    arr.remove(1)
    expect(arr.values()).toEqual(["a", "c"])
    unmount()
  })

  it("move reorders items", () => {
    const { result: arr, unmount } = mountWith(() => useFieldArray(["a", "b", "c"]))

    arr.move(0, 2)
    expect(arr.values()).toEqual(["b", "c", "a"])
    unmount()
  })

  it("swap exchanges items", () => {
    const { result: arr, unmount } = mountWith(() => useFieldArray(["a", "b", "c"]))

    arr.swap(0, 2)
    expect(arr.values()).toEqual(["c", "b", "a"])
    unmount()
  })

  it("replace replaces all items", () => {
    const { result: arr, unmount } = mountWith(() => useFieldArray(["a", "b"]))

    arr.replace(["x", "y", "z"])
    expect(arr.values()).toEqual(["x", "y", "z"])
    expect(arr.length()).toBe(3)
    unmount()
  })

  it("items have stable keys", () => {
    const { result: arr, unmount } = mountWith(() => useFieldArray(["a", "b"]))

    const keysBefore = arr.items().map((i: any) => i.key)
    arr.append("c")
    const keysAfter = arr.items().map((i: any) => i.key)

    // First two keys should be preserved
    expect(keysAfter[0]).toBe(keysBefore[0])
    expect(keysAfter[1]).toBe(keysBefore[1])
    // New item gets a new key
    expect(keysAfter[2]).not.toBe(keysBefore[0])
    expect(keysAfter[2]).not.toBe(keysBefore[1])
    unmount()
  })

  it("individual item values are reactive signals", () => {
    const { result: arr, unmount } = mountWith(() => useFieldArray(["a", "b"]))

    const item = arr.items()[0]!
    expect(item.value()).toBe("a")
    item.value.set("updated")
    expect(item.value()).toBe("updated")
    unmount()
  })

  it("update modifies value at index", () => {
    const { result: arr, unmount } = mountWith(() => useFieldArray(["a", "b", "c"]))

    arr.update(1, "updated")
    expect(arr.values()).toEqual(["a", "updated", "c"])

    // Key should be preserved
    const item = arr.items()[1]!
    expect(item.value()).toBe("updated")
    unmount()
  })

  it("update with invalid (out-of-bounds) index is a no-op", () => {
    const { result: arr, unmount } = mountWith(() => useFieldArray(["a", "b"]))

    arr.update(99, "nope")
    expect(arr.values()).toEqual(["a", "b"])

    arr.update(-1, "nope")
    expect(arr.values()).toEqual(["a", "b"])
    unmount()
  })

  it("move with invalid from index does not insert undefined", () => {
    const { result: arr, unmount } = mountWith(() => useFieldArray(["a", "b", "c"]))

    // splice(99,1) returns [] so item is undefined → splice(to,0) is a no-op
    arr.move(99, 0)
    // The array should still have 3 items (the splice removed nothing, guard prevented insert)
    // Actually splice removes nothing and returns [], item is undefined so nothing inserted
    expect(arr.values()).toEqual(["a", "b", "c"])
    unmount()
  })

  it("swap with one invalid index is a no-op", () => {
    const { result: arr, unmount } = mountWith(() => useFieldArray(["a", "b", "c"]))

    // indexA out of bounds
    arr.swap(99, 0)
    expect(arr.values()).toEqual(["a", "b", "c"])

    // indexB out of bounds
    arr.swap(0, 99)
    expect(arr.values()).toEqual(["a", "b", "c"])

    // Both out of bounds
    arr.swap(99, 100)
    expect(arr.values()).toEqual(["a", "b", "c"])
    unmount()
  })
})

// ─── structuredEqual (via dirty tracking) ────────────────────────────────────

describe("structuredEqual coverage via dirty tracking", () => {
  it("arrays with different lengths are detected as dirty", () => {
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { items: ["a", "b"] as string[] },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    // Longer array
    form.fields.items.setValue(["a", "b", "c"])
    expect(form.fields.items.dirty()).toBe(true)

    // Shorter array
    form.fields.items.setValue(["a"])
    expect(form.fields.items.dirty()).toBe(true)

    // Same length same elements — not dirty
    form.fields.items.setValue(["a", "b"])
    expect(form.fields.items.dirty()).toBe(false)
    unmount()
  })

  it("arrays with same length but different elements are detected as dirty", () => {
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { items: ["a", "b", "c"] as string[] },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    form.fields.items.setValue(["a", "b", "x"])
    expect(form.fields.items.dirty()).toBe(true)

    form.fields.items.setValue(["x", "b", "c"])
    expect(form.fields.items.dirty()).toBe(true)

    // Restoring original clears dirty
    form.fields.items.setValue(["a", "b", "c"])
    expect(form.fields.items.dirty()).toBe(false)
    unmount()
  })

  it("objects with different number of keys are detected as dirty", () => {
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { meta: { x: 1, y: 2 } as Record<string, number> },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    // More keys
    form.fields.meta.setValue({ x: 1, y: 2, z: 3 })
    expect(form.fields.meta.dirty()).toBe(true)

    // Fewer keys
    form.fields.meta.setValue({ x: 1 })
    expect(form.fields.meta.dirty()).toBe(true)

    // Same keys same values — not dirty
    form.fields.meta.setValue({ x: 1, y: 2 })
    expect(form.fields.meta.dirty()).toBe(false)
    unmount()
  })

  it("objects with same key count but different values are detected as dirty", () => {
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { meta: { x: 1, y: 2 } as Record<string, number> },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    form.fields.meta.setValue({ x: 1, y: 999 })
    expect(form.fields.meta.dirty()).toBe(true)
    unmount()
  })

  it("null vs object is detected as dirty", () => {
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { data: { a: 1 } as Record<string, number> | null },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    form.fields.data.setValue(null)
    expect(form.fields.data.dirty()).toBe(true)
    unmount()
  })
})

// ─── validateOn: 'submit' ───────────────────────────────────────────────────

describe("validateOn: submit", () => {
  it("does not validate on blur", async () => {
    let validatorCalls = 0
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { name: "" },
        validators: {
          name: (v) => {
            validatorCalls++
            return !v ? "Required" : undefined
          },
        },
        onSubmit: () => {
          /* noop */
        },
        validateOn: "submit",
      }),
    )

    // Blur should NOT trigger validation
    form.fields.name.setTouched()
    await new Promise((r) => setTimeout(r, 10))
    expect(validatorCalls).toBe(0)
    expect(form.fields.name.error()).toBeUndefined()

    // setValue should NOT trigger validation
    form.fields.name.setValue("hello")
    await new Promise((r) => setTimeout(r, 10))
    expect(validatorCalls).toBe(0)
    expect(form.fields.name.error()).toBeUndefined()
    unmount()
  })

  it("validates only when handleSubmit is called", async () => {
    let submitted = false
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { name: "" },
        validators: {
          name: (v) => (!v ? "Required" : undefined),
        },
        onSubmit: () => {
          submitted = true
        },
        validateOn: "submit",
      }),
    )

    // No validation until submit
    form.fields.name.setTouched()
    await new Promise((r) => setTimeout(r, 10))
    expect(form.fields.name.error()).toBeUndefined()

    // Submit triggers validation
    await form.handleSubmit()
    expect(submitted).toBe(false)
    expect(form.fields.name.error()).toBe("Required")

    // Fix and resubmit
    form.fields.name.setValue("hello")
    await form.handleSubmit()
    expect(submitted).toBe(true)
    unmount()
  })
})

// ─── debounceMs for field validation ─────────────────────────────────────────

describe("debounceMs field validation", () => {
  it("debounced validation on change mode", async () => {
    let callCount = 0
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { name: "" },
        validators: {
          name: (v) => {
            callCount++
            return !v ? "Required" : undefined
          },
        },
        onSubmit: () => {
          /* noop */
        },
        validateOn: "change",
        debounceMs: 50,
      }),
    )

    // Change should trigger debounced validation
    form.fields.name.setValue("a")
    form.fields.name.setValue("ab")
    form.fields.name.setValue("abc")

    // Not yet validated
    await new Promise((r) => setTimeout(r, 10))
    expect(callCount).toBe(0)

    // After debounce, should validate
    await new Promise((r) => setTimeout(r, 80))
    expect(callCount).toBeGreaterThanOrEqual(1)
    expect(form.fields.name.error()).toBeUndefined()
    unmount()
  })

  it("debounced validation resolves after timer fires", async () => {
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { name: "" },
        validators: {
          name: (v) => (!v ? "Required" : undefined),
        },
        onSubmit: () => {
          /* noop */
        },
        validateOn: "blur",
        debounceMs: 30,
      }),
    )

    form.fields.name.setTouched()

    // Before debounce fires
    await new Promise((r) => setTimeout(r, 5))
    expect(form.fields.name.error()).toBeUndefined()

    // After debounce fires
    await new Promise((r) => setTimeout(r, 50))
    expect(form.fields.name.error()).toBe("Required")
    unmount()
  })

  it("reset clears pending debounce timers", async () => {
    let callCount = 0
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { name: "" },
        validators: {
          name: (v) => {
            callCount++
            return !v ? "Required" : undefined
          },
        },
        onSubmit: () => {
          /* noop */
        },
        validateOn: "blur",
        debounceMs: 50,
      }),
    )

    form.fields.name.setTouched()
    // Reset before debounce fires
    form.reset()

    await new Promise((r) => setTimeout(r, 80))
    // Validator should not have been called since timer was cleared
    expect(callCount).toBe(0)
    expect(form.fields.name.error()).toBeUndefined()
    unmount()
  })
})

// ─── Edge case: nonexistent field names ──────────────────────────────────────

describe("useForm nonexistent field operations", () => {
  it("setFieldValue with nonexistent field throws", () => {
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { name: "Alice" },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    expect(() => form.setFieldValue("nonexistent" as any, "value")).toThrow(
      '[@pyreon/form] Field "nonexistent" does not exist',
    )
    expect(form.fields.name.value()).toBe("Alice")
    unmount()
  })

  it("setFieldError with nonexistent field throws", () => {
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { name: "Alice" },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    expect(() => form.setFieldError("nonexistent" as any, "error")).toThrow(
      '[@pyreon/form] Field "nonexistent" does not exist',
    )
    expect(form.isValid()).toBe(true)
    unmount()
  })

  it("resetField with nonexistent field is a no-op", () => {
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { name: "Alice" },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    form.resetField("nonexistent" as any)
    expect(form.fields.name.value()).toBe("Alice")
    unmount()
  })
})

// ─── Edge case: structuredEqual mixed types ──────────────────────────────────

describe("dirty detection with mixed types", () => {
  it("number vs string is dirty", () => {
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { value: 0 as any },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    form.fields.value.setValue("0" as any)
    expect(form.fields.value.dirty()).toBe(true)
    unmount()
  })
})

// ─── validate() branch coverage ──────────────────────────────────────────────

describe("validate() branch coverage", () => {
  it("getErrors returns empty when no errors exist", async () => {
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { name: "valid", email: "a@b.com" },
        validators: {
          name: (v) => (!v ? "Required" : undefined),
          email: (v) => (!v ? "Required" : undefined),
        },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    // Validate with all valid values — errors() should return empty object
    await form.validate()
    expect(form.errors()).toEqual({})
    unmount()
  })

  it("stale async field-level validation on blur is discarded", async () => {
    const resolvers: Array<(v: string | undefined) => void> = []
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { name: "" },
        validators: {
          name: (_v) => {
            return new Promise<string | undefined>((resolve) => {
              resolvers.push(resolve)
            })
          },
        },
        onSubmit: () => {
          /* noop */
        },
        validateOn: "blur",
      }),
    )

    // Trigger first blur validation
    form.fields.name.setTouched()
    // Trigger second blur validation (bumps version, makes first stale)
    form.fields.name.setTouched()

    // Resolve the first (stale) result
    resolvers[0]!("Stale error from blur")
    await new Promise((r) => setTimeout(r, 0))
    // Error should NOT be set since it's stale
    expect(form.fields.name.error()).toBeUndefined()

    // Resolve the second (current) result
    resolvers[1]!(undefined)
    await new Promise((r) => setTimeout(r, 0))
    expect(form.fields.name.error()).toBeUndefined()
    unmount()
  })

  it("stale async validation results are discarded during validate()", async () => {
    const resolvers: Array<(v: string | undefined) => void> = []
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { name: "" },
        validators: {
          name: (_v) => {
            return new Promise<string | undefined>((resolve) => {
              resolvers.push(resolve)
            })
          },
        },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    // Start first validation
    const firstValidate = form.validate()
    // Start second validation before first resolves — bumps version
    const secondValidate = form.validate()

    // Resolve the first (stale) validation — should be discarded
    resolvers[0]!("Stale error")
    // Resolve the second (current) validation
    resolvers[1]!(undefined)

    await Promise.all([firstValidate, secondValidate])

    // The stale error should NOT have been applied
    expect(form.fields.name.error()).toBeUndefined()
    unmount()
  })

  it("field-level validator throwing during validate() captures error", async () => {
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { name: "Alice" },
        validators: {
          name: () => {
            throw new Error("Validator crashed")
          },
        },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    const valid = await form.validate()
    expect(valid).toBe(false)
    expect(form.fields.name.error()).toBe("Validator crashed")
    unmount()
  })

  it("field-level validator throwing on blur captures error", async () => {
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { name: "" },
        validators: {
          name: () => {
            throw new Error("Blur validator crashed")
          },
        },
        validateOn: "blur",
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    form.fields.name.setTouched()
    await new Promise((r) => setTimeout(r, 0))
    expect(form.fields.name.error()).toBe("Blur validator crashed")
    unmount()
  })

  it("schema validator with keys having undefined value does not block submit", async () => {
    let submitted = false
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { name: "Alice", email: "a@b.com" },
        schema: (_values) => {
          // Return an object where some keys have undefined values
          return { name: undefined, email: undefined } as any
        },
        onSubmit: () => {
          submitted = true
        },
      }),
    )

    await form.handleSubmit()
    // Schema returned keys but all with undefined values — should pass
    expect(submitted).toBe(true)
    unmount()
  })

  it("schema validator throwing sets submitError and returns false", async () => {
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { name: "Alice", email: "a@b.com" },
        schema: () => {
          throw new Error("Schema exploded")
        },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    const valid = await form.validate()
    expect(valid).toBe(false)
    expect(form.submitError()).toBeInstanceOf(Error)
    expect((form.submitError() as Error).message).toBe("Schema exploded")
    unmount()
  })

  it("fields without validators return undefined in validate()", async () => {
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { name: "Alice", noValidator: "test" },
        validators: {
          name: (v) => (!v ? "Required" : undefined),
          // noValidator field has no validator
        },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    const valid = await form.validate()
    expect(valid).toBe(true)
    expect(form.fields.noValidator.error()).toBeUndefined()
    unmount()
  })
})

// ─── Edge case: debounceMs + validateOn: 'change' ───────────────────────────

describe("debounceMs with validateOn change", () => {
  it("debounces validation on change", async () => {
    let callCount = 0
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { name: "" },
        validators: {
          name: async (v) => {
            callCount++
            return v.length < 3 ? "Too short" : undefined
          },
        },
        validateOn: "change",
        debounceMs: 50,
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    form.fields.name.setValue("a")
    form.fields.name.setValue("ab")
    form.fields.name.setValue("abc")

    // None should have fired yet
    expect(callCount).toBe(0)

    await new Promise((r) => setTimeout(r, 80))
    // Only the last one should have fired after debounce
    expect(callCount).toBe(1)
    expect(form.fields.name.error()).toBeUndefined()
    unmount()
  })
})

// ─── useField ────────────────────────────────────────────────────────────────

describe("useField", () => {
  it("extracts a single field from a form", () => {
    const { result, unmount } = mountWith(() => {
      const form = useForm({
        initialValues: { email: "", password: "" },
        onSubmit: () => {
          /* noop */
        },
      })
      const field = useField(form, "email")
      return { form, field }
    })

    expect(result.field.value()).toBe("")
    result.field.setValue("test@test.com")
    expect(result.form.fields.email.value()).toBe("test@test.com")
    expect(result.field.dirty()).toBe(true)
    unmount()
  })

  it("hasError and showError computed correctly", async () => {
    const { result, unmount } = mountWith(() => {
      const form = useForm({
        initialValues: { email: "" },
        validators: { email: (v) => (!v ? "Required" : undefined) },
        onSubmit: () => {
          /* noop */
        },
      })
      const field = useField(form, "email")
      return { form, field }
    })

    expect(result.field.hasError()).toBe(false)
    expect(result.field.showError()).toBe(false)

    // Trigger validation
    result.field.setTouched()
    await new Promise((r) => setTimeout(r, 0))

    expect(result.field.hasError()).toBe(true)
    // showError = touched AND hasError
    expect(result.field.showError()).toBe(true)
    unmount()
  })

  it("register() delegates to form.register()", () => {
    const { result, unmount } = mountWith(() => {
      const form = useForm({
        initialValues: { email: "" },
        onSubmit: () => {
          /* noop */
        },
      })
      const field = useField(form, "email")
      return { form, field }
    })

    const fieldProps = result.field.register()
    const formProps = result.form.register("email")
    // Should be the same memoized object
    expect(fieldProps).toBe(formProps)
    unmount()
  })

  it("register() with checkbox type", () => {
    const { result, unmount } = mountWith(() => {
      const form = useForm({
        initialValues: { remember: false },
        onSubmit: () => {
          /* noop */
        },
      })
      const field = useField(form, "remember")
      return { form, field }
    })

    const props = result.field.register({ type: "checkbox" })
    expect(props.checked).toBeDefined()
    expect(props.checked!()).toBe(false)
    unmount()
  })

  it("reset delegates to field reset", () => {
    const { result, unmount } = mountWith(() => {
      const form = useForm({
        initialValues: { name: "initial" },
        onSubmit: () => {
          /* noop */
        },
      })
      const field = useField(form, "name")
      return { form, field }
    })

    result.field.setValue("changed")
    result.field.setTouched()
    expect(result.field.dirty()).toBe(true)
    expect(result.field.touched()).toBe(true)

    result.field.reset()
    expect(result.field.value()).toBe("initial")
    expect(result.field.dirty()).toBe(false)
    expect(result.field.touched()).toBe(false)
    unmount()
  })
})

// ─── useWatch ────────────────────────────────────────────────────────────────

describe("useWatch", () => {
  it("watches a single field value", () => {
    const { result, unmount } = mountWith(() => {
      const form = useForm({
        initialValues: { email: "a@b.com", password: "" },
        onSubmit: () => {
          /* noop */
        },
      })
      const email = useWatch(form, "email")
      return { form, email }
    })

    expect(result.email()).toBe("a@b.com")
    result.form.fields.email.setValue("new@email.com")
    expect(result.email()).toBe("new@email.com")
    unmount()
  })

  it("watches multiple fields", () => {
    const { result, unmount } = mountWith(() => {
      const form = useForm({
        initialValues: { first: "John", last: "Doe" },
        onSubmit: () => {
          /* noop */
        },
      })
      const [first, last] = useWatch(form, ["first", "last"])
      return { form, first, last }
    })

    expect(result.first!()).toBe("John")
    expect(result.last!()).toBe("Doe")
    result.form.fields.first.setValue("Jane")
    expect(result.first!()).toBe("Jane")
    unmount()
  })

  it("watches all fields when no name provided", () => {
    const { result, unmount } = mountWith(() => {
      const form = useForm({
        initialValues: { email: "a@b.com", name: "Alice" },
        onSubmit: () => {
          /* noop */
        },
      })
      const all = useWatch(form)
      return { form, all }
    })

    expect(result.all()).toEqual({ email: "a@b.com", name: "Alice" })
    result.form.fields.email.setValue("new@email.com")
    expect(result.all()).toEqual({ email: "new@email.com", name: "Alice" })
    unmount()
  })
})

// ─── useFormState ────────────────────────────────────────────────────────────

describe("useFormState", () => {
  it("returns full form state summary", async () => {
    const { result, unmount } = mountWith(() => {
      const form = useForm({
        initialValues: { email: "", password: "" },
        validators: { email: (v) => (!v ? "Required" : undefined) },
        onSubmit: () => {
          /* noop */
        },
      })
      const state = useFormState(form)
      return { form, state }
    })

    const s = result.state()
    expect(s.isSubmitting).toBe(false)
    expect(s.isValidating).toBe(false)
    expect(s.isValid).toBe(true)
    expect(s.isDirty).toBe(false)
    expect(s.submitCount).toBe(0)
    expect(s.submitError).toBeUndefined()
    expect(s.touchedFields).toEqual({})
    expect(s.dirtyFields).toEqual({})
    expect(s.errors).toEqual({})

    // Change form state
    result.form.fields.email.setValue("test")
    result.form.fields.email.setTouched()
    await new Promise((r) => setTimeout(r, 0))

    const s2 = result.state()
    expect(s2.isDirty).toBe(true)
    expect(s2.dirtyFields).toEqual({ email: true })
    expect(s2.touchedFields).toEqual({ email: true })
    unmount()
  })

  it("works with selector for fine-grained reactivity", async () => {
    const { result, unmount } = mountWith(() => {
      const form = useForm({
        initialValues: { email: "" },
        validators: { email: (v) => (!v ? "Required" : undefined) },
        onSubmit: () => {
          /* noop */
        },
      })
      const canSubmit = useFormState(form, (s) => s.isValid && !s.isSubmitting)
      return { form, canSubmit }
    })

    expect(result.canSubmit()).toBe(true)

    // Trigger validation to make it invalid
    await result.form.validate()
    expect(result.canSubmit()).toBe(false)

    // Fix value
    result.form.fields.email.setValue("test@test.com")
    await result.form.validate()
    expect(result.canSubmit()).toBe(true)
    unmount()
  })

  it("tracks errors in summary", async () => {
    const { result, unmount } = mountWith(() => {
      const form = useForm({
        initialValues: { email: "", name: "" },
        validators: {
          email: (v) => (!v ? "Email required" : undefined),
          name: (v) => (!v ? "Name required" : undefined),
        },
        onSubmit: () => {
          /* noop */
        },
      })
      const state = useFormState(form)
      return { form, state }
    })

    await result.form.validate()
    const s = result.state()
    expect(s.errors).toEqual({ email: "Email required", name: "Name required" })
    expect(s.isValid).toBe(false)
    unmount()
  })
})

// ─── FormProvider / useFormContext ────────────────────────────────────────────

describe("FormProvider / useFormContext", () => {
  it("provides form through context", () => {
    let contextForm: FormState<{ email: string }> | undefined
    const el = document.createElement("div")
    document.body.appendChild(el)

    function ContextConsumer() {
      contextForm = useFormContext() as FormState<{ email: string }>
      return null
    }

    function ContextTest() {
      const form = useForm({
        initialValues: { email: "context@test.com" },
        onSubmit: () => {
          /* noop */
        },
      })
      return <FormProvider form={form as any}>{() => <ContextConsumer />}</FormProvider>
    }

    const unmount = mount(<ContextTest />, el)

    expect(contextForm).toBeDefined()
    expect(contextForm!.fields.email.value()).toBe("context@test.com")
    unmount()
    el.remove()
  })

  it("throws when useFormContext is called outside FormProvider", () => {
    const el = document.createElement("div")
    document.body.appendChild(el)

    let error: Error | undefined
    const unmount = mount(
      <Capture
        fn={() => {
          try {
            useFormContext()
          } catch (e) {
            error = e as Error
          }
        }}
      />,
      el,
    )

    expect(error).toBeDefined()
    expect(error!.message).toContain("useFormContext")
    expect(error!.message).toContain("FormProvider")
    unmount()
    el.remove()
  })
})
