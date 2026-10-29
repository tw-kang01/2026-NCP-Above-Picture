/**
 * 입력 검사·안전한 오류·쿠키·AI 요청 형식·초안과 질문 규칙을 검증합니다.
 * 외부 AI는 가짜 fetch로 대체하며 변경한 환경과 fetch는 finally에서 복원합니다.
 * 각 test는 실제로 겪은 실패가 다시 생기지 않는지 독립적으로 확인합니다.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  requireText,
  validateImage,
  SafeError,
} from "../src/lib/server/day1/validation.js";
import { readJson, respond } from "../src/lib/server/day1/http.js";
import { callClova, makeFirstQuestion } from "../src/lib/server/day1/clova.js";
import { appRespond, publicMemory } from "../src/lib/server/app/http.js";
import { assembleDraft, originalDraft, readDraftObject } from "../src/lib/server/app/draft-format.js";
import { repeatedQuestion } from "../src/lib/server/app/question-plan.js";
import { readQuestionText } from "../src/lib/server/app/question-format.js";

test("HTTPS upgrades existing session cookies without losing ownership", async () => {
  const saved = process.env.APP_COOKIE_SECURE;
  const token = "ab".repeat(32);
  const request = new Request("http://127.0.0.1:3000/api/app", {
    headers: { Cookie: `memory_session=${token}` },
  });
  try {
    process.env.APP_COOKIE_SECURE = "false";
    const before = await appRespond(request, (owner) => ({ owner }));
    assert.equal(before.headers.get("set-cookie"), null);
    process.env.APP_COOKIE_SECURE = "true";
    const after = await appRespond(request, (owner) => ({ owner }));
    assert.equal((await before.json()).data.owner, (await after.json()).data.owner);
    assert.match(after.headers.get("set-cookie"), new RegExp(`^memory_session=${token};`));
    assert.match(after.headers.get("set-cookie"), /; Secure$/);
    assert.match(after.headers.get("set-cookie"), /; HttpOnly; SameSite=Lax;/);
  } finally {
    if (saved === undefined) delete process.env.APP_COOKIE_SECURE;
    else process.env.APP_COOKIE_SECURE = saved;
  }
});

test("input validation rejects missing, blank, overly long and forged images", () => {
  for (const value of [undefined, null, 0, "", "  "]) {
    assert.throws(() => requireText(value, "message", 20), SafeError);
  }
  assert.throws(() => requireText("a".repeat(21), "message", 20), SafeError);
  assert.equal(requireText(" 안녕 ", "message", 20), "안녕");
  assert.throws(
    () => validateImage(Buffer.from("not an image"), "image/jpeg"),
    SafeError,
  );
  assert.throws(
    () => validateImage(Buffer.alloc(5 * 1024 * 1024 + 1), "image/png"),
    SafeError,
  );
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.throws(() => validateImage(pngSignature, "image/jpeg"), SafeError);
  assert.equal(validateImage(pngSignature, "image/png").extension, "png");
});

test("JSON requests enforce format, object shape and streamed byte limit", async () => {
  const make = (body, headers = { "Content-Type": "application/json" }) =>
    new Request("http://localhost/check", { method: "POST", headers, body });
  assert.deepEqual(await readJson(make('{"message":"안녕하세요"}')), {
    message: "안녕하세요",
  });
  await assert.rejects(
    () => readJson(make("[]")),
    (error) => error.code === "INVALID_JSON",
  );
  await assert.rejects(
    () => readJson(make("{")),
    (error) => error.code === "INVALID_JSON",
  );
  await assert.rejects(
    () => readJson(make("{}", { "Content-Type": "text/plain" })),
    (error) => error.status === 415,
  );
  await assert.rejects(
    () => readJson(make('{"message":"too big"}'), 4),
    (error) => error.status === 413,
  );
});

test("unexpected errors do not expose provider messages or credentials", async () => {
  const originalLog = console.error;
  const logs = [];
  console.error = (value) => logs.push(value);
  try {
    const response = await respond(() => {
      throw new Error("secret-test-only-not-real");
    });
    assert.equal(response.status, 500);
    const text = await response.text();
    assert.ok(!text.includes("secret-test-only-not-real"));
    assert.ok(!logs.join("").includes("secret-test-only-not-real"));
    assert.equal(JSON.parse(text).error.code, "INTERNAL_ERROR");
  } finally {
    console.error = originalLog;
  }
});

test("CLOVA requests are mocked: success, provider failure, HTTP failure, timeout", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.CLOVA_STUDIO_API_KEY;
  process.env.CLOVA_STUDIO_API_KEY = "offline-test-placeholder";
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(
        url,
        "https://clovastudio.stream.ntruss.com/v3/chat-completions/HCX-DASH-002",
      );
      assert.equal(options.method, "POST");
      return Response.json({
        status: { code: "20000" },
        result: { message: { content: " 첫 질문입니다. " } },
      });
    };
    assert.equal(
      await callClova("HCX-DASH-002", [{ role: "user", content: "test" }]),
      "첫 질문입니다.",
    );
    globalThis.fetch = async () =>
      Response.json({
        status: { code: "40000", message: "private provider details" },
      });
    await assert.rejects(
      () => callClova("HCX-DASH-002", []),
      (error) =>
        error.code === "AI_PROVIDER_ERROR" &&
        !error.message.includes("private"),
    );
    globalThis.fetch = async () =>
      new Response("private details", { status: 401 });
    await assert.rejects(
      () => callClova("HCX-DASH-002", []),
      (error) => error.code === "AI_AUTH_FAILED",
    );
    globalThis.fetch = async () => {
      const error = new Error("timeout");
      error.name = "TimeoutError";
      throw error;
    };
    await assert.rejects(
      () => callClova("HCX-DASH-002", []),
      (error) => error.code === "AI_TIMEOUT",
    );
    globalThis.fetch = async () =>
      Response.json({
        status: { code: "20000" },
        result: { message: { content: "" } },
      });
    await assert.rejects(
      () => callClova("HCX-DASH-002", []),
      (error) => error.code === "AI_EMPTY_RESPONSE",
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.CLOVA_STUDIO_API_KEY;
    else process.env.CLOVA_STUDIO_API_KEY = originalKey;
  }
});

test("vision request uses native imageUrl field and passes observations to text model", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.CLOVA_STUDIO_API_KEY;
  process.env.CLOVA_STUDIO_API_KEY = "offline-test-placeholder";
  const calls = [];
  try {
    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push({ url, body });
      const content =
        calls.length === 1
          ? "컵 두 개가 보입니다."
          : "이 사진을 찍을 때 어떤 상황이었나요?";
      return Response.json({
        status: { code: "20000" },
        result: { message: { content } },
      });
    };
    const fixtureUrl =
      "https://kr.object.ncloudstorage.com/offline-fixture/photo.jpg?X-Amz-Signature=OFFLINE_FIXTURE";
    const result = await makeFirstQuestion(fixtureUrl);
    assert.equal(calls.length, 2);
    assert.ok(calls[0].url.endsWith("/HCX-005"));
    const image = calls[0].body.messages[1].content[1];
    assert.equal(image.type, "image_url");
    assert.deepEqual(image.imageUrl, { url: fixtureUrl });
    assert.equal(image.dataUri, undefined);
    assert.ok(calls[1].url.endsWith("/HCX-007"));
    assert.equal(calls[1].body.thinking.effort, "high");
    assert.equal(calls[1].body.maxTokens, undefined);
    assert.ok(calls[1].body.messages[1].content.includes(result.observation));
    assert.ok(!calls[1].body.messages[1].content.includes("OFFLINE_FIXTURE"));
    assert.equal(result.question, "이 사진을 찍을 때 어떤 상황이었나요?");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.CLOVA_STUDIO_API_KEY;
    else process.env.CLOVA_STUDIO_API_KEY = originalKey;
  }
});

test("diary parsing accepts a complete wrapped object, rejects incomplete or competing objects", () => {
  const object = { title: "사진관", paragraphs: [{ answerIds: ["answer-1"], text: '따옴표 "와" 중괄호 {도} 읽는다.' }] };
  assert.deepEqual(readDraftObject(`설명\n\`\`\`json\n${JSON.stringify(object)}\n\`\`\``), object);
  assert.equal(readDraftObject('{"title":"잘린 글"'), null);
  assert.equal(readDraftObject('{} {}'), null);
});

test("diary permits natural rewriting and correction while requiring every answer ID", () => {
  const answers = [
    { answerId: "answer-1", answer: "사진관에서 증명사진 찍었어." },
    { answerId: "answer-2", answer: "그 남자가 아니라 나인데. 여권 사진은 아냐." },
  ];
  const memory = { date: "2026-10-29" };
  const parsed = { title: "증명사진 찍은 날", paragraphs: [{ answerIds: ["answer-1", "answer-2"], text: "사진관에서 내 증명사진을 찍었다." }] };
  const result = assembleDraft(parsed, memory, answers);
  assert.equal(result.content, "사진관에서 내 증명사진을 찍었다.");
  assert.equal(result.draftSource, "ai");
  assert.equal(assembleDraft({ ...parsed, paragraphs: [{ answerIds: ["answer-1"], text: "사진을 찍었다." }] }, memory, answers), null);
  assert.equal(assembleDraft({ ...parsed, paragraphs: [{ answerIds: ["answer-1", "answer-1"], text: "사진을 찍었다." }] }, memory, answers), null);
  assert.equal(assembleDraft({ ...parsed, paragraphs: [{ answerIds: ["unknown"], text: "사진을 찍었다." }] }, memory, answers), null);
});

test("a tiny summary cannot replace detailed answers; fallback retains 20,000 input characters", () => {
  const answers = Array.from({ length: 10 }, (_, index) => ({ answerId: `answer-${index + 1}`, answer: `${index}` + "기".repeat(1999) }));
  const memory = { date: "2026-10-29" };
  const summary = { title: "하루", paragraphs: [{ answerIds: answers.map((answer) => answer.answerId), text: "좋은 하루였다." }] };
  assert.equal(assembleDraft(summary, memory, answers), null);
  const fallback = originalDraft(memory, answers);
  assert.equal(fallback.content.length, 20018);
  for (const answer of answers) assert.ok(fallback.content.includes(answer.answer));
  assert.equal(fallback.draftSource, "answers");
});

test("question repeat guard catches punctuation changes and repeated emotion prompts", () => {
  const previous = [{ question: "그때 기분이 어땠나요?" }];
  assert.equal(repeatedQuestion("그때 기분이 어땠나요？", previous), true);
  assert.equal(repeatedQuestion("그 순간 어떤 감정이 들었나요?", previous), true);
  assert.equal(repeatedQuestion("사진을 찍은 다음에는 무엇을 했나요?", previous), false);
  assert.equal(repeatedQuestion("이 사진을 찍기 직전에는 무엇을 하고 있었나요?", [{ question: "이 사진을 찍던 순간에는 무엇을 하고 있었나요?" }]), false);
});

test("questions accept a strict JSON object or a clean single Korean question", () => {
  const question = "이 사진을 찍던 순간에는 무엇을 하고 있었나요?";
  assert.equal(readQuestionText(JSON.stringify({ question })), question);
  assert.equal(readQuestionText(`\`\`\`json\n${JSON.stringify({ question })}\n\`\`\``), question);
  assert.equal(readQuestionText(question), question);
  assert.equal(readQuestionText(question.replace("?", "？")), question);
});

test("legacy Q1 Markdown headings and design rationale never enter the question", () => {
  const question = "이 사진을 찍던 순간에는 무엇을 하고 있었나요?";
  const rationale = "이 질문은 당시의 상황과 감정을 자연스럽게 떠올리도록 설계되었습니다.";
  assert.equal(readQuestionText(`**Q1:** ${question} ${rationale}`), question);
  assert.equal(readQuestionText(`### **Q1:**\n${question}\n${rationale}`), question);
  assert.equal(readQuestionText(`질문 1: **${question}**`), question);
});

test("question parsing rejects analysis, multiple questions, malformed JSON and oversized output", () => {
  const question = "그때 무엇을 하고 있었나요?";
  for (const value of [
    null,
    "이 질문은 사용자의 기억을 정리하는 데 도움이 되도록 설계되었습니다.",
    `분석: 먼저 당시 상황을 물어야 합니다. ${question}`,
    "이 질문은 어떤 의도로 설계되었나요?",
    `${question} 그 뒤에는 무엇을 했나요?`,
    `${question} Q2: 그다음에는`,
    JSON.stringify({ question, rationale: "내부 설명" }),
    JSON.stringify({ question: `${question} 이 질문은 설계 설명입니다.` }),
    JSON.stringify({ question: [question] }),
    '{"question":"잘린 질문',
    `\`\`\`json\n${JSON.stringify({ question })}`,
    `${"기억".repeat(61)}이 있나요?`,
    `${question} 이 질문은 ${"설명".repeat(600)}`,
  ]) assert.equal(readQuestionText(value), null);
});

test("saved question display removes a known wrapper without changing stored turns or answers", () => {
  const question = "이 사진을 찍던 순간에는 무엇을 하고 있었나요?";
  const memory = {
    id: "fixture-memory", photos: [],
    turns: [
      { id: "fixture-question", question: `**Q1:** ${question} 이 질문은 상황을 떠올리도록 설계되었습니다.`, answer: "잠시 쉬었어.", skipped: false },
      { id: "unknown-legacy", question: "질문 형식이 아닌 과거 값", answer: "기존 답변", skipped: false },
    ],
  };
  const before = structuredClone(memory);
  const projected = publicMemory(memory);
  assert.equal(projected.turns[0].question, question);
  assert.equal(projected.turns[0].id, memory.turns[0].id);
  assert.equal(projected.turns[0].answer, memory.turns[0].answer);
  assert.equal(projected.turns[1].question, memory.turns[1].question);
  assert.notEqual(projected.turns, memory.turns);
  assert.notEqual(projected.turns[0], memory.turns[0]);
  assert.deepEqual(memory, before);
});
