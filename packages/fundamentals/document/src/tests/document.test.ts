import { afterEach, describe, expect, it } from "vitest"
import {
  _resetRenderers,
  Button,
  Code,
  Column,
  createDocument,
  Divider,
  Document,
  Heading,
  Image,
  isDocNode,
  Link,
  List,
  ListItem,
  Page,
  PageBreak,
  Quote,
  Row,
  registerRenderer,
  render,
  Section,
  Spacer,
  Table,
  Text,
  unregisterRenderer,
} from "../index"

afterEach(() => {
  _resetRenderers()
})

// ─── Node Construction ──────────────────────────────────────────────────────

describe("node construction", () => {
  it("Document creates a document node", () => {
    const doc = Document({ title: "Test", children: "hello" })
    expect(doc.type).toBe("document")
    expect(doc.props.title).toBe("Test")
    expect(doc.children).toEqual(["hello"])
  })

  it("Page creates a page node", () => {
    const page = Page({ size: "A4", margin: 40, children: "content" })
    expect(page.type).toBe("page")
    expect(page.props.size).toBe("A4")
    expect(page.props.margin).toBe(40)
  })

  it("Section with direction", () => {
    const section = Section({ direction: "row", gap: 20, children: "a" })
    expect(section.type).toBe("section")
    expect(section.props.direction).toBe("row")
    expect(section.props.gap).toBe(20)
  })

  it("Row and Column", () => {
    const row = Row({
      gap: 10,
      children: [Column({ width: "50%", children: "left" })],
    })
    expect(row.type).toBe("row")
    expect(row.children).toHaveLength(1)
    const col = row.children[0]!
    expect(typeof col).not.toBe("string")
    if (typeof col !== "string") {
      expect(col.type).toBe("column")
      expect(col.props.width).toBe("50%")
    }
  })

  it("Heading defaults to level 1", () => {
    const h = Heading({ children: "Title" })
    expect(h.type).toBe("heading")
    expect(h.props.level).toBe(1)
  })

  it("Heading with custom level", () => {
    const h = Heading({ level: 3, children: "Subtitle" })
    expect(h.props.level).toBe(3)
  })

  it("Text with formatting", () => {
    const t = Text({
      bold: true,
      italic: true,
      size: 14,
      color: "#333",
      children: "hello",
    })
    expect(t.type).toBe("text")
    expect(t.props.bold).toBe(true)
    expect(t.props.italic).toBe(true)
    expect(t.props.size).toBe(14)
  })

  it("Link", () => {
    const l = Link({ href: "https://example.com", children: "click" })
    expect(l.type).toBe("link")
    expect(l.props.href).toBe("https://example.com")
  })

  it("Image with all props", () => {
    const img = Image({
      src: "/logo.png",
      width: 100,
      height: 50,
      alt: "Logo",
      caption: "Company logo",
    })
    expect(img.type).toBe("image")
    expect(img.props.src).toBe("/logo.png")
    expect(img.props.width).toBe(100)
    expect(img.props.caption).toBe("Company logo")
    expect(img.children).toEqual([])
  })

  it("Table with columns and rows", () => {
    const t = Table({
      columns: ["Name", { header: "Price", align: "right" }],
      rows: [["Widget", "$10"]],
      striped: true,
    })
    expect(t.type).toBe("table")
    expect(t.props.columns).toHaveLength(2)
    expect(t.props.rows).toHaveLength(1)
    expect(t.props.striped).toBe(true)
  })

  it("List with items", () => {
    const l = List({
      ordered: true,
      children: [ListItem({ children: "one" }), ListItem({ children: "two" })],
    })
    expect(l.type).toBe("list")
    expect(l.props.ordered).toBe(true)
    expect(l.children).toHaveLength(2)
  })

  it("Code", () => {
    const c = Code({ language: "typescript", children: "const x = 1" })
    expect(c.type).toBe("code")
    expect(c.props.language).toBe("typescript")
  })

  it("Divider", () => {
    const d = Divider({ color: "#ccc", thickness: 2 })
    expect(d.type).toBe("divider")
    expect(d.props.color).toBe("#ccc")
  })

  it("Divider with defaults", () => {
    const d = Divider()
    expect(d.type).toBe("divider")
  })

  it("Spacer", () => {
    const s = Spacer({ height: 30 })
    expect(s.type).toBe("spacer")
    expect(s.props.height).toBe(30)
  })

  it("Button", () => {
    const b = Button({ href: "/pay", background: "#4f46e5", children: "Pay" })
    expect(b.type).toBe("button")
    expect(b.props.href).toBe("/pay")
    expect(b.props.background).toBe("#4f46e5")
  })

  it("Quote", () => {
    const q = Quote({ borderColor: "#blue", children: "wise words" })
    expect(q.type).toBe("quote")
    expect(q.props.borderColor).toBe("#blue")
  })

  it("isDocNode returns true for nodes", () => {
    expect(isDocNode(Heading({ children: "hi" }))).toBe(true)
  })

  it("isDocNode returns false for non-nodes", () => {
    expect(isDocNode("string")).toBe(false)
    expect(isDocNode(null)).toBe(false)
    expect(isDocNode(42)).toBe(false)
    expect(isDocNode({})).toBe(false)
  })

  it("normalizes nested children", () => {
    const doc = Document({
      children: [Heading({ children: "A" }), [Text({ children: "B" }), Text({ children: "C" })]],
    })
    expect(doc.children).toHaveLength(3)
  })

  it("handles null/undefined/false children", () => {
    const doc = Document({ children: [null, undefined, false, "text"] })
    expect(doc.children).toEqual(["text"])
  })

  it("converts numbers to strings in children", () => {
    const t = Text({ children: 42 as unknown as string })
    expect(t.children).toEqual(["42"])
  })
})

// ─── HTML Renderer ──────────────────────────────────────────────────────────

