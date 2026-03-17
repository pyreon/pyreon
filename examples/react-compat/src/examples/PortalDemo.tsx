import { createPortal, useState } from "react"
import Demo from "./Demo"

export default function PortalDemo() {
  const [show, setShow] = useState(false)

  return (
    <Demo
      title="Portals"
      apis="createPortal"
      code={`import { createPortal } from "react";

// Render children into document.body
{createPortal(
  <div class="modal">Portal content</div>,
  document.body
)}`}
    >
      <button type="button" onClick={() => setShow((v) => !v)}>
        {show ? "Hide Portal" : "Show Portal"}
      </button>
      {show
        ? createPortal(
            <div style="position:fixed;bottom:1rem;right:1rem;background:#1c1c20;border:1px solid #2a2a2e;border-radius:8px;padding:1rem;color:#e4e4e7;z-index:9999;">
              I'm a portal rendered in document.body!
            </div>,
            document.body,
          )
        : null}
      <p class="muted">{show ? "Portal is visible (bottom-right corner)" : "Click to show"}</p>
    </Demo>
  )
}
