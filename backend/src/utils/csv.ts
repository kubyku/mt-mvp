import { parse } from "csv-parse/sync";
import { CSV_COLUMNS, type ImportPreviewRow } from "../types/domain.js";

type CsvParseResult = {
  rows: Array<Record<string, string>>;
  preview: ImportPreviewRow[];
  columnsOk: boolean;
  missingColumns: string[];
};

function normalizeRecord(record: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(record)) {
    normalized[String(k).trim()] = String(v ?? "").trim();
  }
  return normalized;
}

export function parseCsvWithValidation(csvText: string): CsvParseResult {
  const raw = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Array<Record<string, unknown>>;

  const rows = raw.map(normalizeRecord);
  const headerSet = new Set<string>(rows.length ? Object.keys(rows[0]) : []);
  const missingColumns = CSV_COLUMNS.filter((col) => !headerSet.has(col));
  const columnsOk = missingColumns.length === 0;

  const preview: ImportPreviewRow[] = rows.map((row, index) => {
    const rowNumber = index + 2;
    const required = ["suite", "case_title", "step_no", "test_step", "expected_result"];
    const missing = required.filter((field) => !String(row[field] || "").trim());
    const stepNo = Number(row.step_no);

    if (missing.length) {
      return {
        rowNumber,
        row,
        status: "fail",
        errorMessage: `Missing required fields: ${missing.join(", ")}`,
      };
    }

    if (!Number.isFinite(stepNo)) {
      return {
        rowNumber,
        row,
        status: "fail",
        errorMessage: "step_no must be a number",
      };
    }

    return {
      rowNumber,
      row,
      status: columnsOk ? "success" : "fail",
      errorMessage: columnsOk ? undefined : `Missing columns: ${missingColumns.join(", ")}`,
    };
  });

  return { rows, preview, columnsOk, missingColumns };
}

export function parseTags(rawTags: string): string[] {
  return String(rawTags || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeCsvCell(value: unknown): string {
  const normalized = String(value ?? "");
  if (/[",\n\r]/.test(normalized)) {
    return `"${normalized.replace(/"/g, "\"\"")}"`;
  }
  return normalized;
}

export function buildCsvText(columns: readonly string[], rows: Array<Record<string, unknown>>): string {
  const header = columns.join(",");
  if (!rows.length) return `${header}\n`;

  const body = rows
    .map((row) => columns.map((column) => escapeCsvCell(row[column])).join(","))
    .join("\n");

  return `${header}\n${body}\n`;
}
