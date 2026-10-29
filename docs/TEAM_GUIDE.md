# 처음 배우는 사람을 위한 코드 심층 안내

이 문서는 실제 파일의 책임과 한 요청의 왕복을 설명합니다. 개인 명단이나 전공 대신 작업 역할을 사용합니다.
먼저 [README](../README.md)로 demo를 실행해 사진·답변·저장을 한 번 끝내면 코드 이름을 이해하기 쉽습니다.

## 1. 한 프로젝트지만 실행 위치는 다릅니다

MemoryApp은 브라우저에서 입력과 화면 상태를 관리합니다. 서버 모듈은 요청을 검사하고 DB·저장소·AI에 접근합니다.
같은 JavaScript라도 실행 위치에 따라 사용할 수 있는 기능이 다릅니다. 브라우저에는 process.env의 서버 비밀 키를 보내지 않습니다.
Next.js의 route.js는 브라우저 코드가 아니라 서버에서 실행되는 HTTP 입구입니다.

```text
브라우저 상태 → fetch → route.js → 공통 HTTP 처리 → 업무 함수
                                                    ↓
                                       AI·사진·기록 저장
                                                    ↓
브라우저 상태 ← JSON 결과 ← 안전한 응답 ← 처리 결과
```

## 2. 화면 상태부터 읽기

파일: `src/components/MemoryApp.js`.
active는 서버에서 받은 현재 기록, answer는 지금 입력 중인 답변, title·content는 편집 중인 글입니다.
view는 어느 화면을 보여 줄지, pending은 어떤 작업을 기다리는지, error는 실패 안내를 담습니다.
서버의 status와 화면의 view는 다릅니다. draft 기록을 목록에서도 열 수 있기 때문입니다.

| 함수·모듈 | 하는 일 |
|---|---|
| beginNew | 새 작성 화면을 준비 |
| handleFiles | 사진 사본을 만들고 미리보기 준비 |
| startMemory | 기록 생성·사진 업로드·대화 시작 연결 |
| submitAnswer | 답변 또는 건너뛰기 요청 |
| makeDraft | 현재 답변으로 초안 요청 |
| regenerateDraft | 저장 전 초안 교체 요청 |
| saveMemory | 제목·본문·버전으로 저장 |
| deleteMemory | 확인한 기록 삭제 |
| remember | localStorage에 작성 중 ID 기억 |

날짜·답변 수·단계 표시 계산은 `src/lib/client/memory-display.js`로 나눴습니다.
단순 표시 부품은 `src/components/memory/`에 있습니다. 메인 파일은 상태와 작업 순서에 집중합니다.
PhotoViewer는 확대·좌우 이동·키보드를, ConversationHistory는 질문·답변 원문을 담당합니다.

## 3. 답변 제출을 끝까지 따라가기

### 화면 입력

React의 useState는 화면이 기억하는 값을 만듭니다. 입력창의 변경 처리가 setAnswer를 호출하면 answer가 바뀝니다.
타이핑한 것만으로 서버가 저장되는 것은 아닙니다. 버튼이 submitAnswer를 실행하고 서버 응답이 성공해야 기록에 반영됩니다.
빈 답변·중복 클릭을 화면에서 먼저 막지만, 화면 검사는 사용자 편의를 위한 것이므로 서버도 다시 검사합니다.

### 요청 만들기

파일: `src/lib/client/memory-api.js`.
memoryApi.answer는 기록 ID로 URL을 만들고 questionId·answer·skipped를 JSON 본문에 넣습니다.
request 함수는 Content-Type, 쿠키 전송, no-store, 대기 한도, 응답 JSON과 오류 변환을 공통 처리합니다.

```javascript
await memoryApi.answer(memoryId, questionId, answer, false);
```

이 표현의 네 인자는 순서가 있습니다. 두 ID를 바꾸거나 answer 대신 객체를 넣으면 서버 계약과 맞지 않습니다.
JSON.stringify는 객체를 전송용 글자로 바꾸고 response.json은 받은 글자를 객체로 읽습니다.

### 서버 입구

