import { db } from "../db/connection.js";
import { nowIso } from "../utils/time.js";
import type { CaseSnapshot, CaseUpsertInput, StepSnapshot } from "../types/domain.js";

function normalizeSteps(steps: StepSnapshot[]): StepSnapshot[] {
  return steps
    .map((step) => ({
      stepNo: Number(step.stepNo),
      action: String(step.action || "").trim(),
      inputData: String(step.inputData || "").trim(),
      expectedResult: String(step.expectedResult || "").trim(),
    }))
    .filter((step) => Number.isFinite(step.stepNo))
    .sort((a, b) => a.stepNo - b.stepNo);
}

function getSuiteName(suiteId: number): string {
  const row = db.prepare(`SELECT name FROM suites WHERE id = ?`).get(suiteId) as { name: string } | undefined;
  return row?.name ?? "Unknown Suite";
}

function buildSnapshot(caseId: number, input: CaseUpsertInput): CaseSnapshot {
  const steps = normalizeSteps(input.steps);
  return {
    caseId,
    title: input.title,
    qualityAttribute: input.qualityAttribute ?? "",
    categoryLarge: input.categoryLarge ?? "",
    categoryMedium: input.categoryMedium ?? "",
    preconditions: input.preconditions ?? "",
    priority: input.priority ?? "Medium",
    tags: input.tags ?? [],
    suiteId: input.suiteId,
    suiteName: getSuiteName(input.suiteId),
    projectId: input.projectId,
    steps,
  };
}

function nextVersionNo(caseId: number): number {
  const row = db.prepare(`SELECT COALESCE(MAX(version_no), 0) as maxNo FROM test_case_versions WHERE case_id = ?`).get(caseId) as {
    maxNo: number;
  };
  return Number(row.maxNo) + 1;
}

function insertVersion(caseId: number, snapshot: CaseSnapshot, createdBy: number | null): number {
  const versionNo = nextVersionNo(caseId);
  const createdAt = nowIso();
  const insertVersionStmt = db.prepare(
    `INSERT INTO test_case_versions(case_id, version_no, snapshot, created_by, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const versionRes = insertVersionStmt.run(caseId, versionNo, JSON.stringify(snapshot), createdBy, createdAt);
  const versionId = Number(versionRes.lastInsertRowid);

  const stepStmt = db.prepare(
    `INSERT INTO test_steps(case_version_id, step_no, action, input_data, expected_result)
     VALUES (?, ?, ?, ?, ?)`,
  );
  for (const step of snapshot.steps) {
    stepStmt.run(versionId, step.stepNo, step.action, step.inputData, step.expectedResult);
  }

  return versionId;
}

export function createCaseWithVersion(input: CaseUpsertInput): { caseId: number; versionId: number; versionNo: number } {
  const tx = db.transaction(() => {
    const createdAt = nowIso();
    const insertCase = db.prepare(
      `INSERT INTO test_cases(
        project_id, suite_id, title, quality_attribute, category_large, category_medium,
        preconditions, priority, tags, current_version_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    );
    const caseRes = insertCase.run(
      input.projectId,
      input.suiteId,
      input.title,
      input.qualityAttribute ?? "",
      input.categoryLarge ?? "",
      input.categoryMedium ?? "",
      input.preconditions ?? "",
      input.priority ?? "Medium",
      JSON.stringify(input.tags ?? []),
      createdAt,
      createdAt,
    );
    const caseId = Number(caseRes.lastInsertRowid);

    const snapshot = buildSnapshot(caseId, input);
    const versionId = insertVersion(caseId, snapshot, input.createdBy);

    db.prepare(`UPDATE test_cases SET current_version_id = ?, updated_at = ? WHERE id = ?`).run(versionId, nowIso(), caseId);

    const row = db
      .prepare(`SELECT version_no FROM test_case_versions WHERE id = ?`)
      .get(versionId) as { version_no: number };

    return { caseId, versionId, versionNo: row.version_no };
  });

  return tx();
}

