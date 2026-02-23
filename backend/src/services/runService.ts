import { db } from "../db/connection.js";
import { getCaseVersion } from "./caseService.js";
import { nowIso } from "../utils/time.js";
import type { StepExecutionStatus } from "../types/domain.js";

function calcOverallStatus(statuses: StepExecutionStatus[]): StepExecutionStatus {
  if (!statuses.length) return "untested";
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("blocked")) return "blocked";
  if (statuses.every((status) => status === "pass")) return "pass";
  if (statuses.every((status) => status === "untested")) return "untested";
  return "blocked";
}

export function createRun(params: {
  projectId: number;
  name: string;
  releaseVersion?: string;
  createdBy: number | null;
  caseIds: number[];
}): { runId: number } {
  const tx = db.transaction(() => {
    const runRes = db
      .prepare(
        `INSERT INTO test_runs(project_id, name, release_version, created_by, created_at, status)
         VALUES (?, ?, ?, ?, ?, 'open')`,
      )
      .run(params.projectId, params.name, params.releaseVersion ?? "", params.createdBy, nowIso());

    const runId = Number(runRes.lastInsertRowid);

    const caseRows = db
      .prepare(`SELECT id, current_version_id FROM test_cases WHERE project_id = ? AND id IN (${params.caseIds.map(() => "?").join(",")})`)
      .all(params.projectId, ...params.caseIds) as Array<{ id: number; current_version_id: number | null }>;

    const insertRunCase = db.prepare(
      `INSERT INTO test_run_cases(run_id, case_id, case_version_id, status)
       VALUES (?, ?, ?, 'untested')`,
    );

    for (const row of caseRows) {
      if (!row.current_version_id) continue;
      insertRunCase.run(runId, row.id, row.current_version_id);
    }

    return { runId };
  });

  return tx();
}

export function listRuns(projectId: number): Array<{
  id: number;
  projectId: number;
  name: string;
  releaseVersion: string;
  createdBy: number | null;
  createdAt: string;
  status: "open" | "closed";
  caseCount: number;
}> {
  const rows = db
    .prepare(
      `SELECT r.id, r.project_id, r.name, r.release_version, r.created_by, r.created_at, r.status,
              COUNT(rc.id) as case_count
       FROM test_runs r
       LEFT JOIN test_run_cases rc ON rc.run_id = r.id
       WHERE r.project_id = ?
       GROUP BY r.id
       ORDER BY r.id DESC`,
    )
    .all(projectId) as Array<{
    id: number;
    project_id: number;
    name: string;
    release_version: string;
    created_by: number | null;
    created_at: string;
    status: "open" | "closed";
    case_count: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    releaseVersion: row.release_version,
    createdBy: row.created_by,
    createdAt: row.created_at,
    status: row.status,
    caseCount: row.case_count,
  }));
}

export function updateRunStatus(runId: number, status: "open" | "closed"): void {
  db.prepare(`UPDATE test_runs SET status = ? WHERE id = ?`).run(status, runId);
}

export function updateRun(runId: number, params: { name: string; releaseVersion: string }): void {
  db.prepare(`UPDATE test_runs SET name = ?, release_version = ? WHERE id = ?`).run(
    params.name.trim(),
    params.releaseVersion.trim(),
    runId,
  );
}

export function deleteRun(runId: number): void {
  db.prepare(`DELETE FROM test_runs WHERE id = ?`).run(runId);
}

