import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import type { CaseDetail, Project, RunDetail, RunListItem, Suite, TestCaseListItem, User } from "./types";

type ViewKey = "cases" | "import" | "runs" | "reports" | "admin";
type StepStatus = "untested" | "pass" | "fail" | "blocked";
type CaseDetailTab = "basic" | "steps" | "history";

type AppNotification = {
  id: number;
  type: "success" | "error" | "info";
  message: string;
  timestamp: Date;
  read: boolean;
};

type DiffResult = {
  fields: Array<{ field: string; from: unknown; to: unknown }>;
  stepsAdded: Array<{ stepNo: number; action: string; inputData: string; expectedResult: string }>;
  stepsRemoved: Array<{ stepNo: number; action: string; inputData: string; expectedResult: string }>;
  stepsChanged: Array<{
    stepNo: number;
    from: { stepNo: number; action: string; inputData: string; expectedResult: string };
    to: { stepNo: number; action: string; inputData: string; expectedResult: string };
  }>;
};

type ImportPreview = {
  columnsOk: boolean;
  missingColumns: string[];
  totalRows: number;
  successCount: number;
  failCount: number;
  rows: Array<{ rowNumber: number; status: "success" | "fail"; errorMessage?: string; row: Record<string, string> }>;
};

const views: Array<{ key: ViewKey; label: string }> = [
  { key: "cases", label: "테스트 케이스" },
  { key: "import", label: "가져오기" },
  { key: "runs", label: "테스트 실행" },
  { key: "reports", label: "리포트" },
  { key: "admin", label: "관리" },
];

const stepStatuses: StepStatus[] = ["untested", "pass", "fail", "blocked"];
const allowedRoles = new Set(["admin", "qa", "tester"]);

const errorMessageMap: Record<string, string> = {
  unauthorized: "로그인이 만료되었습니다. 다시 로그인해 주세요.",
  user_not_found: "사용자를 찾을 수 없습니다.",
  username_required: "사용자명을 입력해 주세요.",
  name_required: "이름을 입력해 주세요.",
  project_and_name_required: "프로젝트와 이름이 필요합니다.",
  suite_and_name_required: "스위트와 이름이 필요합니다.",
  suite_cannot_parent_self: "스위트는 자기 자신을 부모로 지정할 수 없습니다.",
  project_id_required: "프로젝트를 선택해 주세요.",
  suite_id_required: "스위트를 선택해 주세요.",
  run_id_required: "Run을 선택해 주세요.",
  user_id_required: "사용자를 선택해 주세요.",
  user_payload_required: "사용자 정보를 모두 입력해 주세요.",
  from_and_to_required: "비교할 버전을 선택해 주세요.",
  version_not_found: "버전을 찾을 수 없습니다.",
  internal_error: "서버 오류가 발생했습니다.",
  diff_error: "버전 비교 중 오류가 발생했습니다.",
  suite_required_before_create_case: "케이스를 만들기 전에 스위트를 먼저 생성해 주세요.",
  case_not_selected: "케이스를 먼저 선택해 주세요.",
  run_case_not_selected: "실행할 Run Case를 먼저 선택해 주세요.",
  csv_text_required: "CSV 내용을 입력해 주세요.",
  run_name_required: "Run 이름을 입력해 주세요.",
  run_cases_required: "Run에 포함할 케이스를 1개 이상 선택해 주세요.",
  project_name_required: "프로젝트 이름을 입력해 주세요.",
  suite_name_required: "스위트 이름을 입력해 주세요.",
  case_title_required: "케이스 제목을 입력해 주세요.",
  user_username_required: "Username을 입력해 주세요.",
  user_display_name_required: "이름(Display Name)을 입력해 주세요.",
  user_email_required: "이메일을 입력해 주세요.",
  user_email_invalid: "유효한 이메일 형식이 아닙니다.",
  user_password_required: "비밀번호를 입력해 주세요.",
  user_role_invalid: "역할(Role) 값이 올바르지 않습니다.",
  run_name_too_long: "Run 이름은 100자 이하로 입력해 주세요.",
  title_too_long: "제목은 200자 이하로 입력해 주세요.",
};