export function createVersionForCase(caseId: number, input: Omit<CaseUpsertInput, "createdBy">, createdBy: number | null): {
  versionId: number;
  versionNo: number;
} {
  const tx = db.transaction(() => {
    const snapshot = buildSnapshot(caseId, { ...input, createdBy });
    const versionId = insertVersion(caseId, snapshot, createdBy);

    db.prepare(
      `UPDATE test_cases SET
        suite_id = ?,
        title = ?,
        quality_attribute = ?,
        category_large = ?,
        category_medium = ?,
        preconditions = ?,
        priority = ?,
        tags = ?,
        current_version_id = ?,
        updated_at = ?
      WHERE id = ?`,
    ).run(
      input.suiteId,
      input.title,
      input.qualityAttribute ?? "",
      input.categoryLarge ?? "",
      input.categoryMedium ?? "",
      input.preconditions ?? "",
      input.priority ?? "Medium",
      JSON.stringify(input.tags ?? []),
      versionId,
      nowIso(),
      caseId,
    );

    const row = db
      .prepare(`SELECT version_no FROM test_case_versions WHERE id = ?`)
      .get(versionId) as { version_no: number };

    return { versionId, versionNo: row.version_no };
  });

  return tx();
}

export function findCaseBySuiteAndTitle(suiteId: number, title: string): { id: number; project_id: number } | undefined {
  return db
    .prepare(`SELECT id, project_id FROM test_cases WHERE suite_id = ? AND title = ?`)
    .get(suiteId, title) as { id: number; project_id: number } | undefined;
}

export function listProjects(): Array<{ id: number; name: string; createdAt: string }> {
  const rows = db.prepare(`SELECT id, name, created_at FROM projects ORDER BY id`).all() as Array<{
    id: number;
    name: string;
    created_at: string;
  }>;
  return rows.map((row) => ({ id: row.id, name: row.name, createdAt: row.created_at }));
}

export function createProject(name: string): number {
  const row = db.prepare(`INSERT INTO projects(name, created_at) VALUES (?, ?)`).run(name.trim(), nowIso());
  return Number(row.lastInsertRowid);
}

export function updateProject(projectId: number, name: string): void {
  db.prepare(`UPDATE projects SET name = ? WHERE id = ?`).run(name.trim(), projectId);
}

export function deleteProject(projectId: number): void {
  db.prepare(`DELETE FROM projects WHERE id = ?`).run(projectId);
}

export function listSuites(projectId: number): Array<{ id: number; projectId: number; name: string; parentSuiteId: number | null }> {
  const rows = db
    .prepare(`SELECT id, project_id, name, parent_suite_id FROM suites WHERE project_id = ? ORDER BY name`)
    .all(projectId) as Array<{ id: number; project_id: number; name: string; parent_suite_id: number | null }>;

  return rows.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    parentSuiteId: r.parent_suite_id,
  }));
}

export function createSuite(projectId: number, name: string, parentSuiteId: number | null = null): number {
  const row = db
    .prepare(`INSERT INTO suites(project_id, name, parent_suite_id, created_at) VALUES (?, ?, ?, ?)`)
    .run(projectId, name.trim(), parentSuiteId, nowIso());
  return Number(row.lastInsertRowid);
}

export function updateSuite(suiteId: number, name: string, parentSuiteId: number | null = null): void {
  db.prepare(`UPDATE suites SET name = ?, parent_suite_id = ? WHERE id = ?`).run(name.trim(), parentSuiteId, suiteId);
}

export function deleteSuite(suiteId: number): void {
  db.prepare(`DELETE FROM suites WHERE id = ?`).run(suiteId);
}

export function getOrCreateSuite(projectId: number, suiteName: string): number {
  const normalized = suiteName.trim();
  const existing = db
    .prepare(`SELECT id FROM suites WHERE project_id = ? AND name = ?`)
    .get(projectId, normalized) as { id: number } | undefined;
  if (existing) return existing.id;
  return createSuite(projectId, normalized, null);
}

