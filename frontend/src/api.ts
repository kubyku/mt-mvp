const jsonHeaders = { "Content-Type": "application/json" };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.body ? jsonHeaders : {}),
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || `HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

async function requestText(url: string, init?: RequestInit): Promise<string> {
  const response = await fetch(url, {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.body ? jsonHeaders : {}),
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || `HTTP ${response.status}`);
  }

  return response.text();
}

export const api = {
  login: (username: string, password: string) =>
    request<{ user: unknown }>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  register: (username: string, displayName: string, password: string) =>
    request<{ user: unknown }>("/api/auth/register", { method: "POST", body: JSON.stringify({ username, displayName, password }) }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  me: () => request<{ user: unknown }>("/api/auth/me"),

  projects: () => request<{ projects: unknown[] }>("/api/projects"),
  createProject: (name: string) =>
    request<{ projectId: number }>("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  updateProject: (projectId: number, name: string) =>
    request(`/api/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  deleteProject: (projectId: number) =>
    request(`/api/projects/${projectId}`, {
      method: "DELETE",
    }),
  suites: (projectId: number) => request<{ suites: unknown[] }>(`/api/projects/${projectId}/suites`),
  createSuite: (projectId: number, name: string, parentSuiteId: number | null = null) =>
    request<{ suiteId: number }>(`/api/projects/${projectId}/suites`, {
      method: "POST",
      body: JSON.stringify({ name, parentSuiteId }),
    }),
  updateSuite: (suiteId: number, name: string, parentSuiteId: number | null = null) =>
    request(`/api/suites/${suiteId}`, {
      method: "PATCH",
      body: JSON.stringify({ name, parentSuiteId }),
    }),
  deleteSuite: (suiteId: number) =>
    request(`/api/suites/${suiteId}`, {
      method: "DELETE",
    }),

  listCases: (projectId: number, suiteId?: number) =>
    request<{ cases: unknown[] }>(
      suiteId ? `/api/projects/${projectId}/cases?suiteId=${suiteId}` : `/api/projects/${projectId}/cases`,
    ),
  createCase: (projectId: number, body: unknown) =>
    request<{ caseId: number; versionId: number; versionNo: number }>(`/api/projects/${projectId}/cases`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  exportCasesCsv: (projectId: number, suiteId?: number) =>
    requestText(
      suiteId ? `/api/projects/${projectId}/cases/export?suiteId=${suiteId}` : `/api/projects/${projectId}/cases/export`,
    ),
  caseDetail: (caseId: number) => request<unknown>(`/api/cases/${caseId}`),
  updateCase: (caseId: number, body: unknown) =>
    request(`/api/cases/${caseId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteCase: (caseId: number) =>
    request(`/api/cases/${caseId}`, {
      method: "DELETE",
    }),
  caseDiff: (caseId: number, fromVersionId: number, toVersionId: number) =>
    request<{ diff: unknown }>(`/api/cases/${caseId}/diff?fromVersionId=${fromVersionId}&toVersionId=${toVersionId}`),

  importPreview: (csvText: string) =>
    request<unknown>("/api/import/preview", {
      method: "POST",
      body: JSON.stringify({ csvText }),
    }),
  importExecute: (projectId: number, fileName: string, csvText: string) =>
    request<unknown>("/api/import/execute", {
      method: "POST",
      body: JSON.stringify({ projectId, fileName, csvText }),
    }),
  importLogs: () => request<{ logs: unknown[] }>("/api/import/logs"),
  importLogRows: (logId: number) => request<{ rows: unknown[] }>(`/api/import/logs/${logId}/rows`),
  deleteImportLog: (logId: number) =>
    request(`/api/import/logs/${logId}`, {
      method: "DELETE",
    }),
  clearImportLogs: () =>
    request("/api/import/logs", {
      method: "DELETE",
    }),

  listRuns: (projectId: number) => request<{ runs: unknown[] }>(`/api/projects/${projectId}/runs`),
  createRun: (body: unknown) => request<{ runId: number }>("/api/runs", { method: "POST", body: JSON.stringify(body) }),
  runDetail: (runId: number) => request<unknown>(`/api/runs/${runId}`),
  updateRun: (runId: number, body: { name: string; releaseVersion: string }) =>
    request(`/api/runs/${runId}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteRun: (runId: number) =>
    request(`/api/runs/${runId}`, {
      method: "DELETE",
    }),
  updateRunStatus: (runId: number, status: "open" | "closed") =>
    request(`/api/runs/${runId}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  runCase: (runCaseId: number) => request<unknown>(`/api/run-cases/${runCaseId}`),
  saveRunCaseResult: (runCaseId: number, body: unknown) =>
    request(`/api/run-cases/${runCaseId}/result`, { method: "POST", body: JSON.stringify(body) }),

  reportSummary: (projectId: number) => request<unknown>(`/api/reports/${projectId}/summary`),
  reportFailures: (projectId: number) => request<{ failures: unknown[] }>(`/api/reports/${projectId}/failures`),
  reportPriority: (projectId: number) => request<{ priorities: unknown[] }>(`/api/reports/${projectId}/priority`),

  adminUsers: () => request<{ users: unknown[] }>("/api/admin/users"),
  createUser: (body: { username: string; displayName: string; role: string; email: string; password: string }) =>
    request<{ userId: number }>("/api/admin/users", { method: "POST", body: JSON.stringify(body) }),
  updateUser: (userId: number, body: { username: string; displayName: string; role: string; email: string; password?: string }) =>
    request(`/api/admin/users/${userId}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteUser: (userId: number) =>
    request(`/api/admin/users/${userId}`, {
      method: "DELETE",
    }),
};