export function getRunDetail(runId: number): {
  run: {
    id: number;
    projectId: number;
    name: string;
    releaseVersion: string;
    status: "open" | "closed";
    createdBy: number | null;
    createdAt: string;
  };
  cases: Array<{
    id: number;
    runId: number;
    caseId: number;
    caseVersionId: number;
    status: StepExecutionStatus;
    caseTitle: string;
    priority: string;
    versionNo: number;
    resultComment: string | null;
    executedAt: string | null;
  }>;
} | null {
  const runRow = db
    .prepare(`SELECT id, project_id, name, release_version, status, created_by, created_at FROM test_runs WHERE id = ?`)
    .get(runId) as
    | {
        id: number;
        project_id: number;
        name: string;
        release_version: string;
        status: "open" | "closed";
        created_by: number | null;
        created_at: string;
      }
    | undefined;

  if (!runRow) return null;

  const caseRows = db
    .prepare(
      `SELECT rc.id, rc.run_id, rc.case_id, rc.case_version_id, rc.status,
              c.title as case_title, c.priority,
              v.version_no,
              tr.comment as result_comment,
              tr.executed_at
       FROM test_run_cases rc
       JOIN test_cases c ON c.id = rc.case_id
       JOIN test_case_versions v ON v.id = rc.case_version_id
       LEFT JOIN test_results tr ON tr.run_case_id = rc.id
       WHERE rc.run_id = ?
       ORDER BY rc.id ASC`,
    )
    .all(runId) as Array<{
    id: number;
    run_id: number;
    case_id: number;
    case_version_id: number;
    status: StepExecutionStatus;
    case_title: string;
    priority: string;
    version_no: number;
    result_comment: string | null;
    executed_at: string | null;
  }>;

  return {
    run: {
      id: runRow.id,
      projectId: runRow.project_id,
      name: runRow.name,
      releaseVersion: runRow.release_version,
      status: runRow.status,
      createdBy: runRow.created_by,
      createdAt: runRow.created_at,
    },
    cases: caseRows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      caseId: row.case_id,
      caseVersionId: row.case_version_id,
      status: row.status,
      caseTitle: row.case_title,
      priority: row.priority,
      versionNo: row.version_no,
      resultComment: row.result_comment,
      executedAt: row.executed_at,
    })),
  };
}

export function getRunCaseExecution(runCaseId: number): {
  runCase: {
    id: number;
    runId: number;
    caseId: number;
    caseVersionId: number;
    status: StepExecutionStatus;
  };
  snapshot: ReturnType<typeof getCaseVersion>;
  result: {
    id: number;
    overallStatus: StepExecutionStatus;
    comment: string;
    executedBy: number | null;
    executedAt: string;
    stepResults: Array<{ stepNo: number; status: StepExecutionStatus; comment: string }>;
  } | null;
} | null {
  const runCase = db
    .prepare(`SELECT id, run_id, case_id, case_version_id, status FROM test_run_cases WHERE id = ?`)
    .get(runCaseId) as
    | { id: number; run_id: number; case_id: number; case_version_id: number; status: StepExecutionStatus }
    | undefined;

  if (!runCase) return null;

  const snapshot = getCaseVersion(runCase.case_version_id);
  if (!snapshot) return null;

  const resultRow = db
    .prepare(`SELECT id, overall_status, comment, executed_by, executed_at FROM test_results WHERE run_case_id = ?`)
    .get(runCaseId) as
    | { id: number; overall_status: StepExecutionStatus; comment: string; executed_by: number | null; executed_at: string }
    | undefined;

  let result = null;
  if (resultRow) {
    const stepRows = db
      .prepare(`SELECT step_no, status, comment FROM test_step_results WHERE result_id = ? ORDER BY step_no ASC`)
      .all(resultRow.id) as Array<{ step_no: number; status: StepExecutionStatus; comment: string }>;

    result = {
      id: resultRow.id,
      overallStatus: resultRow.overall_status,
      comment: resultRow.comment || "",
      executedBy: resultRow.executed_by,
      executedAt: resultRow.executed_at,
      stepResults: stepRows.map((row) => ({ stepNo: row.step_no, status: row.status, comment: row.comment || "" })),
    };
  }

  return {
    runCase: {
      id: runCase.id,
      runId: runCase.run_id,
      caseId: runCase.case_id,
      caseVersionId: runCase.case_version_id,
      status: runCase.status,
    },
    snapshot,
    result,
  };
}

