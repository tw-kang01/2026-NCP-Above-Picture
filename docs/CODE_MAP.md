# 수정 연습과 파일 안내

이 문서는 [코드 따라 읽기](code/README.md)를 마친 뒤 작은 수정을 해 보거나, 바꾸려는 기능이 어느 파일에 있는지 찾을 때 사용합니다. 파일 이름을 모두 외울 필요는 없습니다. 먼저 화면 문구 하나를 고쳐 보고 그 변경이 화면에 어떻게 나타나는지 확인하겠습니다.

파일은 이름이 붙은 내용 묶음이고 폴더는 파일을 모아 둔 장소입니다. 이름 끝의 확장자는 용도를 짐작하게 해 줍니다. 여기서는 `.js`가 화면·서버 JavaScript, `.mjs`가 모듈 형식의 설정·검사 코드, `.css`가 화면의 색·간격·배치, `.json`이 설정·데이터, `.md`가 지금 읽는 Markdown 설명서입니다. `.sh`는 Ubuntu Bash 절차이고 `.ps1`은 Windows PowerShell 절차이므로 실행하는 창도 다릅니다. 확장자가 같아도 구체적인 역할은 경로와 내용으로 확인합니다.

## 1. 안내 문구 하나를 고쳐 보기

선행 조건은 메인 README의 로컬 demo 실행입니다. 프로젝트 폴더를 편집기로 열고 개발 서버를 켜 둡니다. `src/components/MemoryApp.js`에서 화면에 보이는 안내 문장을 검색한 뒤 따옴표 안의 글만 바꿉니다. 처음에는 `id`, `status`, `version`, API 주소처럼 다른 파일과 연결된 값은 그대로 두세요.

파일을 저장하고 브라우저에서 문구가 바뀌는지 확인합니다. 그다음 테스트 답변을 보내 이전과 같은 질문·초안·저장 흐름이 유지되는지 봅니다. 수정이 보이지 않으면 편집한 폴더와 서버를 켠 폴더가 같은지 먼저 확인합니다.

**내 PC PowerShell의 프로젝트 폴더**에서 변경한 줄을 읽습니다.

```powershell
git diff -- src/components/MemoryApp.js
```

추가·삭제한 줄에 의도한 문구만 있어야 합니다. 예상하지 않은 변경이 보이면 저장 전후를 비교합니다. 리팩토링은 동작을 유지하면서 읽기 쉬운 구조로 바꾸는 작업이므로 파일을 나눴다는 이유만으로 동작 변경까지 허용되는 것은 아닙니다. 함수 역할이 바뀌었다면 주석과 문서도 맞춥니다.

## 2. 바꾼 내용을 검사하기

