# API 계약서와 Postman 실습

이 문서는 현재 서버 코드의 요청·응답·제한을 정리합니다. 처음 용어를 배우는 사람은 [README](../README.md)의 API와 네트워크 설명을 먼저 읽어도 됩니다.
기준 주소는 로컬 `http://127.0.0.1:3000`입니다. 운영에서는 본인의 실제 HTTPS 주소를 사용합니다. `203.0.113.10`은 설명용 주소입니다.

## 1. 공통 약속

일반 입력은 `Content-Type: application/json`의 JSON 객체입니다. 배열·문자열만 보내는 요청은 허용하지 않습니다.
본문이 비어 있는 작업도 필요한 곳에는 `{}`를 보냅니다. 사진 업로드는 `multipart/form-data`의 `files` 파일 항목입니다.

일반 성공은 HTTP 200과 다음 형태입니다. 생성·삭제도 200을 반환합니다.

```json
{
  "ok": true,
  "data": { "memory": {} },
  "requestId": "요청 확인 번호"
}
```

실패는 해당 HTTP 상태와 다음 형태입니다.

```json
{
  "ok": false,
  "error": { "code": "INVALID_DATE", "message": "실제 날짜를 YYYY-MM-DD 형식으로 입력해주세요." },
  "requestId": "요청 확인 번호"
}
```

사진 조회 성공은 이미지 바이트입니다. 실패는 안전한 JSON 오류입니다.
`GET /api/health`는 간단한 웹 서버 응답이며 공통 requestId가 없습니다. DB·AI·스토리지 점검도 하지 않습니다.

## 2. 전체 경로

`{id}`는 기록 UUID, `{photoId}`는 사진 UUID입니다. 실제 값은 응답에서 가져옵니다.

| 방식 | 경로 | 입력 | data의 주요 내용 |
|---|---|---|---|
| GET | `/api/health` | 없음 | service·serverTime·message |
| GET | `/api/app` | 없음 | mode·configured·missing·maxPhotos·maxTurns·defaultTurns·aiModels |
| GET | `/api/memories` | 없음 | memories 배열 |
| POST | `/api/memories` | date·place·questionLimit 선택 | 새 memory |
| GET | `/api/memories/{id}` | 없음 | memory |
| PATCH | `/api/memories/{id}` | title·content·version | 저장한 memory |
| DELETE | `/api/memories/{id}` | 없음 | deleted: true |
| POST | `/api/memories/{id}/photos` | files 파일 1~3개 | memory |
| GET | `/api/memories/{id}/photos/{photoId}` | 없음 | 이미지 바이트 |
| POST | `/api/memories/{id}/start` | questionLimit 선택 | 첫 질문이 있는 memory |
| POST | `/api/memories/{id}/answers` | questionId·answer·skipped | 다음 질문 또는 완료된 memory |
| POST | `/api/memories/{id}/draft` | regenerate·version 선택 | 초안 memory |

`configured:true`는 필수 설정이 존재한다는 뜻이며 실제 외부 접속 성공을 보장하지 않습니다. `aiModels`도 실행 코드의 설정 정보입니다.

## 3. 기록 생성

```json
{
  "date": "2026-10-29",
  "place": "동네 카페",
  "questionLimit": 3
}
```

date는 실제 `YYYY-MM-DD` 날짜여야 합니다. place는 문자열이어야 하며 모르면 빈 문자열을 보냅니다.
questionLimit은 정수 1~10입니다. 생략하면 3입니다. 옛 기록에 필드가 없으면 3개로 해석합니다.
생성 응답의 `data.memory.id`를 뒤 요청에 사용합니다. 새 기록의 status는 upload, version은 1입니다.
소유자별 최대 기록 수는 두 실행 모드 모두 100개입니다.

## 4. 사진 업로드와 시작

Body를 form-data로 고르고 Key를 files, 종류를 File로 지정합니다. 각 사진을 같은 files 이름으로 추가합니다.
파일 외의 다른 이름을 섞지 않습니다. multipart 경계가 포함된 Content-Type은 도구가 자동 설정하게 둡니다.
각 파일은 JPEG·PNG·WebP이고 0바이트보다 크며 5MiB 이하여야 합니다. 파일 시작 바이트와 선언 형식이 일치해야 합니다.
한 요청은 최대 `15MiB + 256KiB`, 기록 합계는 최대 3장입니다. upload 상태에서만 추가할 수 있습니다.

사진을 올린 뒤 start에 다음 JSON을 보냅니다.

```json
{ "questionLimit": 3 }
```

`{}`면 기록에 저장한 질문 수를 사용합니다. 사진이 최소 하나 있어야 합니다.
사진 관찰과 첫 질문 생성 뒤 status가 conversation으로 바뀝니다. 이미 시작한 요청의 재시도는 현재 기록을 반환합니다.

## 5. 답변과 건너뛰기

```json
{
  "questionId": "현재 질문 UUID",
  "answer": "발표가 끝난 뒤 친구와 쉬고 있었어요.",
  "skipped": false
}
```

questionId는 가장 최근의 아직 답하지 않은 질문 ID입니다. skipped는 실제 boolean이어야 합니다. 문자열 `"false"`는 거절합니다.
건너뛰지 않는 답변은 공백 제거 후 비어 있지 않아야 하며 2,000자 이하입니다.
건너뛰기에는 `skipped:true`를 사용합니다. 서버는 해당 답변을 빈 문자열로 저장합니다.
모든 질문을 건너뛰어 실제 답변이 하나도 없게 되는 마지막 건너뛰기는 400 ANSWER_REQUIRED입니다.

