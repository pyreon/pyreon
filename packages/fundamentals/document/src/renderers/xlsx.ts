import type { DocChild, DocNode, DocumentRenderer, RenderOptions, TableColumn } from "../types";

/**
 * XLSX renderer — lazy-loads ExcelJS on first use.
 * Extracts tables from the document and renders each as a worksheet.
 * Non-table content (headings, text) becomes header rows.
 */

function resolveColumn(col: string | TableColumn): TableColumn {
  return typeof col === "string" ? { header: col } : col;
}

function getTextContent(children: DocChild[]): string {
  return children
    .map((c) => (typeof c === "string" ? c : getTextContent((c as DocNode).children)))
    .join("");
}

interface ExtractedSheet {
  name: string;
  headings: string[];
  tables: DocNode[];
}

/** Walk the tree and group content into sheets (one per page, or one global). */
function extractSheets(node: DocNode): ExtractedSheet[] {
  const sheets: ExtractedSheet[] = [];
  let currentSheet: ExtractedSheet = {
    name: "Sheet 1",
    headings: [],
    tables: [],
  };

  function walk(n: DocNode): void {
    switch (n.type) {
      case "document":
        walkChildren(n);
        break;

      case "page":
        pushCurrentSheet();
        currentSheet = {
          name: `Sheet ${sheets.length + 1}`,
          headings: [],
          tables: [],
        };
        walkChildren(n);
        break;

      case "heading":
        addHeading(n);
        break;

      case "table":
        currentSheet.tables.push(n);
        break;

      default:
        walkChildren(n);
    }
  }

  function walkChildren(n: DocNode): void {
    for (const child of n.children) {
      if (typeof child !== "string") walk(child);
    }
  }

  function pushCurrentSheet(): void {
    if (currentSheet.tables.length > 0 || currentSheet.headings.length > 0) {
      sheets.push(currentSheet);
    }
  }

  function addHeading(n: DocNode): void {
    const text = getTextContent(n.children);
    currentSheet.headings.push(text);
    if (currentSheet.headings.length === 1) {
      currentSheet.name = text.slice(0, 31); // Excel sheet name max 31 chars
    }
  }

  walk(node);
  pushCurrentSheet();

  return sheets;
}

/** Parse a cell value, handling currencies, percentages, and plain numbers. */
function parseCellValue(value: string | number | undefined): string | number {
  if (value == null) return "";
  if (typeof value === "number") return value;

  const trimmed = value.trim();

  // Percentage: "45%" or "12.5%"
  if (/^-?\d+(\.\d+)?%$/.test(trimmed)) {
    return Number.parseFloat(trimmed) / 100;
  }

  // Currency: "$1,234.56", "$1234", "-$500"
  const currencyMatch = trimmed.match(/^-?\$[\d,]+(\.\d+)?$/);
  if (currencyMatch) {
    return Number.parseFloat(trimmed.replace(/[$,]/g, ""));
  }

  // Plain number: "1,234.56", "1234", "-500.5"
  const plainNum = Number(trimmed.replace(/,/g, ""));
  if (!Number.isNaN(plainNum) && /^-?[\d,]+(\.\d+)?$/.test(trimmed)) {
    return plainNum;
  }

  return value;
}

/** Get ExcelJS number format string for a value. */
function getCellFormat(originalValue: string | number | undefined): string | undefined {
  if (typeof originalValue !== "string") return undefined;
  const trimmed = originalValue.trim();

  if (/^-?\d+(\.\d+)?%$/.test(trimmed)) return "0.00%";
  if (/^-?\$/.test(trimmed)) return "$#,##0.00";
  return undefined;
}

/** Map alignment string to ExcelJS horizontal alignment. */
function mapAlignment(align?: string): "left" | "center" | "right" | undefined {
  if (align === "left" || align === "center" || align === "right") return align;
  return undefined;
}

/** Thin border style for ExcelJS. */
function thinBorder(): { style: "thin"; color: { argb: string } } {
  return { style: "thin", color: { argb: "FFDDDDDD" } };
}

/** Apply header styling to a cell. */
function styleHeaderCell(
  cell: {
    font: unknown;
    fill: unknown;
    alignment: unknown;
    border: unknown;
    value: unknown;
  },
  col: TableColumn,
  hs: { background?: string; color?: string } | undefined,
  bordered: boolean,
): void {
  cell.value = col.header;
  cell.font = {
    bold: true,
    color: { argb: hs?.color?.replace("#", "FF") ?? "FF000000" },
  };
  if (hs?.background) {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: hs.background.replace("#", "FF") },
    };
  }
  cell.alignment = { horizontal: mapAlignment(col.align) ?? "left" };
  if (bordered) {
    cell.border = {
      top: thinBorder(),
      bottom: thinBorder(),
      left: thinBorder(),
      right: thinBorder(),
    };
  }
}

