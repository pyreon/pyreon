import { sanitizeHref, sanitizeImageSrc } from "../sanitize";
import type { DocChild, DocNode, DocumentRenderer, RenderOptions, TableColumn } from "../types";

function resolveColumn(col: string | TableColumn): TableColumn {
  return typeof col === "string" ? { header: col } : col;
}

function renderChild(child: DocChild): string {
  if (typeof child === "string") return child;
  return renderNode(child);
}

function renderChildren(children: DocChild[]): string {
  return children.map(renderChild).join("");
}

function renderInline(children: DocChild[]): string {
  return children.map(renderChild).join("");
}

function renderNode(node: DocNode): string {
  const p = node.props;

  switch (node.type) {
    case "document":
      return renderChildren(node.children);

    case "page":
      return renderChildren(node.children);

    case "section":
      return `${renderChildren(node.children)}\n`;

    case "row":
    case "column":
      return renderChildren(node.children);

    case "heading": {
      const level = (p.level as number) ?? 1;
      const prefix = "#".repeat(Math.min(Math.max(level, 1), 6));
      return `${prefix} ${renderInline(node.children)}\n\n`;
    }

    case "text": {
      let text = renderInline(node.children);
      if (p.bold) text = `**${text}**`;
      if (p.italic) text = `*${text}*`;
      if (p.strikethrough) text = `~~${text}~~`;
      return `${text}\n\n`;
    }

    case "link":
      return `[${renderInline(node.children)}](${sanitizeHref(p.href as string)})`;

    case "image": {
      const alt = (p.alt as string) ?? "";
      let md = `![${alt}](${sanitizeImageSrc(p.src as string)})`;
      if (p.caption) md += `\n*${p.caption}*`;
      return `${md}\n\n`;
    }

    case "table": {
      const columns = ((p.columns ?? []) as (string | TableColumn)[]).map(resolveColumn);
      const rows = (p.rows ?? []) as (string | number)[][];

      if (columns.length === 0) return "";

      // Header
      const header = `| ${columns.map((c) => c.header).join(" | ")} |`;

      // Separator with alignment
      const separator = `| ${columns
        .map((c) => {
          const align = c.align ?? "left";
          if (align === "center") return ":---:";
          if (align === "right") return "---:";
          return "---";
        })
        .join(" | ")} |`;

      // Rows
      const body = rows
        .map((row) => `| ${row.map((cell) => String(cell ?? "")).join(" | ")} |`)
        .join("\n");

      let md = `${header}\n${separator}\n${body}\n\n`;
      if (p.caption) md = `*${p.caption}*\n\n${md}`;
      return md;
    }

    case "list": {
      const ordered = p.ordered as boolean | undefined;
      return `${node.children
        .filter((c): c is DocNode => typeof c !== "string")
        .map((item, i) => {
          const prefix = ordered ? `${i + 1}.` : "-";
          return `${prefix} ${renderInline(item.children)}`;
        })
        .join("\n")}\n\n`;
    }

    case "list-item":
      return renderInline(node.children);

    case "code": {
      const lang = (p.language as string) ?? "";
      const content = renderInline(node.children);
      return `\`\`\`${lang}\n${content}\n\`\`\`\n\n`;
    }

    case "divider":
      return "---\n\n";

    case "page-break":
      return "---\n\n";

    case "spacer":
      return "\n";

    case "button":
      return `[${renderInline(node.children)}](${sanitizeHref(p.href as string)})\n\n`;

    case "quote":
      return `> ${renderInline(node.children)}\n\n`;

    default:
      return renderChildren(node.children);
  }
}

export const markdownRenderer: DocumentRenderer = {
  async render(node: DocNode, _options?: RenderOptions): Promise<string> {
    return `${renderNode(node).trim()}\n`;
  },
};
