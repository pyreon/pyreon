import { sanitizeColor, sanitizeHref, sanitizeImageSrc } from "../sanitize";
import type { DocChild, DocNode, DocumentRenderer, RenderOptions, TableColumn } from "../types";

/**
 * SVG renderer — generates a standalone SVG document from the node tree.
 * Useful for thumbnails, social cards, and preview images.
 * No external dependencies — pure SVG string generation.
 */

function resolveColumn(col: string | TableColumn): TableColumn {
  return typeof col === "string" ? { header: col } : col;
}

function escapeXml(str: string): string {
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

interface RenderContext {
  y: number;
  width: number;
  padding: number;
}

function renderNode(node: DocNode, ctx: RenderContext): string {
  const p = node.props;
  const contentWidth = ctx.width - ctx.padding * 2;
  let svg = "";

  switch (node.type) {
    case "document":
    case "page":
    case "section":
    case "row":
    case "column":
      for (const child of node.children) {
        if (typeof child !== "string") {
          svg += renderNode(child, ctx);
        }
      }
      break;

    case "heading": {
      const level = (p.level as number) ?? 1;
      const sizes: Record<number, number> = {
        1: 28,
        2: 24,
        3: 20,
        4: 18,
        5: 16,
        6: 14,
      };
      const size = sizes[level] ?? 24;
      const color = sanitizeColor((p.color as string) ?? "#000000");
      const text = escapeXml(getTextContent(node.children));
      ctx.y += size + 8;
      svg += `<text x="${ctx.padding}" y="${ctx.y}" font-size="${size}" font-weight="bold" fill="${color}" font-family="system-ui, -apple-system, sans-serif">${text}</text>`;
      ctx.y += 12;
      break;
    }

    case "text": {
      const size = (p.size as number) ?? 14;
      const color = sanitizeColor((p.color as string) ?? "#333333");
      const weight = p.bold ? "bold" : "normal";
      const style = p.italic ? "italic" : "normal";
      const text = escapeXml(getTextContent(node.children));
      ctx.y += size + 4;
      svg += `<text x="${ctx.padding}" y="${ctx.y}" font-size="${size}" font-weight="${weight}" font-style="${style}" fill="${color}" font-family="system-ui, -apple-system, sans-serif">${text}</text>`;
      ctx.y += 10;
      break;
    }

    case "link": {
      const href = sanitizeHref(p.href as string);
      const text = escapeXml(getTextContent(node.children));
      const color = sanitizeColor((p.color as string) ?? "#4f46e5");
      ctx.y += 18;
      svg += `<a href="${escapeXml(href)}"><text x="${ctx.padding}" y="${ctx.y}" font-size="14" fill="${color}" text-decoration="underline" font-family="system-ui, -apple-system, sans-serif">${text}</text></a>`;
      ctx.y += 10;
      break;
    }

    case "image": {
      const width = (p.width as number) ?? Math.min(contentWidth, 400);
      const height = (p.height as number) ?? 200;
      const src = sanitizeImageSrc(p.src as string);

      if (src.startsWith("data:") || src.startsWith("http")) {
        svg += `<image x="${ctx.padding}" y="${ctx.y}" width="${width}" height="${height}" href="${escapeXml(src)}" />`;
      } else {
        // Placeholder rectangle for local paths
        svg += `<rect x="${ctx.padding}" y="${ctx.y}" width="${width}" height="${height}" fill="#f0f0f0" stroke="#ddd" rx="4" />`;
        svg += `<text x="${ctx.padding + width / 2}" y="${ctx.y + height / 2}" text-anchor="middle" dominant-baseline="middle" font-size="12" fill="#999" font-family="system-ui, sans-serif">${escapeXml((p.alt as string) ?? "Image")}</text>`;
      }
      ctx.y += height + 8;

      if (p.caption) {
        ctx.y += 14;
        svg += `<text x="${ctx.padding}" y="${ctx.y}" font-size="12" fill="#666" font-style="italic" font-family="system-ui, sans-serif">${escapeXml(p.caption as string)}</text>`;
        ctx.y += 8;
      }
      break;
    }

    case "table": {
      const columns = ((p.columns ?? []) as (string | TableColumn)[]).map(resolveColumn);
      const rows = (p.rows ?? []) as (string | number)[][];
      const hs = p.headerStyle as { background?: string; color?: string } | undefined;
      const striped = p.striped as boolean | undefined;

      const colWidth = contentWidth / columns.length;
      const rowHeight = 28;
      const headerBg = sanitizeColor(hs?.background ?? "#f5f5f5");
      const headerColor = sanitizeColor(hs?.color ?? "#000000");

      // Header
      svg += `<rect x="${ctx.padding}" y="${ctx.y}" width="${contentWidth}" height="${rowHeight}" fill="${headerBg}" />`;
      for (let i = 0; i < columns.length; i++) {
        const col = columns[i];
        if (!col) continue;
        svg += `<text x="${ctx.padding + i * colWidth + 8}" y="${ctx.y + 18}" font-size="12" font-weight="bold" fill="${headerColor}" font-family="system-ui, sans-serif">${escapeXml(col.header)}</text>`;
      }
      ctx.y += rowHeight;

      // Rows
      for (let r = 0; r < rows.length; r++) {
        if (striped && r % 2 === 1) {
          svg += `<rect x="${ctx.padding}" y="${ctx.y}" width="${contentWidth}" height="${rowHeight}" fill="#f9f9f9" />`;
        }
        for (let c = 0; c < columns.length; c++) {
          svg += `<text x="${ctx.padding + c * colWidth + 8}" y="${ctx.y + 18}" font-size="12" fill="#333" font-family="system-ui, sans-serif">${escapeXml(String(rows[r]?.[c] ?? ""))}</text>`;
        }
        ctx.y += rowHeight;
      }

      // Bottom border
      svg += `<line x1="${ctx.padding}" y1="${ctx.y}" x2="${ctx.padding + contentWidth}" y2="${ctx.y}" stroke="#ddd" stroke-width="1" />`;
      ctx.y += 12;
      break;
    }

    case "list": {
      const ordered = p.ordered as boolean | undefined;
      const items = node.children.filter((c): c is DocNode => typeof c !== "string");
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item) continue;
        const prefix = ordered ? `${i + 1}.` : "•";
        const text = escapeXml(getTextContent(item.children));
        ctx.y += 18;
        svg += `<text x="${ctx.padding + 16}" y="${ctx.y}" font-size="13" fill="#333" font-family="system-ui, sans-serif">${prefix} ${text}</text>`;
      }
      ctx.y += 10;
      break;
    }

    case "code": {
      const text = getTextContent(node.children);
      const lines = text.split("\n");
      const codeHeight = lines.length * 18 + 16;
      svg += `<rect x="${ctx.padding}" y="${ctx.y}" width="${contentWidth}" height="${codeHeight}" fill="#f5f5f5" rx="4" />`;
      for (let i = 0; i < lines.length; i++) {
        svg += `<text x="${ctx.padding + 12}" y="${ctx.y + 20 + i * 18}" font-size="12" fill="#333" font-family="monospace">${escapeXml(lines[i] ?? "")}</text>`;
      }
      ctx.y += codeHeight + 8;
      break;
    }

    case "divider": {
      const color = sanitizeColor((p.color as string) ?? "#ddd");
      const thickness = (p.thickness as number) ?? 1;
      ctx.y += 12;
      svg += `<line x1="${ctx.padding}" y1="${ctx.y}" x2="${ctx.padding + contentWidth}" y2="${ctx.y}" stroke="${color}" stroke-width="${thickness}" />`;
      ctx.y += 12;
      break;
    }

    case "page-break":
      ctx.y += 16;
      svg += `<line x1="${ctx.padding}" y1="${ctx.y}" x2="${ctx.padding + contentWidth}" y2="${ctx.y}" stroke="#ccc" stroke-width="2" stroke-dasharray="8,4" />`;
      ctx.y += 16;
      break;

    case "spacer":
      ctx.y += (p.height as number) ?? 12;
      break;

    case "button": {
      const bg = sanitizeColor((p.background as string) ?? "#4f46e5");
      const color = sanitizeColor((p.color as string) ?? "#ffffff");
      const text = escapeXml(getTextContent(node.children));
      const btnWidth = Math.min(text.length * 10 + 48, contentWidth);
      const btnHeight = 40;
      ctx.y += 8;
      svg += `<rect x="${ctx.padding}" y="${ctx.y}" width="${btnWidth}" height="${btnHeight}" fill="${bg}" rx="4" />`;
      svg += `<text x="${ctx.padding + btnWidth / 2}" y="${ctx.y + 25}" text-anchor="middle" font-size="14" font-weight="bold" fill="${color}" font-family="system-ui, sans-serif">${text}</text>`;
      ctx.y += btnHeight + 12;
      break;
    }

    case "quote": {
      const borderColor = sanitizeColor((p.borderColor as string) ?? "#ddd");
      const text = escapeXml(getTextContent(node.children));
      ctx.y += 4;
      svg += `<rect x="${ctx.padding}" y="${ctx.y}" width="4" height="20" fill="${borderColor}" />`;
      svg += `<text x="${ctx.padding + 16}" y="${ctx.y + 15}" font-size="13" fill="#555" font-style="italic" font-family="system-ui, sans-serif">${text}</text>`;
      ctx.y += 28;
      break;
    }
  }

  return svg;
}

export const svgRenderer: DocumentRenderer = {
  async render(node: DocNode, options?: RenderOptions): Promise<string> {
    const width = 800;
    const padding = 40;
    const ctx: RenderContext = { y: padding, width, padding };

    const content = renderNode(node, ctx);
    const height = ctx.y + padding;

    const dir = options?.direction === "rtl" ? ' direction="rtl"' : "";

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"${dir}>
<rect width="${width}" height="${height}" fill="#ffffff" />
${content}
</svg>`;
  },
};