파일: `src/app/api/memories/[id]/answers/route.js`.
POST가 요청을 받고 params에서 기록 ID를 읽습니다. 공통 appRespond 안에서 service의 answer를 호출합니다.
입구는 URL과 함수의 연결을 맡고, 업무 규칙은 service에 둡니다. 여러 입구에서 쿠키 처리를 따로 복제하지 않습니다.

### 공통 경계

파일: `src/lib/server/app/http.js`.
readSessionToken은 쿠키를 읽고 형식을 확인합니다. 무작위 토큰의 해시를 소유자 값으로 사용합니다.
sameOrigin은 브라우저의 외부 사이트 변경 요청을 검사합니다. consumeLimit은 분당 처리량을 제한합니다.
publicMemory는 응답에 필요한 필드만 골라 내부 저장 키와 소유자 해시를 제외합니다.

오류 응답의 공통 처리는 `src/lib/server/day1/http.js`에 있습니다.
SafeError이면 정해진 상태·코드·안내를 보내고, 예상하지 못한 오류는 내부 메시지를 그대로 보여 주지 않습니다.
공급자 메시지에 키나 사용자 내용이 들어 있을 수 있어 원문·스택·본문을 로그에 남기지 않습니다.

### 업무 규칙

파일: `src/lib/server/app/service.js`의 answer.
서버는 JSON 형식, 질문 UUID, boolean skipped, 답변 길이를 검사합니다.
withMemoryLock 안에서 소유자의 최신 기록을 읽고 conversation 단계인지 확인합니다.
현재 질문인지, 이미 답한 질문인지 확인한 뒤 변경된 turns를 준비합니다.

질문이 더 필요하면 `nextQuestionTurn`을 호출합니다. 성공하면 saveMemory로 버전을 올리고 공개 가능한 기록을 반환합니다.
AI 요청 실패 전까지 준비한 값이 곧 저장 완료를 뜻하지는 않습니다.
응답이 성공하면 브라우저가 data.memory로 현재 상태를 갱신하고 다음 질문을 보여 줍니다.

## 4. 실제 저장은 어디서 하나요

파일: `src/lib/server/app/repository.js`.
서비스 함수는 무엇을 저장할지 결정하고 repository는 어디에 어떻게 저장할지 담당합니다.
demo는 파일, ncloud는 PostgreSQL을 사용하므로 서비스가 파일 경로와 SQL을 매번 직접 다루지 않습니다.

### demo 파일 저장

DATA_ROOT는 APP_DATA_DIR 또는 `.data`입니다. 기록은 memories/{UUID}.json에 둡니다.
writeAtomic은 임시 파일에 먼저 쓰고 rename합니다. 쓰는 중간의 불완전한 본문을 정식 파일로 보지 않게 하기 위한 처리입니다.
프로세스 안의 기록 큐와 버전 비교를 사용하지만 여러 프로세스가 같은 파일을 동시에 쓰는 운영용 저장 방식은 아닙니다.

### PostgreSQL 저장

최초 사용 시 app_memories 테이블과 소유자 인덱스를 준비합니다. DB 계정에 필요한 생성 권한이 있어야 합니다.

| 칼럼 | 역할 |
|---|---|
| id UUID | 기록의 기본 키 |
| owner_hash TEXT | 익명 소유자 |
| version INTEGER | 덮어쓰기 충돌 검사 |
| payload JSONB | 질문·답변·사진 정보·글 등 기록 객체 |
| created_at·updated_at | 생성·수정 시각 |

SQL의 `$1`, `$2`는 입력을 문자열로 이어 붙이지 않고 매개변수로 전달하는 자리입니다.
조회는 ID뿐 아니라 owner_hash도 조건에 넣습니다. 다른 소유자의 내용이 응답으로 나가지 않게 합니다.
저장은 현재 version과 일치할 때만 UPDATE하고 성공한 변경에서 번호를 증가시킵니다.

### 잠금·거래·실패

같은 기록의 변경은 프로세스 큐로 순서를 정합니다. ncloud는 advisory transaction lock도 사용합니다.
BEGIN으로 시작해 성공하면 COMMIT, 실패하면 ROLLBACK합니다. DB 변경을 묶는 경계입니다.
이미 발생한 CLOVA 과금이나 외부 사진 업로드까지 PostgreSQL이 취소하지는 못합니다.
그래서 업로드 실패 경로에는 새 사진 정리를 시도하는 보상 처리가 있습니다.

