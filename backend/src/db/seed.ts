import { db } from "./connection.js";
import { runMigrations } from "./migrate.js";
import { createCaseWithVersion } from "../services/caseService.js";

function nowIso(): string {
  return new Date().toISOString();
}

type SeedCase = {
  suite: string;
  title: string;
  qa: string;
  large: string;
  medium: string;
  preconditions: string;
  priority: string;
  tags: string[];
  steps: Array<{ stepNo: number; action: string; inputData: string; expectedResult: string }>;
};

function seedUsers(): void {
  const users = [
    { username: "admin", displayName: "Admin User", role: "admin", password: "admin" },
    { username: "qa1", displayName: "QA One", role: "qa", password: "qa1" },
    { username: "qa2", displayName: "QA Two", role: "qa", password: "qa2" },
  ];
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO users(username, display_name, role, email, password, created_at) VALUES (?, ?, ?, '', ?, ?)`,
  );
  for (const user of users) {
    stmt.run(user.username, user.displayName, user.role, user.password, nowIso());
  }
}

function seedProjectAndSuites(): { projectId: number; suites: Record<string, number> } {
  const existing = db.prepare(`SELECT id FROM projects LIMIT 1`).get() as { id: number } | undefined;
  if (existing) {
    const suiteRows = db
      .prepare(`SELECT id, name FROM suites WHERE project_id = ?`)
      .all(existing.id) as Array<{ id: number; name: string }>;
    return {
      projectId: existing.id,
      suites: Object.fromEntries(suiteRows.map((s) => [s.name, s.id])),
    };
  }

  const projectInsert = db
    .prepare(`INSERT INTO projects(name, created_at) VALUES (?, ?)`)
    .run("TMT Demo Project", nowIso());
  const projectId = Number(projectInsert.lastInsertRowid);

  const suiteNames = ["API", "UI", "Regression"];
  const suiteStmt = db.prepare(
    `INSERT INTO suites(project_id, name, parent_suite_id, created_at) VALUES (?, ?, NULL, ?)`,
  );
  const suites: Record<string, number> = {};
  for (const name of suiteNames) {
    const row = suiteStmt.run(projectId, name, nowIso());
    suites[name] = Number(row.lastInsertRowid);
  }

  return { projectId, suites };
}

function seedCases(projectId: number, suites: Record<string, number>, createdBy: number): void {
  const count = db.prepare(`SELECT COUNT(*) as cnt FROM test_cases WHERE project_id = ?`).get(projectId) as { cnt: number };
  if (count.cnt >= 10) return;

  const cases: SeedCase[] = [
    {
      suite: "API",
      title: "Login API returns token",
      qa: "Security",
      large: "Auth",
      medium: "Login",
      preconditions: "User account exists",
      priority: "High",
      tags: ["auth", "api"],
      steps: [
        { stepNo: 1, action: "Send POST /login", inputData: "valid credentials", expectedResult: "200 OK" },
        { stepNo: 2, action: "Verify token field", inputData: "response body", expectedResult: "token exists" },
        { stepNo: 3, action: "Call /me with token", inputData: "Authorization header", expectedResult: "user profile returned" },
      ],
    },
    {
      suite: "API",
      title: "Login API rejects bad password",
      qa: "Reliability",
      large: "Auth",
      medium: "Negative",
      preconditions: "Known user account",
      priority: "High",
      tags: ["auth", "negative"],
      steps: [
        { stepNo: 1, action: "Send POST /login", inputData: "wrong password", expectedResult: "401 Unauthorized" },
        { stepNo: 2, action: "Check error code", inputData: "response body", expectedResult: "error code exists" },
        { stepNo: 3, action: "Check no token", inputData: "response body", expectedResult: "token is absent" },
      ],
    },
    {
      suite: "API",
      title: "CSV import validates required columns",
      qa: "Usability",
      large: "Import",
      medium: "Validation",
      preconditions: "User logged in",
      priority: "Medium",
      tags: ["import", "csv"],
      steps: [
        { stepNo: 1, action: "Upload invalid CSV", inputData: "missing headers", expectedResult: "validation errors shown" },
        { stepNo: 2, action: "Check failed rows", inputData: "preview result", expectedResult: "row errors visible" },
        { stepNo: 3, action: "Fix headers and retry", inputData: "valid template", expectedResult: "preview success" },
      ],
    },
    {
      suite: "UI",
      title: "Suite tree loads and expands",
      qa: "Usability",
      large: "Navigation",
      medium: "Suite",
      preconditions: "Project has suites",
      priority: "Medium",
      tags: ["ui", "suite"],
      steps: [
        { stepNo: 1, action: "Open Test Cases page", inputData: "sidebar click", expectedResult: "suite tree visible" },
        { stepNo: 2, action: "Expand suite", inputData: "click arrow", expectedResult: "child items visible" },
        { stepNo: 3, action: "Select suite", inputData: "click suite row", expectedResult: "case list filtered" },
      ],
    },
    {
      suite: "UI",
      title: "Case detail edits create new version",
      qa: "Reliability",
      large: "Versioning",
      medium: "Case Update",
      preconditions: "Existing case present",
      priority: "High",
      tags: ["version", "history"],
      steps: [
        { stepNo: 1, action: "Open case detail", inputData: "case row click", expectedResult: "detail panel opens" },
        { stepNo: 2, action: "Edit title and save", inputData: "new text", expectedResult: "save success" },
        { stepNo: 3, action: "Open history tab", inputData: "tab click", expectedResult: "version count incremented" },
      ],
    },
    {
      suite: "UI",
      title: "Version diff highlights step changes",
      qa: "Usability",
      large: "Versioning",
      medium: "Diff",
      preconditions: "At least two versions exist",
      priority: "Medium",
      tags: ["diff", "steps"],
      steps: [
        { stepNo: 1, action: "Select base and target version", inputData: "history tab", expectedResult: "both versions selected" },
        { stepNo: 2, action: "Click compare", inputData: "compare action", expectedResult: "field diff displayed" },
        { stepNo: 3, action: "Inspect steps diff", inputData: "step section", expectedResult: "added/removed/changed listed" },
      ],
    },
    {
      suite: "Regression",
      title: "Run creation snapshots current versions",
      qa: "Reliability",
      large: "Run",
      medium: "Snapshot",
      preconditions: "Multiple cases exist",
      priority: "High",
      tags: ["run", "snapshot"],
      steps: [
        { stepNo: 1, action: "Select cases and create run", inputData: "run form", expectedResult: "run created" },
        { stepNo: 2, action: "Update one case", inputData: "case edit", expectedResult: "new case version created" },
        { stepNo: 3, action: "Check run case version", inputData: "run details", expectedResult: "version id unchanged" },
      ],
    },
    {
      suite: "Regression",
      title: "Step result drives overall status",
      qa: "Reliability",
      large: "Execution",
      medium: "Result",
      preconditions: "Open run exists",
      priority: "High",
      tags: ["execution", "status"],
      steps: [
        { stepNo: 1, action: "Mark first step pass", inputData: "step 1", expectedResult: "step saved" },
        { stepNo: 2, action: "Mark second step fail", inputData: "step 2", expectedResult: "step saved" },
        { stepNo: 3, action: "Save result", inputData: "run case", expectedResult: "overall status fail" },
      ],
    },
    {
      suite: "Regression",
      title: "Import log captures row-level errors",
      qa: "Reliability",
      large: "Import",
      medium: "Logging",
      preconditions: "CSV file prepared",
      priority: "Medium",
      tags: ["import", "log"],
      steps: [
        { stepNo: 1, action: "Upload malformed CSV", inputData: "bad rows", expectedResult: "preview shows errors" },
        { stepNo: 2, action: "Execute import", inputData: "import action", expectedResult: "log created" },
        { stepNo: 3, action: "Open import log", inputData: "logs table", expectedResult: "failed row reasons shown" },
      ],
    },
    {
      suite: "Regression",
      title: "Reports show failure and priority breakdown",
      qa: "Usability",
      large: "Reporting",
      medium: "Dashboard",
      preconditions: "Run results exist",
      priority: "Low",
      tags: ["reports"],
      steps: [
        { stepNo: 1, action: "Open Reports page", inputData: "sidebar", expectedResult: "summary cards rendered" },
        { stepNo: 2, action: "Check failures table", inputData: "reports", expectedResult: "failed items listed" },
        { stepNo: 3, action: "Check priority chart", inputData: "reports", expectedResult: "priority counts shown" },
      ],
    },
  ];

  for (const item of cases) {
    createCaseWithVersion({
      projectId,
      suiteId: suites[item.suite],
      title: item.title,
      qualityAttribute: item.qa,
      categoryLarge: item.large,
      categoryMedium: item.medium,
      preconditions: item.preconditions,
      priority: item.priority,
      tags: item.tags,
      steps: item.steps,
      createdBy: createdBy,
    });
  }
}

export function runSeed(): void {
  runMigrations();
  seedUsers();

  const admin = db.prepare(`SELECT id FROM users WHERE username = 'admin'`).get() as { id: number };
  const seeded = seedProjectAndSuites();
  seedCases(seeded.projectId, seeded.suites, admin.id);

  // eslint-disable-next-line no-console
  console.log("[seed] done");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSeed();
}
