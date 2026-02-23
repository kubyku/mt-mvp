# TMT MVP (TestRail/Zephyr-style)

AI가 생성한 CSV 테스트케이스를 Import해서 버전관리하고, Test Run 생성/실행/리포트까지 처리하는 MVP입니다.

## 1) Repo 구조

```text
tmt-mvp/
  backend/
    src/
      db/
        migrations/001_init.sql
        connection.ts
        migrate.ts
        seed.ts
      services/
        authService.ts
        caseService.ts
        importService.ts
        runService.ts
      utils/
        csv.ts
        time.ts
      index.ts
  frontend/
    src/
      App.tsx
      api.ts
      types.ts
      styles.css
      main.tsx
  samples/testcases.csv
```

## 2) 실행 방법

```bash
cd tmt-mvp
npm install

# DB migration
npm --prefix backend run db:migrate

# Seed (Project 1, Suite 3, TestCase 10)
npm --prefix backend run db:seed

# Backend (http://127.0.0.1:4300)
npm --prefix backend run dev
# 또는
npm --prefix backend run build && npm --prefix backend run start

# Frontend (http://localhost:5173)
npm --prefix frontend run dev
```

기본 로그인 계정:
- `admin`
- `qa1`
- `qa2`

## 3) CSV 표준 템플릿

필수 컬럼(고정):

```csv
suite,quality_attribute,category_large,category_medium,case_title,preconditions,step_no,test_step,input_data,expected_result,priority,tags
```

샘플 파일:
- `samples/testcases.csv`

## 4) DB 스키마 설명

핵심 테이블:
- `projects`, `suites`
- `test_cases`
- `test_case_versions`
- `test_steps`
- `test_runs`
- `test_run_cases`
- `test_results`
- `test_step_results`
- `import_logs`
- `import_log_rows`
- `users`, `sessions`

스키마 SQL:
- `backend/src/db/migrations/001_init.sql`

SQLite를 사용하지만, 테이블/관계 구조는 PostgreSQL로 이관하기 쉽게 설계했습니다.

## 5) Versioning 설계

### TestCase 변경
- `test_cases`는 현재 메타와 `current_version_id`를 가짐
- 변경 시 기존 버전은 보존
- 새 `test_case_versions` + `test_steps` 생성
- `test_cases.current_version_id` 갱신

### Import 동작
- 동일 `suite + case_title`는 같은 케이스로 그룹핑
- `step_no` 정렬 후 Step 생성
- 기존 케이스 존재 시 새 Version 생성
- 미존재 시 신규 Case + v1 생성
- Import 결과는 `import_logs` / `import_log_rows`에 저장

## 6) Snapshot 구조 설명

`test_case_versions.snapshot` 예시:

```json
{
  "caseId": 1,
  "title": "Login API returns token",
  "qualityAttribute": "Security",
  "categoryLarge": "Auth",
  "categoryMedium": "Login",
  "preconditions": "User account exists",
  "priority": "High",
  "tags": ["auth", "api"],
  "suiteId": 1,
  "suiteName": "API",
  "projectId": 1,
  "steps": [
    {"stepNo": 1, "action": "...", "inputData": "...", "expectedResult": "..."}
  ]
}
```

## 7) Run Snapshot 고정 정책

Run 생성 시:
- 선택된 각 케이스의 `current_version_id`를 `test_run_cases.case_version_id`에 저장
- 이후 케이스가 수정되어도 Run은 기존 버전(snapshot)으로 유지

## 8) UI 기능 맵

좌측 네비게이션:
- Test Cases
- Import
- Test Runs
- Reports
- Admin

주요 기능:
- Test Cases: Suite 트리, 리스트, 상세편집, Version History, Diff
- Import: 업로드/프리뷰/실행/로그 조회 + 현재 케이스 CSV Export
- Test Runs: Run 생성, 케이스 실행, Step 결과 입력
- Reports: 진행률/실패 목록/우선순위 집계
- Admin: 사용자 및 최근 로그 확인

CRUD 지원:
- Project: create/read/update/delete
- Suite: create/read/update/delete
- Test Case: create/read/update/delete (수정은 새 version 생성)
- Test Run: create/read/update/delete
- Import Log: read/delete (단건/전체 삭제)
- User(Admin): create/read/update/delete
- Reports: 집계 화면으로 read-only

## 9) CSV Export

- UI: `Import` 화면에서 `Export Current Cases CSV` 버튼 실행
- Suite 선택 시 해당 Suite만, 미선택 시 전체 Suite를 Export
- Export 포맷은 Import와 동일한 표준 컬럼 순서 사용:
  `suite,quality_attribute,category_large,category_medium,case_title,preconditions,step_no,test_step,input_data,expected_result,priority,tags`
- 데이터 기준: 각 케이스의 `current_version_id`(현재 버전 스냅샷)

API:
- `GET /api/projects/:projectId/cases/export`
- `GET /api/projects/:projectId/cases/export?suiteId=:suiteId`

## 10) 수용기준 대응

- CSV Import 정상 동작: `importService.ts`
- 케이스 Version 증가: `caseService.ts`
- Run 생성 시 스냅샷 고정: `runService.ts`
- Step별 실행 결과 저장: `saveRunCaseResult`
- History 비교 화면 동작: `App.tsx` + `/api/cases/:id/diff`
- Import 로그 확인: `import_logs`, `import_log_rows`
