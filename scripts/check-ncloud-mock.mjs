import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * ncloud 분기의 요청 형식과 AI 보완 처리를 실제 클라우드 접속 없이 검사합니다.
 * 아래는 URL 서명 계산용 가짜 값이며 실제 키·DB·개인 기록을 사용하지 않습니다.
 * fetch를 가로채 모델·추론 수준·사진 수·초안 검사 순서를 확인합니다.
 */
const environment = {
  APP_MODE: "ncloud",
  NCP_ACCESS_KEY: "TEST_ACCESS_KEY_NOT_REAL",
  NCP_SECRET_KEY: "TEST_SECRET_KEY_NOT_REAL",
  NCP_BUCKET: "test-bucket-not-real",
  PGHOST: "not-a-real-database.invalid",
  PGPORT: "5432",
  PGDATABASE: "test",
  PGUSER: "test",
  PGPASSWORD: "TEST_PASSWORD_NOT_REAL",
  CLOVA_STUDIO_API_KEY: "TEST_CLOVA_KEY_NOT_REAL",
};
const previous = Object.fromEntries(
  Object.keys(environment).map((key) => [key, process.env[key]]),
);
const originalFetch = globalThis.fetch;
Object.assign(process.env, environment);

try {
  const { observePhotos, nextQuestion, nextQuestionTurn, makeDraft } = await import(
    "../src/lib/server/app/ai.js"
  );
  const calls = [];
  let malformedDraft = false;
  let truncatedDraft = false;
  let questionResponse = "이 사진을 찍던 순간에는 어떤 일이 있었나요?";
  let truncatedQuestion = false;
  globalThis.fetch = async (url, options) => {
    assert.ok(
      String(url).startsWith(
        "https://clovastudio.stream.ntruss.com/v3/chat-completions/",
      ),
    );
    const body = JSON.parse(options.body);
    calls.push({ url: String(url), body });
    const isVision = String(url).endsWith("/HCX-005");
    const isDraft = /WRITE_DIARY|REVIEW_DIARY/.test(body.messages[0].content);
    if (!isVision) {
      assert.ok(String(url).endsWith("/HCX-007"));
      assert.equal(body.maxTokens, undefined);
      assert.equal(body.thinking.effort, "high");
      assert.equal(body.maxCompletionTokens, isDraft ? 32768 : 20480);
    }
    const content = isVision
      ? "사진 1: 컵. 사진 2: 나무. 사진 3: 책."
      : isDraft
        ? malformedDraft
          ? "JSON 형식이 아닌 응답"
          : JSON.stringify({
              title: "잠시 쉬었던 날",
              paragraphs: [{ answerIds: ["answer-1"], text: "잠시 혼자 쉬었다." }],
            })
        : questionResponse;
    return Response.json({
      status: { code: "20000" },
      result: {
        message: { content, thinkingContent: "PRIVATE_REASONING_MUST_NOT_APPEAR" },
        finishReason: (isDraft ? truncatedDraft : truncatedQuestion) ? "length" : "stop",
      },
    });
  };
  const memory = {
    id: randomUUID(),
    ownerHash: randomUUID(),
    date: "2026-10-23",
    place: "카페",
    photos: [1, 2, 3].map((index) => ({ key: `mock-only/${index}.jpg` })),
    turns: [],
    questionLimit: 7,
    observation: "VISUAL_ONLY_MUST_NOT_ENTER_DRAFT",
  };

  assert.ok((await observePhotos(memory)).includes("사진 3"));
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith("/HCX-005"));
  const photoMessages = calls[0].body.messages.filter(
    (message) => message.role === "user",
  );
  assert.equal(photoMessages.length, 3);
  for (const [index, message] of photoMessages.entries()) {
    const imageBlocks = message.content.filter(
      (item) => item.type === "image_url",
    );
    assert.equal(imageBlocks.length, 1);
    const url = new URL(imageBlocks[0].imageUrl.url);
    assert.equal(url.hostname, "kr.object.ncloudstorage.com");
    assert.equal(url.searchParams.get("X-Amz-Expires"), "300");
    assert.ok(url.pathname.endsWith(`/mock-only/${index + 1}.jpg`));
  }
  console.log(
    "PASS: three photos use one mocked HCX-005 request with three image messages and 300-second signed URLs.",
  );

  await nextQuestion(memory);
  assert.ok(calls[1].url.endsWith("/HCX-007"));
  assert.equal(JSON.parse(calls[1].body.messages[1].content).totalQuestions, 7);
  assert.ok(JSON.stringify(calls[1].body).includes(memory.observation));
  assert.ok(!JSON.stringify(calls[1].body).includes("X-Amz-Signature"));
  console.log(
    "PASS: HCX-007 high questions receive visual clues, with no image URL or maxTokens.",
  );

  memory.turns = [
    {
      id: randomUUID(),
      question: "무슨 일이 있었나요?",
      answer: "잠시 혼자 쉬었다.",
      skipped: false,
    },
  ];
  assert.deepEqual(await makeDraft(memory), {
    title: "잠시 쉬었던 날",
    content: "잠시 혼자 쉬었다.",
    draftSource: "ai", preservedAnswerCount: 0, writingModel: "HCX-007",
  });
  assert.ok(calls[2].url.endsWith("/HCX-007"));
  const draftFacts = JSON.parse(calls[2].body.messages[1].content);
  assert.deepEqual(draftFacts, {
    date: memory.date,
    place: memory.place,
    answers: [{ answerId: "answer-1", question: "무슨 일이 있었나요?", answer: "잠시 혼자 쉬었다." }],
  });
  assert.ok(calls[3].body.messages[0].content.includes("REVIEW_DIARY"));
  const reviewFacts = JSON.parse(calls[3].body.messages[1].content);
  assert.deepEqual(reviewFacts.answers, draftFacts.answers);
  assert.ok(reviewFacts.candidate.paragraphs.length);
  assert.ok(!JSON.stringify(calls[2].body).includes(memory.observation));
  assert.ok(!JSON.stringify(calls[2].body).includes("mock-only/"));
  assert.ok(!JSON.stringify(calls[2].body).includes("X-Amz-Signature"));
  console.log(
    "PASS: draft input contains only explicit date, place, and user answers, with no photos or observations.",
  );

  malformedDraft = true;
  const malformedStart = calls.length;
  const fallback = await makeDraft(memory);
  assert.equal(fallback.draftSource, "answers");
  assert.equal(fallback.content, memory.turns[0].answer);
  assert.equal(calls.length - malformedStart, 2);
  assert.equal(JSON.parse(calls.at(-1).body.messages[1].content).candidate, null);
  console.log("PASS: two malformed drafts preserve all original answers and disclose fallback.");
  malformedDraft = false;
  truncatedDraft = true;
  const truncated = await makeDraft({ ...memory, ownerHash: randomUUID() });
  assert.equal(truncated.draftSource, "answers");
  assert.equal(truncated.content, memory.turns[0].answer);
  truncatedDraft = false;
  console.log("PASS: finishReason length rejects even parseable but truncated output.");
  const cleanQuestion = "이 사진을 찍던 순간에는 무엇을 하고 있었나요?";
  const questionCases = [
    { response: JSON.stringify({ question: cleanQuestion }), source: "ai" },
    { response: `**Q1:** ${cleanQuestion} 이 질문은 상황과 감정을 떠올리도록 설계되었습니다.`, source: "ai" },
    { response: cleanQuestion, source: "ai" },
    { response: `${cleanQuestion} 그 뒤에는 무엇을 했나요?`, source: "guided" },
    { response: "이 질문은 기억을 정리하도록 설계되었습니다.", source: "guided" },
    { response: `${"기억".repeat(61)}이 있나요?`, source: "guided" },
    { response: `${cleanQuestion} 이 질문은 ${"설명".repeat(600)}`, source: "guided" },
    { response: JSON.stringify({ question: cleanQuestion }), source: "guided", truncated: true },
  ];
  for (const item of questionCases) {
    questionResponse = item.response;
    truncatedQuestion = item.truncated === true;
    const turn = await nextQuestionTurn({ ...memory, ownerHash: randomUUID(), turns: [] });
    assert.equal(turn.questionSource, item.source);
    assert.equal(turn.question, cleanQuestion);
    assert.ok(!/Q1|\*\*|설계|PRIVATE_REASONING/.test(turn.question));
  }
  truncatedQuestion = false;
  questionResponse = `**Q1:** ${cleanQuestion} 이 질문은 당시 감정을 살펴보도록 설계되었습니다.`;
  const wrappedRepeat = await nextQuestionTurn({
    ...memory, ownerHash: randomUUID(),
    turns: [{ question: `**Q1:** ${cleanQuestion} 이 질문은 당시 감정을 살펴보도록 설계되었습니다.`, topic: "context", answer: "잠시 쉬었어.", skipped: false }],
  });
  assert.equal(wrappedRepeat.questionSource, "guided");
  assert.notEqual(wrappedRepeat.question, cleanQuestion);
  assert.ok(!/Q1|\*\*|설계/.test(wrappedRepeat.question));
  const previousTurnSent = JSON.parse(calls.at(-1).body.messages[1].content).previousTurns[0];
  assert.equal(previousTurnSent.question, cleanQuestion);
  questionResponse = "이 사진을 찍던 순간에는 어떤 일이 있었나요?";
  console.log("PASS: eight question-format cases and a wrapped repeat strip rationale or use a clean guided question, including truncation.");
  const repeatMemory = { ...memory, ownerHash: randomUUID(), turns: [], questionLimit: 10 };
  for (let index = 0; index < 10; index++) {
    const turn = await nextQuestionTurn(repeatMemory);
    repeatMemory.turns.push({ id: randomUUID(), ...turn, answer: `답변 ${index + 1}`, skipped: false });
  }
  assert.equal(new Set(repeatMemory.turns.map((turn) => turn.question)).size, 10);
  assert.ok(repeatMemory.turns.slice(1).every((turn) => turn.questionSource === "guided"));
  console.log("PASS: ten identical provider questions produce ten distinct questions with disclosed guided replacements.");
  const beforeEmpty = calls.length;
  await assert.rejects(() => makeDraft({ ...memory, turns: [] }), {
    status: 400,
    code: "ANSWER_REQUIRED",
  });
  assert.equal(calls.length, beforeEmpty);
  globalThis.fetch = async () => new Response("provider private error", { status: 403 });
  await assert.rejects(() => makeDraft({ ...memory, ownerHash: randomUUID() }), { code: "AI_AUTH_FAILED" });
  console.log(
    "PASS: empty answers are rejected before any AI call. No live cloud calls were made.",
  );
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
