import { db } from "../db/connection.js";
import { buildCsvText, parseCsvWithValidation, parseTags } from "../utils/csv.js";
import { CSV_COLUMNS } from "../types/domain.js";
import { nowIso } from "../utils/time.js";
import { createCaseWithVersion, createVersionForCase, findCaseBySuiteAndTitle, getOrCreateSuite } from "./caseService.js";

type CsvRowWithMeta = {
  rowNumber: number;
  row: Record<string, string>;
};

function toNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function validateGroupedPreviewRows(
  rows: Array<{ rowNumber: number; status: "success" | "fail"; errorMessage?: string; row: Record<string, string> }>,
): Array<{ rowNumber: number; status: "success" | "fail"; errorMessage?: string; row: Record<string, string> }> {
  const next = rows.map((item) => ({ ...item }));

  const markFail = (index: number, message: string): void => {
    if (next[index].status === "fail") return;
    next[index] = {
      ...next[index],
      status: "fail",
      errorMessage: message,
    };
  };

  const groups = new Map<string, number[]>();
  for (let i = 0; i < next.length; i += 1) {
    if (next[i].status !== "success") continue;
    const suite = String(next[i].row.suite || "").trim();
    const title = String(next[i].row.case_title || "").trim();
    const key = `${suite}||${title}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(i);
    groups.set(key, bucket);
  }

  for (const rowIndexes of groups.values()) {
    const stepBuckets = new Map<number, number[]>();
    for (const index of rowIndexes) {
      const stepNo = toNumber(next[index].row.step_no);
      if (!Number.isInteger(stepNo) || stepNo <= 0) {
        markFail(index, "step_no must be a positive integer");
        continue;
      }
      const bucket = stepBuckets.get(stepNo) ?? [];
      bucket.push(index);
      stepBuckets.set(stepNo, bucket);
    }

    for (const [stepNo, indexes] of stepBuckets.entries()) {
      if (indexes.length <= 1) continue;
      for (const index of indexes) {
        markFail(index, `duplicate step_no (${stepNo}) in same suite + case_title group`);
      }
    }
  }

  return next;
}

export function previewImport(csvText: string): {
  columnsOk: boolean;
  missingColumns: string[];
  totalRows: number;
  successCount: number;
  failCount: number;
  rows: Array<{ rowNumber: number; status: "success" | "fail"; errorMessage?: string; row: Record<string, string> }>;
} {
  const parsed = parseCsvWithValidation(csvText);
  const validatedRows = validateGroupedPreviewRows(parsed.preview);
  const successCount = validatedRows.filter((row) => row.status === "success").length;
  const failCount = validatedRows.length - successCount;

  return {
    columnsOk: parsed.columnsOk,
    missingColumns: parsed.missingColumns,
    totalRows: validatedRows.length,
    successCount,
    failCount,
    rows: validatedRows,
  };
}

export function executeImport(params: {
  projectId: number;
  fileName: string;
  csvText: string;
  userId: number | null;
}): {
  importLogId: number;
  totalRows: number;
  successCount: number;
  failCount: number;
} {
  const parsed = parseCsvWithValidation(params.csvText);
  const validatedRows = validateGroupedPreviewRows(parsed.preview);

  const importLog = db
    .prepare(
      `INSERT INTO import_logs(file_name, total_rows, success_count, fail_count, created_at, created_by)
       VALUES (?, ?, 0, 0, ?, ?)`,
    )
    .run(params.fileName || "import.csv", validatedRows.length, nowIso(), params.userId);
  const importLogId = Number(importLog.lastInsertRowid);

  const logRowStmt = db.prepare(
    `INSERT INTO import_log_rows(import_log_id, row_number, status, error_message)
     VALUES (?, ?, ?, ?)`,
  );

  const validRows: CsvRowWithMeta[] = [];
  let successCount = 0;
  let failCount = 0;

  for (const previewRow of validatedRows) {
    if (previewRow.status === "fail") {
      logRowStmt.run(importLogId, previewRow.rowNumber, "fail", previewRow.errorMessage || "Validation failed");
      failCount += 1;
      continue;
    }
    validRows.push({ rowNumber: previewRow.rowNumber, row: previewRow.row });
  }

  const grouped = new Map<string, CsvRowWithMeta[]>();
  for (const item of validRows) {
    const suite = item.row.suite.trim();
    const title = item.row.case_title.trim();
    const key = `${suite}||${title}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }

  for (const items of grouped.values()) {
    const first = items[0].row;
    try {
      const suiteId = getOrCreateSuite(params.projectId, first.suite);
      const existing = findCaseBySuiteAndTitle(suiteId, first.case_title.trim());

      const steps = items
        .map((item) => ({
          stepNo: toNumber(item.row.step_no),
          action: item.row.test_step,
          inputData: item.row.input_data,
          expectedResult: item.row.expected_result,
        }))
        .sort((a, b) => a.stepNo - b.stepNo);

      const allTags = Array.from(
        new Set(
          items
            .flatMap((item) => parseTags(item.row.tags))
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      );

      if (existing) {
        createVersionForCase(
          existing.id,
          {
            projectId: existing.project_id,
            suiteId,
            title: first.case_title.trim(),
            qualityAttribute: first.quality_attribute,
            categoryLarge: first.category_large,
            categoryMedium: first.category_medium,
            preconditions: first.preconditions,
            priority: first.priority || "Medium",
            tags: allTags,
            steps,
          },
          params.userId,
        );
      } else {
        createCaseWithVersion({
          projectId: params.projectId,
          suiteId,
          title: first.case_title.trim(),
          qualityAttribute: first.quality_attribute,
          categoryLarge: first.category_large,
          categoryMedium: first.category_medium,
          preconditions: first.preconditions,
          priority: first.priority || "Medium",
          tags: allTags,
          steps,
          createdBy: params.userId,
        });
      }

      for (const item of items) {
        logRowStmt.run(importLogId, item.rowNumber, "success", null);
        successCount += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_import_error";
      for (const item of items) {
        logRowStmt.run(importLogId, item.rowNumber, "fail", message);
        failCount += 1;
      }
    }
  }

  db.prepare(`UPDATE import_logs SET success_count = ?, fail_count = ? WHERE id = ?`).run(
    successCount,
    failCount,
    importLogId,
  );

  return {
    importLogId,
    totalRows: validatedRows.length,
    successCount,
    failCount,
  };
}

export function listImportLogs(): Array<{
  id: number;
  fileName: string;
  totalRows: number;
  successCount: number;
  failCount: number;
  createdAt: string;
}> {
  const rows = db
    .prepare(
      `SELECT id, file_name, total_rows, success_count, fail_count, created_at
       FROM import_logs
       ORDER BY id DESC`,
    )
    .all() as Array<{
    id: number;
    file_name: string;
    total_rows: number;
    success_count: number;
    fail_count: number;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    fileName: row.file_name,
    totalRows: row.total_rows,
    successCount: row.success_count,
    failCount: row.fail_count,
    createdAt: row.created_at,
  }));
}

