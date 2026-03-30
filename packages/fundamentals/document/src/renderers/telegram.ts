import { sanitizeHref } from "../sanitize";
import type { DocChild, DocNode, DocumentRenderer, RenderOptions, TableColumn } from "../types";

/**
 * Telegram renderer — outputs HTML using Telegram's supported subset.
 * Telegram Bot API supports: <b>, <i>, <u>, <s>, <a>, <code>, <pre>, <blockquote>.
 * No tables, no images inline — images sent separately via sendPhoto.
 */

function resolveColumn(col: string | TableColumn): TableColumn {
  return typeof col === "string" ? { header: col } : col;
}

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getTextContent(children: DocChild[]): string {
  return children
    .map((c) => (typeof c === "string" ? c : getTextContent((c as DocNode).children)))
    .join("");
}

function renderNode(node: DocNode): string {
  const p = node.props;

  switch (node.type) {
    case "document":
    case "page":
    case "section":
    case "row":
    case "column":
      return node.children.map((c) => (typeof c === "string" ? esc(c) : renderNode(c))).join("");

    case "heading": {
      const text = esc(getTextContent(node.children));
      return `<b>${text}</b>\n\n`;
    }

    case "text": {
      let text = esc(getTextContent(node.children));
      if (p.bold) text = `<b>${text}</b>`;
      if (p.italic) text = `<i>${text}</i>`;
      if (p.underline) text = `<u>${text}</u>`;
      if (p.strikethrough) text = `<s>${text}</s>`;
      return `${text}\n\n`;
    }

    case "link": {
      const href = sanitizeHref(p.href as string);
      const text = esc(getTextContent(node.children));
      return `<a href="${esc(href)}">${text}</a>\n\n`;
    }

    case "image":
      // Telegram doesn't support inline images in HTML
      // Images need to be sent separately via sendPhoto
      return "";

    case "table": {
      const columns = ((p.columns ?? []) as (string | TableColumn)[]).map(resolveColumn);
      const rows = (p.rows ?? []) as (string | number)[][];

      // Render as preformatted text since Telegram has no table support
      const header = columns.map((c) => c.header).join(" | ");
      const separator = columns.map(() => "---").join("-+-");
      const body = rows.map((row) => row.map((c) => String(c ?? "")).join(" | ")).join("\n");

      return `<pre>${esc(header)}\n${esc(separator)}\n${esc(body)}</pre>\n\n`;
    }

    case "list": {
      const ordered = p.ordered as boolean | undefined;
      const items = node.children
        .filter((c): c is DocNode => typeof c !== "string")
        .map((item, i) => {
          const prefix = ordered ? `${i + 1}.` : "•";
          return `${prefix} ${esc(getTextContent(item.children))}`;
        })
        .join("\n");
      return `${items}\n\n`;
    }

    case "code": {
      const lang = (p.language as string) ?? "";
      const text = esc(getTextContent(node.children));
      if (lang) {
        return `<pre><code class="language-${esc(lang)}">${text}</code></pre>\n\n`;
      }
      return `<pre>${text}</pre>\n\n`;
    }

    case "divider":
    case "page-break":
      return "───────────\n\n";

    case "spacer":
      return "\n";

    case "button": {
      const href = sanitizeHref(p.href as string);
      const text = esc(getTextContent(node.children));
      return `<a href="${esc(href)}">${text}</a>\n\n`;
    }

    case "quote": {
      const text = esc(getTextContent(node.children));
      return `<blockquote>${text}</blockquote>\n\n`;
    }

    default:
      return "";
  }
}

export const telegramRenderer: DocumentRenderer = {
  async render(node: DocNode, _options?: RenderOptions): Promise<string> {
    return renderNode(node).trim();
  },
};
