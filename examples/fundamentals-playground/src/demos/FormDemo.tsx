import { useField, useForm, useFormState } from "@pyreon/form"
import { signal } from "@pyreon/reactivity"

export function FormDemo() {
  const submitted = signal<string | null>(null)

  const form = useForm({
    initialValues: {
      name: "",
      email: "",
      password: "",
      newsletter: false,
    },
    validators: {
      name: (v) => (!v ? "Name is required" : undefined),
      email: (v) => {
        if (!v) return "Email is required"
        if (!v.includes("@")) return "Must be a valid email"
        return undefined
      },
      password: (v) => {
        if (!v) return "Password is required"
        if (v.length < 8) return "Must be at least 8 characters"
        return undefined
      },
    },
    validateOn: "blur",
    onSubmit: async (values) => {
      await new Promise((r) => setTimeout(r, 500))
      submitted.set(JSON.stringify(values, null, 2))
    },
  })

  const name = useField(form, "name")
  const email = useField(form, "email")
  const password = useField(form, "password")
  const state = useFormState(form)

  return (
    <div>
      <h2>Form</h2>
      <p class="desc">
        Signal-based form management with field validation, submission, and reactive state.
      </p>

      <div class="section">
        <h3>Registration Form</h3>
        <form onSubmit={(e: Event) => form.handleSubmit(e)}>
          <div class="field">
            <label>Name</label>
            <input placeholder="Your name" {...name.register()} />
            {() => (name.showError() ? <div class="error">{name.error()}</div> : null)}
          </div>

          <div class="field">
            <label>Email</label>
            <input type="email" placeholder="you@example.com" {...email.register()} />
            {() => (email.showError() ? <div class="error">{email.error()}</div> : null)}
          </div>

          <div class="field">
            <label>Password</label>
            <input type="password" placeholder="Min 8 characters" {...password.register()} />
            {() => (password.showError() ? <div class="error">{password.error()}</div> : null)}
          </div>

          <div class="field">
            <label>
              <input type="checkbox" {...form.register("newsletter", { type: "checkbox" })} />{" "}
              Subscribe to newsletter
            </label>
          </div>

          <div class="row">
            <button class="primary" type="submit" disabled={form.isSubmitting()}>
              {() => (form.isSubmitting() ? "Submitting..." : "Register")}
            </button>
            <button type="button" onClick={() => form.reset()}>
              Reset
            </button>
            <button type="button" onClick={() => form.clearErrors()}>
              Clear Errors
            </button>
          </div>
        </form>
      </div>

      <div class="section">
        <h3>Form State</h3>
        <div class="row">
          <span class={`badge ${state().isValid ? "green" : "red"}`}>
            {() => (state().isValid ? "Valid" : "Invalid")}
          </span>
          <span class={`badge ${state().isDirty ? "blue" : "gray"}`}>
            {() => (state().isDirty ? "Dirty" : "Pristine")}
          </span>
          <span class="badge gray">Submits: {() => state().submitCount}</span>
        </div>
        <pre style="font-size: 12px; margin-top: 8px">
          Values: {() => JSON.stringify(form.values(), null, 2)}
        </pre>
      </div>

      {() =>
        submitted() ? (
          <div class="section">
            <h3>Submitted Data</h3>
            <pre style="font-size: 13px; color: #2e7d32">{submitted()}</pre>
          </div>
        ) : null
      }
    </div>
  )
}
