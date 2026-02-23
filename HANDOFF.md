# TMT MVP HANDOFF (Claude Code 이어받기용)

## 0) 작업 위치 / 시작점
- Workspace: `/Users/jhk/QA/pmo/frontend`
- Project: `/Users/jhk/QA/pmo/frontend/tmt-mvp`
- Backend entry: `backend/src/index.ts`
- Frontend entry: `frontend/src/App.tsx`

---

## 1) 현재 구현 상태 요약

### Backend
- Stack: Express + TypeScript + SQLite
- 구현 완료:
  - Auth/session
  - Project / Suite / TestCase / Version / Step
  - CSV Import + Preview + Import Log
  - CSV Export (현재 케이스 기준)
  - Test Run 생성/실행/결과 저장
  - Reports 집계
  - Admin Users

### Frontend
- Stack: React + TypeScript + Vite
- 구현 완료 화면:
  - `Test Cases`
  - `Import`
  - `Test Runs`
  - `Reports`
  - `Admin`

---

## 2) 마지막 반영 내용 (이번 세션 핵심)

1. `Import`와 짝으로 `Export Current Cases CSV` 추가
2. `Test Cases` 리스트 ID 숫자 오름차순 정렬 적용
3. Import 화면 레이아웃/가독성 보정 (`Import Logs` 비정상 확장 문제 수정)
4. 주요 영역 CRUD 확장
   - Project: C/R/U/D
   - Suite: C/R/U/D
   - TestCase: C/R/U/D
   - TestRun: C/R/U/D
   - ImportLog: R/D (단건, 전체 삭제)
   - User(Admin): C/R/U/D

5. 프론트 에러 처리/검증 강화 (2026-02-23 추가)
   - `frontend/src/App.tsx`:
     - 공통 에러 매핑(`errorMessageMap`) + 공통 실행 래퍼(`runGuarded`) 추가
     - 주요 액션(Create/Update/Delete/Import/Run/Report) 실패 시 `errorMessage + statusMessage + error notification` 일관 처리
     - 입력 검증 강화:
       - Project/Suite/Case/Run 이름 필수 및 길이 검증
       - User 생성/수정 시 이메일 형식, 역할 값 검증
       - CSV 미입력, Run 케이스 미선택, 버전 비교 미선택 등 사전 검증
     - 모달 제출 상태 추가:
       - 중복 제출 방지 (`isModalSubmitting`)
       - 모달 내부 오류 배너 표시 (`modalError`)
   - `frontend/src/styles.css`:
     - `button:disabled` 스타일 추가
     - `.modal-error-banner` 스타일 추가

---

## 3) API 현황 (중요 엔드포인트)

### Project CRUD
- `GET /api/projects`
- `POST /api/projects`
- `PATCH /api/projects/:projectId`
- `DELETE /api/projects/:projectId`

### Suite CRUD
- `GET /api/projects/:projectId/suites`
- `POST /api/projects/:projectId/suites`
- `PATCH /api/suites/:suiteId`
- `DELETE /api/suites/:suiteId`

### Case CRUD + Version
- `GET /api/projects/:projectId/cases`
- `POST /api/projects/:projectId/cases`
- `PUT /api/cases/:caseId` (수정 시 신규 version)
- `DELETE /api/cases/:caseId`
- `GET /api/cases/:caseId`
- `GET /api/cases/:caseId/diff?fromVersionId=&toVersionId=`

### Import / Export
- `POST /api/import/preview`
- `POST /api/import/execute`
- `GET /api/import/logs`
- `GET /api/import/logs/:logId/rows`
- `DELETE /api/import/logs/:logId`
- `DELETE /api/import/logs`
- `GET /api/projects/:projectId/cases/export`
- `GET /api/projects/:projectId/cases/export?suiteId=:suiteId`

### Run CRUD + Execution
- `POST /api/runs`
- `GET /api/projects/:projectId/runs`
- `GET /api/runs/:runId`
- `PATCH /api/runs/:runId/status`
- `PATCH /api/runs/:runId`
- `DELETE /api/runs/:runId`
- `GET /api/run-cases/:runCaseId`
- `POST /api/run-cases/:runCaseId/result`

### Admin User CRUD
- `GET /api/admin/users`
- `POST /api/admin/users`
- `PATCH /api/admin/users/:userId`
- `DELETE /api/admin/users/:userId`

---

## 4) 프론트 UI에서 CRUD 연결된 위치
- 상단 Project 컨트롤: `+ Project / Rename / Delete`
- Suite Tree: `Rename Suite / Delete Suite`
- Case List: `+ Case / Delete Case`
- Import Logs: `Delete Selected Log / Clear Logs`
- Runs 상세: `Edit Run / Delete Run`
- Admin Users: `+ User / Edit User / Delete User`

참고: 현재 일부 입력 UX는 `window.prompt/confirm` 기반(빠른 MVP 방식).  
다음 단계에서 모달 폼으로 교체 권장.

---

## 5) 주요 변경 파일

### Backend
- `backend/src/index.ts` (CRUD 라우트 추가)
- `backend/src/services/caseService.ts` (project/suite/case CRUD 로직 확장)
- `backend/src/services/runService.ts` (run update/delete)
- `backend/src/services/importService.ts` (import log delete/clear, export 생성)
- `backend/src/services/authService.ts` (user CRUD)
- `backend/src/utils/csv.ts` (CSV builder/escape)

### Frontend
- `frontend/src/api.ts` (신규 CRUD API 함수 추가)
- `frontend/src/App.tsx` (CRUD 버튼/핸들러 연결, export UI, case 정렬)
- `frontend/src/styles.css` (import 레이아웃/가독성 보정)

### 문서
- `README.md` (CRUD/Export 반영)

---

## 6) 실행 방법
프로젝트 루트에서:

```bash
cd /Users/jhk/QA/pmo/frontend/tmt-mvp
npm install

# backend
npm --prefix backend run db:migrate
npm --prefix backend run db:seed
npm --prefix backend run start

# frontend
npm --prefix frontend run dev -- --host 127.0.0.1 --port 5173
```

URL:
- FE: `http://127.0.0.1:5173`
- BE: `http://127.0.0.1:4300`
- Health: `http://127.0.0.1:4300/api/health`

---

## 7) 검증 상태
- `npm --prefix backend run build` 통과
- `npm --prefix frontend run build` 통과
- CRUD API 실호출 검증:
  - project create/delete
  - user create/update/delete
  - run create/update/delete
- 임시 검증 데이터는 정리 완료

---

## 8) 알려진 이슈 / 다음 우선순위

1. CRUD 입력 UX가 prompt 기반이라 사용성이 낮음
   - 모달 폼으로 전환 필요
2. 에러 핸들링 개선 필요
   - 현재 일부 실패는 statusMessage만 변경
3. 권한 모델 미세분화 없음 (MVP 수준)
4. E2E/통합 테스트 부재
   - Import/Version/Run snapshot 고정 시나리오 자동화 필요

---

## 9) Claude Code가 바로 이어서 할 작업 제안
1. `window.prompt/confirm` 전부 공통 Modal 컴포넌트로 교체
2. CRUD 액션 실패 시 토스트/에러 영역 표준화
3. Project/Suite/Case 생성 폼 validation 강화
4. Admin User 편집 UX 개선(인라인 또는 모달)
5. Playwright 또는 API integration tests 추가
