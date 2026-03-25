import { render } from "./render"
import type { DocNode, RenderOptions } from "./types"

const FORMAT_MAP: Record<string, string> = {
  html: "html",
  htm: "html",
  pdf: "pdf",
  docx: "docx",
  doc: "docx",
  xlsx: "xlsx",
  xls: "xlsx",
  pptx: "pptx",
  ppt: "pptx",
  md: "md",
  txt: "text",
  csv: "csv",
  svg: "svg",
}

const MIME_TYPES: Record<string, string> = {
  html: "text/html",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  email: "text/html",
  md: "text/markdown",
  text: "text/plain",
  csv: "text/csv",
  svg: "image/svg+xml",
}

/**
 * Download a document in the browser.
 *
 * @example
 * ```tsx
 * await download(doc, 'report.pdf')
 * await download(doc, 'report.docx')
 * ```
 */
export async function download(
  node: DocNode,
  filename: string,
  options?: RenderOptions,
): Promise<void> {
  const ext = filename.split(".").pop()?.toLowerCase()
  if (!ext) {
    throw new Error("[@pyreon/document] Filename must have an extension (e.g., report.pdf).")
  }

  const format = FORMAT_MAP[ext]
  if (!format) {
    throw new Error(
      `[@pyreon/document] Unknown file extension '.${ext}'. Supported: ${Object.keys(FORMAT_MAP).join(", ")}`,
    )
  }

  const result = await render(node, format, options)

  const blob =
    result instanceof Uint8Array
      ? new Blob([result as BlobPart])
      : new Blob([result], {
          type: MIME_TYPES[format] ?? "application/octet-stream",
        })

  if (typeof document === "undefined") {
    throw new Error("[@pyreon/document] download() requires a browser environment.")
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