export function listImportLogRows(importLogId: number): Array<{
  id: number;
  rowNumber: number;
  status: "success" | "fail";
  errorMessage: string | null;
}> {
  const rows = db
    .prepare(
      `SELECT id, row_number, status, error_message
       FROM import_log_rows
       WHERE import_log_id = ?
       ORDER BY row_number ASC`,
    )
    .all(importLogId) as Array<{ id: number; row_number: number; status: "success" | "fail"; error_message: string | null }>;

  return rows.map((row) => ({
    id: row.id,
    rowNumber: row.row_number,
    status: row.status,
    errorMessage: row.error_message,
  }));
}

export function deleteImportLog(importLogId: number): void {
  db.prepare(`DELETE FROM import_logs WHERE id = ?`).run(importLogId);
}

export function clearImportLogs(): void {
  db.prepare(`DELETE FROM import_logs`).run();
}

function parseTagJson(rawTags: string): string[] {
  try {
    const parsed = JSON.parse(rawTags || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function exportCasesCsv(params: { projectId: number; suiteId?: number }): string {
  const where = params.suiteId ? `WHERE c.project_id = ? AND c.suite_id = ?` : `WHERE c.project_id = ?`;
  const queryParams = params.suiteId ? [params.projectId, params.suiteId] : [params.projectId];

  const rows = db
    .prepare(
      `SELECT s.name AS suite_name,
              c.quality_attribute,
              c.category_large,
              c.category_medium,
              c.title AS case_title,
              c.preconditions,
              ts.step_no,
              ts.action AS test_step,
              ts.input_data,
              ts.expected_result,
              c.priority,
              c.tags
       FROM test_cases c
       JOIN suites s ON s.id = c.suite_id
       LEFT JOIN test_steps ts ON ts.case_version_id = c.current_version_id
       ${where}
       ORDER BY s.name ASC, c.title ASC, ts.step_no ASC`,
    )
    .all(...queryParams) as Array<{
    suite_name: string;
    quality_attribute: string;
    category_large: string;
    category_medium: string;
    case_title: string;
    preconditions: string;
    step_no: number | null;
    test_step: string | null;
    input_data: string | null;
    expected_result: string | null;
    priority: string;
    tags: string;
  }>;

  const csvRows = rows.map((row) => ({
    suite: row.suite_name,
    quality_attribute: row.quality_attribute ?? "",
    category_large: row.category_large ?? "",
    category_medium: row.category_medium ?? "",
    case_title: row.case_title ?? "",
    preconditions: row.preconditions ?? "",
    step_no: row.step_no ?? "",
    test_step: row.test_step ?? "",
    input_data: row.input_data ?? "",
    expected_result: row.expected_result ?? "",
    priority: row.priority ?? "Medium",
    tags: parseTagJson(row.tags).join(","),
  }));

  return buildCsvText(CSV_COLUMNS, csvRows);
}