## 5. 사진 경로 읽기

브라우저 preparePhoto는 원본을 최대 1,600px JPEG 사본으로 만들고 EXIF 전송을 제외합니다.
서버 validateImage는 크기와 시작 바이트를 검사합니다. 브라우저를 거치지 않는 요청도 검사하는 이유입니다.
photos.js는 저장 모드에 따라 로컬 파일 또는 Object Storage를 사용합니다.
공통 S3 호환 연결 설정은 `src/lib/server/object-storage.js`에 있습니다.

Object Storage는 DB와 역할이 다릅니다. 파일 바이트는 저장소에, 그 파일의 ID·키·연결 관계는 기록에 둡니다.
브라우저는 서버의 사진 API로 요청합니다. 사진 소유자를 확인한 뒤 private/no-store 바이트를 돌려줍니다.
CLOVA에 사진을 제공할 때만 유효기간 300초의 서명 URL을 만듭니다.

## 6. 질문과 일기 생성 읽기

모델 설정은 clova-models.js, 질문 계획은 question-plan.js, 연결 순서는 ai.js입니다.
질문 응답은 question-format.js가 짧은 한국어 질문 하나로 읽습니다. 새 응답의 질문 한도는 120자이며 Q1·설계 해설이 화면에 나오지 않게 합니다.
새 형식이 잘못되면 준비된 질문을 사용합니다. 옛 기록은 publicMemory의 표시용 복사본에서 확실한 포장만 제거하며 DB·ID·답변은 유지합니다.
관찰은 HCX-005, 질문·작성·검토는 HCX-007 high를 사용합니다.
사진 관찰은 불확실한 참고이며 사용자 답변보다 우선하지 않습니다.
일기 작성·검토에는 사진·관찰을 보내지 않고 날짜·장소·답변을 근거로 전달합니다.

작성 기준은 writing-prompts.js에 있습니다. 질문의 잘못된 전제와 사용자의 정정을 실제 사건으로 혼동하지 않도록 지시합니다.
첫 호출이 정상이어도 두 번째 검토 호출을 수행합니다. 첫 결과가 잘못되면 candidate:null과 원답변으로 검토 요청을 만듭니다.
최대 두 호출을 수행하며, 공급자 인증·HTTP·네트워크 오류는 즉시 안전한 오류로 전달합니다.
형식·잘림·분량 문제가 끝까지 남으면 원래 답변을 본문으로 사용합니다.

draft-format.js는 JSON 객체 추출, 제목·문단·answerIds 검사, 현저한 축약 검사를 담당합니다.
모든 답변 ID가 한 번씩 있어도 의미가 전부 보존됐는지는 확정할 수 없습니다.
별도 AI 검토와 사용자의 원문 비교를 함께 두는 이유입니다.

## 7. 어떤 파일을 먼저 고칠까요

| 목적 | 위치 | 검증 |
|---|---|---|
| 문구 연습 | MemoryApp.js | 화면과 답변 API 유지 |
| 카드 배치 | components/memory/·globals.css | 모바일·키보드·확대 |
| 질문 관점 | question-plan.js | 여러 질문 수에서 반복 확인 |
| 문체 | writing-prompts.js | 실제 모델과 원문 비교 |
| 데이터 규칙 | service.js | 상태·소유자·버전 오류 |
| 저장 방식 | repository.js | 재조회·동시성·이전 기록 |
| API 전송 | memory-api.js·route.js | Network·Postman |

작업 역할은 화면·API 검증·클라우드 통합·사용성 확인처럼 나눌 수 있습니다.
역할 배정안과 실제 기여는 다릅니다. 자신의 변경 파일, 재현한 문제, 확인 결과로 기여를 남깁니다.
같은 파일을 동시에 고칠 때는 범위를 먼저 나누고 최종 코드와 주석을 함께 확인합니다.
전체 파일 표는 README, 정확한 필드와 한도는 [API 계약서](API_CONTRACT.md)를 기준으로 사용합니다.
