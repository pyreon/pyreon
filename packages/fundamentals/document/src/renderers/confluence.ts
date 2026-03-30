import { sanitizeHref, sanitizeImageSrc } from "../sanitize";
import type { DocChild, DocNode, DocumentRenderer, RenderOptions, TableColumn } from "../types";

/**
 * Atlassian Document Format (ADF) renderer — for Jira and Confluence.
 * ADF is the JSON format used by Atlassian's Document API.
 * Can be posted to Confluence pages, Jira issue descriptions, and comments.
 */

function resolveColumn(col: string | TableColumn): TableColumn {
  return typeof col === "string" ? { header: col } : col;
}

function getTextContent(children: DocChild[]): string {
  return children
    .map((c) => (typeof c === "string" ? c : getTextContent((c as DocNode).children)))
    .join("");
}

interface AdfNode {
  type: string;
  content?: AdfNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  attrs?: Record<string, unknown>;
}

function textNode(text: string, marks?: AdfNode["marks"]): AdfNode {
  return { type: "text", text, ...(marks && marks.length > 0 ? { marks } : {}) };
}

function nodeToAdf(node: DocNode): AdfNode[] {
  const p = node.props;
  const result: AdfNode[] = [];

  switch (node.type) {
    case "document":
    case "page":
    case "section":
    case "row":
    case "column":
      for (const child of node.children) {
        if (typeof child !== "string") {
          result.push(...nodeToAdf(child));
        }
      }
      break;

    case "heading": {
      const level = Math.min(Math.max((p.level as number) ?? 1, 1), 6);
      const text = getTextContent(node.children);
      result.push({
        type: "heading",
        attrs: { level },
        content: [textNode(text, [{ type: "strong" }])],
      });
      break;
    }

    case "text": {
      const text = getTextContent(node.children);
      const marks: AdfNode["marks"] = [];
      if (p.bold) marks.push({ type: "strong" });
      if (p.italic) marks.push({ type: "em" });
      if (p.underline) marks.push({ type: "underline" });
      if (p.strikethrough) marks.push({ type: "strike" });
      if (p.color) marks.push({ type: "textColor", attrs: { color: p.color as string } });
      result.push({
        type: "paragraph",
        content: [textNode(text, marks)],
      });
      break;
    }

    case "link": {
      const href = sanitizeHref(p.href as string);
      const text = getTextContent(node.children);
      result.push({
        type: "paragraph",
        content: [textNode(text, [{ type: "link", attrs: { href } }])],
      });
      break;
    }

    case "image": {
      const src = sanitizeImageSrc(p.src as string);
      if (src.startsWith("http")) {
        result.push({
          type: "mediaSingle",
          attrs: { layout: "center" },
          content: [
            {
              type: "media",
              attrs: {
                type: "external",
                url: src,
                width: (p.width as number) ?? undefined,
                height: (p.height as number) ?? undefined,
              },
            },
          ],
        });
      }
      break;
    }

    case "table": {
      const columns = ((p.columns ?? []) as (string | TableColumn)[]).map(resolveColumn);
      const rows = (p.rows ?? []) as (string | number)[][];

      const headerRow: AdfNode = {
        type: "tableRow",
        content: columns.map((col) => ({
          type: "tableHeader",
          content: [
            {
              type: "paragraph",
              content: [textNode(col.header, [{ type: "strong" }])],
            },
          ],
        })),
      };

      const dataRows = rows.map((row) => ({
        type: "tableRow" as const,
        content: columns.map((_, i) => ({
          type: "tableCell" as const,
          content: [
            {
              type: "paragraph" as const,
              content: [textNode(String(row[i] ?? ""))],
            },
          ],
        })),
      }));

      result.push({
        type: "table",
        attrs: { isNumberColumnEnabled: false, layout: "default" },
        content: [headerRow, ...dataRows],
      });
      break;
    }

    case "list": {
      const ordered = p.ordered as boolean | undefined;
      const type = ordered ? "orderedList" : "bulletList";
      const items = node.children
        .filter((c): c is DocNode => typeof c !== "string")
        .map((item) => ({
          type: "listItem" as const,
          content: [
            {
              type: "paragraph" as const,
              content: [textNode(getTextContent(item.children))],
            },
          ],
        }));
      result.push({ type, content: items });
      break;
    }

    case "code": {
      const text = getTextContent(node.children);
      const lang = (p.language as string) ?? null;
      result.push({
        type: "codeBlock",
        attrs: { language: lang },
        content: [textNode(text)],
      });
      break;
    }

    case "divider":
    case "page-break":
      result.push({ type: "rule" });
      break;

    case "spacer":
      result.push({ type: "paragraph", content: [] });
      break;

    case "button": {
      const href = sanitizeHref(p.href as string);
      const text = getTextContent(node.children);
      result.push({
        type: "paragraph",
        content: [textNode(text, [{ type: "link", attrs: { href } }, { type: "strong" }])],
      });
      break;
    }

    case "quote": {
      const text = getTextContent(node.children);
      result.push({
        type: "blockquote",
        content: [{ type: "paragraph", content: [textNode(text)] }],
      });
      break;
    }
  }

  return result;
}

export const confluenceRenderer: DocumentRenderer = {
  async render(node: DocNode, _options?: RenderOptions): Promise<string> {
    const content = nodeToAdf(node);
    const adf = {
      version: 1,
      type: "doc",
      content,
    };
    return JSON.stringify(adf, null, 2);
  },
};