describe("HTML renderer", () => {
  it("renders a simple document", async () => {
    const doc = Document({
      title: "Test",
      children: Page({ children: Heading({ children: "Hello" }) }),
    })
    const html = (await render(doc, "html")) as string
    expect(html).toContain("<!DOCTYPE html>")
    expect(html).toContain("<title>Test</title>")
    expect(html).toContain("<h1")
    expect(html).toContain("Hello")
  })

  it("renders text with formatting", async () => {
    const doc = Document({
      children: Text({
        bold: true,
        color: "#f00",
        size: 20,
        align: "center",
        children: "Bold Red",
      }),
    })
    const html = (await render(doc, "html")) as string
    expect(html).toContain("font-weight:bold")
    expect(html).toContain("color:#f00")
    expect(html).toContain("font-size:20px")
    expect(html).toContain("text-align:center")
  })

  it("renders a table", async () => {
    const doc = Document({
      children: Table({
        columns: ["Name", { header: "Price", align: "right" }],
        rows: [
          ["Widget", "$10"],
          ["Gadget", "$20"],
        ],
        striped: true,
        headerStyle: { background: "#000", color: "#fff" },
      }),
    })
    const html = (await render(doc, "html")) as string
    expect(html).toContain("<table")
    expect(html).toContain("Widget")
    expect(html).toContain("$10")
    expect(html).toContain("background:#000")
    expect(html).toContain("color:#fff")
  })

  it("renders an image with caption", async () => {
    const doc = Document({
      children: Image({
        src: "/img.png",
        width: 200,
        alt: "Photo",
        caption: "A photo",
      }),
    })
    const html = (await render(doc, "html")) as string
    expect(html).toContain("<img")
    expect(html).toContain('src="/img.png"')
    expect(html).toContain("<figcaption>")
    expect(html).toContain("A photo")
  })

  it("renders a link", async () => {
    const doc = Document({
      children: Link({ href: "https://example.com", children: "Click me" }),
    })
    const html = (await render(doc, "html")) as string
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain("Click me")
  })

  it("renders a list", async () => {
    const doc = Document({
      children: List({
        ordered: true,
        children: [ListItem({ children: "one" }), ListItem({ children: "two" })],
      }),
    })
    const html = (await render(doc, "html")) as string
    expect(html).toContain("<ol>")
    expect(html).toContain("<li>one</li>")
  })

  it("renders code blocks", async () => {
    const doc = Document({ children: Code({ children: "const x = 1" }) })
    const html = (await render(doc, "html")) as string
    expect(html).toContain("<pre")
    expect(html).toContain("<code>")
    expect(html).toContain("const x = 1")
  })

  it("renders divider", async () => {
    const doc = Document({ children: Divider({ color: "#ccc", thickness: 2 }) })
    const html = (await render(doc, "html")) as string
    expect(html).toContain("<hr")
    expect(html).toContain("2px solid #ccc")
  })

  it("renders spacer", async () => {
    const doc = Document({ children: Spacer({ height: 30 }) })
    const html = (await render(doc, "html")) as string
    expect(html).toContain("height:30px")
  })

  it("renders button", async () => {
    const doc = Document({
      children: Button({
        href: "/pay",
        background: "#4f46e5",
        color: "#fff",
        children: "Pay",
      }),
    })
    const html = (await render(doc, "html")) as string
    expect(html).toContain('href="/pay"')
    expect(html).toContain("background:#4f46e5")
    expect(html).toContain("Pay")
  })

  it("renders blockquote", async () => {
    const doc = Document({ children: Quote({ children: "A wise quote" }) })
    const html = (await render(doc, "html")) as string
    expect(html).toContain("<blockquote")
    expect(html).toContain("A wise quote")
  })

  it("renders section with row direction", async () => {
    const doc = Document({
      children: Section({
        direction: "row",
        gap: 20,
        background: "#f5f5f5",
        children: [Text({ children: "A" }), Text({ children: "B" })],
      }),
    })
    const html = (await render(doc, "html")) as string
    expect(html).toContain("display:flex")
    expect(html).toContain("flex-direction:row")
  })

  it("renders image with center alignment", async () => {
    const doc = Document({
      children: Image({ src: "/img.png", align: "center" }),
    })
    const html = (await render(doc, "html")) as string
    expect(html).toContain("margin:0 auto")
  })

  it("renders table with bordered option", async () => {
    const doc = Document({
      children: Table({ columns: ["A"], rows: [["1"]], bordered: true }),
    })
    const html = (await render(doc, "html")) as string
    expect(html).toContain("border:1px solid #ddd")
  })

  it("renders table with caption", async () => {
    const doc = Document({
      children: Table({ columns: ["A"], rows: [["1"]], caption: "My Table" }),
    })
    const html = (await render(doc, "html")) as string
    expect(html).toContain("<caption>My Table</caption>")
  })

  it("escapes HTML in text", async () => {
    const doc = Document({
      children: Text({ children: "<script>alert(1)</script>" }),
    })
    const html = (await render(doc, "html")) as string
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("renders text with underline and strikethrough", async () => {
    const ul = Document({
      children: Text({ underline: true, children: "underlined" }),
    })
    const st = Document({
      children: Text({ strikethrough: true, children: "struck" }),
    })
    expect((await render(ul, "html")) as string).toContain("text-decoration:underline")
    expect((await render(st, "html")) as string).toContain("text-decoration:line-through")
  })

  it("renders image with right alignment", async () => {
    const doc = Document({ children: Image({ src: "/x.png", align: "right" }) })
    const html = (await render(doc, "html")) as string
    expect(html).toContain("margin-left:auto")
  })
})

// ─── Email Renderer ─────────────────────────────────────────────────────────

describe("email renderer", () => {
  it("renders email-safe HTML", async () => {
    const doc = Document({
      title: "Welcome",
      children: [Heading({ children: "Hello!" }), Text({ children: "Welcome to our service." })],
    })
    const html = (await render(doc, "email")) as string
    expect(html).toContain("<!DOCTYPE html>")
    expect(html).toContain("max-width:600px")
    expect(html).toContain("Hello!")
    // Should have Outlook conditional comments
    expect(html).toContain("<!--[if mso]>")
  })

  it("renders bulletproof buttons", async () => {
    const doc = Document({
      children: Button({
        href: "/pay",
        background: "#4f46e5",
        children: "Pay Now",
      }),
    })
    const html = (await render(doc, "email")) as string
    // VML for Outlook
    expect(html).toContain("v:roundrect")
    // CSS for others
    expect(html).toContain("background-color:#4f46e5")
    expect(html).toContain("Pay Now")
  })

  it("renders table with inline styles", async () => {
    const doc = Document({
      children: Table({
        columns: ["Name", "Price"],
        rows: [["Widget", "$10"]],
        headerStyle: { background: "#000", color: "#fff" },
      }),
    })
    const html = (await render(doc, "email")) as string
    expect(html).toContain("background-color:#000")
    expect(html).toContain("color:#fff")
    expect(html).toContain("Widget")
  })

  it("renders section with row direction using tables", async () => {
    const doc = Document({
      children: Section({
        direction: "row",
        children: [Text({ children: "Left" }), Text({ children: "Right" })],
      }),
    })
    const html = (await render(doc, "email")) as string
    // Should use table layout, not flexbox
    expect(html).not.toContain("display:flex")
    expect(html).toContain("<table")
    expect(html).toContain("Left")
    expect(html).toContain("Right")
  })

  it("renders divider using table", async () => {
    const doc = Document({ children: Divider() })
    const html = (await render(doc, "email")) as string
    expect(html).toContain("border-top:1px solid")
  })

  it("renders quote using table with border-left", async () => {
    const doc = Document({ children: Quote({ children: "A quote" }) })
    const html = (await render(doc, "email")) as string
    expect(html).toContain("border-left:4px solid")
  })
})

// ─── Markdown Renderer ──────────────────────────────────────────────────────

describe("markdown renderer", () => {
  it("renders headings with # prefix", async () => {
    const doc = Document({
      children: [
        Heading({ level: 1, children: "Title" }),
        Heading({ level: 3, children: "Subtitle" }),
      ],
    })
    const md = (await render(doc, "md")) as string
    expect(md).toContain("# Title")
    expect(md).toContain("### Subtitle")
  })

  it("renders bold and italic text", async () => {
    const doc = Document({
      children: [
        Text({ bold: true, children: "bold" }),
        Text({ italic: true, children: "italic" }),
        Text({ strikethrough: true, children: "struck" }),
      ],
    })
    const md = (await render(doc, "md")) as string
    expect(md).toContain("**bold**")
    expect(md).toContain("*italic*")
    expect(md).toContain("~~struck~~")
  })

  it("renders tables as pipe tables", async () => {
    const doc = Document({
      children: Table({
        columns: ["Name", { header: "Price", align: "right" }],
        rows: [["Widget", "$10"]],
      }),
    })
    const md = (await render(doc, "md")) as string
    expect(md).toContain("| Name | Price |")
    expect(md).toContain("| --- | ---: |")
    expect(md).toContain("| Widget | $10 |")
  })

  it("renders links in markdown format", async () => {
    const doc = Document({
      children: Link({ href: "https://example.com", children: "click" }),
    })
    const md = (await render(doc, "md")) as string
    expect(md).toContain("[click](https://example.com)")
  })

  it("renders images", async () => {
    const doc = Document({
      children: Image({ src: "/img.png", alt: "Photo", caption: "A photo" }),
    })
    const md = (await render(doc, "md")) as string
    expect(md).toContain("![Photo](/img.png)")
    expect(md).toContain("*A photo*")
  })

  it("renders code blocks with language", async () => {
    const doc = Document({
      children: Code({ language: "typescript", children: "const x = 1" }),
    })
    const md = (await render(doc, "md")) as string
    expect(md).toContain("```typescript")
    expect(md).toContain("const x = 1")
    expect(md).toContain("```")
  })

  it("renders ordered and unordered lists", async () => {
    const ol = Document({
      children: List({
        ordered: true,
        children: [ListItem({ children: "first" }), ListItem({ children: "second" })],
      }),
    })
    const ul = Document({
      children: List({
        children: [ListItem({ children: "a" }), ListItem({ children: "b" })],
      }),
    })
    const orderedMd = (await render(ol, "md")) as string
    const unorderedMd = (await render(ul, "md")) as string
    expect(orderedMd).toContain("1. first")
    expect(orderedMd).toContain("2. second")
    expect(unorderedMd).toContain("- a")
    expect(unorderedMd).toContain("- b")
  })

  it("renders divider as ---", async () => {
    const doc = Document({ children: Divider() })
    const md = (await render(doc, "md")) as string
    expect(md).toContain("---")
  })

  it("renders button as link", async () => {
    const doc = Document({
      children: Button({ href: "/pay", children: "Pay" }),
    })
    const md = (await render(doc, "md")) as string
    expect(md).toContain("[Pay](/pay)")
  })

  it("renders quote with >", async () => {
    const doc = Document({ children: Quote({ children: "wise" }) })
    const md = (await render(doc, "md")) as string
    expect(md).toContain("> wise")
  })

  it("renders table with caption", async () => {
    const doc = Document({
      children: Table({ columns: ["A"], rows: [["1"]], caption: "My Table" }),
    })
    const md = (await render(doc, "md")) as string
    expect(md).toContain("*My Table*")
  })
})

// ─── Text Renderer ──────────────────────────────────────────────────────────

describe("text renderer", () => {
  it("renders headings with underlines", async () => {
    const doc = Document({
      children: [Heading({ level: 1, children: "Title" }), Heading({ level: 2, children: "Sub" })],
    })
    const text = (await render(doc, "text")) as string
    expect(text).toContain("TITLE")
    expect(text).toContain("=====")
    expect(text).toContain("Sub")
    expect(text).toContain("---")
  })

  it("renders aligned table columns", async () => {
    const doc = Document({
      children: Table({
        columns: [
          { header: "Name", align: "left" },
          { header: "Price", align: "right" },
        ],
        rows: [["Widget", "$10"]],
      }),
    })
    const text = (await render(doc, "text")) as string
    expect(text).toContain("Name")
    expect(text).toContain("Price")
    expect(text).toContain("Widget")
  })

  it("renders button as link reference", async () => {
    const doc = Document({
      children: Button({ href: "/pay", children: "Pay" }),
    })
    const text = (await render(doc, "text")) as string
    expect(text).toContain("[Pay]")
    expect(text).toContain("/pay")
  })

  it("renders image as placeholder", async () => {
    const doc = Document({
      children: Image({ src: "/x.png", alt: "Photo", caption: "Nice" }),
    })
    const text = (await render(doc, "text")) as string
    expect(text).toContain("[Photo — Nice]")
  })
})

// ─── CSV Renderer ───────────────────────────────────────────────────────────

describe("CSV renderer", () => {
  it("extracts tables as CSV", async () => {
    const doc = Document({
      children: Table({
        columns: ["Name", "Price"],
        rows: [
          ["Widget", "$10"],
          ["Gadget", "$20"],
        ],
      }),
    })
    const csv = (await render(doc, "csv")) as string
    expect(csv).toContain("Name,Price")
    expect(csv).toContain("Widget,$10")
    expect(csv).toContain("Gadget,$20")
  })

  it("escapes commas and quotes", async () => {
    const doc = Document({
      children: Table({
        columns: ["Name"],
        rows: [["Widget, Inc."], ['He said "hello"']],
      }),
    })
    const csv = (await render(doc, "csv")) as string
    expect(csv).toContain('"Widget, Inc."')
    expect(csv).toContain('"He said ""hello"""')
  })

  it("returns message when no tables", async () => {
    const doc = Document({ children: Text({ children: "no tables here" }) })
    const csv = (await render(doc, "csv")) as string
    expect(csv).toContain("No tables found")
  })

  it("handles multiple tables", async () => {
    const doc = Document({
      children: [
        Table({ columns: ["A"], rows: [["1"]] }),
        Table({ columns: ["B"], rows: [["2"]] }),
      ],
    })
    const csv = (await render(doc, "csv")) as string
    expect(csv).toContain("A")
    expect(csv).toContain("B")
  })

  it("adds caption as comment", async () => {
    const doc = Document({
      children: Table({ columns: ["A"], rows: [["1"]], caption: "My Data" }),
    })
    const csv = (await render(doc, "csv")) as string
    expect(csv).toContain("# My Data")
  })
})

// ─── Builder Pattern ────────────────────────────────────────────────────────

describe("createDocument builder", () => {
  it("builds a document with heading and text", async () => {
    const doc = createDocument({ title: "Test" }).heading("Title").text("Hello world")

    const node = doc.build()
    expect(node.type).toBe("document")
    expect(node.props.title).toBe("Test")
  })

  it("renders to HTML", async () => {
    const doc = createDocument()
      .heading("Report")
      .text("Summary text")
      .table({
        columns: ["Name", "Value"],
        rows: [["A", "1"]],
      })

    const html = await doc.toHtml()
    expect(html).toContain("Report")
    expect(html).toContain("Summary text")
    expect(html).toContain("<table")
  })

  it("renders to markdown", async () => {
    const doc = createDocument()
      .heading("Title")
      .text("Body", { bold: true })
      .list(["item 1", "item 2"])

    const md = await doc.toMarkdown()
    expect(md).toContain("# Title")
    expect(md).toContain("**Body**")
    expect(md).toContain("- item 1")
  })

  it("renders to text", async () => {
    const doc = createDocument().heading("Title").text("Body")

    const text = await doc.toText()
    expect(text).toContain("TITLE")
    expect(text).toContain("Body")
  })

  it("renders to CSV", async () => {
    const doc = createDocument().table({ columns: ["X"], rows: [["1"], ["2"]] })

    const csv = await doc.toCsv()
    expect(csv).toContain("X")
    expect(csv).toContain("1")
  })

  it("supports all builder methods", () => {
    const doc = createDocument()
      .heading("H")
      .text("T")
      .paragraph("P")
      .image("/img.png")
      .table({ columns: ["A"], rows: [["1"]] })
      .list(["a", "b"])
      .code("x = 1", { language: "python" })
      .divider()
      .spacer(20)
      .quote("Q")
      .button("Click", { href: "/go" })
      .link("Link", { href: "/link" })

    const node = doc.build()
    expect(node.type).toBe("document")
  })

  it("chart without instance shows placeholder", async () => {
    const doc = createDocument().chart(null)

    const html = await doc.toHtml()
    expect(html).toContain("[Chart]")
  })

  it("flow without instance shows placeholder", async () => {
    const doc = createDocument().flow(null)

    const html = await doc.toHtml()
    expect(html).toContain("[Flow Diagram]")
  })

  it("chart with getDataURL captures image", async () => {
    const mockChart = {
      getDataURL: () => "data:image/png;base64,abc123",
    }
    const doc = createDocument().chart(mockChart, { width: 400 })
    const html = await doc.toHtml()
    expect(html).toContain("data:image/png;base64,abc123")
  })

  it("flow with toSVG captures image", async () => {
    const mockFlow = {
      toSVG: () => "<svg><rect/></svg>",
    }
    const doc = createDocument().flow(mockFlow, { width: 500 })
    const html = await doc.toHtml()
    expect(html).toContain("data:image/svg+xml")
  })
})

// ─── Custom Renderers ───────────────────────────────────────────────────────

describe("custom renderers", () => {
  it("registerRenderer adds a custom format", async () => {
    registerRenderer("custom", {
      async render(node) {
        return `CUSTOM:${node.type}`
      },
    })

    const doc = Document({ children: "hello" })
    const result = await render(doc, "custom")
    expect(result).toBe("CUSTOM:document")
  })

  it("unregisterRenderer removes a format", () => {
    registerRenderer("temp", {
      async render() {
        return "x"
      },
    })
    unregisterRenderer("temp")
    expect(render(Document({ children: "x" }), "temp")).rejects.toThrow("No renderer registered")
  })

  it("throws for unknown format", () => {
    expect(render(Document({ children: "x" }), "unknown")).rejects.toThrow("No renderer registered")
  })

  it("lazy renderer is cached after first use", async () => {
    let loadCount = 0
    registerRenderer("lazy", async () => {
      loadCount++
      return {
        async render() {
          return "lazy-result"
        },
      }
    })

    await render(Document({ children: "x" }), "lazy")
    await render(Document({ children: "x" }), "lazy")
    expect(loadCount).toBe(1)
  })
})

// ─── Real-World Document ────────────────────────────────────────────────────

describe("real-world document", () => {
  function createInvoice() {
    return Document({
      title: "Invoice #1234",
      author: "Acme Corp",
      children: Page({
        size: "A4",
        margin: 40,
        children: [
          Row({
            gap: 20,
            children: [
              Column({
                children: Image({ src: "/logo.png", width: 80, alt: "Logo" }),
              }),
              Column({
                children: [
                  Heading({ children: "Invoice #1234" }),
                  Text({ color: "#666", children: "March 23, 2026" }),
                ],
              }),
            ],
          }),
          Spacer({ height: 30 }),
          Table({
            columns: [
              { header: "Item", width: "50%" },
              { header: "Qty", width: "15%", align: "center" },
              { header: "Price", width: "15%", align: "right" },
              { header: "Total", width: "20%", align: "right" },
            ],
            rows: [
              ["Widget Pro", "2", "$50", "$100"],
              ["Gadget Plus", "1", "$75", "$75"],
              ["Service Fee", "1", "$25", "$25"],
            ],
            striped: true,
            headerStyle: { background: "#1a1a2e", color: "#fff" },
          }),
          Spacer({ height: 20 }),
          Text({
            bold: true,
            align: "right",
            size: 18,
            children: "Total: $200",
          }),
          Divider(),
          Text({
            color: "#999",
            size: 12,
            children: "Thank you for your business!",
          }),
          Button({
            href: "https://acme.com/pay/1234",
            background: "#4f46e5",
            align: "center",
            children: "Pay Now",
          }),
        ],
      }),
    })
  }

  it("renders as HTML", async () => {
    const html = (await render(createInvoice(), "html")) as string
    expect(html).toContain("Invoice #1234")
    expect(html).toContain("Widget Pro")
    expect(html).toContain("Total: $200")
    expect(html).toContain("Pay Now")
  })

  it("renders as email", async () => {
    const html = (await render(createInvoice(), "email")) as string
    expect(html).toContain("Invoice #1234")
    expect(html).toContain("max-width:600px")
    expect(html).toContain("v:roundrect") // Outlook button
  })

  it("renders as markdown", async () => {
    const md = (await render(createInvoice(), "md")) as string
    expect(md).toContain("# Invoice #1234")
    expect(md).toContain("| Widget Pro")
    expect(md).toContain("**Total: $200**")
  })

  it("renders as text", async () => {
    const text = (await render(createInvoice(), "text")) as string
    expect(text).toContain("INVOICE #1234")
    expect(text).toContain("Widget Pro")
    expect(text).toContain("Total: $200")
  })

  it("renders as CSV", async () => {
    const csv = (await render(createInvoice(), "csv")) as string
    expect(csv).toContain("Item,Qty,Price,Total")
    expect(csv).toContain("Widget Pro,2,$50,$100")
  })
})

// ─── Text Renderer — additional coverage ────────────────────────────────────

describe("text renderer — additional", () => {
  it("renders link with URL", async () => {
    const doc = Document({
      children: Link({ href: "https://x.com", children: "Link" }),
    })
    const text = (await render(doc, "text")) as string
    expect(text).toContain("Link (https://x.com)")
  })

  it("renders table with caption", async () => {
    const doc = Document({
      children: Table({ columns: ["A"], rows: [["1"]], caption: "Data" }),
    })
    const text = (await render(doc, "text")) as string
    expect(text).toContain("Data")
  })

  it("renders ordered list", async () => {
    const doc = Document({
      children: List({
        ordered: true,
        children: [ListItem({ children: "one" }), ListItem({ children: "two" })],
      }),
    })
    const text = (await render(doc, "text")) as string
    expect(text).toContain("1. one")
    expect(text).toContain("2. two")
  })

  it("renders unordered list", async () => {
    const doc = Document({
      children: List({
        children: [ListItem({ children: "a" }), ListItem({ children: "b" })],
      }),
    })
    const text = (await render(doc, "text")) as string
    expect(text).toContain("* a")
    expect(text).toContain("* b")
  })

  it("renders code block", async () => {
    const doc = Document({ children: Code({ children: "x = 1" }) })
    const text = (await render(doc, "text")) as string
    expect(text).toContain("x = 1")
  })

  it("renders divider", async () => {
    const doc = Document({ children: Divider() })
    const text = (await render(doc, "text")) as string
    expect(text).toContain("─")
  })

  it("renders spacer as newline", async () => {
    const doc = Document({
      children: [Text({ children: "A" }), Spacer({ height: 20 }), Text({ children: "B" })],
    })
    const text = (await render(doc, "text")) as string
    expect(text).toContain("A")
    expect(text).toContain("B")
  })

  it("renders quote with indentation", async () => {
    const doc = Document({ children: Quote({ children: "wise" }) })
    const text = (await render(doc, "text")) as string
    expect(text).toContain('"wise"')
  })

  it("renders section/row/column", async () => {
    const doc = Document({
      children: Section({
        children: Row({
          children: Column({ children: Text({ children: "nested" }) }),
        }),
      }),
    })
    const text = (await render(doc, "text")) as string
    expect(text).toContain("nested")
  })

  it("renders heading level 3+", async () => {
    const doc = Document({ children: Heading({ level: 4, children: "Sub" }) })
    const text = (await render(doc, "text")) as string
    expect(text).toContain("Sub")
    // Level 3+ should not have underline
    expect(text).not.toContain("===")
    expect(text).not.toContain("---")
  })

  it("renders table with center aligned column", async () => {
    const doc = Document({
      children: Table({
        columns: [{ header: "Name", align: "center" }],
        rows: [["X"]],
      }),
    })
    const text = (await render(doc, "text")) as string
    expect(text).toContain("Name")
    expect(text).toContain("X")
  })
})

// ─── Builder — additional coverage ───────────────────────────────────────────

describe("builder — additional", () => {
  it("pageBreak wraps content", () => {
    const doc = createDocument().heading("Page 1").pageBreak().heading("Page 2")
    const node = doc.build()
    expect(node.type).toBe("document")
  })

  it("toEmail renders", async () => {
    const html = await createDocument().heading("Hi").toEmail()
    expect(html).toContain("Hi")
    expect(html).toContain("max-width:600px")
  })

  it("toCsv renders", async () => {
    const csv = await createDocument()
      .table({ columns: ["X"], rows: [["1"]] })
      .toCsv()
    expect(csv).toContain("X")
  })

  it("toText renders", async () => {
    const text = await createDocument().heading("Hi").toText()
    expect(text).toContain("HI")
  })
})

// ─── Markdown — additional branch coverage ──────────────────────────────────

describe("markdown — additional branches", () => {
  it("renders table with center aligned column", async () => {
    const doc = Document({
      children: Table({
        columns: [{ header: "X", align: "center" }],
        rows: [["1"]],
      }),
    })
    const md = (await render(doc, "md")) as string
    expect(md).toContain(":---:")
  })

  it("renders table with left aligned column (default)", async () => {
    const doc = Document({
      children: Table({
        columns: [{ header: "X", align: "left" }],
        rows: [["1"]],
      }),
    })
    const md = (await render(doc, "md")) as string
    expect(md).toContain("| --- |")
  })

  it("renders empty table gracefully", async () => {
    const doc = Document({
      children: Table({ columns: [], rows: [] }),
    })
    const md = (await render(doc, "md")) as string
    expect(md).toBeDefined()
  })

  it("renders image without caption", async () => {
    const doc = Document({ children: Image({ src: "/x.png", alt: "X" }) })
    const md = (await render(doc, "md")) as string
    expect(md).toContain("![X](/x.png)")
    expect(md).not.toContain("*")
  })

  it("renders image without alt", async () => {
    const doc = Document({ children: Image({ src: "/x.png" }) })
    const md = (await render(doc, "md")) as string
    expect(md).toContain("![](/x.png)")
  })

  it("renders code without language", async () => {
    const doc = Document({ children: Code({ children: "x = 1" }) })
    const md = (await render(doc, "md")) as string
    expect(md).toContain("```\nx = 1\n```")
  })

  it("renders spacer as newline", async () => {
    const doc = Document({ children: Spacer({ height: 20 }) })
    const md = (await render(doc, "md")) as string
    expect(md).toBeDefined()
  })
})

// ─── Email — additional branch coverage ─────────────────────────────────────

describe("email — additional branches", () => {
  it("renders section with background and padding", async () => {
    const doc = Document({
      children: Section({
        background: "#f00",
        padding: [10, 20],
        borderRadius: 8,
        children: Text({ children: "hi" }),
      }),
    })
    const html = (await render(doc, "email")) as string
    expect(html).toContain("background-color:#f00")
    expect(html).toContain("border-radius:8px")
  })

  it("renders image with right alignment", async () => {
    const doc = Document({ children: Image({ src: "/x.png", align: "right" }) })
    const html = (await render(doc, "email")) as string
    expect(html).toContain("text-align:right")
  })

  it("renders striped table", async () => {
    const doc = Document({
      children: Table({
        columns: ["A"],
        rows: [["1"], ["2"], ["3"]],
        striped: true,
      }),
    })
    const html = (await render(doc, "email")) as string
    expect(html).toContain("background-color:#f9f9f9")
  })

  it("renders heading level 2", async () => {
    const doc = Document({ children: Heading({ level: 2, children: "Sub" }) })
    const html = (await render(doc, "email")) as string
    expect(html).toContain("<h2")
    expect(html).toContain("font-size:24px")
  })

  it("renders text with all formatting options", async () => {
    const doc = Document({
      children: Text({
        size: 16,
        bold: true,
        italic: true,
        underline: true,
        align: "center",
        lineHeight: 2,
        children: "styled",
      }),
    })
    const html = (await render(doc, "email")) as string
    expect(html).toContain("font-size:16px")
    expect(html).toContain("font-weight:bold")
    expect(html).toContain("font-style:italic")
    expect(html).toContain("text-decoration:underline")
    expect(html).toContain("text-align:center")
  })

  it("renders text with strikethrough", async () => {
    const doc = Document({
      children: Text({ strikethrough: true, children: "old" }),
    })
    const html = (await render(doc, "email")) as string
    expect(html).toContain("text-decoration:line-through")
  })

  it("renders button with custom alignment", async () => {
    const doc = Document({
      children: Button({ href: "/x", align: "center", children: "Go" }),
    })
    const html = (await render(doc, "email")) as string
    expect(html).toContain("text-align:center")
  })

  it("renders section column direction (default)", async () => {
    const doc = Document({
      children: Section({ children: Text({ children: "content" }) }),
    })
    const html = (await render(doc, "email")) as string
    expect(html).toContain("content")
  })

  it("renders section with gap in row", async () => {
    const doc = Document({
      children: Section({
        direction: "row",
        gap: 16,
        children: [Text({ children: "a" }), Text({ children: "b" })],
      }),
    })
    const html = (await render(doc, "email")) as string
    expect(html).toContain("padding:0 8px")
  })
})

// ─── HTML — additional branch coverage ──────────────────────────────────────

describe("html — additional branches", () => {
  it("renders section column direction (default)", async () => {
    const doc = Document({
      children: Section({ children: Text({ children: "x" }) }),
    })
    const html = (await render(doc, "html")) as string
    expect(html).not.toContain("display:flex")
  })

  it("renders page with margin as array", async () => {
    const doc = Document({
      children: Page({ margin: [10, 20], children: Text({ children: "hi" }) }),
    })
    const html = (await render(doc, "html")) as string
    expect(html).toContain("10px 20px")
  })

  it("renders page with 4-value margin", async () => {
    const doc = Document({
      children: Page({
        margin: [10, 20, 30, 40],
        children: Text({ children: "hi" }),
      }),
    })
    const html = (await render(doc, "html")) as string
    expect(html).toContain("10px 20px 30px 40px")
  })

  it("renders text with lineHeight", async () => {
    const doc = Document({
      children: Text({ lineHeight: 1.8, children: "text" }),
    })
    const html = (await render(doc, "html")) as string
    expect(html).toContain("line-height:1.8")
  })
})

// ─── CSV — additional branch coverage ───────────────────────────────────────

describe("csv — additional branches", () => {
  it("finds tables nested in pages", async () => {
    const doc = Document({
      children: Page({
        children: Section({
          children: Table({ columns: ["Nested"], rows: [["val"]] }),
        }),
      }),
    })
    const csv = (await render(doc, "csv")) as string
    expect(csv).toContain("Nested")
    expect(csv).toContain("val")
  })
})

// ─── Render Dispatcher — additional coverage ────────────────────────────────

describe("render dispatcher — additional", () => {
  it("error message includes available formats", async () => {
    try {
      await render(Document({ children: "x" }), "nonexistent")
    } catch (e) {
      expect((e as Error).message).toContain("No renderer registered")
      expect((e as Error).message).toContain("Available:")
      expect((e as Error).message).toContain("html")
    }
  })
})

// ─── Email Renderer — additional coverage ───────────────────────────────────

describe("email renderer — additional", () => {
  it("renders image with caption", async () => {
    const doc = Document({
      children: Image({ src: "/x.png", alt: "Photo", caption: "Nice" }),
    })
    const html = (await render(doc, "email")) as string
    expect(html).toContain("Nice")
  })

  it("renders image with center alignment", async () => {
    const doc = Document({
      children: Image({ src: "/x.png", align: "center" }),
    })
    const html = (await render(doc, "email")) as string
    expect(html).toContain("text-align:center")
  })

  it("renders code block", async () => {
    const doc = Document({ children: Code({ children: "const x = 1" }) })
    const html = (await render(doc, "email")) as string
    expect(html).toContain("Courier New")
    expect(html).toContain("const x = 1")
  })

  it("renders spacer with line-height trick", async () => {
    const doc = Document({ children: Spacer({ height: 20 }) })
    const html = (await render(doc, "email")) as string
    expect(html).toContain("height:20px")
    expect(html).toContain("line-height:20px")
  })

  it("renders list", async () => {
    const doc = Document({
      children: List({
        children: [ListItem({ children: "one" }), ListItem({ children: "two" })],
      }),
    })
    const html = (await render(doc, "email")) as string
    expect(html).toContain("<ul")
    expect(html).toContain("<li")
  })

  it("renders table caption", async () => {
    const doc = Document({
      children: Table({ columns: ["A"], rows: [["1"]], caption: "Data" }),
    })
    const html = (await render(doc, "email")) as string
    expect(html).toContain("Data")
  })

  it("renders link with target _blank", async () => {
    const doc = Document({
      children: Link({ href: "https://x.com", children: "X" }),
    })
    const html = (await render(doc, "email")) as string
    expect(html).toContain('target="_blank"')
  })

  it("renders row layout using tables", async () => {
    const doc = Document({
      children: Row({
        gap: 10,
        children: [Text({ children: "L" }), Text({ children: "R" })],
      }),
    })
    const html = (await render(doc, "email")) as string
    expect(html).toContain("<table")
    expect(html).toContain('valign="top"')
  })
})

// ─── DOCX Renderer (integration) ────────────────────────────────────────────

describe("DOCX renderer", () => {
  it("renders a document with heading, text, table, list, code, divider to a valid Uint8Array", async () => {
    const doc = Document({
      title: "DOCX Test",
      author: "Test Suite",
      children: Page({
        size: "A4",
        margin: 40,
        children: [
          Heading({ children: "DOCX Integration Test" }),
          Text({ children: "A test paragraph.", bold: true }),
          Table({
            columns: ["Name", "Value"],
            rows: [
              ["Alpha", "100"],
              ["Beta", "200"],
            ],
            striped: true,
            headerStyle: { background: "#333333", color: "#ffffff" },
          }),
          List({
            ordered: true,
            children: [ListItem({ children: "First" }), ListItem({ children: "Second" })],
          }),
          Code({ children: "const x = 42" }),
          Divider(),
        ],
      }),
    })

    const result = await render(doc, "docx")
    expect(result).toBeInstanceOf(Uint8Array)
    expect((result as Uint8Array).length).toBeGreaterThan(0)
    // DOCX files are ZIP archives — first two bytes are PK (0x50, 0x4B)
    expect((result as Uint8Array)[0]).toBe(0x50)
    expect((result as Uint8Array)[1]).toBe(0x4b)
  }, 15000)

  it("embeds base64 images via ImageRun", async () => {
    // 1x1 red pixel PNG as base64
    const redPixel =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="

    const doc = Document({
      children: Page({
        children: [Image({ src: redPixel, width: 50, height: 50, caption: "Red pixel" })],
      }),
    })

    const result = await render(doc, "docx")
    expect(result).toBeInstanceOf(Uint8Array)
    expect((result as Uint8Array).length).toBeGreaterThan(0)
  }, 15000)

  it("renders external URL images as placeholders", async () => {
    const doc = Document({
      children: Image({
        src: "https://example.com/logo.png",
        alt: "Logo",
        caption: "Company",
      }),
    })

    const result = await render(doc, "docx")
    expect(result).toBeInstanceOf(Uint8Array)
    expect((result as Uint8Array).length).toBeGreaterThan(0)
  }, 15000)

  it("renders page with header and footer", async () => {
    const doc = Document({
      children: Page({
        header: Text({ children: "My Header" }),
        footer: Text({ children: "Page Footer" }),
        children: [Heading({ children: "Content" }), Text({ children: "Body text." })],
      }),
    })

    const result = await render(doc, "docx")
    expect(result).toBeInstanceOf(Uint8Array)
    expect((result as Uint8Array).length).toBeGreaterThan(0)
  }, 15000)

  it("renders table with bordered option and column widths", async () => {
    const doc = Document({
      children: Table({
        columns: [
          { header: "Name", width: "60%" },
          { header: "Price", width: "40%", align: "right" },
        ],
        rows: [["Widget", "$10"]],
        bordered: true,
      }),
    })

    const result = await render(doc, "docx")
    expect(result).toBeInstanceOf(Uint8Array)
    expect((result as Uint8Array).length).toBeGreaterThan(0)
  }, 15000)

  it("renders nested lists", async () => {
    const doc = Document({
      children: List({
        children: [
          ListItem({
            children: [
              "Parent item",
              List({
                children: [ListItem({ children: "Child item" })],
              }),
            ],
          }),
        ],
      }),
    })

    const result = await render(doc, "docx")
    expect(result).toBeInstanceOf(Uint8Array)
    expect((result as Uint8Array).length).toBeGreaterThan(0)
  }, 15000)
})

// ─── XLSX Renderer (integration) ────────────────────────────────────────────

describe("XLSX renderer", () => {
  it("renders a document with tables to a valid Uint8Array", async () => {
    const doc = Document({
      title: "XLSX Test",
      author: "Test Suite",
      children: Page({
        children: [
          Heading({ children: "Sales Data" }),
          Table({
            columns: ["Product", "Revenue", "Margin"],
            rows: [
              ["Widget", "$1,234.56", "15%"],
              ["Gadget", "$2,500.00", "22.5%"],
            ],
            striped: true,
            headerStyle: { background: "#1a1a2e", color: "#ffffff" },
          }),
        ],
      }),
    })

    const result = await render(doc, "xlsx")
    expect(result).toBeInstanceOf(Uint8Array)
    expect((result as Uint8Array).length).toBeGreaterThan(0)
    // XLSX files are ZIP archives — first two bytes are PK (0x50, 0x4B)
    expect((result as Uint8Array)[0]).toBe(0x50)
    expect((result as Uint8Array)[1]).toBe(0x4b)
  }, 15000)

  it("parses currency values as numbers", async () => {
    const doc = Document({
      children: Table({
        columns: ["Amount"],
        rows: [["$1,234.56"], ["$500"], ["-$100.50"]],
      }),
    })

    const result = await render(doc, "xlsx")
    expect(result).toBeInstanceOf(Uint8Array)
    expect((result as Uint8Array).length).toBeGreaterThan(0)
  }, 15000)

  it("parses percentage values", async () => {
    const doc = Document({
      children: Table({
        columns: ["Rate"],
        rows: [["45%"], ["12.5%"], ["-3%"]],
      }),
    })

    const result = await render(doc, "xlsx")
    expect(result).toBeInstanceOf(Uint8Array)
    expect((result as Uint8Array).length).toBeGreaterThan(0)
  }, 15000)

  it("renders multiple tables on the same sheet with spacing", async () => {
    const doc = Document({
      children: [
        Heading({ children: "Report" }),
        Table({
          columns: ["A", "B"],
          rows: [
            ["1", "2"],
            ["3", "4"],
          ],
          caption: "First Table",
        }),
        Table({
          columns: ["X", "Y"],
          rows: [["a", "b"]],
          caption: "Second Table",
        }),
      ],
    })

    const result = await render(doc, "xlsx")
    expect(result).toBeInstanceOf(Uint8Array)
    expect((result as Uint8Array).length).toBeGreaterThan(0)
  }, 15000)

  it("renders bordered tables", async () => {
    const doc = Document({
      children: Table({
        columns: ["Name", "Value"],
        rows: [["Alpha", "100"]],
        bordered: true,
      }),
    })

    const result = await render(doc, "xlsx")
    expect(result).toBeInstanceOf(Uint8Array)
    expect((result as Uint8Array).length).toBeGreaterThan(0)
  }, 15000)

  it("renders empty document with default sheet", async () => {
    const doc = Document({ children: Text({ children: "no tables" }) })

    const result = await render(doc, "xlsx")
    expect(result).toBeInstanceOf(Uint8Array)
    expect((result as Uint8Array).length).toBeGreaterThan(0)
  }, 15000)
})

// ─── PDF Renderer (integration) ─────────────────────────────────────────────

describe("PDF renderer", () => {
  it("renders a document with heading, text, table, and data: image to a valid Uint8Array", async () => {
    // 1x1 red pixel PNG as base64
    const redPixel =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="

    const doc = Document({
      title: "PDF Test",
      author: "Test Suite",
      children: Page({
        size: "A4",
        margin: 40,
        children: [
          Heading({ children: "PDF Integration Test" }),
          Text({ children: "This is a test paragraph.", bold: true }),
          Table({
            columns: ["Name", "Value"],
            rows: [
              ["Alpha", "100"],
              ["Beta", "200"],
            ],
            striped: true,
            headerStyle: { background: "#333333", color: "#ffffff" },
          }),
          Image({ src: redPixel, width: 50, height: 50 }),
          List({
            ordered: true,
            children: [ListItem({ children: "First" }), ListItem({ children: "Second" })],
          }),
          Divider(),
          Quote({ children: "A wise quote." }),
        ],
      }),
    })

    const result = await render(doc, "pdf")
    expect(result).toBeInstanceOf(Uint8Array)
    expect((result as Uint8Array).length).toBeGreaterThan(0)
    // PDF files start with %PDF
    const header = String.fromCharCode(...(result as Uint8Array).slice(0, 5))
    expect(header).toBe("%PDF-")
  }, 15000)

  it("renders images with HTTP URLs as placeholder text", async () => {
    const doc = Document({
      title: "HTTP Image Test",
      children: Page({
        children: [
          Heading({ children: "Test" }),
          Image({ src: "https://example.com/image.png", width: 100 }),
        ],
      }),
    })

    const result = await render(doc, "pdf")
    expect(result).toBeInstanceOf(Uint8Array)
    expect((result as Uint8Array).length).toBeGreaterThan(0)
  }, 15000)

  it("renders page with header and footer", async () => {
    const doc = Document({
      title: "Header/Footer Test",
      children: Page({
        header: Text({ children: "Page Header", bold: true }),
        footer: Text({ children: "Page Footer", size: 10 }),
        children: [Heading({ children: "Content" }), Text({ children: "Body text." })],
      }),
    })

    const result = await render(doc, "pdf")
    expect(result).toBeInstanceOf(Uint8Array)
    expect((result as Uint8Array).length).toBeGreaterThan(0)
  }, 15000)
})

// ─── PPTX Renderer (integration) ────────────────────────────────────────────

describe("PPTX renderer", () => {
  it("renders a document with pages, headings, text, and tables to a valid Uint8Array", async () => {
    const doc = Document({
      title: "PPTX Test",
      author: "Test Suite",
      children: [
        Page({
          children: [
            Heading({ children: "Slide 1 Title" }),
            Text({ children: "Introduction text.", bold: true }),
            List({
              children: [ListItem({ children: "Point A" }), ListItem({ children: "Point B" })],
            }),
          ],
        }),
        Page({
          children: [
            Heading({ level: 2, children: "Slide 2 Data" }),
            Table({
              columns: ["Metric", "Value"],
              rows: [
                ["Revenue", "$1M"],
                ["Profit", "$300K"],
              ],
              headerStyle: { background: "#1a1a2e", color: "#ffffff" },
              striped: true,
            }),
          ],
        }),
      ],
    })

    const result = await render(doc, "pptx")
    expect(result).toBeInstanceOf(Uint8Array)
    expect((result as Uint8Array).length).toBeGreaterThan(0)
    // PPTX files are ZIP archives — first two bytes are PK (0x50, 0x4B)
    expect((result as Uint8Array)[0]).toBe(0x50)
    expect((result as Uint8Array)[1]).toBe(0x4b)
  }, 15000)

  it("renders a document without explicit pages as a single slide", async () => {
    const doc = Document({
      title: "Single Slide",
      children: [
        Heading({ children: "Auto Slide" }),
        Text({ children: "No explicit page wrapper." }),
      ],
    })

    const result = await render(doc, "pptx")
    expect(result).toBeInstanceOf(Uint8Array)
    expect((result as Uint8Array).length).toBeGreaterThan(0)
  }, 15000)

  it("renders all node types without errors", async () => {
    // 1x1 red pixel PNG as base64
    const redPixel =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="

    const doc = Document({
      children: Page({
        children: [
          Heading({ children: "Title" }),
          Text({ children: "Body", bold: true, italic: true }),
          Image({ src: redPixel, width: 50, height: 50 }),
          Code({ children: "const x = 1" }),
          Quote({ children: "A quote" }),
          Link({ href: "https://example.com", children: "Link text" }),
          Button({ href: "/action", background: "#4f46e5", children: "Click" }),
          Divider(),
          Spacer({ height: 20 }),
          List({ ordered: true, children: [ListItem({ children: "one" })] }),
          Section({ children: Text({ children: "nested" }) }),
        ],
      }),
    })

    const result = await render(doc, "pptx")
    expect(result).toBeInstanceOf(Uint8Array)
    expect((result as Uint8Array).length).toBeGreaterThan(0)
  }, 15000)
})

// ─── Slack Renderer ─────────────────────────────────────────────────────────

describe("Slack renderer", () => {
  it("renders heading as header block", async () => {
    const doc = Document({ children: Heading({ children: "Hello" }) })
    const json = (await render(doc, "slack")) as string
    const parsed = JSON.parse(json)
    expect(parsed.blocks).toHaveLength(1)
    expect(parsed.blocks[0].type).toBe("header")
  })

  it("renders text with bold as mrkdwn", async () => {
    const doc = Document({
      children: Text({ bold: true, children: "Bold text" }),
    })
    const json = (await render(doc, "slack")) as string
    const parsed = JSON.parse(json)
    expect(parsed.blocks[0].text.text).toContain("*Bold text*")
  })

  it("renders button as actions block", async () => {
    const doc = Document({
      children: Button({ href: "/go", children: "Click" }),
    })
    const json = (await render(doc, "slack")) as string
    const parsed = JSON.parse(json)
    expect(parsed.blocks[0].type).toBe("actions")
    expect(parsed.blocks[0].elements[0].type).toBe("button")
  })

  it("renders table as code block", async () => {
    const doc = Document({
      children: Table({ columns: ["A", "B"], rows: [["1", "2"]] }),
    })
    const json = (await render(doc, "slack")) as string
    const parsed = JSON.parse(json)
    expect(parsed.blocks[0].text.text).toContain("*A*")
    expect(parsed.blocks[0].text.text).toContain("1 | 2")
  })

  it("renders divider", async () => {
    const doc = Document({ children: Divider() })
    const json = (await render(doc, "slack")) as string
    const parsed = JSON.parse(json)
    expect(parsed.blocks[0].type).toBe("divider")
  })

  it("renders list as bullet points", async () => {
    const doc = Document({
      children: List({
        children: [ListItem({ children: "one" }), ListItem({ children: "two" })],
      }),
    })
    const json = (await render(doc, "slack")) as string
    const parsed = JSON.parse(json)
    expect(parsed.blocks[0].text.text).toContain("• one")
    expect(parsed.blocks[0].text.text).toContain("• two")
  })

  it("renders ordered list", async () => {
    const doc = Document({
      children: List({
        ordered: true,
        children: [ListItem({ children: "a" }), ListItem({ children: "b" })],
      }),
    })
    const json = (await render(doc, "slack")) as string
    const parsed = JSON.parse(json)
    expect(parsed.blocks[0].text.text).toContain("1. a")
    expect(parsed.blocks[0].text.text).toContain("2. b")
  })

  it("renders link in mrkdwn format", async () => {
    const doc = Document({
      children: Link({ href: "https://x.com", children: "X" }),
    })
    const json = (await render(doc, "slack")) as string
    const parsed = JSON.parse(json)
    expect(parsed.blocks[0].text.text).toContain("<https://x.com|X>")
  })

  it("renders code block", async () => {
    const doc = Document({
      children: Code({ language: "js", children: "const x = 1" }),
    })
    const json = (await render(doc, "slack")) as string
    const parsed = JSON.parse(json)
    expect(parsed.blocks[0].text.text).toContain("```js")
    expect(parsed.blocks[0].text.text).toContain("const x = 1")
  })

  it("renders quote with >", async () => {
    const doc = Document({ children: Quote({ children: "wise" }) })
    const json = (await render(doc, "slack")) as string
    const parsed = JSON.parse(json)
    expect(parsed.blocks[0].text.text).toContain("> wise")
  })

  it("renders image with URL", async () => {
    const doc = Document({
      children: Image({ src: "https://x.com/img.png", alt: "Photo" }),
    })
    const json = (await render(doc, "slack")) as string
    const parsed = JSON.parse(json)
    expect(parsed.blocks[0].type).toBe("image")
    expect(parsed.blocks[0].image_url).toBe("https://x.com/img.png")
  })

  it("skips non-URL images", async () => {
    const doc = Document({
      children: Image({ src: "data:image/png;base64,abc" }),
    })
    const json = (await render(doc, "slack")) as string
    const parsed = JSON.parse(json)
    expect(parsed.blocks).toHaveLength(0)
  })

  it("renders page-break as divider", async () => {
    const doc = Document({ children: PageBreak() })
    const json = (await render(doc, "slack")) as string
    const parsed = JSON.parse(json)
    expect(parsed.blocks[0].type).toBe("divider")
  })

  it("renders text with italic and strikethrough", async () => {
    const doc = Document({
      children: [
        Text({ italic: true, children: "italic" }),
        Text({ strikethrough: true, children: "struck" }),
      ],
    })
    const json = (await render(doc, "slack")) as string
    const parsed = JSON.parse(json)
    expect(parsed.blocks[0].text.text).toContain("_italic_")
    expect(parsed.blocks[1].text.text).toContain("~struck~")
  })

  it("renders image with caption", async () => {
    const doc = Document({
      children: Image({ src: "https://x.com/img.png", caption: "Nice" }),
    })
    const json = (await render(doc, "slack")) as string
    const parsed = JSON.parse(json)
    expect(parsed.blocks[0].title.text).toBe("Nice")
  })

  it("renders table with caption", async () => {
    const doc = Document({
      children: Table({ columns: ["X"], rows: [["1"]], caption: "My Table" }),
    })
    const json = (await render(doc, "slack")) as string
    const parsed = JSON.parse(json)
    expect(parsed.blocks[0].text.text).toContain("_My Table_")
  })
})

// ─── PageBreak ──────────────────────────────────────────────────────────────

describe("PageBreak", () => {
  it("creates a page-break node", () => {
    const pb = PageBreak()
    expect(pb.type).toBe("page-break")
    expect(pb.children).toEqual([])
  })

  it("renders as CSS page-break in HTML", async () => {
    const doc = Document({ children: PageBreak() })
    const html = (await render(doc, "html")) as string
    expect(html).toContain("page-break-after:always")
  })

  it("renders as separator in email", async () => {
    const doc = Document({ children: PageBreak() })
    const html = (await render(doc, "email")) as string
    expect(html).toContain("border-top:2px solid")
  })

  it("renders as --- in markdown", async () => {
    const doc = Document({ children: PageBreak() })
    const md = (await render(doc, "md")) as string
    expect(md).toContain("---")
  })

  it("renders as separator in text", async () => {
    const doc = Document({ children: PageBreak() })
    const text = (await render(doc, "text")) as string
    expect(text).toContain("═")
  })

  it("builder pageBreak inserts page-break node", async () => {
    const doc = createDocument().heading("Page 1").pageBreak().heading("Page 2")
    const html = await doc.toHtml()
    expect(html).toContain("page-break-after:always")
    expect(html).toContain("Page 1")
    expect(html).toContain("Page 2")
  })
})

// ─── RTL Support ────────────────────────────────────────────────────────────

describe("RTL support", () => {
  it("adds dir=rtl to HTML body", async () => {
    const doc = Document({ children: Text({ children: "مرحبا" }) })
    const html = (await render(doc, "html", { direction: "rtl" })) as string
    expect(html).toContain('dir="rtl"')
    expect(html).toContain("direction:rtl")
  })

  it("does not add dir for ltr (default)", async () => {
    const doc = Document({ children: Text({ children: "Hello" }) })
    const html = (await render(doc, "html")) as string
    expect(html).not.toContain('dir="rtl"')
  })
})

// ─── keepTogether ───────────────────────────────────────────────────────────

describe("keepTogether", () => {
  it("table accepts keepTogether prop", () => {
    const t = Table({ columns: ["A"], rows: [["1"]], keepTogether: true })
    expect(t.props.keepTogether).toBe(true)
  })
})

// ─── Builder toSlack ────────────────────────────────────────────────────────

// ─── SVG Renderer ───────────────────────────────────────────────────────────

describe("SVG renderer", () => {
  it("renders a valid SVG document", async () => {
    const doc = Document({ children: Heading({ children: "Title" }) })
    const svg = (await render(doc, "svg")) as string
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain("</svg>")
    expect(svg).toContain("Title")
  })

  it("renders heading with correct font size", async () => {
    const doc = Document({ children: Heading({ level: 2, children: "Sub" }) })
    const svg = (await render(doc, "svg")) as string
    expect(svg).toContain('font-size="24"')
    expect(svg).toContain('font-weight="bold"')
  })

  it("renders text with bold and italic", async () => {
    const doc = Document({
      children: [
        Text({ bold: true, children: "Bold" }),
        Text({ italic: true, children: "Italic" }),
      ],
    })
    const svg = (await render(doc, "svg")) as string
    expect(svg).toContain('font-weight="bold"')
    expect(svg).toContain('font-style="italic"')
  })

  it("renders table with header and rows", async () => {
    const doc = Document({
      children: Table({
        columns: ["Name", "Price"],
        rows: [["Widget", "$10"]],
        headerStyle: { background: "#000", color: "#fff" },
        striped: true,
      }),
    })
    const svg = (await render(doc, "svg")) as string
    expect(svg).toContain("Name")
    expect(svg).toContain("Widget")
    expect(svg).toContain('fill="#000"')
  })

  it("renders image from data URL", async () => {
    const doc = Document({
      children: Image({
        src: "data:image/png;base64,abc",
        width: 200,
        height: 100,
        caption: "Photo",
      }),
    })
    const svg = (await render(doc, "svg")) as string
    expect(svg).toContain("<image")
    expect(svg).toContain("data:image/png;base64,abc")
    expect(svg).toContain("Photo")
  })

  it("renders image placeholder for local paths", async () => {
    const doc = Document({
      children: Image({ src: "/local.png", alt: "Local" }),
    })
    const svg = (await render(doc, "svg")) as string
    expect(svg).toContain("Local")
    expect(svg).toContain('fill="#f0f0f0"')
  })

  it("renders list", async () => {
    const doc = Document({
      children: List({
        ordered: true,
        children: [ListItem({ children: "one" }), ListItem({ children: "two" })],
      }),
    })
    const svg = (await render(doc, "svg")) as string
    expect(svg).toContain("1. one")
    expect(svg).toContain("2. two")
  })

  it("renders unordered list", async () => {
    const doc = Document({
      children: List({
        children: [ListItem({ children: "a" }), ListItem({ children: "b" })],
      }),
    })
    const svg = (await render(doc, "svg")) as string
    expect(svg).toContain("• a")
    expect(svg).toContain("• b")
  })

  it("renders code block", async () => {
    const doc = Document({ children: Code({ children: "const x = 1" }) })
    const svg = (await render(doc, "svg")) as string
    expect(svg).toContain("const x = 1")
    expect(svg).toContain('font-family="monospace"')
    expect(svg).toContain('fill="#f5f5f5"') // background
  })

  it("renders divider", async () => {
    const doc = Document({ children: Divider({ color: "#ccc", thickness: 2 }) })
    const svg = (await render(doc, "svg")) as string
    expect(svg).toContain('stroke="#ccc"')
    expect(svg).toContain('stroke-width="2"')
  })

  it("renders button", async () => {
    const doc = Document({
      children: Button({
        href: "/pay",
        background: "#4f46e5",
        children: "Pay",
      }),
    })
    const svg = (await render(doc, "svg")) as string
    expect(svg).toContain('fill="#4f46e5"')
    expect(svg).toContain("Pay")
  })

  it("renders quote", async () => {
    const doc = Document({ children: Quote({ children: "wise words" }) })
    const svg = (await render(doc, "svg")) as string
    expect(svg).toContain("wise words")
    expect(svg).toContain('font-style="italic"')
  })

  it("renders link", async () => {
    const doc = Document({
      children: Link({ href: "https://x.com", children: "X" }),
    })
    const svg = (await render(doc, "svg")) as string
    expect(svg).toContain('<a href="https://x.com">')
    expect(svg).toContain("X")
  })

  it("renders spacer", async () => {
    const doc = Document({
      children: [Text({ children: "A" }), Spacer({ height: 50 }), Text({ children: "B" })],
    })
    const svg = (await render(doc, "svg")) as string
    expect(svg).toContain("A")
    expect(svg).toContain("B")
  })

  it("renders page-break as dashed line", async () => {
    const doc = Document({ children: PageBreak() })
    const svg = (await render(doc, "svg")) as string
    expect(svg).toContain("stroke-dasharray")
  })

  it("supports RTL direction", async () => {
    const doc = Document({ children: Text({ children: "مرحبا" }) })
    const svg = (await render(doc, "svg", { direction: "rtl" })) as string
    expect(svg).toContain('direction="rtl"')
  })

  it("auto-calculates height from content", async () => {
    const doc = Document({
      children: [Heading({ children: "A" }), Text({ children: "B" }), Text({ children: "C" })],
    })
    const svg = (await render(doc, "svg")) as string
    const match = svg.match(/height="(\d+)"/)
    expect(match).toBeTruthy()
    expect(Number(match![1])).toBeGreaterThan(80)
  })

  it("renders image from HTTP URL", async () => {
    const doc = Document({
      children: Image({ src: "https://x.com/img.png", width: 300 }),
    })
    const svg = (await render(doc, "svg")) as string
    expect(svg).toContain("<image")
    expect(svg).toContain("https://x.com/img.png")
  })

  it("builder toSvg works", async () => {
    const svg = await createDocument().heading("Hi").text("World").toSvg()
    expect(svg).toContain("<svg")
    expect(svg).toContain("Hi")
    expect(svg).toContain("World")
  })
})

// ─── Teams Renderer ─────────────────────────────────────────────────────────

describe("Teams renderer", () => {
  it("renders heading as TextBlock", async () => {
    const doc = Document({ children: Heading({ children: "Hello" }) })
    const json = (await render(doc, "teams")) as string
    const card = JSON.parse(json)
    expect(card.type).toBe("AdaptiveCard")
    expect(card.body[0].type).toBe("TextBlock")
    expect(card.body[0].text).toBe("Hello")
    expect(card.body[0].weight).toBe("bolder")
  })

  it("renders bold text", async () => {
    const doc = Document({ children: Text({ bold: true, children: "Bold" }) })
    const json = (await render(doc, "teams")) as string
    const card = JSON.parse(json)
    expect(card.body[0].text).toContain("**Bold**")
  })

  it("renders button as Action.OpenUrl", async () => {
    const doc = Document({
      children: Button({ href: "/go", children: "Click" }),
    })
    const json = (await render(doc, "teams")) as string
    const card = JSON.parse(json)
    expect(card.body[0].type).toBe("ActionSet")
    expect(card.body[0].actions[0].type).toBe("Action.OpenUrl")
  })

  it("renders table as ColumnSet", async () => {
    const doc = Document({
      children: Table({ columns: ["A", "B"], rows: [["1", "2"]] }),
    })
    const json = (await render(doc, "teams")) as string
    const card = JSON.parse(json)
    expect(card.body[0].type).toBe("ColumnSet")
  })

  it("renders list", async () => {
    const doc = Document({
      children: List({
        children: [ListItem({ children: "one" }), ListItem({ children: "two" })],
      }),
    })
    const json = (await render(doc, "teams")) as string
    const card = JSON.parse(json)
    expect(card.body[0].text).toContain("• one")
  })

  it("renders code as monospace", async () => {
    const doc = Document({ children: Code({ children: "x = 1" }) })
    const json = (await render(doc, "teams")) as string
    const card = JSON.parse(json)
    expect(card.body[0].fontType).toBe("monospace")
  })

  it("renders divider as separator", async () => {
    const doc = Document({ children: Divider() })
    const json = (await render(doc, "teams")) as string
    const card = JSON.parse(json)
    expect(card.body[0].separator).toBe(true)
  })

  it("renders image with URL", async () => {
    const doc = Document({
      children: Image({ src: "https://x.com/img.png", alt: "Photo" }),
    })
    const json = (await render(doc, "teams")) as string
    const card = JSON.parse(json)
    expect(card.body[0].type).toBe("Image")
  })

  it("renders quote as Container", async () => {
    const doc = Document({ children: Quote({ children: "wise" }) })
    const json = (await render(doc, "teams")) as string
    const card = JSON.parse(json)
    expect(card.body[0].type).toBe("Container")
    expect(card.body[0].style).toBe("emphasis")
  })

  it("renders link as markdown", async () => {
    const doc = Document({
      children: Link({ href: "https://x.com", children: "X" }),
    })
    const json = (await render(doc, "teams")) as string
    const card = JSON.parse(json)
    expect(card.body[0].text).toContain("[X](https://x.com)")
  })

  it("builder toTeams works", async () => {
    const json = await createDocument().heading("Hi").toTeams()
    const card = JSON.parse(json)
    expect(card.type).toBe("AdaptiveCard")
  })
})

// ─── Discord Renderer ───────────────────────────────────────────────────────

describe("Discord renderer", () => {
  it("renders heading as embed title", async () => {
    const doc = Document({ children: Heading({ children: "Title" }) })
    const json = (await render(doc, "discord")) as string
    const payload = JSON.parse(json)
    expect(payload.embeds[0].title).toBe("Title")
  })

  it("renders text in description", async () => {
    const doc = Document({
      children: [Heading({ children: "T" }), Text({ children: "Body" })],
    })
    const json = (await render(doc, "discord")) as string
    const payload = JSON.parse(json)
    expect(payload.embeds[0].description).toContain("Body")
  })

  it("renders small table as fields", async () => {
    const doc = Document({
      children: Table({
        columns: ["A", "B"],
        rows: [
          ["1", "2"],
          ["3", "4"],
        ],
      }),
    })
    const json = (await render(doc, "discord")) as string
    const payload = JSON.parse(json)
    expect(payload.embeds[0].fields).toHaveLength(2)
    expect(payload.embeds[0].fields[0].name).toBe("A")
    expect(payload.embeds[0].fields[0].inline).toBe(true)
  })

  it("renders image as embed image", async () => {
    const doc = Document({ children: Image({ src: "https://x.com/img.png" }) })
    const json = (await render(doc, "discord")) as string
    const payload = JSON.parse(json)
    expect(payload.embeds[0].image.url).toBe("https://x.com/img.png")
  })

  it("renders quote with >", async () => {
    const doc = Document({ children: Quote({ children: "wise" }) })
    const json = (await render(doc, "discord")) as string
    const payload = JSON.parse(json)
    expect(payload.embeds[0].description).toContain("> wise")
  })

  it("renders code block", async () => {
    const doc = Document({
      children: Code({ language: "js", children: "x()" }),
    })
    const json = (await render(doc, "discord")) as string
    const payload = JSON.parse(json)
    expect(payload.embeds[0].description).toContain("```js")
  })

  it("renders list", async () => {
    const doc = Document({
      children: List({
        ordered: true,
        children: [ListItem({ children: "a" })],
      }),
    })
    const json = (await render(doc, "discord")) as string
    const payload = JSON.parse(json)
    expect(payload.embeds[0].description).toContain("1. a")
  })

  it("builder toDiscord works", async () => {
    const json = await createDocument().heading("Hi").text("World").toDiscord()
    const payload = JSON.parse(json)
    expect(payload.embeds).toHaveLength(1)
  })
})

// ─── Telegram Renderer ──────────────────────────────────────────────────────

describe("Telegram renderer", () => {
  it("renders heading as bold", async () => {
    const doc = Document({ children: Heading({ children: "Title" }) })
    const html = (await render(doc, "telegram")) as string
    expect(html).toContain("<b>Title</b>")
  })

  it("renders text with formatting", async () => {
    const doc = Document({
      children: [
        Text({ bold: true, children: "Bold" }),
        Text({ italic: true, children: "Italic" }),
        Text({ underline: true, children: "Under" }),
        Text({ strikethrough: true, children: "Struck" }),
      ],
    })
    const html = (await render(doc, "telegram")) as string
    expect(html).toContain("<b>Bold</b>")
    expect(html).toContain("<i>Italic</i>")
    expect(html).toContain("<u>Under</u>")
    expect(html).toContain("<s>Struck</s>")
  })

  it("renders link as <a>", async () => {
    const doc = Document({
      children: Link({ href: "https://x.com", children: "X" }),
    })
    const html = (await render(doc, "telegram")) as string
    expect(html).toContain('<a href="https://x.com">X</a>')
  })

  it("renders table as pre-formatted text", async () => {
    const doc = Document({
      children: Table({ columns: ["A", "B"], rows: [["1", "2"]] }),
    })
    const html = (await render(doc, "telegram")) as string
    expect(html).toContain("<pre>")
    expect(html).toContain("A | B")
    expect(html).toContain("1 | 2")
  })

  it("renders code with language", async () => {
    const doc = Document({
      children: Code({ language: "python", children: "x = 1" }),
    })
    const html = (await render(doc, "telegram")) as string
    expect(html).toContain("language-python")
    expect(html).toContain("x = 1")
  })

  it("renders code without language", async () => {
    const doc = Document({ children: Code({ children: "x = 1" }) })
    const html = (await render(doc, "telegram")) as string
    expect(html).toContain("<pre>x = 1</pre>")
  })

  it("renders quote as blockquote", async () => {
    const doc = Document({ children: Quote({ children: "wise" }) })
    const html = (await render(doc, "telegram")) as string
    expect(html).toContain("<blockquote>wise</blockquote>")
  })

  it("renders list", async () => {
    const doc = Document({
      children: List({
        children: [ListItem({ children: "one" }), ListItem({ children: "two" })],
      }),
    })
    const html = (await render(doc, "telegram")) as string
    expect(html).toContain("• one")
    expect(html).toContain("• two")
  })

  it("renders button as link", async () => {
    const doc = Document({
      children: Button({ href: "/pay", children: "Pay" }),
    })
    const html = (await render(doc, "telegram")) as string
    expect(html).toContain('<a href="/pay">Pay</a>')
  })

  it("skips images (sent separately in Telegram)", async () => {
    const doc = Document({ children: Image({ src: "https://x.com/img.png" }) })
    const html = (await render(doc, "telegram")) as string
    expect(html).toBe("")
  })

  it("escapes HTML entities", async () => {
    const doc = Document({
      children: Text({ children: "<script>alert(1)</script>" }),
    })
    const html = (await render(doc, "telegram")) as string
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("builder toTelegram works", async () => {
    const html = await createDocument().heading("Hi").text("World").toTelegram()
    expect(html).toContain("<b>Hi</b>")
    expect(html).toContain("World")
  })
})

// ─── Notion Renderer ────────────────────────────────────────────────────────

describe("Notion renderer", () => {
  it("renders heading as heading block", async () => {
    const doc = Document({ children: Heading({ children: "Title" }) })
    const json = (await render(doc, "notion")) as string
    const parsed = JSON.parse(json)
    expect(parsed.children[0].type).toBe("heading_1")
  })

  it("renders h2 as heading_2", async () => {
    const doc = Document({ children: Heading({ level: 2, children: "Sub" }) })
    const json = (await render(doc, "notion")) as string
    const parsed = JSON.parse(json)
    expect(parsed.children[0].type).toBe("heading_2")
  })

  it("renders h3+ as heading_3", async () => {
    const doc = Document({ children: Heading({ level: 4, children: "Sub" }) })
    const json = (await render(doc, "notion")) as string
    const parsed = JSON.parse(json)
    expect(parsed.children[0].type).toBe("heading_3")
  })

  it("renders text as paragraph", async () => {
    const doc = Document({ children: Text({ bold: true, children: "Bold" }) })
    const json = (await render(doc, "notion")) as string
    const parsed = JSON.parse(json)
    expect(parsed.children[0].type).toBe("paragraph")
    expect(parsed.children[0].paragraph.rich_text[0].annotations.bold).toBe(true)
  })

  it("renders table with header row", async () => {
    const doc = Document({
      children: Table({ columns: ["A", "B"], rows: [["1", "2"]] }),
    })
    const json = (await render(doc, "notion")) as string
    const parsed = JSON.parse(json)
    expect(parsed.children[0].type).toBe("table")
    expect(parsed.children[0].table.has_column_header).toBe(true)
  })

  it("renders bulleted list", async () => {
    const doc = Document({
      children: List({ children: [ListItem({ children: "a" })] }),
    })
    const json = (await render(doc, "notion")) as string
    const parsed = JSON.parse(json)
    expect(parsed.children[0].type).toBe("bulleted_list_item")
  })

  it("renders numbered list", async () => {
    const doc = Document({
      children: List({
        ordered: true,
        children: [ListItem({ children: "a" })],
      }),
    })
    const json = (await render(doc, "notion")) as string
    const parsed = JSON.parse(json)
    expect(parsed.children[0].type).toBe("numbered_list_item")
  })

  it("renders code block", async () => {
    const doc = Document({
      children: Code({ language: "python", children: "x = 1" }),
    })
    const json = (await render(doc, "notion")) as string
    const parsed = JSON.parse(json)
    expect(parsed.children[0].type).toBe("code")
    expect(parsed.children[0].code.language).toBe("python")
  })

  it("renders quote", async () => {
    const doc = Document({ children: Quote({ children: "wise" }) })
    const json = (await render(doc, "notion")) as string
    const parsed = JSON.parse(json)
    expect(parsed.children[0].type).toBe("quote")
  })

  it("renders divider", async () => {
    const doc = Document({ children: Divider() })
    const json = (await render(doc, "notion")) as string
    const parsed = JSON.parse(json)
    expect(parsed.children[0].type).toBe("divider")
  })

  it("renders image with URL", async () => {
    const doc = Document({ children: Image({ src: "https://x.com/img.png" }) })
    const json = (await render(doc, "notion")) as string
    const parsed = JSON.parse(json)
    expect(parsed.children[0].type).toBe("image")
  })

  it("renders link as paragraph with link", async () => {
    const doc = Document({
      children: Link({ href: "https://x.com", children: "X" }),
    })
    const json = (await render(doc, "notion")) as string
    const parsed = JSON.parse(json)
    expect(parsed.children[0].paragraph.rich_text[0].text.link.url).toBe("https://x.com")
  })

  it("builder toNotion works", async () => {
    const json = await createDocument().heading("Hi").toNotion()
    const parsed = JSON.parse(json)
    expect(parsed.children.length).toBeGreaterThan(0)
  })
})

// ─── Confluence/Jira Renderer ───────────────────────────────────────────────

describe("Confluence renderer", () => {
  it("renders ADF document", async () => {
    const doc = Document({ children: Heading({ children: "Title" }) })
    const json = (await render(doc, "confluence")) as string
    const adf = JSON.parse(json)
    expect(adf.version).toBe(1)
    expect(adf.type).toBe("doc")
    expect(adf.content[0].type).toBe("heading")
  })

  it("renders text with marks", async () => {
    const doc = Document({
      children: Text({ bold: true, italic: true, children: "styled" }),
    })
    const json = (await render(doc, "confluence")) as string
    const adf = JSON.parse(json)
    const marks = adf.content[0].content[0].marks
    expect(marks.some((m: any) => m.type === "strong")).toBe(true)
    expect(marks.some((m: any) => m.type === "em")).toBe(true)
  })

  it("renders table", async () => {
    const doc = Document({
      children: Table({ columns: ["A"], rows: [["1"]] }),
    })
    const json = (await render(doc, "confluence")) as string
    const adf = JSON.parse(json)
    expect(adf.content[0].type).toBe("table")
    expect(adf.content[0].content[0].content[0].type).toBe("tableHeader")
  })

  it("renders ordered list", async () => {
    const doc = Document({
      children: List({
        ordered: true,
        children: [ListItem({ children: "a" })],
      }),
    })
    const json = (await render(doc, "confluence")) as string
    const adf = JSON.parse(json)
    expect(adf.content[0].type).toBe("orderedList")
  })

  it("renders code block", async () => {
    const doc = Document({
      children: Code({ language: "java", children: "int x = 1;" }),
    })
    const json = (await render(doc, "confluence")) as string
    const adf = JSON.parse(json)
    expect(adf.content[0].type).toBe("codeBlock")
    expect(adf.content[0].attrs.language).toBe("java")
  })

  it("renders blockquote", async () => {
    const doc = Document({ children: Quote({ children: "wise" }) })
    const json = (await render(doc, "confluence")) as string
    const adf = JSON.parse(json)
    expect(adf.content[0].type).toBe("blockquote")
  })

  it("renders rule (divider)", async () => {
    const doc = Document({ children: Divider() })
    const json = (await render(doc, "confluence")) as string
    const adf = JSON.parse(json)
    expect(adf.content[0].type).toBe("rule")
  })

  it("renders link with href", async () => {
    const doc = Document({
      children: Link({ href: "https://x.com", children: "X" }),
    })
    const json = (await render(doc, "confluence")) as string
    const adf = JSON.parse(json)
    expect(adf.content[0].content[0].marks[0].attrs.href).toBe("https://x.com")
  })

  it("builder toConfluence works", async () => {
    const json = await createDocument().heading("Hi").toConfluence()
    const adf = JSON.parse(json)
    expect(adf.type).toBe("doc")
  })
})

// ─── WhatsApp Renderer ──────────────────────────────────────────────────────

describe("WhatsApp renderer", () => {
  it("renders heading as bold", async () => {
    const doc = Document({ children: Heading({ children: "Title" }) })
    const text = (await render(doc, "whatsapp")) as string
    expect(text).toContain("*Title*")
  })

  it("renders bold, italic, strikethrough", async () => {
    const doc = Document({
      children: [
        Text({ bold: true, children: "Bold" }),
        Text({ italic: true, children: "Italic" }),
        Text({ strikethrough: true, children: "Struck" }),
      ],
    })
    const text = (await render(doc, "whatsapp")) as string
    expect(text).toContain("*Bold*")
    expect(text).toContain("_Italic_")
    expect(text).toContain("~Struck~")
  })

  it("renders code as triple backticks", async () => {
    const doc = Document({ children: Code({ children: "x = 1" }) })
    const text = (await render(doc, "whatsapp")) as string
    expect(text).toContain("```x = 1```")
  })

  it("renders quote with >", async () => {
    const doc = Document({ children: Quote({ children: "wise" }) })
    const text = (await render(doc, "whatsapp")) as string
    expect(text).toContain("> wise")
  })

  it("renders link as text + URL", async () => {
    const doc = Document({
      children: Link({ href: "https://x.com", children: "X" }),
    })
    const text = (await render(doc, "whatsapp")) as string
    expect(text).toContain("X: https://x.com")
  })

  it("renders table", async () => {
    const doc = Document({
      children: Table({ columns: ["A", "B"], rows: [["1", "2"]] }),
    })
    const text = (await render(doc, "whatsapp")) as string
    expect(text).toContain("*A* | *B*")
    expect(text).toContain("1 | 2")
  })

  it("renders list", async () => {
    const doc = Document({
      children: List({ children: [ListItem({ children: "one" })] }),
    })
    const text = (await render(doc, "whatsapp")) as string
    expect(text).toContain("• one")
  })

  it("skips images", async () => {
    const doc = Document({ children: Image({ src: "https://x.com/img.png" }) })
    const text = (await render(doc, "whatsapp")) as string
    expect(text).toBe("")
  })

  it("builder toWhatsApp works", async () => {
    const text = await createDocument().heading("Hi").text("World").toWhatsApp()
    expect(text).toContain("*Hi*")
    expect(text).toContain("World")
  })
})

// ─── Google Chat Renderer ───────────────────────────────────────────────────

describe("Google Chat renderer", () => {
  it("renders card with header", async () => {
    const doc = Document({
      title: "Report",
      children: Text({ children: "Body" }),
    })
    const json = (await render(doc, "google-chat")) as string
    const card = JSON.parse(json)
    expect(card.cardsV2[0].card.header.title).toBe("Report")
  })

  it("renders heading as decorated text", async () => {
    const doc = Document({ children: Heading({ children: "Title" }) })
    const json = (await render(doc, "google-chat")) as string
    const card = JSON.parse(json)
    expect(card.cardsV2[0].card.sections[0].widgets[0].decoratedText.text).toContain("<b>Title</b>")
  })

  it("renders text paragraph", async () => {
    const doc = Document({ children: Text({ bold: true, children: "Bold" }) })
    const json = (await render(doc, "google-chat")) as string
    const card = JSON.parse(json)
    expect(card.cardsV2[0].card.sections[0].widgets[0].textParagraph.text).toContain("<b>Bold</b>")
  })

  it("renders button", async () => {
    const doc = Document({
      children: Button({ href: "/go", children: "Click" }),
    })
    const json = (await render(doc, "google-chat")) as string
    const card = JSON.parse(json)
    expect(card.cardsV2[0].card.sections[0].widgets[0].buttonList.buttons[0].text).toBe("Click")
  })

  it("renders divider", async () => {
    const doc = Document({ children: Divider() })
    const json = (await render(doc, "google-chat")) as string
    const card = JSON.parse(json)
    expect(card.cardsV2[0].card.sections[0].widgets[0].divider).toBeDefined()
  })

  it("renders image", async () => {
    const doc = Document({
      children: Image({ src: "https://x.com/img.png", alt: "Photo" }),
    })
    const json = (await render(doc, "google-chat")) as string
    const card = JSON.parse(json)
    expect(card.cardsV2[0].card.sections[0].widgets[0].image.imageUrl).toBe("https://x.com/img.png")
  })

  it("renders link", async () => {
    const doc = Document({
      children: Link({ href: "https://x.com", children: "X" }),
    })
    const json = (await render(doc, "google-chat")) as string
    const card = JSON.parse(json)
    expect(card.cardsV2[0].card.sections[0].widgets[0].textParagraph.text).toContain(
      'href="https://x.com"',
    )
  })

  it("renders list", async () => {
    const doc = Document({
      children: List({ children: [ListItem({ children: "one" })] }),
    })
    const json = (await render(doc, "google-chat")) as string
    const card = JSON.parse(json)
    expect(card.cardsV2[0].card.sections[0].widgets[0].textParagraph.text).toContain("• one")
  })

  it("uses first heading as title when no title prop", async () => {
    const doc = Document({
      children: [Heading({ children: "Auto Title" }), Text({ children: "body" })],
    })
    const json = (await render(doc, "google-chat")) as string
    const card = JSON.parse(json)
    expect(card.cardsV2[0].card.header.title).toBe("Auto Title")
  })

  it("builder toGoogleChat works", async () => {
    const json = await createDocument({ title: "Hi" }).text("World").toGoogleChat()
    const card = JSON.parse(json)
    expect(card.cardsV2[0].card.header.title).toBe("Hi")
  })
})

describe("builder toSlack", () => {
  it("renders to Slack JSON", async () => {
    const result = await createDocument().heading("Hi").text("World").toSlack()
    const parsed = JSON.parse(result)
    expect(parsed.blocks).toHaveLength(2)
    expect(parsed.blocks[0].type).toBe("header")
    expect(parsed.blocks[1].type).toBe("section")
  })
})

// ─── Builder .add() and .section() ──────────────────────────────────────────

describe("builder .add() and .section()", () => {
  // build() wraps sections in Document({ children: [Page({ children: sections })] })
  // so actual content nodes are inside the page's children
  function getPageChildren(doc: ReturnType<typeof createDocument>) {
    const node = doc.build()
    expect(node.type).toBe("document")
    const page = node.children[0]!
    expect(typeof page !== "string" && page.type).toBe("page")
    return typeof page !== "string" ? page.children : []
  }

  it("add() with a single node adds it to the document", () => {
    const doc = createDocument().add(Text({ children: "hello" }))
    const children = getPageChildren(doc)
    expect(children).toHaveLength(1)
    const child = children[0]!
    expect(typeof child !== "string" && child.type).toBe("text")
  })

  it("add() with an array adds multiple nodes", () => {
    const doc = createDocument().add([Heading({ children: "a" }), Text({ children: "b" })])
    const children = getPageChildren(doc)
    expect(children).toHaveLength(2)
    const first = children[0]!
    const second = children[1]!
    expect(typeof first !== "string" && first.type).toBe("heading")
    expect(typeof second !== "string" && second.type).toBe("text")
  })

  it("section() wraps children in a Section node", () => {
    const doc = createDocument().section([Text({ children: "a" }), Text({ children: "b" })])
    const children = getPageChildren(doc)
    expect(children).toHaveLength(1)
    const section = children[0]!
    expect(typeof section !== "string" && section.type).toBe("section")
    if (typeof section !== "string") {
      expect(section.children).toHaveLength(2)
    }
  })
})