같은 질문에 같은 답변·건너뛰기를 재전송하면 중복 저장하지 않고 현재 기록을 반환합니다.
이미 답한 질문에 다른 답변을 보내면 409 ALREADY_ANSWERED입니다. 새 질문 ID를 임의로 만들지 않습니다.
다음 질문 생성이 필요한 경우 외부 AI 요청까지 성공한 뒤 변경을 저장합니다.

## 6. 초안과 재작성

최초 생성은 draft 주소에 `{}`를 보냅니다. 실제 답변이 하나 이상이면 선택한 문항을 다 채우기 전에도 생성할 수 있습니다.
일반 요청에서 이미 draft·saved 상태라면 기존 기록을 반환하고 새 AI 글을 만들지 않습니다.

저장 전 초안을 명시적으로 교체하려면 다음을 보냅니다.

```json
{ "regenerate": true, "version": 5 }
```

5는 예시입니다. 실제 최신 version을 사용합니다. regenerate는 boolean일 때만 허용합니다.
재작성은 draft에서만 가능합니다. saved에는 409 DRAFT_REQUIRED입니다. 버전이 다르면 409 VERSION_CONFLICT입니다.
질문·답변은 유지하지만 제목·본문은 교체되므로 직접 수정한 내용은 먼저 보관합니다.

## 7. 최종 저장

```json
{
  "title": "발표 뒤의 휴식",
  "content": "발표가 끝난 뒤 친구와 쉬었다.",
  "version": 6
}
```

title은 80자, content는 32,000자 이하이며 공백만 있는 값은 거절합니다. 이 요청의 JSON 본문 한도는 128KiB입니다.
version은 양의 정수이며 가장 최근 서버 응답의 값을 그대로 보냅니다. 클라이언트가 먼저 증가시키지 않습니다.
draft·saved에서만 저장할 수 있고 성공하면 status는 saved, version은 증가합니다.
일반 JSON 요청 한도는 16KiB입니다. 저장 요청만 더 큰 한도를 지정합니다.

## 8. 공개 필드와 보안

memory는 id·date·place·status·title·content·turns·version·createdAt·updatedAt·mode·photos·questionLimit·draftSource·preservedAnswerCount·writingModel을 제공합니다.
photos는 id·name·앱 조회 url을 제공합니다. 내부 key·checksum·버킷·소유자 해시·관찰문은 공개 응답에서 제외합니다.
turns에는 질문·답변·건너뛰기와 질문 생성 출처 등이 포함됩니다. 이는 사용자의 내용이므로 응답을 공개 자료로 그대로 쓰지 않습니다.
새 질문은 설명·마크다운 없이 120자 이내의 한국어 질문 하나로 검사합니다. 부적절한 형식은 준비된 관점 질문으로 대체할 수 있습니다.
기존 질문의 확실한 Q1·Markdown 포장은 공개 응답의 표시용 복사본에서 정리합니다. DB 원문·질문 ID·답변은 유지하고 불명확한 옛 값은 그대로 남길 수 있습니다.

소유권은 memory_session 쿠키로 확인합니다. 다른 소유자의 기록은 존재 여부를 구분하지 않고 404로 처리합니다.
브라우저의 변경 요청은 Origin과 Sec-Fetch-Site를 검사합니다. Postman처럼 Origin이 없는 도구는 사용할 수 있지만 쿠키 소유권 검사는 그대로 적용합니다.
사진 응답은 private, no-store입니다. 일반 API도 no-store 응답을 사용합니다.

## 9. 동시성·요청 수·대기

| 항목 | 현재 설정 |
|---|---|
| 소유자별 변경 | 분당 60회 |
| 소유자별 실제 AI | 분당 12회 |
| ncloud 동시 쓰기 | 프로세스에서 최대 2개 |
| DB 연결 풀 | 최대 3개 |
| 앱 정보 조회 대기 | 브라우저 15초 |
| 목록·상세 대기 | 브라우저 20초 |
| 일반·초안 대기 | 브라우저 210초 |
| HCX-007 한 호출 | 90초 |
| HCX-005 호출 | 기본 30초 |
| 저장소 요청 | 20초 |

요청 수 제한은 프로세스 메모리에 있어 다중 서버 전체를 통제하지 않습니다.
응답 시간 초과만으로 저장 실패를 확정하지 않습니다. 재조회 후 상태를 확인하고 같은 작업을 재시도합니다.
DB 거래와 외부 사진·AI는 하나의 분산 거래가 아닙니다. 외부 과금을 정확히 한 번으로 보장하지 않습니다.

## 10. 처음 실습할 순서

1. 컬렉션을 Import하고 base_url을 지정합니다.
2. GET app으로 쿠키와 모드를 확인합니다.
3. 기록을 만들고 응답 ID를 사용합니다.
4. 사진을 올리고 시작합니다.
5. 현재 질문 ID로 답변을 보냅니다.
6. 초안을 만들고 제목·본문·최신 버전으로 저장합니다.
7. 목록·상세를 재조회합니다.
8. 빈 답변 400, 다른 쿠키 404, 오래된 버전 409를 비교합니다.
9. 자신이 만든 테스트 기록만 삭제합니다.

요청·응답의 전체 흐름 해설은 [코드 안내](TEAM_GUIDE.md), 실제 클라우드 준비는 [NCP 설정](NCLOUD_SETUP.md)에 있습니다.
