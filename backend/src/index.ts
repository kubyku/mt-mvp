import express from "express";
import cors from "cors";
import { runMigrations } from "./db/migrate.js";
import { runSeed } from "./db/seed.js";
import {
  createSession,
  createUser,
  deleteSession,
  deleteUser,
  findUserByUsername,
  getUserBySessionId,
  listUsers,
  updateUser,
} from "./services/authService.js";
import {
  createProject,
  createCaseWithVersion,
  createSuite,
  createVersionForCase,
  deleteCase,
  deleteProject,
  deleteSuite,
  diffCaseVersions,
  getCaseDetail,
  getCaseVersion,
  listCases,
  listProjects,
  listSuites,
  updateProject,
  updateSuite,
} from "./services/caseService.js";
import {
  clearImportLogs,
  deleteImportLog,
  executeImport,
  exportCasesCsv,
  listImportLogRows,
  listImportLogs,
  previewImport,
} from "./services/importService.js";
import {
  createRun,
  deleteRun,
  getRunCaseExecution,
  getRunDetail,
  listRuns,
  reportFailures,
  reportPriority,
  reportSummary,
  saveRunCaseResult,
  updateRun,
  updateRunStatus,
} from "./services/runService.js";

const app = express();
const PORT = Number(process.env.PORT || 4300);
const HOST = process.env.HOST || "127.0.0.1";

runMigrations();
runSeed();

app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
  }),
);
app.use(express.json({ limit: "5mb" }));

