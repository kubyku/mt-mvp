PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS suites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  parent_suite_id INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_suite_id) REFERENCES suites(id) ON DELETE SET NULL,
  UNIQUE(project_id, name)
);

CREATE TABLE IF NOT EXISTS test_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  suite_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  quality_attribute TEXT,
  category_large TEXT,
  category_medium TEXT,
  preconditions TEXT,
  priority TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  current_version_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (suite_id) REFERENCES suites(id) ON DELETE CASCADE,
  UNIQUE(suite_id, title)
);

CREATE TABLE IF NOT EXISTS test_case_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL,
  version_no INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES test_cases(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(case_id, version_no)
);

CREATE TABLE IF NOT EXISTS test_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_version_id INTEGER NOT NULL,
  step_no INTEGER NOT NULL,
  action TEXT NOT NULL,
  input_data TEXT,
  expected_result TEXT NOT NULL,
  FOREIGN KEY (case_version_id) REFERENCES test_case_versions(id) ON DELETE CASCADE,
  UNIQUE(case_version_id, step_no)
);

CREATE TABLE IF NOT EXISTS test_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  release_version TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('open','closed')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS test_run_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  case_id INTEGER NOT NULL,
  case_version_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('untested','pass','fail','blocked')),
  FOREIGN KEY (run_id) REFERENCES test_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (case_id) REFERENCES test_cases(id) ON DELETE CASCADE,
  FOREIGN KEY (case_version_id) REFERENCES test_case_versions(id) ON DELETE RESTRICT,
  UNIQUE(run_id, case_id)
);

CREATE TABLE IF NOT EXISTS test_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_case_id INTEGER NOT NULL UNIQUE,
  overall_status TEXT NOT NULL CHECK(overall_status IN ('untested','pass','fail','blocked')),
  comment TEXT,
  executed_by INTEGER,
  executed_at TEXT NOT NULL,
  FOREIGN KEY (run_case_id) REFERENCES test_run_cases(id) ON DELETE CASCADE,
  FOREIGN KEY (executed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS test_step_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  result_id INTEGER NOT NULL,
  step_no INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('untested','pass','fail','blocked')),
  comment TEXT,
  FOREIGN KEY (result_id) REFERENCES test_results(id) ON DELETE CASCADE,
  UNIQUE(result_id, step_no)
);

CREATE TABLE IF NOT EXISTS import_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name TEXT NOT NULL,
  total_rows INTEGER NOT NULL,
  success_count INTEGER NOT NULL,
  fail_count INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  created_by INTEGER,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS import_log_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_log_id INTEGER NOT NULL,
  row_number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('success','fail')),
  error_message TEXT,
  FOREIGN KEY (import_log_id) REFERENCES import_logs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_suites_project_id ON suites(project_id);
CREATE INDEX IF NOT EXISTS idx_cases_project_id ON test_cases(project_id);
CREATE INDEX IF NOT EXISTS idx_cases_suite_id ON test_cases(suite_id);
CREATE INDEX IF NOT EXISTS idx_versions_case_id ON test_case_versions(case_id);
CREATE INDEX IF NOT EXISTS idx_steps_case_version_id ON test_steps(case_version_id);
CREATE INDEX IF NOT EXISTS idx_run_cases_run_id ON test_run_cases(run_id);
CREATE INDEX IF NOT EXISTS idx_runs_project_id ON test_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_import_log_rows_import_log_id ON import_log_rows(import_log_id);
