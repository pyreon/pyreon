# @pyreon/toast

Signal-driven toast notifications for the Pyreon framework.

## Install

```bash
bun add @pyreon/toast
```

## Usage

```tsx
import { toast, Toaster } from "@pyreon/toast";

// Place once at app root
<Toaster position="top-right" />;

// Show toasts from anywhere — no provider needed
toast.success("Saved!");
toast.error("Connection failed");
toast("Custom message", { duration: 8000 });

// Promise pattern
toast.promise(saveData(), {
  loading: "Saving...",
  success: "Done!",
  error: "Failed",
});
```

## API

- `toast(message, options?)` — show a toast, returns id
- `toast.success/error/warning/info(message)` — typed shortcuts
- `toast.loading(message)` — persistent loading toast
- `toast.update(id, updates)` — update an existing toast
- `toast.dismiss(id?)` — dismiss one or all
- `toast.promise(promise, { loading, success, error })` — auto-updating toast
- `<Toaster position? max? gap? offset? />` — render component

## License

MIT