function parseCookies(rawCookie: string | undefined): Record<string, string> {
  if (!rawCookie) return {};
  return rawCookie.split(";").reduce<Record<string, string>>((acc, pair) => {
    const [key, ...rest] = pair.trim().split("=");
    acc[key] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

function setSessionCookie(res: express.Response, sid: string): void {
  res.setHeader("Set-Cookie", `tmt_sid=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
}

function clearSessionCookie(res: express.Response): void {
  res.setHeader("Set-Cookie", "tmt_sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
}

function authMiddleware(req: express.Request, _res: express.Response, next: express.NextFunction): void {
  const cookies = parseCookies(req.headers.cookie);
  const sid = cookies.tmt_sid;
  if (!sid) {
    next();
    return;
  }
  const user = getUserBySessionId(sid);
  if (user) {
    req.user = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    };
  }
  next();
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (!req.user) {
    res.status(401).json({ message: "unauthorized" });
    return;
  }
  next();
}

app.use(authMiddleware);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

app.post("/api/auth/login", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  if (!username || !password) {
    res.status(400).json({ message: "아이디와 비밀번호를 입력해주세요." });
    return;
  }

  const user = findUserByUsername(username);
  if (!user || user.password !== password) {
    res.status(401).json({ message: "아이디 또는 비밀번호가 올바르지 않습니다." });
    return;
  }

  const sid = createSession(user.id);
  setSessionCookie(res, sid);
  const { password: _pw, ...safeUser } = user;
  res.json({ user: safeUser });
});

app.post("/api/auth/register", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const displayName = String(req.body?.displayName || "").trim();
  const password = String(req.body?.password || "");
  if (!username || !displayName || !password) {
    res.status(400).json({ message: "모든 항목을 입력해주세요." });
    return;
  }

  const existing = findUserByUsername(username);
  if (existing) {
    res.status(409).json({ message: "이미 사용 중인 아이디입니다." });
    return;
  }

  const userId = createUser({ username, displayName, role: "tester", email: "", password });
  const sid = createSession(userId);
  setSessionCookie(res, sid);
  res.json({ user: { id: userId, username, displayName, role: "tester" } });
});

app.post("/api/auth/logout", requireAuth, (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.tmt_sid) {
    deleteSession(cookies.tmt_sid);
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get("/api/projects", requireAuth, (_req, res) => {
  res.json({ projects: listProjects() });
});

app.post("/api/projects", requireAuth, (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) {
    res.status(400).json({ message: "name_required" });
    return;
  }
  const projectId = createProject(name);
  res.status(201).json({ projectId });
});

app.patch("/api/projects/:projectId", requireAuth, (req, res) => {
  const projectId = Number(req.params.projectId);
  const name = String(req.body?.name || "").trim();
  if (!projectId || !name) {
    res.status(400).json({ message: "project_and_name_required" });
    return;
  }
  updateProject(projectId, name);
  res.json({ ok: true });
});

app.delete("/api/projects/:projectId", requireAuth, (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!projectId) {
    res.status(400).json({ message: "project_id_required" });
    return;
  }
  deleteProject(projectId);
  res.json({ ok: true });
});

app.get("/api/projects/:projectId/suites", requireAuth, (req, res) => {
  const projectId = Number(req.params.projectId);
  res.json({ suites: listSuites(projectId) });
});

app.post("/api/projects/:projectId/suites", requireAuth, (req, res) => {
  const projectId = Number(req.params.projectId);
  const name = String(req.body?.name || "").trim();
  const parentSuiteId = req.body?.parentSuiteId ? Number(req.body.parentSuiteId) : null;

  if (!name) {
    res.status(400).json({ message: "name_required" });
    return;
  }

  const suiteId = createSuite(projectId, name, parentSuiteId);
  res.status(201).json({ suiteId });
});

app.patch("/api/suites/:suiteId", requireAuth, (req, res) => {
  const suiteId = Number(req.params.suiteId);
  const name = String(req.body?.name || "").trim();
  const parentSuiteId = req.body?.parentSuiteId ? Number(req.body.parentSuiteId) : null;
  if (!suiteId || !name) {
    res.status(400).json({ message: "suite_and_name_required" });
    return;
  }
  if (parentSuiteId && parentSuiteId === suiteId) {
    res.status(400).json({ message: "suite_cannot_parent_self" });
    return;
  }
  updateSuite(suiteId, name, parentSuiteId);
  res.json({ ok: true });
});

app.delete("/api/suites/:suiteId", requireAuth, (req, res) => {
  const suiteId = Number(req.params.suiteId);
  if (!suiteId) {
    res.status(400).json({ message: "suite_id_required" });
    return;
  }
  deleteSuite(suiteId);
  res.json({ ok: true });
});

app.get("/api/projects/:projectId/cases", requireAuth, (req, res) => {
  const projectId = Number(req.params.projectId);
  const suiteIdRaw = req.query.suiteId;
  const suiteId = suiteIdRaw ? Number(suiteIdRaw) : undefined;

  res.json({ cases: listCases(projectId, suiteId) });
});

app.get("/api/projects/:projectId/cases/export", requireAuth, (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!projectId) {
    res.status(400).json({ message: "project_id_required" });
    return;
  }

  const suiteIdRaw = req.query.suiteId;
  const suiteId = suiteIdRaw ? Number(suiteIdRaw) : undefined;
  const csvText = exportCasesCsv({ projectId, suiteId });
  const date = new Date().toISOString().slice(0, 10);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="tmt-cases-${projectId}-${date}.csv"`);
  res.send(csvText);
});

app.post("/api/projects/:projectId/cases", requireAuth, (req, res) => {
  const projectId = Number(req.params.projectId);

  const result = createCaseWithVersion({
    projectId,
    suiteId: Number(req.body.suiteId),
    title: String(req.body.title || ""),
    qualityAttribute: String(req.body.qualityAttribute || ""),
    categoryLarge: String(req.body.categoryLarge || ""),
    categoryMedium: String(req.body.categoryMedium || ""),
    preconditions: String(req.body.preconditions || ""),
    priority: String(req.body.priority || "Medium"),
    tags: Array.isArray(req.body.tags) ? req.body.tags.map(String) : [],
    steps: Array.isArray(req.body.steps)
      ? req.body.steps.map((s: unknown) => {
          const row = s as Record<string, unknown>;
          return {
            stepNo: Number(row.stepNo),
            action: String(row.action || ""),
            inputData: String(row.inputData || ""),
            expectedResult: String(row.expectedResult || ""),
          };
        })
      : [],
    createdBy: req.user?.id ?? null,
  });

  res.status(201).json(result);
});

app.get("/api/cases/:caseId", requireAuth, (req, res) => {
  const caseId = Number(req.params.caseId);
  const detail = getCaseDetail(caseId);
  if (!detail) {
    res.status(404).json({ message: "case_not_found" });
    return;
  }
  res.json(detail);
});

app.put("/api/cases/:caseId", requireAuth, (req, res) => {
  const caseId = Number(req.params.caseId);
  const detail = getCaseDetail(caseId);
  if (!detail) {
    res.status(404).json({ message: "case_not_found" });
    return;
  }

  const payload = {
    projectId: detail.case.projectId,
    suiteId: Number(req.body.suiteId ?? detail.case.suiteId),
    title: String(req.body.title ?? detail.case.title),
    qualityAttribute: String(req.body.qualityAttribute ?? detail.case.qualityAttribute),
    categoryLarge: String(req.body.categoryLarge ?? detail.case.categoryLarge),
    categoryMedium: String(req.body.categoryMedium ?? detail.case.categoryMedium),
    preconditions: String(req.body.preconditions ?? detail.case.preconditions),
    priority: String(req.body.priority ?? detail.case.priority),
    tags: Array.isArray(req.body.tags) ? req.body.tags.map(String) : detail.case.tags,
    steps: Array.isArray(req.body.steps)
      ? req.body.steps.map((s: unknown) => {
          const row = s as Record<string, unknown>;
          return {
            stepNo: Number(row.stepNo),
            action: String(row.action || ""),
            inputData: String(row.inputData || ""),
            expectedResult: String(row.expectedResult || ""),
          };
        })
      : detail.currentVersion?.snapshot.steps || [],
  };

  const result = createVersionForCase(caseId, payload, req.user?.id ?? null);
  res.json(result);
});

app.delete("/api/cases/:caseId", requireAuth, (req, res) => {
  const caseId = Number(req.params.caseId);
  if (!caseId) {
    res.status(400).json({ message: "case_id_required" });
    return;
  }
  deleteCase(caseId);
  res.json({ ok: true });
});

app.get("/api/cases/:caseId/versions/:versionId", requireAuth, (req, res) => {
  const caseId = Number(req.params.caseId);
  const versionId = Number(req.params.versionId);
  const version = getCaseVersion(versionId);

  if (!version || version.caseId !== caseId) {
    res.status(404).json({ message: "version_not_found" });
    return;
  }

  res.json({ version });
});

app.get("/api/cases/:caseId/diff", requireAuth, (req, res) => {
  const fromVersionId = Number(req.query.fromVersionId);
  const toVersionId = Number(req.query.toVersionId);

  if (!fromVersionId || !toVersionId) {
    res.status(400).json({ message: "from_to_required" });
    return;
  }

  try {
    const diff = diffCaseVersions(fromVersionId, toVersionId);
    res.json({ diff });
  } catch (error) {
    const message = error instanceof Error ? error.message : "diff_error";
    res.status(message === "version_not_found" ? 404 : 500).json({ message });
  }
});

app.post("/api/import/preview", requireAuth, (req, res) => {
  const csvText = String(req.body?.csvText || "");
  if (!csvText.trim()) {
    res.status(400).json({ message: "csv_required" });
    return;
  }

  res.json(previewImport(csvText));
});

app.post("/api/import/execute", requireAuth, (req, res) => {
  const projectId = Number(req.body?.projectId);
  const fileName = String(req.body?.fileName || "import.csv");
  const csvText = String(req.body?.csvText || "");

  if (!projectId || !csvText.trim()) {
    res.status(400).json({ message: "project_and_csv_required" });
    return;
  }

  const result = executeImport({
    projectId,
    fileName,
    csvText,
    userId: req.user?.id ?? null,
  });

  res.json(result);
});

app.get("/api/import/logs", requireAuth, (_req, res) => {
  res.json({ logs: listImportLogs() });
});

app.get("/api/import/logs/:logId/rows", requireAuth, (req, res) => {
  const logId = Number(req.params.logId);
  res.json({ rows: listImportLogRows(logId) });
});

app.delete("/api/import/logs/:logId", requireAuth, (req, res) => {
  const logId = Number(req.params.logId);
  if (!logId) {
    res.status(400).json({ message: "log_id_required" });
    return;
  }
  deleteImportLog(logId);
  res.json({ ok: true });
});

app.delete("/api/import/logs", requireAuth, (_req, res) => {
  clearImportLogs();
  res.json({ ok: true });
});

app.post("/api/runs", requireAuth, (req, res) => {
  const projectId = Number(req.body?.projectId);
  const name = String(req.body?.name || "").trim();
  const releaseVersion = String(req.body?.releaseVersion || "");
  const caseIds = Array.isArray(req.body?.caseIds) ? req.body.caseIds.map(Number).filter(Number.isFinite) : [];

  if (!projectId || !name || !caseIds.length) {
    res.status(400).json({ message: "invalid_run_payload" });
    return;
  }

  const result = createRun({
    projectId,
    name,
    releaseVersion,
    caseIds,
    createdBy: req.user?.id ?? null,
  });

  res.status(201).json(result);
});

app.get("/api/projects/:projectId/runs", requireAuth, (req, res) => {
  const projectId = Number(req.params.projectId);
  res.json({ runs: listRuns(projectId) });
});

app.get("/api/runs/:runId", requireAuth, (req, res) => {
  const runId = Number(req.params.runId);
  const detail = getRunDetail(runId);
  if (!detail) {
    res.status(404).json({ message: "run_not_found" });
    return;
  }
  res.json(detail);
});

app.patch("/api/runs/:runId/status", requireAuth, (req, res) => {
  const runId = Number(req.params.runId);
  const status = String(req.body?.status || "");
  if (status !== "open" && status !== "closed") {
    res.status(400).json({ message: "invalid_status" });
    return;
  }
  updateRunStatus(runId, status);
  res.json({ ok: true });
});

app.patch("/api/runs/:runId", requireAuth, (req, res) => {
  const runId = Number(req.params.runId);
  const name = String(req.body?.name || "").trim();
  const releaseVersion = String(req.body?.releaseVersion || "").trim();
  if (!runId || !name) {
    res.status(400).json({ message: "run_and_name_required" });
    return;
  }
  updateRun(runId, { name, releaseVersion });
  res.json({ ok: true });
});

app.delete("/api/runs/:runId", requireAuth, (req, res) => {
  const runId = Number(req.params.runId);
  if (!runId) {
    res.status(400).json({ message: "run_id_required" });
    return;
  }
  deleteRun(runId);
  res.json({ ok: true });
});

app.get("/api/run-cases/:runCaseId", requireAuth, (req, res) => {
  const runCaseId = Number(req.params.runCaseId);
  const payload = getRunCaseExecution(runCaseId);
  if (!payload) {
    res.status(404).json({ message: "run_case_not_found" });
    return;
  }
  res.json(payload);
});

app.post("/api/run-cases/:runCaseId/result", requireAuth, (req, res) => {
  const runCaseId = Number(req.params.runCaseId);
  const stepResults = Array.isArray(req.body?.stepResults)
    ? req.body.stepResults.map((step: unknown) => {
        const row = step as Record<string, unknown>;
        const status = String(row.status || "untested");
        const normalized = ["untested", "pass", "fail", "blocked"].includes(status) ? status : "untested";
        return {
          stepNo: Number(row.stepNo),
          status: normalized as "untested" | "pass" | "fail" | "blocked",
          comment: String(row.comment || ""),
        };
      })
    : [];

  const result = saveRunCaseResult({
    runCaseId,
    executedBy: req.user?.id ?? null,
    comment: String(req.body?.comment || ""),
    stepResults,
  });

  res.json(result);
});

app.get("/api/reports/:projectId/summary", requireAuth, (req, res) => {
  res.json(reportSummary(Number(req.params.projectId)));
});

app.get("/api/reports/:projectId/failures", requireAuth, (req, res) => {
  res.json({ failures: reportFailures(Number(req.params.projectId)) });
});

app.get("/api/reports/:projectId/priority", requireAuth, (req, res) => {
  res.json({ priorities: reportPriority(Number(req.params.projectId)) });
});

app.get("/api/admin/users", requireAuth, (_req, res) => {
  res.json({ users: listUsers() });
});

app.post("/api/admin/users", requireAuth, (req, res) => {
  const username = String(req.body?.username || "").trim();
  const displayName = String(req.body?.displayName || "").trim();
  const role = String(req.body?.role || "tester").trim();
  const email = String(req.body?.email || "").trim();
  const password = String(req.body?.password || "");
  if (!username || !displayName) {
    res.status(400).json({ message: "username_and_display_name_required" });
    return;
  }
  const userId = createUser({ username, displayName, role, email, password });
  res.status(201).json({ userId });
});

app.patch("/api/admin/users/:userId", requireAuth, (req, res) => {
  const userId = Number(req.params.userId);
  const username = String(req.body?.username || "").trim();
  const displayName = String(req.body?.displayName || "").trim();
  const role = String(req.body?.role || "tester").trim();
  const email = String(req.body?.email || "").trim();
  const password = req.body?.password ? String(req.body.password) : undefined;
  if (!userId || !username || !displayName) {
    res.status(400).json({ message: "user_payload_required" });
    return;
  }
  updateUser(userId, { username, displayName, role, email, password });
  res.json({ ok: true });
});

app.delete("/api/admin/users/:userId", requireAuth, (req, res) => {
  const userId = Number(req.params.userId);
  if (!userId) {
    res.status(400).json({ message: "user_id_required" });
    return;
  }
  if (userId === req.user?.id) {
    res.status(400).json({ message: "cannot_delete_current_user" });
    return;
  }
  deleteUser(userId);
  res.json({ ok: true });
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : "internal_error";
  res.status(500).json({ message });
});

app.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`TMT backend running on http://${HOST}:${PORT}`);
});
