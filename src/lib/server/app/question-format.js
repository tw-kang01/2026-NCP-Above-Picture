/**
 * AI 응답에서 화면에 보여줄 질문 한 문장만 읽습니다.
 * 새 응답은 {"question":"... ?"} 형태를 요청하고, 예전의 Q1/Markdown 포장은 제한적으로 허용합니다.
 * 설명문을 질문으로 추측하지 않습니다. 확실하지 않은 새 응답은 null을 반환해 기본 질문으로 대체합니다.
 */
export const MAX_QUESTION_CHARACTERS = 120;
const MAX_RESPONSE_CHARACTERS = 1000;

/** 알려진 제목·굵게 표시만 벗깁니다. 문장 중간의 내용을 임의로 잘라 질문을 만들지 않습니다. */
function unwrapLegacyHeading(value) {
  const unbold = (text) => text
    .replace(/^\*\*([^*\n]+)\*\*/, "$1")
    .replace(/^__([^_\n]+)__/, "$1");
  const heading = unbold(value.replace(/^(?:#{1,6}\s+|[-*]\s+)/, ""));
  const withoutLabel = heading.replace(
    /^(?:Q(?:uestion)?\s*\d*|질문\s*\d*|\d+)\s*[:.)：]\s*/i,
    "",
  );
  return unbold(withoutLabel).trim();
}

/**
 * JSON 또는 기존 단문 응답을 읽어 짧은 한국어 질문만 반환합니다. 실패하면 null입니다.
 * 질문 뒤의 알려진 설계 설명은 제거하지만 물음표가 여러 개이거나 질문 앞에 분석이 있으면 거절합니다.
 */
export function readQuestionText(text, { maxLength = MAX_QUESTION_CHARACTERS } = {}) {
  if (typeof text !== "string") return null;
  let value = text.trim().replace(/？/g, "?");
  if (!value || value.length > MAX_RESPONSE_CHARACTERS) return null;

  // 완성된 코드 울타리만 벗깁니다. 잘린 JSON이나 뒤에 다른 객체가 붙은 응답은 복구하지 않습니다.
  if (value.startsWith("```")) {
    const fenced = value.match(/^```(?:json)?\s*\n?([\s\S]*?)\s*```$/i);
    if (!fenced) return null;
    value = fenced[1].trim();
  }
  const structured = value.startsWith("{") || value.startsWith("[");
  if (structured) {
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object" ||
        Object.keys(parsed).length !== 1 || typeof parsed.question !== "string") return null;
    value = parsed.question.trim().replace(/？/g, "?");
  } else {
    value = unwrapLegacyHeading(value);
  }

  // 여러 질문 중 하나를 마음대로 고르면 대화 주제가 달라질 수 있어 전체를 거절합니다.
  if ((value.match(/\?/g) || []).length !== 1) return null;
  const end = value.indexOf("?");
  const question = value.slice(0, end + 1).trim();
  const remainder = value.slice(end + 1).trim();
  if (remainder && (structured ||
      !/^(?:이\s*질문(?:은|을|의)|질문\s*의도|설계\s*의도|설명\s*[:：])/.test(remainder))) return null;
  if (question.length < 5 || question.length > maxLength ||
      !/[가-힣]/.test(question) || /[\r\n`#*_<>]/.test(question) || /[.!;]\s/.test(question) ||
      /^(?:분석|설명|해설|답변|추론|의도|이\s*질문|질문\s*(?:의도|설계)|다음\s*질문|사용자에게)/.test(question) ||
      /질문(?:은|을|의)|설계되|생각\s*과정|분석\s*결과/.test(question)) return null;
  return question;
}

/**
 * 기존 기록의 표시만 정리합니다. 옛 질문 상한(700자) 안의 확실한 포장만 제거합니다.
 * 해석할 수 없는 과거 질문을 새 질문으로 지어 바꾸지 않으며 원본 DB·질문 ID·답변은 수정하지 않습니다.
 */
export function questionForDisplay(text) {
  return readQuestionText(text, { maxLength: 700 }) || text;
}