export function saveRunCaseResult(params: {
  runCaseId: number;
  executedBy: number | null;
  comment?: string;
  stepResults: Array<{ stepNo: number; status: StepExecutionStatus; comment?: string }>;
}): { overallStatus: StepExecutionStatus; resultId: number } {
  const statuses = params.stepResults.map((r) => r.status);
  const overallStatus = calcOverallStatus(statuses);

  const tx = db.transaction(() => {
    const existing = db
      .prepare(`SELECT id FROM test_results WHERE run_case_id = ?`)
      .get(params.runCaseId) as { id: number } | undefined;

    let resultId: number;
    if (existing) {
      resultId = existing.id;
      db.prepare(
        `UPDATE test_results
         SET overall_status = ?, comment = ?, executed_by = ?, executed_at = ?
         WHERE id = ?`,
      ).run(overallStatus, params.comment ?? "", params.executedBy, nowIso(), resultId);
      db.prepare(`DELETE FROM test_step_results WHERE result_id = ?`).run(resultId);
    } else {
      const inserted = db
        .prepare(
          `INSERT INTO test_results(run_case_id, overall_status, comment, executed_by, executed_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(params.runCaseId, overallStatus, params.comment ?? "", params.executedBy, nowIso());
      resultId = Number(inserted.lastInsertRowid);
    }

    const insertStep = db.prepare(
      `INSERT INTO test_step_results(result_id, step_no, status, comment)
       VALUES (?, ?, ?, ?)`,
    );

    for (const step of params.stepResults) {
      insertStep.run(resultId, step.stepNo, step.status, step.comment ?? "");
    }

    db.prepare(`UPDATE test_run_cases SET status = ? WHERE id = ?`).run(overallStatus, params.runCaseId);

    return { overallStatus, resultId };
  });

  return tx();
}

export function reportSummary(projectId: number): {
  totalRunCases: number;
  untested: number;
  pass: number;
  fail: number;
  blocked: number;
  completionRate: number;
} {
  const rows = db
    .prepare(
      `SELECT rc.status, COUNT(*) as cnt
       FROM test_run_cases rc
       JOIN test_runs r ON r.id = rc.run_id
       WHERE r.project_id = ?
       GROUP BY rc.status`,
    )
    .all(projectId) as Array<{ status: StepExecutionStatus; cnt: number }>;

  const totals = { untested: 0, pass: 0, fail: 0, blocked: 0 };
  for (const row of rows) {
    totals[row.status] = row.cnt;
  }

  const totalRunCases = totals.untested + totals.pass + totals.fail + totals.blocked;
  const completionRate = totalRunCases ? Math.round(((totals.pass + totals.fail + totals.blocked) / totalRunCases) * 100) : 0;

  return {
    totalRunCases,
    untested: totals.untested,
    pass: totals.pass,
    fail: totals.fail,
    blocked: totals.blocked,
    completionRate,
  };
}

export function reportFailures(projectId: number): Array<{
  runId: number;
  runName: string;
  runCaseId: number;
  caseId: number;
  caseTitle: string;
  priority: string;
  comment: string;
}> {
  const rows = db
    .prepare(
      `SELECT r.id as run_id, r.name as run_name, rc.id as run_case_id, c.id as case_id, c.title as case_title,
              c.priority, COALESCE(tr.comment, '') as comment
       FROM test_run_cases rc
       JOIN test_runs r ON r.id = rc.run_id
       JOIN test_cases c ON c.id = rc.case_id
       LEFT JOIN test_results tr ON tr.run_case_id = rc.id
       WHERE r.project_id = ? AND rc.status = 'fail'
       ORDER BY rc.id DESC`,
    )
    .all(projectId) as Array<{
    run_id: number;
    run_name: string;
    run_case_id: number;
    case_id: number;
    case_title: string;
    priority: string;
    comment: string;
  }>;

  return rows.map((row) => ({
    runId: row.run_id,
    runName: row.run_name,
    runCaseId: row.run_case_id,
    caseId: row.case_id,
    caseTitle: row.case_title,
    priority: row.priority,
    comment: row.comment,
  }));
}

export function reportPriority(projectId: number): Array<{ priority: string; count: number }> {
  const rows = db
    .prepare(
      `SELECT priority, COUNT(*) as cnt
       FROM test_cases
       WHERE project_id = ?
       GROUP BY priority
       ORDER BY cnt DESC`,
    )
    .all(projectId) as Array<{ priority: string; cnt: number }>;

  return rows.map((row) => ({ priority: row.priority, count: row.cnt }));
}
