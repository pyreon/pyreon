import { sanitizeHref, sanitizeImageSrc } from "../sanitize";
import type { DocChild, DocNode, DocumentRenderer, RenderOptions, TableColumn } from "../types";

/**
 * Google Chat renderer — outputs Card V2 JSON for Google Chat API.
 * Cards can be sent via webhooks, Chat API, or Apps Script.
 */

function resolveColumn(col: string | TableColumn): TableColumn {
  return typeof col === "string" ? { header: col } : col;
}

function getTextContent(children: DocChild[]): string {
  return children
    .map((c) => (typeof c === "string" ? c : getTextContent((c as DocNode).children)))
    .join("");
}

interface CardWidget {
  [key: string]: unknown;
}

function nodeToWidgets(node: DocNode): CardWidget[] {
  const p = node.props;
  const widgets: CardWidget[] = [];

  switch (node.type) {
    case "document":
    case "page":
    case "section":
    case "row":
    case "column":
      for (const child of node.children) {
        if (typeof child !== "string") {
          widgets.push(...nodeToWidgets(child));
        }
      }
      break;

    case "heading": {
      const text = getTextContent(node.children);
      widgets.push({
        decoratedText: {
          topLabel: "",
          text: `<b>${text}</b>`,
          wrapText: true,
        },
      });
      break;
    }

    case "text": {
      let text = getTextContent(node.children);
      if (p.bold) text = `<b>${text}</b>`;
      if (p.italic) text = `<i>${text}</i>`;
      if (p.strikethrough) text = `<s>${text}</s>`;
      widgets.push({
        textParagraph: { text },
      });
      break;
    }

    case "link": {
      const href = sanitizeHref(p.href as string);
      const text = getTextContent(node.children);
      widgets.push({
        textParagraph: { text: `<a href="${href}">${text}</a>` },
      });
      break;
    }

    case "image": {
      const src = sanitizeImageSrc(p.src as string);
      if (src.startsWith("http")) {
        widgets.push({
          image: {
            imageUrl: src,
            altText: (p.alt as string) ?? "Image",
          },
        });
      }
      break;
    }

    case "table": {
      const columns = ((p.columns ?? []) as (string | TableColumn)[]).map(resolveColumn);
      const rows = (p.rows ?? []) as (string | number)[][];

      // Google Chat Cards don't have native tables — use grid or formatted text
      const header = columns.map((c) => `<b>${c.header}</b>`).join(" | ");
      const body = rows.map((row) => row.map((c) => String(c ?? "")).join(" | ")).join("\n");

      widgets.push({
        textParagraph: { text: `${header}\n${body}` },
      });
      break;
    }

    case "list": {
      const ordered = p.ordered as boolean | undefined;
      const items = node.children
        .filter((c): c is DocNode => typeof c !== "string")
        .map((item, i) => {
          const prefix = ordered ? `${i + 1}.` : "•";
          return `${prefix} ${getTextContent(item.children)}`;
        })
        .join("\n");
      widgets.push({
        textParagraph: { text: items },
      });
      break;
    }

    case "code": {
      const text = getTextContent(node.children);
      widgets.push({
        textParagraph: {
          text: `<font color="#333333"><code>${text}</code></font>`,
        },
      });
      break;
    }

    case "divider":
    case "page-break":
      widgets.push({ divider: {} });
      break;

    case "spacer":
      // No direct equivalent — skip
      break;

    case "button": {
      const href = sanitizeHref(p.href as string);
      const text = getTextContent(node.children);
      widgets.push({
        buttonList: {
          buttons: [
            {
              text,
              onClick: { openLink: { url: href } },
              color: {
                red: 0.31,
                green: 0.27,
                blue: 0.89,
                alpha: 1,
              },
            },
          ],
        },
      });
      break;
    }

    case "quote": {
      const text = getTextContent(node.children);
      widgets.push({
        textParagraph: { text: `<i>"${text}"</i>` },
      });
      break;
    }
  }

  return widgets;
}

export const googleChatRenderer: DocumentRenderer = {
  async render(node: DocNode, _options?: RenderOptions): Promise<string> {
    const widgets = nodeToWidgets(node);

    // Extract title from first heading or document title
    let title = (node.props.title as string) ?? "";
    if (!title) {
      const firstHeading = node.children.find(
        (c): c is DocNode => typeof c !== "string" && c.type === "heading",
      );
      if (firstHeading) title = getTextContent(firstHeading.children);
    }

    const card = {
      cardsV2: [
        {
          cardId: "document",
          card: {
            header: title
              ? { title, subtitle: (node.props.subject as string) ?? undefined }
              : undefined,
            sections: [
              {
                widgets,
              },
            ],
          },
        },
      ],
    };

    return JSON.stringify(card, null, 2);
  },
};
