import { sanitizeHref, sanitizeImageSrc } from "../sanitize";
import type { DocChild, DocNode, DocumentRenderer, RenderOptions, TableColumn } from "../types";

/**
 * Notion renderer — outputs Notion Block JSON for the Notion API.
 * Blocks can be appended to a page via `notion.blocks.children.append()`.
 */

function resolveColumn(col: string | TableColumn): TableColumn {
  return typeof col === "string" ? { header: col } : col;
}

function getTextContent(children: DocChild[]): string {
  return children
    .map((c) => (typeof c === "string" ? c : getTextContent((c as DocNode).children)))
    .join("");
}

interface RichText {
  type: "text";
  text: { content: string; link?: { url: string } };
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
  };
}

function textToRichText(text: string, annotations?: RichText["annotations"]): RichText[] {
  return [
    {
      type: "text",
      text: { content: text },
      ...(annotations ? { annotations } : {}),
    },
  ];
}

interface NotionBlock {
  object: "block";
  type: string;
  [key: string]: unknown;
}

function nodeToBlocks(node: DocNode): NotionBlock[] {
  const p = node.props;
  const blocks: NotionBlock[] = [];

  switch (node.type) {
    case "document":
    case "page":
    case "section":
    case "row":
    case "column":
      for (const child of node.children) {
        if (typeof child !== "string") {
          blocks.push(...nodeToBlocks(child));
        }
      }
      break;

    case "heading": {
      const level = (p.level as number) ?? 1;
      const text = getTextContent(node.children);
      const type = level <= 1 ? "heading_1" : level === 2 ? "heading_2" : "heading_3";
      blocks.push({
        object: "block",
        type,
        [type]: { rich_text: textToRichText(text) },
      });
      break;
    }

    case "text": {
      const text = getTextContent(node.children);
      const annotations: RichText["annotations"] = {};
      if (p.bold) annotations.bold = true;
      if (p.italic) annotations.italic = true;
      if (p.strikethrough) annotations.strikethrough = true;
      if (p.underline) annotations.underline = true;
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: textToRichText(
            text,
            Object.keys(annotations).length > 0 ? annotations : undefined,
          ),
        },
      });
      break;
    }

    case "link": {
      const href = sanitizeHref(p.href as string);
      const text = getTextContent(node.children);
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: text, link: { url: href } } }],
        },
      });
      break;
    }

    case "image": {
      const src = sanitizeImageSrc(p.src as string);
      if (src.startsWith("http")) {
        blocks.push({
          object: "block",
          type: "image",
          image: {
            type: "external",
            external: { url: src },
            ...(p.caption ? { caption: textToRichText(p.caption as string) } : {}),
          },
        });
      }
      break;
    }

    case "table": {
      const columns = ((p.columns ?? []) as (string | TableColumn)[]).map(resolveColumn);
      const rows = (p.rows ?? []) as (string | number)[][];

      const tableRows: NotionBlock[] = [];

      // Header row
      tableRows.push({
        object: "block",
        type: "table_row",
        table_row: {
          cells: columns.map((col) => textToRichText(col.header, { bold: true })),
        },
      });

      // Data rows
      for (const row of rows) {
        tableRows.push({
          object: "block",
          type: "table_row",
          table_row: {
            cells: columns.map((_, i) => textToRichText(String(row[i] ?? ""))),
          },
        });
      }

      blocks.push({
        object: "block",
        type: "table",
        table: {
          table_width: columns.length,
          has_column_header: true,
          children: tableRows,
        },
      });
      break;
    }

    case "list": {
      const ordered = p.ordered as boolean | undefined;
      const items = node.children.filter((c): c is DocNode => typeof c !== "string");
      for (const item of items) {
        const text = getTextContent(item.children);
        const type = ordered ? "numbered_list_item" : "bulleted_list_item";
        blocks.push({
          object: "block",
          type,
          [type]: { rich_text: textToRichText(text) },
        });
      }
      break;
    }

    case "code": {
      const text = getTextContent(node.children);
      const lang = (p.language as string) ?? "plain text";
      blocks.push({
        object: "block",
        type: "code",
        code: {
          rich_text: textToRichText(text),
          language: lang,
        },
      });
      break;
    }

    case "divider":
    case "page-break":
      blocks.push({ object: "block", type: "divider", divider: {} });
      break;

    case "spacer":
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: [] },
      });
      break;

    case "button": {
      const href = sanitizeHref(p.href as string);
      const text = getTextContent(node.children);
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: { content: text, link: { url: href } },
              annotations: { bold: true },
            },
          ],
        },
      });
      break;
    }

    case "quote": {
      const text = getTextContent(node.children);
      blocks.push({
        object: "block",
        type: "quote",
        quote: { rich_text: textToRichText(text) },
      });
      break;
    }
  }

  return blocks;
}

export const notionRenderer: DocumentRenderer = {
  async render(node: DocNode, _options?: RenderOptions): Promise<string> {
    const blocks = nodeToBlocks(node);
    return JSON.stringify({ children: blocks }, null, 2);
  },
};
