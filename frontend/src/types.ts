export type User = {
  id: number;
  username: string;
  displayName: string;
  role: string;
  email: string;
};

export type Project = {
  id: number;
  name: string;
  createdAt: string;
};

export type Suite = {
  id: number;
  projectId: number;
  name: string;
  parentSuiteId: number | null;
};

export type TestCaseListItem = {
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
};

export type Step = {
  stepNo: number;
  action: string;
  inputData: string;
  expectedResult: string;
};

export type CaseSnapshot = {
  caseId: number;
  title: string;
  qualityAttribute: string;
  categoryLarge: string;
  categoryMedium: string;
  preconditions: string;
  priority: string;
  tags: string[];
  suiteId: number;
  suiteName: string;
  projectId: number;
  steps: Step[];
};

export type CaseDetail = {
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
  currentVersion: {
    id: number;
    caseId: number;
    versionNo: number;
    snapshot: CaseSnapshot;
    createdBy: number | null;
    createdAt: string;
  } | null;
  versions: Array<{ id: number; versionNo: number; createdAt: string; createdBy: number | null }>;
};

export type RunListItem = {
  id: number;
  projectId: number;
  name: string;
  releaseVersion: string;
  createdBy: number | null;
  createdAt: string;
  status: "open" | "closed";
  caseCount: number;
};

export type RunDetail = {
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
    status: "untested" | "pass" | "fail" | "blocked";
    caseTitle: string;
    priority: string;
    versionNo: number;
    resultComment: string | null;
    executedAt: string | null;
  }>;
};
