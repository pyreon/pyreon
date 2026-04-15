import type { Extension } from '@codemirror/state'
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'

/**
 * Canvas-based minimap extension for CodeMirror 6.
 * Renders a scaled-down overview of the document on the right side.
 */

const MINIMAP_WIDTH = 80
const CHAR_WIDTH = 1.2
const LINE_HEIGHT = 2.5
const MINIMAP_BG = '#1e1e2e'
const MINIMAP_BG_LIGHT = '#f8fafc'
const TEXT_COLOR = '#585b70'
const TEXT_COLOR_LIGHT = '#94a3b8'
const VIEWPORT_COLOR = 'rgba(59, 130, 246, 0.15)'
const VIEWPORT_BORDER = 'rgba(59, 130, 246, 0.4)'

function createMinimapCanvas(): HTMLCanvasElement {
  // Called only by the CodeMirror plugin mount path — never in SSR. The
  // explicit typeof guard documents the SSR-safety contract and lets
  // `no-window-in-ssr` prove it locally; the cast satisfies the return type
  // (the dummy object never actually escapes — the plugin doesn't mount in
  // SSR so this branch is unreachable at runtime).
  if (typeof document === 'undefined') return null as unknown as HTMLCanvasElement
  const canvas = document.createElement('canvas')
  canvas.style.cssText = `position: absolute; right: 0; top: 0; width: ${MINIMAP_WIDTH}px; height: 100%; cursor: pointer; z-index: 5;`
  canvas.width = MINIMAP_WIDTH * 2 // retina
  return canvas
}

function renderMinimap(canvas: HTMLCanvasElement, view: EditorView): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const doc = view.state.doc
  const totalLines = doc.lines
  const height = canvas.clientHeight
  canvas.height = height * 2 // retina

  const isDark = view.dom.classList.contains('cm-dark')
  const bg = isDark ? MINIMAP_BG : MINIMAP_BG_LIGHT
  const textColor = isDark ? TEXT_COLOR : TEXT_COLOR_LIGHT

  const scale = 2 // retina
  ctx.setTransform(scale, 0, 0, scale, 0, 0)

  // Background
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, MINIMAP_WIDTH, height)

  // Calculate visible range in minimap
  const contentHeight = totalLines * LINE_HEIGHT
  const scrollFraction =
    contentHeight > height
      ? view.scrollDOM.scrollTop / (view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight || 1)
      : 0
  const offset = contentHeight > height ? scrollFraction * (contentHeight - height) : 0

  // Render text lines
  ctx.fillStyle = textColor
  const startLine = Math.max(1, Math.floor(offset / LINE_HEIGHT))
  const endLine = Math.min(totalLines, startLine + Math.ceil(height / LINE_HEIGHT) + 1)

  for (let i = startLine; i <= endLine; i++) {
    const line = doc.line(i)
    const y = (i - 1) * LINE_HEIGHT - offset
    if (y < -LINE_HEIGHT || y > height) continue

    const text = line.text
    let x = 4
    for (let j = 0; j < Math.min(text.length, 60); j++) {
      if (text[j] !== ' ' && text[j] !== '\t') {
        ctx.fillRect(x, y, CHAR_WIDTH, 1.5)
      }
      x += CHAR_WIDTH
    }
  }

  // Viewport indicator
  const viewportTop = view.scrollDOM.scrollTop
  const viewportHeight = view.scrollDOM.clientHeight
  const docHeight = view.scrollDOM.scrollHeight || 1

  const vpY = (viewportTop / docHeight) * Math.min(contentHeight, height)
  const vpH = (viewportHeight / docHeight) * Math.min(contentHeight, height)

  ctx.fillStyle = VIEWPORT_COLOR
  ctx.fillRect(0, vpY, MINIMAP_WIDTH, vpH)
  ctx.strokeStyle = VIEWPORT_BORDER
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, vpY + 0.5, MINIMAP_WIDTH - 1, vpH - 1)
}

/**
 * CodeMirror 6 minimap extension.
 * Renders a canvas-based code overview on the right side of the editor.
 *
 * @example
 * ```ts
 * import { minimapExtension } from '@pyreon/code'
 * // Add to editor extensions
 * ```
 */
export function minimapExtension(): Extension {
  return [
    ViewPlugin.fromClass(
      class {
        canvas: HTMLCanvasElement
        view: EditorView
        animFrame: number | null = null

        constructor(view: EditorView) {
          this.view = view
          this.canvas = createMinimapCanvas()
          view.dom.style.position = 'relative'
          view.dom.appendChild(this.canvas)

          // Click to scroll
          this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect()
            const clickY = e.clientY - rect.top
            const fraction = clickY / rect.height
            const scrollTarget =
              fraction * (view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight)
            view.scrollDOM.scrollTo({ top: scrollTarget, behavior: 'smooth' })
          })

          this.render()
        }

        render() {
          renderMinimap(this.canvas, this.view)
        }

        update(update: ViewUpdate) {
          if (typeof window === 'undefined') return
          if (update.docChanged || update.viewportChanged || update.geometryChanged) {
            if (this.animFrame) cancelAnimationFrame(this.animFrame)
            this.animFrame = requestAnimationFrame(() => this.render())
          }
        }

        destroy() {
          if (typeof window === 'undefined') return
          if (this.animFrame) cancelAnimationFrame(this.animFrame)
          this.canvas.remove()
        }
      },
    ),
    // Add padding on the right for the minimap
    EditorView.theme({
      '.cm-scroller': {
        paddingRight: `${MINIMAP_WIDTH + 8}px`,
      },
    }),
  ]
}