같은 PC 프로젝트 폴더에서 변경 범위에 맞는 검사를 실행합니다. 아래는 프로그램 동작을 바꾼 뒤 사용할 전체 기본 순서입니다. 문서의 문장만 바꿨다면 링크·공개 파일 검토와 `git diff --check`처럼 그 변경에 맞는 확인을 합니다.

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:app
npm.cmd run check:publish
git diff --check
```

`test`는 입력·안전한 오류·모의 외부 요청을 확인합니다. `build`는 `.next`에 운영 실행 결과를 준비하고 `test:app`은 그 결과를 별도 포트와 임의 데이터 폴더에서 실행해 demo HTTP 시나리오를 확인합니다. 검사 자신이 만든 기록만 정리하며 실제 사용자 기록이나 유료 CLOVA 요청을 자동으로 쓰지 않습니다. 실패한 검사가 있으면 배포로 넘어가기 전에 관련 동작부터 고칩니다.

빌드한 결과를 직접 열고 싶다면 기존 개발 서버를 `Ctrl+C`로 종료한 뒤 아래 명령을 실행합니다. build와 start는 dev와 같은 3000번을 사용하므로 동시에 켜지 않습니다.

```powershell
npm.cmd run build
npm.cmd start
```

Ready가 나오면 로컬 브라우저에서 같은 주소를 엽니다. `start`는 미리 만든 빌드 결과를 실행하므로 소스를 다시 수정했다면 build도 다시 해야 합니다. 서버에 반영할 때는 [메인 README의 업데이트 순서](../README.md#6-운영-중인-ncp-서버를-새-버전으로-바꾸기)로 이어 갑니다. GitHub 푸시만으로 운영 서버가 교체되지는 않습니다.

`check:publish`는 알려진 비밀값·금지 파일·깨진 상대 문서 링크를 찾는 보조 검사입니다. 모든 이름·소속·이미지 개인정보를 자동 판별하지는 못하므로 새로 쓴 문장과 이미지도 직접 확인합니다.

## 3. 최상위 설정

이 파일들은 앱의 겉모양보다 프로젝트를 설치하고 실행하는 방식을 정합니다. `package.json`의 명령을 npm이 읽고, 잠금 파일은 실제 의존성을 고정합니다. 공개에서 빼야 할 데이터는 `.gitignore`로 관리하며 `.env.example`에는 빈 설정만 둡니다.

| 파일 | 역할 | 수정할 때 확인 |
|---|---|---|
| `README.md` | 전체 실행·개념·이력 | 처음 읽는 사람의 이해 |
| `package.json` | 실행 명령·의존성 범위 | 새 패키지·명령의 필요성 |
| `package-lock.json` | 실제 설치 구성 | npm으로 갱신 |
| `.env.example` | 빈 설정과 demo 예시 | 실제 비밀 값 제외 |
| `.gitignore` | Git 제외 규칙 | 데이터·키·빌드 제외 |
| `.gitattributes` | Git이 저장하는 줄바꿈·바이너리 구분 | 서버 Bash의 LF 줄바꿈 유지 |
| `next.config.mjs` | Next.js 헤더·빌드 | 화면·API 영향 |
| `jsconfig.json` | import 경로 별칭 | `@/` 경로 |
| `AGENTS.md` | 개발 도구 작업 지침 | 해당 버전 Next.js 안내 |
| `.agents/skills/natural-korean-writing/` | 한국어 문체 검수 스킬과 참고 자료 라이선스 | 사실·명령·설명 수준 보존 |
| `public/fonts/` | 로컬 글꼴·라이선스 | 재배포 조건·파일 경로 |

## 4. 화면과 브라우저

페이지는 `page.js`에서 시작해 `MemoryApp.js`로 이어집니다. `MemoryApp.js`가 현재 기록과 사용자 행동을 관리하고, 카드·확대창·원문 대화 같은 표시 부분은 별도 컴포넌트에 맡깁니다. API 주소와 사진 전처리는 `memory-api.js`, 날짜·상태 표시 계산은 `memory-display.js`에 모아 같은 계산을 여러 화면에서 반복하지 않게 했습니다.

| 파일 | 역할 |
|---|---|
| `src/app/page.js` | 첫 페이지에 MemoryApp 연결 |
| `src/app/layout.js` | 공통 HTML 구조·메타정보 |
| `src/app/globals.css` | 색·간격·모바일·PC 배치 |
| `src/components/MemoryApp.js` | 상태·API 호출·사용자 행동 흐름 |
| `src/components/PhotoViewer.js` | 사진 확대·이동·키보드 |
| `src/components/ConversationHistory.js` | 질문·원래 답변·건너뛰기 |
| `src/components/icons.js` | SVG 아이콘 |
| `src/components/memory/Spinner.js` | 처리 중 표시 |
| `src/components/memory/PhotoStrip.js` | 사진 목록·확대 열기 |
| `src/components/memory/MemoryCard.js` | 기록 목록 카드 |
| `src/components/memory/EmptyIllustration.js` | 빈 목록 그림 |
| `src/components/memory/MemoryDialog.js` | 삭제 등 사용자 확인 |
| `src/lib/client/memory-api.js` | fetch·오류 변환·사진 전처리 |
| `src/lib/client/memory-display.js` | 날짜·답변 수·상태 표시 계산 |
| `src/lib/memory-limits.js` | 질문 수 범위·옛 기록 호환 |

## 5. 서버 입구

같은 URL이라도 GET과 POST는 다른 작업입니다. 각 `route.js`는 해당 주소의 요청을 받아 공통 응답 함수와 서비스 함수에 연결합니다. 새 기능을 붙일 때 URL만 바꾸면 끝나는 것이 아니라 서버 규칙과 브라우저 호출도 맞춰야 합니다.

| 파일 | 연결하는 기능 |
|---|---|
| `src/app/api/health/route.js` | 웹 응답 |
| `src/app/api/app/route.js` | 모드·설정·모델 |
| `src/app/api/memories/route.js` | 목록·새 기록 |
| `src/app/api/memories/[id]/route.js` | 상세·저장·삭제 |
| `src/app/api/memories/[id]/photos/route.js` | 업로드 |
| `src/app/api/memories/[id]/photos/[photoId]/route.js` | 사진 조회 |
| `src/app/api/memories/[id]/start/route.js` | 첫 질문 |
| `src/app/api/memories/[id]/answers/route.js` | 답변 제출 |
| `src/app/api/memories/[id]/draft/route.js` | 초안·재작성 |

## 6. 서버 처리

입구에서 받은 요청은 `service.js`가 업무 순서를 정하고 `repository.js`가 저장을 맡습니다. 사진은 `photos.js`, AI는 `ai.js`를 거치므로 DB 문제와 외부 AI 문제를 구분해 볼 수 있습니다. 질문 형식·중복·글쓰기 지침도 역할에 따라 파일을 나누었습니다.

| 파일 | 역할 |
|---|---|
| `src/lib/server/app/config.js` | 모드·필수 설정·모델 정보 |
| `src/lib/server/app/http.js` | 쿠키·소유자·출처·공개 응답·요청 수 |
| `src/lib/server/app/service.js` | 생성·사진·대화·초안·저장·삭제 규칙 |
| `src/lib/server/app/repository.js` | 파일·DB 저장, 버전·잠금 |
| `src/lib/server/app/photos.js` | 사진 ID·읽기·쓰기·삭제·서명 URL |
| `src/lib/server/app/ai.js` | 관찰·질문·작성·검토 연결 |
| `src/lib/server/app/question-plan.js` | 질문 관점·중복 검사 |
| `src/lib/server/app/question-format.js` | 짧은 질문 파싱·검사·옛 질문 표시 정리 |
| `src/lib/server/app/draft-format.js` | JSON·답변 ID·분량·원문 대안 |
| `src/lib/server/app/writing-prompts.js` | 한국어 쓰기·검토 기준 |
| `src/lib/server/clova-models.js` | 모델·추론·토큰 상한 |
| `src/lib/server/object-storage.js` | 공통 Object Storage 연결 |
| `src/lib/server/day1/http.js` | 본문·JSON·안전한 오류 응답 |
| `src/lib/server/day1/validation.js` | 문자열·이미지 검사·SafeError |
| `src/lib/server/day1/db.js` | PostgreSQL 연결 풀·초기 실습 함수 |
| `src/lib/server/day1/clova.js` | CLOVA 요청·응답·모델별 필드 |
| `src/lib/server/day1/storage.js` | 초기 저장소 왕복 실습 함수 |

day1은 처음 연결 실습을 만들 때 붙인 이름입니다.
현재도 공통 HTTP·검사·DB·CLOVA 코드를 재사용합니다.
이름만 보고 사용하지 않는 코드로 판단해 삭제하지 않습니다.
공개 앱에는 인증 없는 실습 점검 API를 다시 열지 않습니다.

## 7. 검사·설치·요청 자료

검사 파일은 입력·모의 AI·실제 demo HTTP를 서로 다른 범위에서 확인합니다. 실제 계정에 요청하는 `check-ncp-ai.mjs`는 자동 오프라인 검사와 구분해서 사용합니다. 배포 파일 두 개는 Ubuntu용 Bash이고 ZIP 도구는 Windows PowerShell용입니다.

| 파일 | 역할 |
|---|---|
| `scripts/check-offline.mjs` | 입력·오류·공통 외부 요청 검사 |
| `scripts/check-ncloud-mock.mjs` | 모의 CLOVA·서명·초안·질문 |
| `scripts/check-app.mjs` | 격리 demo 서버의 HTTP 시나리오 |
| `scripts/check-ncp-ai.mjs` | 실제 HCX-007 연결 점검 |
| `scripts/check-publish.mjs` | 공개 대상 민감정보·금지 파일 점검 |
| `scripts/package-update.ps1` | 추적 파일로 업데이트 ZIP 생성 |
| `scripts/install-ncp-service.sh` | systemd·Nginx 자동 실행 설치 |
| `scripts/enable-ncp-https.sh` | 인증서·HTTPS·갱신 타이머 |
| `scripts/fixtures/test-photo.png` | 검사 이미지 |
| `postman/photo-memory-app.postman_collection.json` | 앱 API 실습 |
| `postman/clova-direct.postman_collection.json` | CLOVA 직접 요청 참고 |

## 8. 바꾸려는 기능에서 파일 찾기

위 표를 다 읽었더라도 실제 수정 때는 바꾸려는 동작에서 시작합니다. 질문을 바꾸려면 화면 문구인지 AI 지침인지, 저장을 바꾸려면 입력 제약인지 DB 보관 방식인지 구분한 뒤 아래 파일로 갑니다.

| 바꾸려는 것 | 먼저 볼 곳 | 함께 확인 |
|---|---|---|
| 안내·입력창 | MemoryApp.js | 사용자 흐름·오류 안내 |
| 카드·사진 목록 | components/memory/ | 클릭·확대·키보드 |
| 색·모바일 배치 | globals.css | 작은 화면·긴 문장 |
| 날짜·상태 표시 | memory-display.js | 목록·상세 일관성 |
| 질문 수 | memory-limits.js | 화면·서버·검사·문서 |
| 질문 관점 | question-plan.js | 1·3·10문항 |
| 질문의 길이·설명 제거 | question-format.js | JSON·옛 포장·다중 질문·잘림 |
| AI 문체 | writing-prompts.js | 실제 결과와 원문 |
| 모델·대기 | clova-models.js, day1/clova.js | 권한·필드·비용·프록시 |
| 사진 한도 | memory-api.js, validation.js, service.js | 서버·프록시·AI |
| 저장·재작성 | service.js | API·권한·재시도 |
| DB 저장 | repository.js | 버전·소유자·이전 데이터 |
| 쿠키 | app/http.js | 기존 기록·HTTPS 전환 |


한 파일을 고친 뒤에는 표의 '함께 확인' 구간까지 읽어 보세요. 예를 들어 사진 한도를 바꾸면 브라우저 검사뿐 아니라 서버 업로드, Nginx 본문 한도, AI 입력 조건도 확인해야 합니다. 필드 이름·상태 값은 이미 저장한 기록과의 호환성도 고려합니다.

## 9. 문서·글꼴·참고 자료

설치 순서를 읽는 문서와 코드를 추적하는 문서는 나누어 두었습니다. 동작을 바꿨다면 사용자가 보는 설치·사용 설명과 코드 해설 중 어느 쪽도 오래된 설명이 남지 않게 함께 확인합니다.

| 파일 | 읽거나 고칠 때 |
|---|---|
| `docs/code/README.md` | 코드 문서 읽는 순서와 선행조건 |
| `docs/code/01-browser-and-request.md` | 화면·Network·통신 함수·React 상태 |
| `docs/code/02-server-and-storage.md` | 서버 입구·업무 규칙·저장·쿠키·동시성 |
| `docs/code/03-photos-and-ai.md` | 사진·AI·응답 검사·원문 보존 |
| `docs/CODE_MAP.md` | 이 파일, 수정 연습과 공개 파일 안내 |
| `docs/POSTMAN_WALKTHROUGH.md` | 요청별 입력·응답·다음 값 연결 실습 |
| `docs/API_CONTRACT.md` | API의 형식·제약·오류 계약 |
| `docs/SETUP_AND_REFERENCE.md` | PC 설치 보충 설명 |
| `docs/NCLOUD_SETUP.md` | NCP 네트워크·자원·설정 |
| `docs/ALWAYS_ON_NCP.md` | 자동 실행과 서버 관리 |
| `docs/HTTPS_NCP.md` | 인증서 발급·갱신·실패 처리 |
| `docs/TEAM_GUIDE.md` | 함수와 모듈 심층 설명 |
| `docs/WRITING_UPDATE.md` | 글쓰기 모델·검토·재작성 |
| `docs/DESIGN.md` | 화면과 상호작용 설계 |
| `docs/COURSE_REQUIREMENTS.md` | 발표 구조와 설명할 증거 |
| `docs/VERIFICATION.md` | 실제 검사·운영 확인의 범위 |
| `docs/WRITING_STYLE.md` | 한국어 문서·주석 작성 기준 |
| `docs/STYLE_REVIEW.md` | 문체와 구성의 수정 근거 |
| `.agents/skills/natural-korean-writing/SKILL.md` | 다른 작업 환경에서도 읽을 문체 검수 지침 |
| `.agents/skills/natural-korean-writing/references/LICENSE-im-not-ai.txt` | 참고 수칙의 MIT 라이선스 원문 |
| `public/fonts/NanumSquareNeo-Variable.woff2` | 화면에서 쓰는 로컬 글꼴 |
| `public/fonts/LICENSE-NanumSquareNeo.txt` | 글꼴의 재배포 조건과 원저작자 표기 |

글꼴과 참고 자료 라이선스는 원저작자 조건을 보존합니다. `node_modules`, `.next`, `.data`, `artifacts`는 각각 설치 라이브러리·빌드 결과·개인 데이터·배포 생성물을 담는 폴더이며 공개 소스 목록과 구분합니다.

[코드 학습 안내로 돌아가기](code/README.md) · [설치·사용 안내로 돌아가기](../README.md)
