/**
 * AI가 반환한 글을 앱이 저장할 수 있는 형식으로 해석·검사합니다.
 * 형식 검사와 답변 ID 포괄 검사는 가능하지만 모든 사실의 정확성을 자동으로 입증하지는 못합니다.
 */
// 질문 10개×답변 최대 2,000자와 문장 연결 여유를 고려한 본문 저장 상한입니다.
export const MAX_DRAFT_CHARACTERS = 32000;

/** 코드 울타리·주변 설명을 제외한 완전한 JSON 객체 하나를 읽습니다. 끊어진 내용을 지어내 복원하지 않습니다. */
export function readDraftObject(text) {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  if (trimmed.length > 64000) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // 앞뒤 설명 때문에 파싱에 실패했다면 아래에서 완전한 객체 하나만 찾아봅니다.
  }
  // 중괄호의 깊이를 세되 JSON 문자열 안의 중괄호와 이스케이프 따옴표는 구분합니다.
  const objects = [];
  let start = -1;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (depth === 0) {
      if (char === "{") {
        start = i;
        depth = 1;
        quoted = false;
      }
      continue;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0)
      objects.push(trimmed.slice(start, i + 1));
  }
  if (depth !== 0 || objects.length !== 1) return null;
  try {
    return JSON.parse(objects[0]);
  } catch {
    return null;
  }
}

/** 유효한 AI 초안을 얻지 못했을 때 날짜 제목과 답변 원문을 반환해 사용자의 말을 보존합니다. */
export function originalDraft(memory, answers) {
  return {
    title: `${memory.date}의 기억`,
    content: answers.map((item) => item.answer).join("\n\n"),
    draftSource: "answers",
    preservedAnswerCount: answers.length,
    writingModel: null,
  };
}

/** 제목·문단·답변 ID·분량을 검사하고 저장용 { title, content, 출처 }로 바꿉니다. 실패하면 null입니다. */
export function assembleDraft(parsed, memory, answers) {
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    typeof parsed.title !== "string" ||
    !parsed.title.trim() ||
    parsed.title.length > 80 ||
    !Array.isArray(parsed.paragraphs) ||
    !parsed.paragraphs.length
  ) return null;
  // 모든 답변 ID가 정확히 한 번 포함돼야 합니다. 알 수 없는 ID나 중복·누락이 있으면 거절합니다.
  const covered = new Set();
  const originals = new Map(answers.map((item) => [item.answerId, item.answer]));
  const paragraphs = [];
  for (const part of parsed.paragraphs) {
    if (
      !part ||
      !Array.isArray(part.answerIds) ||
      !part.answerIds.length ||
      typeof part.text !== "string" ||
      !part.text.trim()
    ) return null;
    for (const id of part.answerIds) {
      if (!originals.has(id) || covered.has(id)) return null;
      covered.add(id);
    }
    paragraphs.push(part.text.trim());
  }
  if (covered.size !== answers.length) return null;
  const content = paragraphs.join("\n\n");
  const sourceLength = answers.reduce(
    (size, item) => size + item.answer.trim().length,
    0,
  );
  // 분량 검사는 지나친 요약을 걸러낼 뿐 의미 보존을 증명하지 않습니다.
  // 별도 REVIEW 호출이 원문 전체와 비교합니다. 잘못된 질문의 정정을 자연스럽게 쓸 수 있도록
  // 원문을 글자 그대로 복사하는 조건은 사용하지 않습니다.
  if (
    content.length > MAX_DRAFT_CHARACTERS ||
    (sourceLength >= 160 && content.length < sourceLength * 0.55)
  ) return null;
  return {
    title: parsed.title.trim(),
    content,
    draftSource: "ai",
    preservedAnswerCount: 0,
  };
}