export function listCases(projectId: number, suiteId?: number): Array<{
  id: number;
  projectId: number;
  suiteId: number;
  suiteName: string;
  title: string;
  qualityAttribute: string;
  categoryLarge: string;
  categoryMedium: string;
  priority: string;
  tags: string[];
  currentVersionId: number | null;
  createdAt: string;
  updatedAt: string;
}> {
  const where = suiteId ? `WHERE c.project_id = ? AND c.suite_id = ?` : `WHERE c.project_id = ?`;
  const params = suiteId ? [projectId, suiteId] : [projectId];

  const rows = db
    .prepare(
      `SELECT c.id, c.project_id, c.suite_id, s.name AS suite_name, c.title,
              c.quality_attribute, c.category_large, c.category_medium,
              c.priority, c.tags, c.current_version_id, c.created_at, c.updated_at
       FROM test_cases c
       JOIN suites s ON s.id = c.suite_id
       ${where}
       ORDER BY c.updated_at DESC, c.id DESC`,
    )
    .all(...params) as Array<{
    id: number;
    project_id: number;
    suite_id: number;
    suite_name: string;
    title: string;
    quality_attribute: string;
    category_large: string;
    category_medium: string;
    priority: string;
    tags: string;
    current_version_id: number | null;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    suiteId: row.suite_id,
    suiteName: row.suite_name,
    title: row.title,
    qualityAttribute: row.quality_attribute,
    categoryLarge: row.category_large,
    categoryMedium: row.category_medium,
    priority: row.priority,
    tags: JSON.parse(row.tags || "[]"),
    currentVersionId: row.current_version_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function deleteCase(caseId: number): void {
  const tx = db.transaction(() => {
    db.prepare(
      `DELETE FROM test_step_results
       WHERE result_id IN (
         SELECT tr.id
         FROM test_results tr
         JOIN test_run_cases rc ON rc.id = tr.run_case_id
         WHERE rc.case_id = ?
       )`,
    ).run(caseId);

    db.prepare(
      `DELETE FROM test_results
       WHERE run_case_id IN (
         SELECT id FROM test_run_cases WHERE case_id = ?
       )`,
    ).run(caseId);

    db.prepare(`DELETE FROM test_run_cases WHERE case_id = ?`).run(caseId);
    db.prepare(`DELETE FROM test_cases WHERE id = ?`).run(caseId);
  });

  tx();
}

function getVersionSteps(caseVersionId: number): StepSnapshot[] {
  const rows = db
    .prepare(`SELECT step_no, action, input_data, expected_result FROM test_steps WHERE case_version_id = ? ORDER BY step_no ASC`)
    .all(caseVersionId) as Array<{ step_no: number; action: string; input_data: string; expected_result: string }>;

  return rows.map((row) => ({
    stepNo: row.step_no,
    action: row.action,
    inputData: row.input_data ?? "",
    expectedResult: row.expected_result,
  }));
}

export function getCaseVersion(caseVersionId: number): {
  id: number;
  caseId: number;
  versionNo: number;
  snapshot: CaseSnapshot;
  createdBy: number | null;
  createdAt: string;
} | null {
  const row = db
    .prepare(`SELECT id, case_id, version_no, snapshot, created_by, created_at FROM test_case_versions WHERE id = ?`)
    .get(caseVersionId) as
    | { id: number; case_id: number; version_no: number; snapshot: string; created_by: number | null; created_at: string }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    caseId: row.case_id,
    versionNo: row.version_no,
    snapshot: JSON.parse(row.snapshot),
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export function getCaseDetail(caseId: number): {
  case: {
    id: number;
    projectId: number;
    suiteId: number;
    title: string;
    qualityAttribute: string;
    categoryLarge: string;
    categoryMedium: string;
    preconditions: string;
    priority: string;
    tags: string[];
    currentVersionId: number | null;
    createdAt: string;
    updatedAt: string;
  };
  currentVersion: ReturnType<typeof getCaseVersion>;
  versions: Array<{ id: number; versionNo: number; createdAt: string; createdBy: number | null }>;
} | null {
  const row = db
    .prepare(
      `SELECT id, project_id, suite_id, title, quality_attribute, category_large, category_medium,
              preconditions, priority, tags, current_version_id, created_at, updated_at
       FROM test_cases
       WHERE id = ?`,
    )
    .get(caseId) as
    | {
        id: number;
        project_id: number;
        suite_id: number;
        title: string;
        quality_attribute: string;
        category_large: string;
        category_medium: string;
        preconditions: string;
        priority: string;
        tags: string;
        current_version_id: number | null;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!row) return null;

  const versions = db
    .prepare(`SELECT id, version_no, created_at, created_by FROM test_case_versions WHERE case_id = ? ORDER BY version_no DESC`)
    .all(caseId) as Array<{ id: number; version_no: number; created_at: string; created_by: number | null }>;

  const currentVersion = row.current_version_id ? getCaseVersion(row.current_version_id) : null;

  if (currentVersion) {
    currentVersion.snapshot.steps = getVersionSteps(currentVersion.id);
  }

  return {
    case: {
      id: row.id,
      projectId: row.project_id,
      suiteId: row.suite_id,
      title: row.title,
      qualityAttribute: row.quality_attribute,
      categoryLarge: row.category_large,
      categoryMedium: row.category_medium,
      preconditions: row.preconditions,
      priority: row.priority,
      tags: JSON.parse(row.tags || "[]"),
      currentVersionId: row.current_version_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    currentVersion,
    versions: versions.map((v) => ({
      id: v.id,
      versionNo: v.version_no,
      createdAt: v.created_at,
      createdBy: v.created_by,
    })),
  };
}

export function diffCaseVersions(fromVersionId: number, toVersionId: number): {
  fields: Array<{ field: string; from: unknown; to: unknown }>;
  stepsAdded: StepSnapshot[];
  stepsRemoved: StepSnapshot[];
  stepsChanged: Array<{ stepNo: number; from: StepSnapshot; to: StepSnapshot }>;
} {
  const fromVersion = getCaseVersion(fromVersionId);
  const toVersion = getCaseVersion(toVersionId);

  if (!fromVersion || !toVersion) {
    throw new Error("version_not_found");
  }

  fromVersion.snapshot.steps = getVersionSteps(fromVersion.id);
  toVersion.snapshot.steps = getVersionSteps(toVersion.id);

  const fieldsToCompare: Array<keyof CaseSnapshot> = [
    "title",
    "qualityAttribute",
    "categoryLarge",
    "categoryMedium",
    "preconditions",
    "priority",
    "tags",
    "suiteId",
  ];

  const fields = fieldsToCompare
    .map((field) => ({ field, from: fromVersion.snapshot[field], to: toVersion.snapshot[field] }))
    .filter((entry) => JSON.stringify(entry.from) !== JSON.stringify(entry.to))
    .map((entry) => ({ field: String(entry.field), from: entry.from, to: entry.to }));

  const fromMap = new Map(fromVersion.snapshot.steps.map((step) => [step.stepNo, step]));
  const toMap = new Map(toVersion.snapshot.steps.map((step) => [step.stepNo, step]));

  const stepsAdded: StepSnapshot[] = [];
  const stepsRemoved: StepSnapshot[] = [];
  const stepsChanged: Array<{ stepNo: number; from: StepSnapshot; to: StepSnapshot }> = [];

  for (const [stepNo, toStep] of toMap.entries()) {
    if (!fromMap.has(stepNo)) {
      stepsAdded.push(toStep);
      continue;
    }
    const fromStep = fromMap.get(stepNo)!;
    if (JSON.stringify(fromStep) !== JSON.stringify(toStep)) {
      stepsChanged.push({ stepNo, from: fromStep, to: toStep });
    }
  }

  for (const [stepNo, fromStep] of fromMap.entries()) {
    if (!toMap.has(stepNo)) {
      stepsRemoved.push(fromStep);
    }
  }

  return {
    fields,
    stepsAdded: stepsAdded.sort((a, b) => a.stepNo - b.stepNo),
    stepsRemoved: stepsRemoved.sort((a, b) => a.stepNo - b.stepNo),
    stepsChanged: stepsChanged.sort((a, b) => a.stepNo - b.stepNo),
  };
}