function App() {
  const [activeView, setActiveView] = useState<ViewKey>("cases");

  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginMode, setLoginMode] = useState<"login" | "register">("login");
  const [registerDisplayName, setRegisterDisplayName] = useState("");
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);

  const [suites, setSuites] = useState<Suite[]>([]);
  const [cases, setCases] = useState<TestCaseListItem[]>([]);
  const [suiteFilterId, setSuiteFilterId] = useState<number | null>(null);
  const [newSuiteName, setNewSuiteName] = useState("");
  const [newSuiteParentId, setNewSuiteParentId] = useState<number | null>(null);
  const [exportSuiteId, setExportSuiteId] = useState<number | null>(null);

  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const [caseDetailTab, setCaseDetailTab] = useState<CaseDetailTab>("basic");
  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null);
  const [caseDraft, setCaseDraft] = useState<{
    suiteId: number;
    title: string;
    qualityAttribute: string;
    categoryLarge: string;
    categoryMedium: string;
    preconditions: string;
    priority: string;
    tags: string;
    steps: Array<{ stepNo: number; action: string; inputData: string; expectedResult: string }>;
  } | null>(null);

  const [diffFromVersion, setDiffFromVersion] = useState<number | null>(null);
  const [diffToVersion, setDiffToVersion] = useState<number | null>(null);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);

  const [csvFileName, setCsvFileName] = useState("import.csv");
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importLogs, setImportLogs] = useState<
    Array<{ id: number; fileName: string; totalRows: number; successCount: number; failCount: number; createdAt: string }>
  >([]);
  const [selectedImportLogId, setSelectedImportLogId] = useState<number | null>(null);
  const [importLogRows, setImportLogRows] = useState<
    Array<{ id: number; rowNumber: number; status: "success" | "fail"; errorMessage: string | null }>
  >([]);
  const [importLogStatusFilter, setImportLogStatusFilter] = useState<"all" | "success" | "fail">("all");
  const [importLogErrorSearch, setImportLogErrorSearch] = useState("");

  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [createRunCaseSearch, setCreateRunCaseSearch] = useState("");
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null);
  const [runCaseSearch, setRunCaseSearch] = useState("");
  const [runCaseStatusFilter, setRunCaseStatusFilter] = useState<"all" | StepStatus>("all");
  const [runCasePriorityFilter, setRunCasePriorityFilter] = useState<string>("all");
  const [selectedRunCaseId, setSelectedRunCaseId] = useState<number | null>(null);
  const [runCaseExecution, setRunCaseExecution] = useState<
    | {
        runCase: { id: number; runId: number; caseId: number; caseVersionId: number; status: StepStatus };
        snapshot: {
          id: number;
          caseId: number;
          versionNo: number;
          snapshot: {
            steps: Array<{ stepNo: number; action: string; inputData: string; expectedResult: string }>;
          };
        };
        result: {
          id: number;
          overallStatus: StepStatus;
          comment: string;
          stepResults: Array<{ stepNo: number; status: StepStatus; comment: string }>;
        } | null;
      }
    | null
  >(null);
  const [runCaseComment, setRunCaseComment] = useState("");
  const [runCaseSteps, setRunCaseSteps] = useState<Array<{ stepNo: number; status: StepStatus; comment: string }>>([]);
  const [newRunName, setNewRunName] = useState("Sprint Regression Run");
  const [newRunReleaseVersion, setNewRunReleaseVersion] = useState("v1.0.0");
  const [selectedRunCaseIds, setSelectedRunCaseIds] = useState<number[]>([]);

  const [reportSummary, setReportSummary] = useState<{
    totalRunCases: number;
    untested: number;
    pass: number;
    fail: number;
    blocked: number;
    completionRate: number;
  } | null>(null);
  const [reportFailures, setReportFailures] = useState<Array<{ runName: string; caseTitle: string; priority: string; comment: string }>>([]);
  const [reportPriorities, setReportPriorities] = useState<Array<{ priority: string; count: number }>>([]);

  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [selectedAdminUserId, setSelectedAdminUserId] = useState<number | null>(null);

  const [statusMessage, setStatusMessage] = useState("Ready");
  const [errorMessage, setErrorMessage] = useState("");

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const notificationIdCounter = useRef(0);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const addNotification = useCallback((type: AppNotification["type"], message: string) => {
    notificationIdCounter.current += 1;
    const item: AppNotification = {
      id: notificationIdCounter.current,
      type,
      message,
      timestamp: new Date(),
      read: false,
    };
    setNotifications((prev) => [item, ...prev].slice(0, 50));
  }, []);

  function markAllRead(): void {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function clearNotifications(): void {
    setNotifications([]);
    setShowNotifications(false);
  }

  // ── Modal state ──
  const [modal, setModal] = useState<{
    type: "projectCreate" | "projectRename" | "suiteRename" | "caseCreate" | "runEdit" | "userForm" | "confirm";
    title: string;
    fields?: Record<string, string>;
    confirmMessage?: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);
  const [modalError, setModalError] = useState("");
  const [isModalSubmitting, setIsModalSubmitting] = useState(false);

  function openModal(config: NonNullable<typeof modal>): void {
    setModal(config);
    setModalError("");
    setIsModalSubmitting(false);
  }

  const modalFieldsRef = useRef<Record<string, string>>({});

  // keep ref in sync
  useEffect(() => {
    modalFieldsRef.current = modal?.fields ?? {};
  }, [modal?.fields]);

  function closeModal(): void {
    if (isModalSubmitting) return;
    setModal(null);
    setModalError("");
    setIsModalSubmitting(false);
    modalFieldsRef.current = {};
  }

  function updateModalField(key: string, value: string): void {
    if (modalError) setModalError("");
    setModal((prev) => prev ? { ...prev, fields: { ...prev.fields, [key]: value } } : prev);
  }

  function getField(key: string): string {
    return modalFieldsRef.current[key] ?? "";
  }

  function resolveErrorMessage(error: unknown, fallback: string): string {
    if (!(error instanceof Error)) return fallback;
    const raw = error.message.trim();
    if (!raw) return fallback;
    return errorMessageMap[raw] ?? raw;
  }

  function showError(error: unknown, fallback: string): void {
    const message = resolveErrorMessage(error, fallback);
    setErrorMessage(message);
    setStatusMessage(`실패: ${message}`);
    addNotification("error", message);
  }

  async function runGuarded(action: () => Promise<void>, fallback: string): Promise<boolean> {
    setErrorMessage("");
    try {
      await action();
      return true;
    } catch (error) {
      showError(error, fallback);
      return false;
    }
  }

  function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  async function handleModalConfirm(): Promise<void> {
    if (!modal || isModalSubmitting) return;
    setModalError("");
    setErrorMessage("");
    setIsModalSubmitting(true);
    try {
      await modal.onConfirm();
    } catch (error) {
      const message = resolveErrorMessage(error, "작업 처리 중 오류가 발생했습니다.");
      setModalError(message);
      setErrorMessage(message);
      setStatusMessage(`실패: ${message}`);
      addNotification("error", message);
    } finally {
      setIsModalSubmitting(false);
    }
  }

  function formatRelativeTime(date: Date): string {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return "방금";
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    return `${Math.floor(diff / 86400)}일 전`;
  }

  const filteredCases = useMemo(() => {
    const next = suiteFilterId ? cases.filter((item) => item.suiteId === suiteFilterId) : [...cases];
    return next.sort((a, b) => a.id - b.id);
  }, [cases, suiteFilterId]);

  const suiteTreeRoots = useMemo(() => {
    const byParent = new Map<number | null, Suite[]>();
    for (const suite of suites) {
      const parent = suite.parentSuiteId ?? null;
      const bucket = byParent.get(parent) ?? [];
      bucket.push(suite);
      byParent.set(parent, bucket);
    }
    for (const bucket of byParent.values()) {
      bucket.sort((a, b) => a.name.localeCompare(b.name));
    }
    return byParent;
  }, [suites]);

  const computedRunOverallStatus = useMemo<StepStatus>(() => {
    if (!runCaseSteps.length) return "untested";
    const statuses = runCaseSteps.map((item) => item.status);
    if (statuses.includes("fail")) return "fail";
    if (statuses.includes("blocked")) return "blocked";
    if (statuses.every((status) => status === "pass")) return "pass";
    if (statuses.every((status) => status === "untested")) return "untested";
    return "blocked";
  }, [runCaseSteps]);

  const runStepSummary = useMemo(() => {
    const summary = { untested: 0, pass: 0, fail: 0, blocked: 0 };
    for (const step of runCaseSteps) {
      summary[step.status] += 1;
    }
    return summary;
  }, [runCaseSteps]);

  const filteredSelectableCases = useMemo(() => {
    const keyword = createRunCaseSearch.trim().toLowerCase();
    if (!keyword) return cases;
    return cases.filter(
      (item) =>
        item.title.toLowerCase().includes(keyword) ||
        item.suiteName.toLowerCase().includes(keyword) ||
        String(item.id).includes(keyword),
    );
  }, [cases, createRunCaseSearch]);

  const runCasePriorityOptions = useMemo(() => {
    if (!runDetail) return [] as string[];
    return Array.from(new Set(runDetail.cases.map((item) => item.priority))).sort((a, b) => a.localeCompare(b));
  }, [runDetail]);

  const filteredRunCases = useMemo(() => {
    if (!runDetail) return [] as RunDetail["cases"];
    const keyword = runCaseSearch.trim().toLowerCase();
    return runDetail.cases.filter((item) => {
      const matchesSearch = !keyword || item.caseTitle.toLowerCase().includes(keyword) || String(item.id).includes(keyword);
      const matchesStatus = runCaseStatusFilter === "all" || item.status === runCaseStatusFilter;
      const matchesPriority = runCasePriorityFilter === "all" || item.priority === runCasePriorityFilter;
      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [runDetail, runCaseSearch, runCaseStatusFilter, runCasePriorityFilter]);

  const filteredImportLogRows = useMemo(() => {
    const keyword = importLogErrorSearch.trim().toLowerCase();
    return importLogRows.filter((row) => {
      const statusMatch = importLogStatusFilter === "all" || row.status === importLogStatusFilter;
      const textMatch =
        !keyword ||
        String(row.errorMessage || "")
          .toLowerCase()
          .includes(keyword);
      return statusMatch && textMatch;
    });
  }, [importLogRows, importLogStatusFilter, importLogErrorSearch]);

  const diffStepRows = useMemo(() => {
    if (!diffResult) return [] as Array<{
      stepNo: number;
      changeType: "added" | "removed" | "changed";
      fromAction: string;
      toAction: string;
      fromExpected: string;
      toExpected: string;
    }>;

    return [
      ...diffResult.stepsAdded.map((step) => ({
        stepNo: step.stepNo,
        changeType: "added" as const,
        fromAction: "-",
        toAction: step.action,
        fromExpected: "-",
        toExpected: step.expectedResult,
      })),
      ...diffResult.stepsRemoved.map((step) => ({
        stepNo: step.stepNo,
        changeType: "removed" as const,
        fromAction: step.action,
        toAction: "-",
        fromExpected: step.expectedResult,
        toExpected: "-",
      })),
      ...diffResult.stepsChanged.map((step) => ({
        stepNo: step.stepNo,
        changeType: "changed" as const,
        fromAction: step.from.action,
        toAction: step.to.action,
        fromExpected: step.from.expectedResult,
        toExpected: step.to.expectedResult,
      })),
    ].sort((a, b) => a.stepNo - b.stepNo);
  }, [diffResult]);

  async function initializeAuth(): Promise<void> {
    try {
      const me = (await api.me()).user as User;
      setCurrentUser(me);
    } catch {
      setCurrentUser(null);
    }
  }

  async function loadProjectState(nextProjectId: number): Promise<void> {
    setStatusMessage("Loading project data...");

    const [suitePayload, casePayload, runPayload, logPayload, summaryPayload, failurePayload, priorityPayload, adminPayload] =
      await Promise.all([
        api.suites(nextProjectId),
        api.listCases(nextProjectId),
        api.listRuns(nextProjectId),
        api.importLogs(),
        api.reportSummary(nextProjectId),
        api.reportFailures(nextProjectId),
        api.reportPriority(nextProjectId),
        api.adminUsers(),
      ]);

    const nextSuites = suitePayload.suites as Suite[];
    const nextCases = casePayload.cases as TestCaseListItem[];
    const nextRuns = runPayload.runs as RunListItem[];

    setSuites(nextSuites);
    setCases(nextCases);
    setRuns(nextRuns);
    setImportLogs(logPayload.logs as Array<{ id: number; fileName: string; totalRows: number; successCount: number; failCount: number; createdAt: string }>);

    setReportSummary(summaryPayload as typeof reportSummary);
    setReportFailures((failurePayload.failures || []) as Array<{ runName: string; caseTitle: string; priority: string; comment: string }>);
    setReportPriorities((priorityPayload.priorities || []) as Array<{ priority: string; count: number }>);

    const nextAdminUsers = adminPayload.users as User[];
    setAdminUsers(nextAdminUsers);
    setSelectedAdminUserId(nextAdminUsers[0]?.id ?? null);

    setSelectedCaseId(nextCases[0]?.id ?? null);
    setSelectedRunId(nextRuns[0]?.id ?? null);
    setSelectedRunCaseId(null);
    setStatusMessage("Project loaded");
  }

  async function bootstrap(): Promise<void> {
    const payload = await api.projects();
    const nextProjects = payload.projects as Project[];
    setProjects(nextProjects);

    const nextProjectId = nextProjects[0]?.id ?? null;
    setProjectId(nextProjectId);
    if (nextProjectId) {
      await loadProjectState(nextProjectId);
    }
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await initializeAuth();
      } catch (error) {
        showError(error, "인증 초기화에 실패했습니다.");
      }
    })();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    void bootstrap().catch((error) => {
      showError(error, "초기 데이터 로딩에 실패했습니다.");
    });
  }, [currentUser]);

  useEffect(() => {
    if (!selectedCaseId) {
      setCaseDetail(null);
      setCaseDraft(null);
      setCaseDetailTab("basic");
      setDiffResult(null);
      setDiffFromVersion(null);
      setDiffToVersion(null);
      return;
    }

    void (async () => {
      try {
        const detail = (await api.caseDetail(selectedCaseId)) as CaseDetail;
        setCaseDetail(detail);

        const snapshot = detail.currentVersion?.snapshot;
        if (snapshot) {
          setCaseDraft({
            suiteId: snapshot.suiteId,
            title: snapshot.title,
            qualityAttribute: snapshot.qualityAttribute,
            categoryLarge: snapshot.categoryLarge,
            categoryMedium: snapshot.categoryMedium,
            preconditions: snapshot.preconditions,
            priority: snapshot.priority,
            tags: snapshot.tags.join(","),
            steps: snapshot.steps.map((step) => ({ ...step })),
          });
          setCaseDetailTab("basic");
          setDiffResult(null);
          setDiffFromVersion(null);
          setDiffToVersion(null);
        }
      } catch (error) {
        showError(error, "케이스 상세를 불러오지 못했습니다.");
      }
    })();
  }, [selectedCaseId]);

  useEffect(() => {
    if (!selectedRunId) {
      setRunDetail(null);
      setRunCaseSearch("");
      setRunCaseStatusFilter("all");
      setRunCasePriorityFilter("all");
      return;
    }
    void (async () => {
      try {
        const payload = (await api.runDetail(selectedRunId)) as RunDetail;
        setRunDetail(payload);
        setRunCaseSearch("");
        setRunCaseStatusFilter("all");
        setRunCasePriorityFilter("all");
        setSelectedRunCaseId(payload.cases[0]?.id ?? null);
      } catch (error) {
        showError(error, "Run 상세를 불러오지 못했습니다.");
      }
    })();
  }, [selectedRunId]);

  useEffect(() => {
    if (!selectedRunCaseId) {
      setRunCaseExecution(null);
      setRunCaseComment("");
      setRunCaseSteps([]);
      return;
    }
    void (async () => {
      try {
        const payload = (await api.runCase(selectedRunCaseId)) as typeof runCaseExecution;
        setRunCaseExecution(payload);

        const existing = payload?.result?.stepResults || [];
        const stepMap = new Map(existing.map((item) => [item.stepNo, item]));

        const initSteps = (payload?.snapshot.snapshot.steps || []).map((step) => {
          const found = stepMap.get(step.stepNo);
          return {
            stepNo: step.stepNo,
            status: (found?.status || "untested") as StepStatus,
            comment: found?.comment || "",
          };
        });

        setRunCaseComment(payload?.result?.comment || "");
        setRunCaseSteps(initSteps);
      } catch (error) {
        showError(error, "Run Case를 불러오지 못했습니다.");
      }
    })();
  }, [selectedRunCaseId]);

  async function handleLogin(): Promise<void> {
    await runGuarded(async () => {
      const result = await api.login(loginUsername, loginPassword);
      const me = result.user as User;
      setCurrentUser(me);
      setLoginPassword("");
      setStatusMessage(`Logged in as ${me.displayName}`);
    }, "로그인에 실패했습니다.");
  }

  async function handleRegister(): Promise<void> {
    await runGuarded(async () => {
      const result = await api.register(loginUsername, registerDisplayName, loginPassword);
      const me = result.user as User;
      setCurrentUser(me);
      setLoginPassword("");
      setRegisterDisplayName("");
      setLoginMode("login");
      setStatusMessage(`회원가입 완료: ${me.displayName}`);
    }, "회원가입에 실패했습니다.");
  }

  async function handleLogout(): Promise<void> {
    await runGuarded(async () => {
      await api.logout();
      setCurrentUser(null);
      setProjects([]);
      setProjectId(null);
      setCases([]);
      setSuites([]);
      setStatusMessage("Logged out");
    }, "로그아웃에 실패했습니다.");
  }

  async function reloadCurrentProject(): Promise<void> {
    if (!projectId) return;
    await loadProjectState(projectId);
  }

  function openCreateProjectModal(): void {
    openModal({
      type: "projectCreate",
      title: "새 프로젝트",
      fields: { name: "" },
      onConfirm: async () => {
        const name = getField("name").trim();
        if (!name) throw new Error("project_name_required");
        const result = await api.createProject(name);
        const payload = await api.projects();
        setProjects(payload.projects as Project[]);
        setProjectId(result.projectId);
        await loadProjectState(result.projectId);
        setStatusMessage(`Project created: ${name}`);
        addNotification("success", `프로젝트 생성: ${name}`);
        closeModal();
      },
    });
  }

  function openRenameProjectModal(): void {
    if (!projectId) return;
    const current = projects.find((p) => p.id === projectId);
    openModal({
      type: "projectRename",
      title: "프로젝트 이름 수정",
      fields: { name: current?.name || "" },
      onConfirm: async () => {
        const name = getField("name").trim();
        if (!name) throw new Error("project_name_required");
        if (!projectId) throw new Error("project_id_required");
        await api.updateProject(projectId, name);
        const payload = await api.projects();
        setProjects(payload.projects as Project[]);
        await reloadCurrentProject();
        setStatusMessage(`Project updated: ${name}`);
        addNotification("success", `프로젝트 수정: ${name}`);
        closeModal();
      },
    });
  }

  function openDeleteProjectModal(): void {
    if (!projectId) return;
    const current = projects.find((p) => p.id === projectId);
    openModal({
      type: "confirm",
      title: "프로젝트 삭제",
      confirmMessage: `프로젝트 "${current?.name || projectId}"를 삭제할까요?`,
      onConfirm: async () => {
        if (!projectId) throw new Error("project_id_required");
        const deletedName = current?.name || String(projectId);
        await api.deleteProject(projectId);
        const payload = await api.projects();
        const nextProjects = payload.projects as Project[];
        setProjects(nextProjects);
        const nextProjectId = nextProjects[0]?.id ?? null;
        setProjectId(nextProjectId);
        if (nextProjectId) {
          await loadProjectState(nextProjectId);
        } else {
          setSuites([]);
          setCases([]);
          setRuns([]);
          setImportLogs([]);
          setAdminUsers([]);
          setSelectedCaseId(null);
          setSelectedRunId(null);
          setSelectedRunCaseId(null);
          setSelectedImportLogId(null);
          setSelectedAdminUserId(null);
          setStatusMessage("No project");
        }
        addNotification("success", `프로젝트 삭제: ${deletedName}`);
        closeModal();
      },
    });
  }

  async function saveCaseDraft(): Promise<void> {
    await runGuarded(async () => {
      if (!selectedCaseId || !caseDraft) throw new Error("case_not_selected");
      const trimmedTitle = caseDraft.title.trim();
      if (!trimmedTitle) throw new Error("case_title_required");
      if (trimmedTitle.length > 200) throw new Error("title_too_long");
      if (!caseDraft.steps.length) {
        throw new Error("최소 1개 이상의 스텝이 필요합니다.");
      }

      await api.updateCase(selectedCaseId, {
        suiteId: caseDraft.suiteId,
        title: trimmedTitle,
        qualityAttribute: caseDraft.qualityAttribute,
        categoryLarge: caseDraft.categoryLarge,
        categoryMedium: caseDraft.categoryMedium,
        preconditions: caseDraft.preconditions,
        priority: caseDraft.priority,
        tags: caseDraft.tags
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        steps: caseDraft.steps,
      });

      setStatusMessage("Case saved as new version");
      addNotification("success", `케이스 저장: ${trimmedTitle}`);
      await reloadCurrentProject();
      const detail = (await api.caseDetail(selectedCaseId)) as CaseDetail;
      setCaseDetail(detail);
    }, "케이스 저장에 실패했습니다.");
  }

  async function handleCompareVersions(): Promise<void> {
    await runGuarded(async () => {
      if (!selectedCaseId) throw new Error("case_not_selected");
      if (!diffFromVersion || !diffToVersion) throw new Error("from_and_to_required");
      const result = (await api.caseDiff(selectedCaseId, diffFromVersion, diffToVersion)) as { diff: DiffResult };
      setDiffResult(result.diff);
    }, "버전 비교에 실패했습니다.");
  }

  async function handlePreviewImport(): Promise<void> {
    await runGuarded(async () => {
      if (!csvText.trim()) throw new Error("csv_text_required");
      const result = (await api.importPreview(csvText)) as ImportPreview;
      setPreview(result);
      setStatusMessage("Import preview generated");
      addNotification("info", "Import 미리보기 생성됨");
    }, "Import 미리보기 생성에 실패했습니다.");
  }

  async function handleExecuteImport(): Promise<void> {
    await runGuarded(async () => {
      if (!projectId) throw new Error("project_id_required");
      if (!csvText.trim()) throw new Error("csv_text_required");
      await api.importExecute(projectId, csvFileName, csvText);
      setStatusMessage("Import completed");
      addNotification("success", `Import 완료: ${csvFileName}`);
      await reloadCurrentProject();
      setPreview(null);
    }, "Import 실행에 실패했습니다.");
  }

  async function handleSelectImportLog(logId: number): Promise<void> {
    await runGuarded(async () => {
      setSelectedImportLogId(logId);
      setImportLogStatusFilter("all");
      setImportLogErrorSearch("");
      const payload = await api.importLogRows(logId);
      setImportLogRows(payload.rows as Array<{ id: number; rowNumber: number; status: "success" | "fail"; errorMessage: string | null }>);
    }, "Import 로그 조회에 실패했습니다.");
  }

  function handleExportCasesCsv(): void {
    if (!projectId) return;
    const query = exportSuiteId ? `?suiteId=${encodeURIComponent(String(exportSuiteId))}` : "";
    const url = `/api/projects/${projectId}/cases/export${query}`;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const fileName = exportSuiteId ? `tmt-cases-suite-${exportSuiteId}-${stamp}.csv` : `tmt-cases-all-${stamp}.csv`;

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setStatusMessage(`CSV export requested: ${fileName}`);
  }

  async function handleCreateRun(): Promise<void> {
    await runGuarded(async () => {
      if (!projectId) throw new Error("project_id_required");
      const trimmedName = newRunName.trim();
      if (!trimmedName) throw new Error("run_name_required");
      if (trimmedName.length > 100) throw new Error("run_name_too_long");
      if (selectedRunCaseIds.length === 0) throw new Error("run_cases_required");

      const result = await api.createRun({
        projectId,
        name: trimmedName,
        releaseVersion: newRunReleaseVersion.trim(),
        caseIds: selectedRunCaseIds,
      });
      const runId = result.runId;
      setStatusMessage(`Run ${runId} created`);
      addNotification("success", `Run 생성: ${trimmedName}`);
      await reloadCurrentProject();
      setSelectedRunId(runId);
    }, "Run 생성에 실패했습니다.");
  }

  async function handleSaveRunCaseResult(): Promise<void> {
    await runGuarded(async () => {
      if (!selectedRunCaseId) throw new Error("run_case_not_selected");
      await api.saveRunCaseResult(selectedRunCaseId, {
        comment: runCaseComment,
        stepResults: runCaseSteps,
      });
      setStatusMessage("Run case result saved");
      addNotification("success", "테스트 결과 저장됨");
      if (selectedRunId) {
        const payload = (await api.runDetail(selectedRunId)) as RunDetail;
        setRunDetail(payload);
      }
    }, "테스트 결과 저장에 실패했습니다.");
  }

  async function toggleRunStatus(): Promise<void> {
    await runGuarded(async () => {
      if (!selectedRunId || !runDetail) throw new Error("run_id_required");
      const nextStatus = runDetail.run.status === "open" ? "closed" : "open";
      await api.updateRunStatus(selectedRunId, nextStatus);
      setStatusMessage(`Run status changed to ${nextStatus}`);
      addNotification("info", `Run 상태 변경: ${nextStatus}`);
      const payload = (await api.runDetail(selectedRunId)) as RunDetail;
      setRunDetail(payload);
    }, "Run 상태 변경에 실패했습니다.");
  }

  function openUpdateRunModal(): void {
    if (!selectedRunId || !runDetail) return;
    openModal({
      type: "runEdit",
      title: "Run 수정",
      fields: { name: runDetail.run.name, releaseVersion: runDetail.run.releaseVersion || "" },
      onConfirm: async () => {
        const name = getField("name").trim();
        const releaseVersion = getField("releaseVersion").trim();
        if (!name) throw new Error("run_name_required");
        if (name.length > 100) throw new Error("run_name_too_long");
        if (!selectedRunId) throw new Error("run_id_required");
        await api.updateRun(selectedRunId, { name, releaseVersion });
        const payload = (await api.runDetail(selectedRunId)) as RunDetail;
        setRunDetail(payload);
        setStatusMessage(`Run updated: ${name}`);
        addNotification("success", `Run 수정: ${name}`);
        closeModal();
      },
    });
  }

  function openDeleteRunModal(): void {
    if (!selectedRunId || !runDetail) return;
    openModal({
      type: "confirm",
      title: "Run 삭제",
      confirmMessage: `Run "${runDetail.run.name}"를 삭제할까요?`,
      onConfirm: async () => {
        if (!selectedRunId || !runDetail) throw new Error("run_id_required");
        const deletedName = runDetail.run.name;
        await api.deleteRun(selectedRunId);
        await reloadCurrentProject();
        setStatusMessage(`Run deleted: ${deletedName}`);
        addNotification("success", `Run 삭제: ${deletedName}`);
        closeModal();
      },
    });
  }

  async function refreshReports(): Promise<void> {
    await runGuarded(async () => {
      if (!projectId) throw new Error("project_id_required");
      const [summary, failures, priorities] = await Promise.all([
        api.reportSummary(projectId),
        api.reportFailures(projectId),
        api.reportPriority(projectId),
      ]);

      setReportSummary(summary as typeof reportSummary);
      setReportFailures((failures.failures || []) as Array<{ runName: string; caseTitle: string; priority: string; comment: string }>);
      setReportPriorities((priorities.priorities || []) as Array<{ priority: string; count: number }>);
    }, "리포트 갱신에 실패했습니다.");
  }

  function openDeleteImportLogModal(): void {
    if (!selectedImportLogId) return;
    openModal({
      type: "confirm",
      title: "Import 로그 삭제",
      confirmMessage: `Import Log #${selectedImportLogId}를 삭제할까요?`,
      onConfirm: async () => {
        if (!selectedImportLogId) return;
        await api.deleteImportLog(selectedImportLogId);
        setSelectedImportLogId(null);
        setImportLogRows([]);
        if (projectId) await reloadCurrentProject();
        addNotification("success", `Import Log #${selectedImportLogId} 삭제됨`);
        closeModal();
      },
    });
  }

  function openClearImportLogsModal(): void {
    openModal({
      type: "confirm",
      title: "Import 로그 전체 삭제",
      confirmMessage: "모든 Import 로그를 삭제할까요?",
      onConfirm: async () => {
        await api.clearImportLogs();
        setSelectedImportLogId(null);
        setImportLogRows([]);
        if (projectId) await reloadCurrentProject();
        addNotification("success", "모든 Import 로그 삭제됨");
        closeModal();
      },
    });
  }

  function openCreateUserModal(): void {
    openModal({
      type: "userForm",
      title: "새 사용자",
      fields: { username: "", displayName: "", role: "tester", email: "", password: "" },
      onConfirm: async () => {
        const username = getField("username").trim();
        const displayName = getField("displayName").trim();
        const role = getField("role").trim() || "tester";
        const email = getField("email").trim();
        const password = getField("password");
        if (!username) throw new Error("user_username_required");
        if (!displayName) throw new Error("user_display_name_required");
        if (!email) throw new Error("user_email_required");
        if (!isValidEmail(email)) throw new Error("user_email_invalid");
        if (!password) throw new Error("user_password_required");
        if (!allowedRoles.has(role)) throw new Error("user_role_invalid");
        await api.createUser({
          username,
          displayName,
          role,
          email,
          password,
        });
        await initializeAuth();
        if (projectId) await reloadCurrentProject();
        addNotification("success", `사용자 생성: ${username}`);
        closeModal();
      },
    });
  }

  function openEditUserModal(): void {
    if (!selectedAdminUserId) return;
    const target = adminUsers.find((u) => u.id === selectedAdminUserId);
    if (!target) return;
    openModal({
      type: "userForm",
      title: "사용자 수정",
      fields: {
        username: target.username,
        displayName: target.displayName,
        role: target.role,
        email: target.email || "",
        password: "",
      },
      onConfirm: async () => {
        const username = getField("username").trim();
        const displayName = getField("displayName").trim();
        const role = getField("role").trim() || "tester";
        const email = getField("email").trim();
        const password = getField("password");
        if (!username) throw new Error("user_username_required");
        if (!displayName) throw new Error("user_display_name_required");
        if (!email) throw new Error("user_email_required");
        if (!isValidEmail(email)) throw new Error("user_email_invalid");
        if (!allowedRoles.has(role)) throw new Error("user_role_invalid");
        if (!selectedAdminUserId) throw new Error("user_id_required");
        await api.updateUser(selectedAdminUserId, {
          username,
          displayName,
          role,
          email,
          password: password || undefined,
        });
        await initializeAuth();
        if (projectId) await reloadCurrentProject();
        addNotification("success", `사용자 수정: ${username}`);
        closeModal();
      },
    });
  }

  function openDeleteUserModal(): void {
    if (!selectedAdminUserId) return;
    const target = adminUsers.find((u) => u.id === selectedAdminUserId);
    if (!target) return;
    openModal({
      type: "confirm",
      title: "사용자 삭제",
      confirmMessage: `유저 "${target.username}"를 삭제할까요?`,
      onConfirm: async () => {
        if (!selectedAdminUserId) throw new Error("user_id_required");
        const t = adminUsers.find((u) => u.id === selectedAdminUserId);
        await api.deleteUser(selectedAdminUserId);
        await initializeAuth();
        if (projectId) await reloadCurrentProject();
        addNotification("success", `사용자 삭제: ${t?.username || ""}`);
        closeModal();
      },
    });
  }

  async function handleCreateSuite(): Promise<void> {
    await runGuarded(async () => {
      if (!projectId) throw new Error("project_id_required");
      const name = newSuiteName.trim();
      if (!name) throw new Error("suite_name_required");
      await api.createSuite(projectId, name, newSuiteParentId);
      setNewSuiteName("");
      setNewSuiteParentId(null);
      await reloadCurrentProject();
      setStatusMessage(`Suite "${name}" created`);
      addNotification("success", `스위트 생성: ${name}`);
    }, "스위트 생성에 실패했습니다.");
  }

  function openRenameSuiteModal(): void {
    if (!suiteFilterId) return;
    const target = suites.find((s) => s.id === suiteFilterId);
    if (!target) return;
    openModal({
      type: "suiteRename",
      title: "스위트 이름 수정",
      fields: { name: target.name },
      onConfirm: async () => {
        const name = getField("name").trim();
        if (!name) throw new Error("suite_name_required");
        if (!suiteFilterId) throw new Error("suite_id_required");
        const t = suites.find((s) => s.id === suiteFilterId);
        await api.updateSuite(suiteFilterId, name, t?.parentSuiteId ?? null);
        await reloadCurrentProject();
        setStatusMessage(`Suite updated: ${name}`);
        addNotification("success", `스위트 수정: ${name}`);
        closeModal();
      },
    });
  }

  function openDeleteSuiteModal(): void {
    if (!suiteFilterId) return;
    const target = suites.find((s) => s.id === suiteFilterId);
    if (!target) return;
    openModal({
      type: "confirm",
      title: "스위트 삭제",
      confirmMessage: `스위트 "${target.name}"를 삭제할까요? (하위 케이스 포함)`,
      onConfirm: async () => {
        if (!suiteFilterId) throw new Error("suite_id_required");
        const t = suites.find((s) => s.id === suiteFilterId);
        await api.deleteSuite(suiteFilterId);
        setSuiteFilterId(null);
        await reloadCurrentProject();
        setStatusMessage(`Suite deleted: ${t?.name}`);
        addNotification("success", `스위트 삭제: ${t?.name}`);
        closeModal();
      },
    });
  }

  function openCreateCaseModal(): void {
    if (!projectId) return;
    const defaultSuiteId = suiteFilterId ?? suites[0]?.id;
    if (!defaultSuiteId) {
      showError(new Error("suite_required_before_create_case"), "케이스 생성을 위한 스위트가 필요합니다.");
      return;
    }
    openModal({
      type: "caseCreate",
      title: "새 테스트 케이스",
      fields: { title: "" },
      onConfirm: async () => {
        const title = getField("title").trim();
        if (!title) throw new Error("case_title_required");
        if (title.length > 200) throw new Error("title_too_long");
        if (!projectId) throw new Error("project_id_required");
        const sid = suiteFilterId ?? suites[0]?.id;
        if (!sid) throw new Error("suite_required_before_create_case");
        const result = await api.createCase(projectId, {
          suiteId: sid,
          title,
          qualityAttribute: "",
          categoryLarge: "",
          categoryMedium: "",
          preconditions: "",
          priority: "Medium",
          tags: [],
          steps: [{ stepNo: 1, action: "New step", inputData: "", expectedResult: "" }],
        });
        await reloadCurrentProject();
        setSelectedCaseId(result.caseId);
        setStatusMessage(`Case created: ${title}`);
        addNotification("success", `케이스 생성: ${title}`);
        closeModal();
      },
    });
  }

  function openDeleteCaseModal(): void {
    if (!selectedCaseId) return;
    const target = cases.find((item) => item.id === selectedCaseId);
    if (!target) return;
    openModal({
      type: "confirm",
      title: "케이스 삭제",
      confirmMessage: `케이스 "${target.title}"를 삭제할까요?`,
      onConfirm: async () => {
        if (!selectedCaseId) throw new Error("case_not_selected");
        const t = cases.find((item) => item.id === selectedCaseId);
        await api.deleteCase(selectedCaseId);
        await reloadCurrentProject();
        setStatusMessage(`Case deleted: ${t?.title}`);
        addNotification("success", `케이스 삭제: ${t?.title}`);
        closeModal();
      },
    });
  }

  function renderSuiteTree(parentId: number | null = null, depth = 0): JSX.Element | null {
    const children = suiteTreeRoots.get(parentId) ?? [];
    if (!children.length) return null;

    return (
      <ul className={depth === 0 ? "list suite-tree" : "suite-children"}>
        {children.map((suite) => {
          const caseCount = cases.filter((item) => item.suiteId === suite.id).length;
          return (
            <li key={suite.id}>
              <button
                className={suiteFilterId === suite.id ? "active suite-button" : "suite-button"}
                onClick={() => setSuiteFilterId(suite.id)}
                style={{ paddingLeft: `${10 + depth * 14}px` }}
              >
                <span>{suite.name}</span>
                <small>{caseCount}</small>
              </button>
              {renderSuiteTree(suite.id, depth + 1)}
            </li>
          );
        })}
      </ul>
    );
  }

  if (!currentUser) {
    const isRegister = loginMode === "register";
    const submitFn = isRegister ? handleRegister : handleLogin;
    const canSubmit = isRegister
      ? !!(loginUsername && loginPassword && registerDisplayName)
      : !!(loginUsername && loginPassword);

    return (
      <div className="login-wrap">
        <div className="card login-card">
          <h1>TMT MVP</h1>
          <p>{isRegister ? "새 계정을 생성합니다." : "등록된 계정으로 로그인하세요."}</p>
          <label>
            아이디
            <input
              type="text"
              value={loginUsername}
              onChange={(e) => setLoginUsername(e.target.value)}
              placeholder="아이디"
              onKeyDown={(e) => e.key === "Enter" && canSubmit && void submitFn()}
            />
          </label>
          {isRegister && (
            <label>
              이름
              <input
                type="text"
                value={registerDisplayName}
                onChange={(e) => setRegisterDisplayName(e.target.value)}
                placeholder="표시 이름"
                onKeyDown={(e) => e.key === "Enter" && canSubmit && void submitFn()}
              />
            </label>
          )}
          <label>
            비밀번호
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="비밀번호"
              onKeyDown={(e) => e.key === "Enter" && canSubmit && void submitFn()}
            />
          </label>
          <button onClick={() => void submitFn()} disabled={!canSubmit}>
            {isRegister ? "회원가입" : "로그인"}
          </button>
          {errorMessage ? <div className="error">{errorMessage}</div> : null}
          <button
            className="ghost"
            style={{ marginTop: 4 }}
            onClick={() => { setLoginMode(isRegister ? "login" : "register"); setErrorMessage(""); }}
          >
            {isRegister ? "로그인으로 돌아가기" : "회원가입"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <h2>TMT MVP</h2>
        <div className="sidebar-user">
          <div>{currentUser.displayName}</div>
          <small>{currentUser.role}</small>
        </div>
        <nav>
          {views.map((view) => (
            <button
              key={view.key}
              className={activeView === view.key ? "active" : ""}
              onClick={() => setActiveView(view.key)}
            >
              {view.label}
            </button>
          ))}
        </nav>
        <button className="ghost" onClick={() => void handleLogout()}>
          로그아웃
        </button>
      </aside>

      <main className="main">
        <header className="topbar card">
          <div>
            <h1>{views.find((v) => v.key === activeView)?.label}</h1>
            <p>{statusMessage}</p>
          </div>
          <div className="top-controls">
            <div className="notification-wrap" ref={notificationRef}>
              <button
                className="notification-bell ghost"
                onClick={() => {
                  setShowNotifications((prev) => !prev);
                  if (!showNotifications) markAllRead();
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                {unreadCount > 0 && <span className="notification-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
              </button>
              {showNotifications && (
                <div className="notification-panel">
                  <div className="notification-panel-header">
                    <h4>알림</h4>
                    <div className="notification-panel-actions">
                      <button className="ghost tiny" onClick={markAllRead}>모두 읽음</button>
                      <button className="ghost tiny" onClick={clearNotifications}>비우기</button>
                    </div>
                  </div>
                  {notifications.length === 0 ? (
                    <div className="notification-empty">알림이 없습니다</div>
                  ) : (
                    <ul className="notification-list">
                      {notifications.map((n) => (
                        <li key={n.id} className={`notification-item${n.read ? "" : " unread"}`}>
                          <span className={`notification-dot ${n.type}`} />
                          <span className="notification-message">{n.message}</span>
                          <span className="notification-time">{formatRelativeTime(n.timestamp)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <label>
              프로젝트
              <select
                value={projectId ?? ""}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setProjectId(next);
                  void loadProjectState(next);
                }}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="ghost" onClick={() => void reloadCurrentProject()}>
              새로고침
            </button>
            <button className="ghost" onClick={() => void openCreateProjectModal()}>
              + 프로젝트
            </button>
            <button className="ghost" onClick={() => void openRenameProjectModal()} disabled={!projectId}>
              이름변경
            </button>
            <button className="ghost" onClick={() => void openDeleteProjectModal()} disabled={!projectId}>
              삭제
            </button>
          </div>
        </header>

        {errorMessage ? <div className="error card">{errorMessage}</div> : null}

        {activeView === "cases" && (
          <section className="content-grid cases-grid">
            <div className="card">
              <h3>스위트 트리</h3>
              <div className="inline-actions">
                <button className="ghost tiny" onClick={() => setSuiteFilterId(null)}>
                  전체 케이스
                </button>
                <button className="ghost tiny" onClick={() => void openRenameSuiteModal()} disabled={!suiteFilterId}>
                  스위트 이름변경
                </button>
                <button className="ghost tiny" onClick={() => void openDeleteSuiteModal()} disabled={!suiteFilterId}>
                  스위트 삭제
                </button>
              </div>
              <div className="suite-create">
                <label>
                  새 스위트
                  <input
                    value={newSuiteName}
                    onChange={(event) => setNewSuiteName(event.target.value)}
                    placeholder="스위트 이름"
                  />
                </label>
                <label>
                  상위 스위트
                  <select
                    value={newSuiteParentId ?? ""}
                    onChange={(event) => setNewSuiteParentId(event.target.value ? Number(event.target.value) : null)}
                  >
                    <option value="">(root)</option>
                    {suites.map((suite) => (
                      <option key={suite.id} value={suite.id}>
                        {suite.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="ghost tiny" onClick={() => void handleCreateSuite()}>
                  + 스위트 추가
                </button>
              </div>
              {renderSuiteTree()}
            </div>

            <div className="card">
              <h3>케이스 목록 ({filteredCases.length})</h3>
              <div className="inline-actions">
                <button className="ghost tiny" onClick={() => void openCreateCaseModal()}>
                  + 케이스
                </button>
                <button className="ghost tiny" onClick={() => void openDeleteCaseModal()} disabled={!selectedCaseId}>
                  케이스 삭제
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>제목</th>
                      <th>우선순위</th>
                      <th>스위트</th>
                      <th>버전</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCases.map((item) => (
                      <tr
                        key={item.id}
                        className={selectedCaseId === item.id ? "row-selected" : ""}
                        onClick={() => setSelectedCaseId(item.id)}
                      >
                        <td>{item.id}</td>
                        <td>{item.title}</td>
                        <td>{item.priority}</td>
                        <td>{item.suiteName}</td>
                        <td>{item.currentVersionId ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <h3>케이스 상세</h3>
              {!caseDraft || !caseDetail ? (
                <p>케이스를 선택하세요.</p>
              ) : (
                <div className="case-detail">
                  <div className="detail-tabs">
                    <button
                      className={caseDetailTab === "basic" ? "active" : "ghost"}
                      onClick={() => setCaseDetailTab("basic")}
                    >
                      기본정보
                    </button>
                    <button
                      className={caseDetailTab === "steps" ? "active" : "ghost"}
                      onClick={() => setCaseDetailTab("steps")}
                    >
                      스텝
                    </button>
                    <button
                      className={caseDetailTab === "history" ? "active" : "ghost"}
                      onClick={() => setCaseDetailTab("history")}
                    >
                      히스토리
                    </button>
                    <button onClick={() => void saveCaseDraft()}>저장 (새 버전)</button>
                  </div>

                  {caseDetailTab === "basic" && (
                    <div className="detail-section">
                      <div className="field-grid">
                        <label>
                          제목
                          <input
                            value={caseDraft.title}
                            onChange={(event) => setCaseDraft({ ...caseDraft, title: event.target.value })}
                          />
                        </label>
                        <label>
                          스위트
                          <select
                            value={caseDraft.suiteId}
                            onChange={(event) => setCaseDraft({ ...caseDraft, suiteId: Number(event.target.value) })}
                          >
                            {suites.map((suite) => (
                              <option key={suite.id} value={suite.id}>
                                {suite.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          품질 속성
                          <input
                            value={caseDraft.qualityAttribute}
                            onChange={(event) => setCaseDraft({ ...caseDraft, qualityAttribute: event.target.value })}
                          />
                        </label>
                        <label>
                          우선순위
                          <input
                            value={caseDraft.priority}
                            onChange={(event) => setCaseDraft({ ...caseDraft, priority: event.target.value })}
                          />
                        </label>
                        <label>
                          대분류
                          <input
                            value={caseDraft.categoryLarge}
                            onChange={(event) => setCaseDraft({ ...caseDraft, categoryLarge: event.target.value })}
                          />
                        </label>
                        <label>
                          중분류
                          <input
                            value={caseDraft.categoryMedium}
                            onChange={(event) => setCaseDraft({ ...caseDraft, categoryMedium: event.target.value })}
                          />
                        </label>
                        <label className="full">
                          사전조건
                          <textarea
                            value={caseDraft.preconditions}
                            onChange={(event) => setCaseDraft({ ...caseDraft, preconditions: event.target.value })}
                          />
                        </label>
                        <label className="full">
                          태그
                          <input
                            value={caseDraft.tags}
                            onChange={(event) => setCaseDraft({ ...caseDraft, tags: event.target.value })}
                            placeholder="smoke,auth"
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {caseDetailTab === "steps" && (
                    <div className="detail-section">
                      <h4>스텝</h4>
                      <table>
                        <thead>
                          <tr>
                            <th>No</th>
                            <th>수행 내용</th>
                            <th>입력 데이터</th>
                            <th>기대 결과</th>
                            <th>작업</th>
                          </tr>
                        </thead>
                        <tbody>
                          {caseDraft.steps.map((step, idx) => (
                            <tr key={step.stepNo + idx}>
                              <td>
                                <input
                                  type="number"
                                  value={step.stepNo}
                                  onChange={(event) => {
                                    const next = [...caseDraft.steps];
                                    next[idx] = { ...next[idx], stepNo: Number(event.target.value) };
                                    setCaseDraft({ ...caseDraft, steps: next });
                                  }}
                                />
                              </td>
                              <td>
                                <input
                                  value={step.action}
                                  onChange={(event) => {
                                    const next = [...caseDraft.steps];
                                    next[idx] = { ...next[idx], action: event.target.value };
                                    setCaseDraft({ ...caseDraft, steps: next });
                                  }}
                                />
                              </td>
                              <td>
                                <input
                                  value={step.inputData}
                                  onChange={(event) => {
                                    const next = [...caseDraft.steps];
                                    next[idx] = { ...next[idx], inputData: event.target.value };
                                    setCaseDraft({ ...caseDraft, steps: next });
                                  }}
                                />
                              </td>
                              <td>
                                <input
                                  value={step.expectedResult}
                                  onChange={(event) => {
                                    const next = [...caseDraft.steps];
                                    next[idx] = { ...next[idx], expectedResult: event.target.value };
                                    setCaseDraft({ ...caseDraft, steps: next });
                                  }}
                                />
                              </td>
                              <td>
                                <button
                                  className="ghost tiny"
                                  onClick={() => {
                                    const next = caseDraft.steps.filter((_, i) => i !== idx);
                                    setCaseDraft({ ...caseDraft, steps: next });
                                  }}
                                >
                                  삭제
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="inline-actions">
                        <button
                          className="ghost tiny"
                          onClick={() =>
                            setCaseDraft({
                              ...caseDraft,
                              steps: [
                                ...caseDraft.steps,
                                {
                                  stepNo: caseDraft.steps.length ? Math.max(...caseDraft.steps.map((s) => s.stepNo)) + 1 : 1,
                                  action: "",
                                  inputData: "",
                                  expectedResult: "",
                                },
                              ],
                            })
                          }
                        >
                          + 스텝 추가
                        </button>
                      </div>
                    </div>
                  )}

                  {caseDetailTab === "history" && (
                    <div className="detail-section">
                      <h4>히스토리 / 버전 비교</h4>
                      <div className="inline-actions">
                        <label>
                          From
                          <select
                            value={diffFromVersion ?? ""}
                            onChange={(event) => setDiffFromVersion(event.target.value ? Number(event.target.value) : null)}
                          >
                            <option value="">선택</option>
                            {caseDetail.versions.map((version) => (
                              <option key={version.id} value={version.id}>
                                v{version.versionNo}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          To
                          <select
                            value={diffToVersion ?? ""}
                            onChange={(event) => setDiffToVersion(event.target.value ? Number(event.target.value) : null)}
                          >
                            <option value="">선택</option>
                            {caseDetail.versions.map((version) => (
                              <option key={version.id} value={version.id}>
                                v{version.versionNo}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button className="ghost" onClick={() => void handleCompareVersions()}>
                          비교
                        </button>
                      </div>

                      <ul className="history-list">
                        {caseDetail.versions.map((version) => (
                          <li key={version.id}>
                            v{version.versionNo} / {new Date(version.createdAt).toLocaleString()}
                          </li>
                        ))}
                      </ul>

                      {diffResult ? (
                        <div className="diff-box">
                          <h5>필드 변경사항</h5>
                          <div className="table-wrap">
                            <table>
                              <thead>
                                <tr>
                                  <th>필드</th>
                                  <th>이전</th>
                                  <th>이후</th>
                                </tr>
                              </thead>
                              <tbody>
                                {diffResult.fields.length ? (
                                  diffResult.fields.map((field) => (
                                    <tr key={field.field} className="diff-row diff-row-field">
                                      <td>{field.field}</td>
                                      <td className="diff-from">{JSON.stringify(field.from)}</td>
                                      <td className="diff-to">{JSON.stringify(field.to)}</td>
                                    </tr>
                                  ))
                                ) : (
                                  <tr>
                                    <td colSpan={3}>변경된 필드 없음</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>

                          <h5>스텝 변경사항</h5>
                          <div className="table-wrap">
                            <table>
                              <thead>
                                <tr>
                                  <th>스텝 No</th>
                                  <th>변경유형</th>
                                  <th>이전 수행내용</th>
                                  <th>이후 수행내용</th>
                                  <th>이전 기대결과</th>
                                  <th>이후 기대결과</th>
                                </tr>
                              </thead>
                              <tbody>
                                {diffStepRows.length ? (
                                  diffStepRows.map((row) => (
                                    <tr key={`${row.changeType}-${row.stepNo}-${row.fromAction}-${row.toAction}`} className={`diff-row diff-row-${row.changeType}`}>
                                      <td>{row.stepNo}</td>
                                      <td>{row.changeType}</td>
                                      <td className="diff-from">{row.fromAction}</td>
                                      <td className="diff-to">{row.toAction}</td>
                                      <td className="diff-from">{row.fromExpected}</td>
                                      <td className="diff-to">{row.toExpected}</td>
                                    </tr>
                                  ))
                                ) : (
                                  <tr>
                                    <td colSpan={6}>변경된 스텝 없음</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {activeView === "import" && (
          <section className="content-grid import-grid">
            <div className="card">
              <div className="import-header">
                <h3>CSV 가져오기</h3>
                <div className="import-tools">
                  <label>
                    내보내기 스위트
                    <select
                      value={exportSuiteId ?? ""}
                      onChange={(event) => setExportSuiteId(event.target.value ? Number(event.target.value) : null)}
                    >
                      <option value="">전체 스위트</option>
                      {suites.map((suite) => (
                        <option key={suite.id} value={suite.id}>
                          {suite.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="ghost" onClick={handleExportCasesCsv}>
                    현재 케이스 CSV 내보내기
                  </button>
                </div>
              </div>
              <label>
                CSV 파일
                <input
                  type="file"
                  accept=".csv"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    setCsvFileName(file.name);
                    void file.text().then((text) => setCsvText(text));
                  }}
                />
              </label>
              <label>
                CSV 내용
                <textarea value={csvText} onChange={(event) => setCsvText(event.target.value)} rows={12} />
              </label>
              <div className="import-main-actions">
                <button className="ghost" onClick={() => void handlePreviewImport()}>
                  미리보기
                </button>
                <button onClick={() => void handleExecuteImport()}>가져오기 실행</button>
              </div>

              {preview ? (
                <div className="preview-box">
                  <p>
                    rows: {preview.totalRows} / success: {preview.successCount} / fail: {preview.failCount}
                  </p>
                  {!preview.columnsOk ? <p className="error">Missing: {preview.missingColumns.join(", ")}</p> : null}
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>행</th>
                          <th>상태</th>
                          <th>오류</th>
                          <th>케이스</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.slice(0, 50).map((row) => (
                          <tr key={row.rowNumber}>
                            <td>{row.rowNumber}</td>
                            <td>{row.status}</td>
                            <td>{row.errorMessage || "-"}</td>
                            <td>{row.row.case_title}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="card">
              <h3>가져오기 로그</h3>
              <div className="inline-actions">
                <button className="ghost tiny" onClick={() => void openDeleteImportLogModal()} disabled={!selectedImportLogId}>
                  선택 로그 삭제
                </button>
                <button className="ghost tiny" onClick={() => void openClearImportLogsModal()} disabled={!importLogs.length}>
                  전체 로그 삭제
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>파일</th>
                      <th>행수</th>
                      <th>성공</th>
                      <th>실패</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importLogs.map((log) => (
                      <tr key={log.id} onClick={() => void handleSelectImportLog(log.id)} className={selectedImportLogId === log.id ? "row-selected" : ""}>
                        <td>{log.id}</td>
                        <td>{log.fileName}</td>
                        <td>{log.totalRows}</td>
                        <td>{log.successCount}</td>
                        <td>{log.failCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedImportLogId ? (
                <div className="detail-section">
                  <h4>로그 상세 #{selectedImportLogId}</h4>
                  <div className="inline-actions">
                    <label>
                      상태
                      <select
                        value={importLogStatusFilter}
                        onChange={(event) => setImportLogStatusFilter(event.target.value as "all" | "success" | "fail")}
                      >
                        <option value="all">all</option>
                        <option value="success">success</option>
                        <option value="fail">fail</option>
                      </select>
                    </label>
                    <label>
                      오류 검색
                      <input
                        value={importLogErrorSearch}
                        onChange={(event) => setImportLogErrorSearch(event.target.value)}
                        placeholder="오류 키워드"
                      />
                    </label>
                  </div>
                  <ul className="history-list">
                    {filteredImportLogRows.map((row) => (
                      <li key={row.id}>
                        Row {row.rowNumber} / {row.status} {row.errorMessage ? `- ${row.errorMessage}` : ""}
                      </li>
                    ))}
                    {!filteredImportLogRows.length ? <li>필터와 일치하는 로그가 없습니다.</li> : null}
                  </ul>
                </div>
              ) : null}
            </div>
          </section>
        )}

        {activeView === "runs" && (
          <section className="content-grid runs-grid">
            <div className="card">
              <h3>실행 생성</h3>
              <label>
                실행 이름
                <input value={newRunName} onChange={(event) => setNewRunName(event.target.value)} />
              </label>
              <label>
                릴리스 버전
                <input value={newRunReleaseVersion} onChange={(event) => setNewRunReleaseVersion(event.target.value)} />
              </label>
              <label>
                케이스 검색
                <input
                  value={createRunCaseSearch}
                  onChange={(event) => setCreateRunCaseSearch(event.target.value)}
                  placeholder="제목/스위트/ID"
                />
              </label>

              <h4>케이스 선택</h4>
              <ul className="check-list">
                {filteredSelectableCases.map((item) => (
                  <li key={item.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedRunCaseIds.includes(item.id)}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setSelectedRunCaseIds([...selectedRunCaseIds, item.id]);
                          } else {
                            setSelectedRunCaseIds(selectedRunCaseIds.filter((id) => id !== item.id));
                          }
                        }}
                      />
                      {item.title} (v{item.currentVersionId ?? "-"})
                    </label>
                  </li>
                ))}
              </ul>
              <button onClick={() => void handleCreateRun()}>실행 생성</button>
            </div>

            <div className="card">
              <h3>실행 목록</h3>
              <ul className="list">
                {runs.map((run) => (
                  <li key={run.id}>
                    <button className={selectedRunId === run.id ? "active" : ""} onClick={() => setSelectedRunId(run.id)}>
                      #{run.id} {run.name} [{run.status}] ({run.caseCount})
                    </button>
                  </li>
                ))}
              </ul>

              {runDetail ? (
                <div className="detail-section">
                  <div className="inline-actions">
                    <h4>
                      {runDetail.run.name} ({runDetail.run.status})
                    </h4>
                    <button className="ghost" onClick={() => void toggleRunStatus()}>
                      열기/닫기 전환
                    </button>
                    <button className="ghost" onClick={() => void openUpdateRunModal()}>
                      실행 수정
                    </button>
                    <button className="ghost" onClick={() => void openDeleteRunModal()}>
                      실행 삭제
                    </button>
                  </div>
                  <div className="run-filters">
                    <label>
                      검색
                      <input
                        value={runCaseSearch}
                        onChange={(event) => setRunCaseSearch(event.target.value)}
                        placeholder="케이스 제목 또는 ID"
                      />
                    </label>
                    <label>
                      상태
                      <select
                        value={runCaseStatusFilter}
                        onChange={(event) => setRunCaseStatusFilter(event.target.value as "all" | StepStatus)}
                      >
                        <option value="all">all</option>
                        {stepStatuses.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      우선순위
                      <select
                        value={runCasePriorityFilter}
                        onChange={(event) => setRunCasePriorityFilter(event.target.value)}
                      >
                        <option value="all">all</option>
                        {runCasePriorityOptions.map((priority) => (
                          <option key={priority} value={priority}>
                            {priority}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>케이스</th>
                          <th>상태</th>
                          <th>버전</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRunCases.map((runCase) => (
                          <tr key={runCase.id} onClick={() => setSelectedRunCaseId(runCase.id)} className={selectedRunCaseId === runCase.id ? "row-selected" : ""}>
                            <td>{runCase.id}</td>
                            <td>{runCase.caseTitle}</td>
                            <td>{runCase.status}</td>
                            <td>v{runCase.versionNo}</td>
                          </tr>
                        ))}
                        {!filteredRunCases.length ? (
                          <tr>
                            <td colSpan={4}>필터와 일치하는 실행 케이스가 없습니다.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="card">
              <h3>실행 테스트</h3>
              {!runCaseExecution ? (
                <p>실행 케이스를 선택하세요</p>
              ) : (
                <>
                  <p>
                    RunCase #{runCaseExecution.runCase.id} / CaseVersion #{runCaseExecution.runCase.caseVersionId}
                  </p>
                  <div className="run-summary-panel">
                    <div className="run-summary-title">
                      종합 상태: <strong>{computedRunOverallStatus}</strong>
                    </div>
                    <div className="run-summary-stats">
                      <span className="summary-chip untested">untested {runStepSummary.untested}</span>
                      <span className="summary-chip pass">pass {runStepSummary.pass}</span>
                      <span className="summary-chip fail">fail {runStepSummary.fail}</span>
                      <span className="summary-chip blocked">blocked {runStepSummary.blocked}</span>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>스텝</th>
                          <th>수행 내용</th>
                          <th>상태</th>
                          <th>코멘트</th>
                        </tr>
                      </thead>
                      <tbody>
                        {runCaseExecution.snapshot.snapshot.steps.map((step, idx) => {
                          const currentStatus = runCaseSteps[idx]?.status || "untested";
                          return (
                          <tr key={step.stepNo} className={`run-step-row run-step-${currentStatus}`}>
                            <td>{step.stepNo}</td>
                            <td>{step.action}</td>
                            <td>
                              <select
                                value={currentStatus}
                                onChange={(event) => {
                                  const next = [...runCaseSteps];
                                  next[idx] = {
                                    ...next[idx],
                                    stepNo: step.stepNo,
                                    status: event.target.value as StepStatus,
                                  };
                                  setRunCaseSteps(next);
                                }}
                              >
                                {stepStatuses.map((status) => (
                                  <option key={status} value={status}>
                                    {status}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input
                                value={runCaseSteps[idx]?.comment || ""}
                                onChange={(event) => {
                                  const next = [...runCaseSteps];
                                  next[idx] = {
                                    ...next[idx],
                                    stepNo: step.stepNo,
                                    comment: event.target.value,
                                  };
                                  setRunCaseSteps(next);
                                }}
                              />
                            </td>
                          </tr>
                        )})}
                      </tbody>
                    </table>
                  </div>
                  <label>
                    종합 코멘트
                    <textarea value={runCaseComment} onChange={(event) => setRunCaseComment(event.target.value)} rows={3} />
                  </label>
                  <button onClick={() => void handleSaveRunCaseResult()}>결과 저장</button>
                </>
              )}
            </div>
          </section>
        )}

        {activeView === "reports" && (
          <section className="content-grid reports-grid">
            <div className="card">
              <div className="inline-actions">
                <h3>진행 현황</h3>
                <button className="ghost" onClick={() => void refreshReports()}>
                  새로고침
                </button>
              </div>
              {reportSummary ? (
                <div className="stats-grid">
                  <div className="stat">전체 실행 케이스: {reportSummary.totalRunCases}</div>
                  <div className="stat">통과: {reportSummary.pass}</div>
                  <div className="stat">실패: {reportSummary.fail}</div>
                  <div className="stat">차단: {reportSummary.blocked}</div>
                  <div className="stat">미테스트: {reportSummary.untested}</div>
                  <div className="stat">완료율: {reportSummary.completionRate}%</div>
                </div>
              ) : (
                <p>데이터 없음</p>
              )}
            </div>

            <div className="card">
              <h3>실패 목록</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>실행</th>
                      <th>케이스</th>
                      <th>우선순위</th>
                      <th>코멘트</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportFailures.map((failure, idx) => (
                      <tr key={`${failure.runName}-${idx}`}>
                        <td>{failure.runName}</td>
                        <td>{failure.caseTitle}</td>
                        <td>{failure.priority}</td>
                        <td>{failure.comment}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <h3>우선순위별 집계</h3>
              <ul className="history-list">
                {reportPriorities.map((item) => (
                  <li key={item.priority}>
                    {item.priority}: {item.count}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {activeView === "admin" && (
          <section className="content-grid admin-grid">
            <div className="card">
              <h3>사용자</h3>
              <div className="inline-actions">
                <button className="ghost tiny" onClick={() => void openCreateUserModal()}>
                  + 사용자
                </button>
                <button className="ghost tiny" onClick={() => void openEditUserModal()} disabled={!selectedAdminUserId}>
                  사용자 수정
                </button>
                <button className="ghost tiny" onClick={() => void openDeleteUserModal()} disabled={!selectedAdminUserId}>
                  사용자 삭제
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>아이디</th>
                      <th>이름</th>
                      <th>이메일</th>
                      <th>역할</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminUsers.map((user) => (
                      <tr
                        key={user.id}
                        onClick={() => setSelectedAdminUserId(user.id)}
                        className={selectedAdminUserId === user.id ? "row-selected" : ""}
                      >
                        <td>{user.id}</td>
                        <td>{user.username}</td>
                        <td>{user.displayName}</td>
                        <td>{user.email}</td>
                        <td>{user.role}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card">
              <h3>최근 가져오기 로그</h3>
              <ul className="history-list">
                {importLogs.slice(0, 10).map((log) => (
                  <li key={log.id}>
                    #{log.id} {log.fileName} / ok {log.successCount} / fail {log.failCount}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </main>

      {/* ── Modal ── */}
      {modal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className={`modal-box${modal.type === "confirm" ? " confirm" : ""}`} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modal.title}</h3>
              <button className="modal-close" onClick={closeModal} disabled={isModalSubmitting}>
                &times;
              </button>
            </div>
            {modalError ? <div className="modal-error-banner">{modalError}</div> : null}

            {modal.type === "confirm" && (
              <>
                <div className="modal-body">
                  <p>{modal.confirmMessage}</p>
                </div>
                <div className="modal-footer">
                  <button className="ghost" onClick={closeModal} disabled={isModalSubmitting}>
                    취소
                  </button>
                  <button onClick={() => void handleModalConfirm()} disabled={isModalSubmitting}>
                    {isModalSubmitting ? "처리 중..." : "확인"}
                  </button>
                </div>
              </>
            )}

            {(modal.type === "projectCreate" || modal.type === "projectRename") && (
              <>
                <div className="modal-body">
                  <label>
                    프로젝트 이름
                    <input
                      value={modal.fields?.name ?? ""}
                      onChange={(e) => updateModalField("name", e.target.value)}
                      autoFocus
                    />
                  </label>
                </div>
                <div className="modal-footer">
                  <button className="ghost" onClick={closeModal} disabled={isModalSubmitting}>
                    취소
                  </button>
                  <button onClick={() => void handleModalConfirm()} disabled={isModalSubmitting}>
                    {isModalSubmitting ? "처리 중..." : modal.type === "projectCreate" ? "생성" : "저장"}
                  </button>
                </div>
              </>
            )}

            {modal.type === "suiteRename" && (
              <>
                <div className="modal-body">
                  <label>
                    스위트 이름
                    <input
                      value={modal.fields?.name ?? ""}
                      onChange={(e) => updateModalField("name", e.target.value)}
                      autoFocus
                    />
                  </label>
                </div>
                <div className="modal-footer">
                  <button className="ghost" onClick={closeModal} disabled={isModalSubmitting}>
                    취소
                  </button>
                  <button onClick={() => void handleModalConfirm()} disabled={isModalSubmitting}>
                    {isModalSubmitting ? "처리 중..." : "저장"}
                  </button>
                </div>
              </>
            )}

            {modal.type === "caseCreate" && (
              <>
                <div className="modal-body">
                  <label>
                    케이스 제목
                    <input
                      value={modal.fields?.title ?? ""}
                      onChange={(e) => updateModalField("title", e.target.value)}
                      autoFocus
                    />
                  </label>
                </div>
                <div className="modal-footer">
                  <button className="ghost" onClick={closeModal} disabled={isModalSubmitting}>
                    취소
                  </button>
                  <button onClick={() => void handleModalConfirm()} disabled={isModalSubmitting}>
                    {isModalSubmitting ? "처리 중..." : "생성"}
                  </button>
                </div>
              </>
            )}

            {modal.type === "runEdit" && (
              <>
                <div className="modal-body">
                  <label>
                    실행 이름
                    <input
                      value={modal.fields?.name ?? ""}
                      onChange={(e) => updateModalField("name", e.target.value)}
                      autoFocus
                    />
                  </label>
                  <label>
                    릴리스 버전
                    <input
                      value={modal.fields?.releaseVersion ?? ""}
                      onChange={(e) => updateModalField("releaseVersion", e.target.value)}
                    />
                  </label>
                </div>
                <div className="modal-footer">
                  <button className="ghost" onClick={closeModal} disabled={isModalSubmitting}>
                    취소
                  </button>
                  <button onClick={() => void handleModalConfirm()} disabled={isModalSubmitting}>
                    {isModalSubmitting ? "처리 중..." : "저장"}
                  </button>
                </div>
              </>
            )}

            {modal.type === "userForm" && (
              <>
                <div className="modal-body">
                  <label>
                    아이디
                    <input
                      value={modal.fields?.username ?? ""}
                      onChange={(e) => updateModalField("username", e.target.value)}
                      autoFocus
                    />
                  </label>
                  <label>
                    이름
                    <input
                      value={modal.fields?.displayName ?? ""}
                      onChange={(e) => updateModalField("displayName", e.target.value)}
                    />
                  </label>
                  <label>
                    이메일
                    <input
                      type="email"
                      value={modal.fields?.email ?? ""}
                      onChange={(e) => updateModalField("email", e.target.value)}
                    />
                  </label>
                  <label>
                    비밀번호{modal.title === "사용자 수정" ? " (변경 시에만 입력)" : ""}
                    <input
                      type="password"
                      value={modal.fields?.password ?? ""}
                      onChange={(e) => updateModalField("password", e.target.value)}
                    />
                  </label>
                  <label>
                    역할
                    <select
                      value={modal.fields?.role ?? "tester"}
                      onChange={(e) => updateModalField("role", e.target.value)}
                    >
                      <option value="admin">admin</option>
                      <option value="qa">qa</option>
                      <option value="tester">tester</option>
                    </select>
                  </label>
                </div>
                <div className="modal-footer">
                  <button className="ghost" onClick={closeModal} disabled={isModalSubmitting}>
                    취소
                  </button>
                  <button onClick={() => void handleModalConfirm()} disabled={isModalSubmitting}>
                    {isModalSubmitting ? "처리 중..." : modal.title === "새 사용자" ? "생성" : "저장"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
