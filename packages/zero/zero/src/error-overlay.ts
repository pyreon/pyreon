/**
 * Dev-only error overlay for SSR/loader errors.
 * Renders a styled HTML page with the error stack trace.
 */
export function renderErrorOverlay(error: Error): string {
  const title = escapeHtml(error.message || 'Unknown error')
  const stack = escapeHtml(error.stack || '')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SSR Error — Pyreon Zero</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, monospace;
      background: #1a1a2e;
      color: #e0e0e0;
      min-height: 100vh;
      padding: 2rem;
    }
    .overlay {
      max-width: 900px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }
    .badge {
      background: #e74c3c;
      color: white;
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .label {
      color: #888;
      font-size: 0.85rem;
    }
    .message {
      font-size: 1.25rem;
      color: #ff6b6b;
      margin-bottom: 1.5rem;
      line-height: 1.5;
      word-break: break-word;
    }
    .stack {
      background: #16213e;
      border: 1px solid #2a2a4a;
      border-radius: 8px;
      padding: 1.25rem;
      overflow-x: auto;
      font-size: 0.8rem;
      line-height: 1.7;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .stack .at { color: #888; }
    .stack .file { color: #4ecdc4; }
    .hint {
      margin-top: 1.5rem;
      padding: 1rem;
      background: #1e2a45;
      border-radius: 6px;
      border-left: 3px solid #3498db;
      font-size: 0.8rem;
      color: #aaa;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="overlay">
    <div class="header">
      <span class="badge">SSR Error</span>
      <span class="label">Pyreon Zero — Dev Mode</span>
    </div>
    <div class="message">${title}</div>
    <pre class="stack">${formatStack(stack)}</pre>
    <div class="hint">
      This error occurred during server-side rendering. Check the terminal for
      the full stack trace. This overlay is only shown in development.
    </div>
  </div>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatStack(stack: string): string {
  return stack
    .split('\n')
    .map((line) => {
      if (line.includes('at ')) {
        const fileMatch = line.match(/\(([^)]+)\)/)
        if (fileMatch) {
          return line.replace(fileMatch[0], `(<span class="file">${fileMatch[1]}</span>)`)
        }
      }
      return line
    })
    .join('\n')
}
