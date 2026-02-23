export const CSV_COLUMNS = [
  "suite",
  "quality_attribute",
  "category_large",
  "category_medium",
  "case_title",
  "preconditions",
  "step_no",
  "test_step",
  "input_data",
  "expected_result",
  "priority",
  "tags",
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

export type StepSnapshot = {
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
  steps: StepSnapshot[];
};

export type CaseUpsertInput = {
  projectId: number;
  suiteId: number;
  title: string;
  qualityAttribute?: string;
  categoryLarge?: string;
  categoryMedium?: string;
  preconditions?: string;
  priority?: string;
  tags?: string[];
  steps: StepSnapshot[];
  createdBy: number | null;
};

export type ImportPreviewRow = {
  rowNumber: number;
  row: Record<string, string>;
  status: "success" | "fail";
  errorMessage?: string;
};

export type StepExecutionStatus = "untested" | "pass" | "fail" | "blocked";