/** Apply data cell value and styling. */
function styleDataCell(
  cell: {
    value: unknown;
    numFmt: unknown;
    alignment: unknown;
    fill: unknown;
    border: unknown;
  },
  rawValue: string | number | undefined,
  col: TableColumn,
  striped: boolean,
  isOddRow: boolean,
  bordered: boolean,
): void {
  cell.value = parseCellValue(rawValue);
  const fmt = getCellFormat(rawValue);
  if (fmt) cell.numFmt = fmt;
  cell.alignment = { horizontal: mapAlignment(col.align) ?? "left" };
  if (striped && isOddRow) {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF9F9F9" },
    };
  }
  if (bordered) {
    cell.border = {
      top: thinBorder(),
      bottom: thinBorder(),
      left: thinBorder(),
      right: thinBorder(),
    };
  }
}

/** Render a single table node into the worksheet starting at the given row. Returns the next row number. */
function renderTable(
  ws: {
    getRow: (n: number) => { getCell: (n: number) => Record<string, unknown> };
    columns: unknown[];
  },
  tableNode: DocNode,
  startRow: number,
): number {
  let rowNum = startRow;
  const columns = ((tableNode.props.columns ?? []) as (string | TableColumn)[]).map(resolveColumn);
  const rows = (tableNode.props.rows ?? []) as (string | number)[][];
  const hs = tableNode.props.headerStyle as { background?: string; color?: string } | undefined;
  const bordered = (tableNode.props.bordered as boolean) ?? false;

  // Caption
  if (tableNode.props.caption) {
    const captionRow = ws.getRow(rowNum);
    const captionCell = captionRow.getCell(1);
    captionCell.value = tableNode.props.caption as string;
    captionCell.font = { italic: true, size: 10 };
    rowNum++;
  }

  // Header row
  const headerRow = ws.getRow(rowNum);
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    if (!col) continue;
    styleHeaderCell(headerRow.getCell(i + 1) as any, col, hs, bordered);
  }
  rowNum++;

  // Data rows
  for (let r = 0; r < rows.length; r++) {
    const dataRow = ws.getRow(rowNum);
    for (let c = 0; c < columns.length; c++) {
      const col = columns[c];
      if (!col) continue;
      styleDataCell(
        dataRow.getCell(c + 1) as any,
        rows[r]?.[c],
        col,
        (tableNode.props.striped as boolean) ?? false,
        r % 2 === 1,
        bordered,
      );
    }
    rowNum++;
  }

  return rowNum + 1; // gap after table
}

/** Auto-fit column widths based on content. */
function autoFitColumns(ws: {
  columns: {
    width: number;
    eachCell?: (opts: { includeEmpty: boolean }, cb: (cell: { value: unknown }) => void) => void;
  }[];
}): void {
  for (const col of ws.columns) {
    let maxLen = 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? "").length;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(maxLen + 2, 50);
  }
}

export const xlsxRenderer: DocumentRenderer = {
  async render(node: DocNode, _options?: RenderOptions): Promise<Uint8Array> {
    let ExcelJS: any;
    try {
      ExcelJS = await import("exceljs");
    } catch {
      throw new Error(
        '[@pyreon/document] XLSX renderer requires "exceljs" package. Install it: bun add exceljs',
      );
    }
    const workbook = new ExcelJS.default.Workbook();

    workbook.creator = (node.props.author as string) ?? "";
    workbook.title = (node.props.title as string) ?? "";

    const sheets = extractSheets(node);

    if (sheets.length === 0) {
      workbook.addWorksheet("Sheet 1");
    }

    for (const sheet of sheets) {
      const ws = workbook.addWorksheet(sheet.name);

      let rowNum = 1;

      // Add headings as title rows
      for (const heading of sheet.headings) {
        const row = ws.getRow(rowNum);
        row.getCell(1).value = heading;
        row.getCell(1).font = { bold: true, size: 14 };
        rowNum++;
      }

      if (sheet.headings.length > 0) rowNum++; // gap after headings

      // Add tables
      for (const tableNode of sheet.tables) {
        rowNum = renderTable(ws as unknown as Parameters<typeof renderTable>[0], tableNode, rowNum);
      }

      // Auto-fit columns (approximate)
      autoFitColumns(ws as unknown as Parameters<typeof autoFitColumns>[0]);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new Uint8Array(buffer as ArrayBuffer);
  },
};
