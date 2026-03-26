import { useHead } from "@pyreon/head"
import { Link } from "@pyreon/zero/link"
import { posts } from "../../features/posts"

export default function NewPostPage() {
  useHead({
    title: "New Post — Pyreon Zero",
    meta: [{ name: "description", content: "Create a new post." }],
  })

  const form = posts.useForm({
    onSuccess: () => {
      window.location.href = "/posts"
    },
  })

  return (
    <div class="post-form">
      <Link
        href="/posts"
        style="color: var(--c-text-muted); font-size: 0.85rem; display: inline-block; margin-bottom: var(--space-lg);"
      >
        ← Back to Posts
      </Link>

      <h1>New Post</h1>
      <p style="color: var(--c-text-muted); margin-bottom: var(--space-xl);">
        This form is powered by <code>@pyreon/feature</code> + <code>@pyreon/form</code> +{" "}
        <code>@pyreon/validation</code> with automatic Zod schema validation.
      </p>

      <form onSubmit={(e: Event) => form.handleSubmit(e)}>
        <div class="form-field">
          <label for="title">Title</label>
          <input id="title" {...(form.register("title") as any)} />
        </div>
        <div class="form-field">
          <label for="body">Body</label>
          <textarea id="body" rows={6} {...(form.register("body") as any)} />
        </div>
        <div class="form-field">
          <label class="checkbox-label">
            <input type="checkbox" {...(form.register("published", { type: "checkbox" }) as any)} />
            Published
          </label>
        </div>
        <button type="submit" class="btn" disabled={form.isSubmitting()}>
          {() => (form.isSubmitting() ? "Creating..." : "Create Post")}
        </button>
      </form>
    </div>
  )
}
