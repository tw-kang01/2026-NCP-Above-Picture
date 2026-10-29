/**
 * 질문의 순서와 중복 여부를 정하는 규칙입니다. 외부 AI 없이도 검사·대체 질문을 만들 수 있습니다.
 * 대화 기록의 topic 값과 실제 질문 문장을 함께 보아 같은 감정 질문의 반복을 줄입니다.
 */
import { questionLimitFor } from "../../memory-limits.js";

// 질문을 순간·세부 장면·이전·이후 등 10개 관점으로 나눕니다. 문장 자체에 새 사실을 가정하지 않습니다.
const TOPICS = [
  { id: "context", angle: "사진을 찍던 순간 실제로 하던 일", question: "이 사진을 찍던 순간에는 무엇을 하고 있었나요?" },
  { id: "detail", angle: "앞선 답변에서 아직 설명하지 않은 작은 장면이나 대화", question: "그 순간에 기억나는 말이나 작은 장면이 있나요?" },
  { id: "before", angle: "사진을 찍기 직전에 있었던 일", question: "이 사진을 찍기 직전에는 무엇을 하고 있었나요?" },
  { id: "after", angle: "사진을 찍은 다음에 있었던 일", question: "이 사진을 찍고 난 뒤에는 무엇을 했나요?" },
  { id: "senses", angle: "그때 들린 소리 또는 냄새 중 한 가지", question: "그곳에서 들렸던 소리나 기억나는 냄새가 있나요?" },
  { id: "choice", angle: "이 순간을 사진으로 남긴 이유", question: "이 순간을 사진으로 남기고 싶었던 이유가 있나요?" },
  { id: "difference", angle: "평소와 달랐던 점, 달랐다고 단정하지 않기", question: "그날 평소와 조금 달랐던 점이 있었나요?" },
  { id: "outside", angle: "사진에 보이지 않는 기억하고 싶은 다른 일", question: "사진에는 담기지 않았지만 남겨 두고 싶은 일이 있나요?" },
  { id: "feeling", angle: "사용자 자신의 당시 기분, 기분을 추정하지 않기", question: "그 순간의 내 기분을 표현하면 어떤 말이 떠오르나요?" },
  { id: "future", angle: "나중에 기록을 읽을 자신에게 남기는 말", question: "나중에 이 기록을 읽을 나에게 남기고 싶은 말이 있나요?" },
];

/** 띄어쓰기·기호·문자 너비 차이를 제거해 비교용 문자열을 만듭니다. 화면에 보여줄 문장은 바꾸지 않습니다. */
function normalize(text) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** 익숙한 표현으로 질문 관점을 추정합니다. 규칙에 없는 표현은 null이며 의미 이해를 완전히 대신하지 않습니다. */
export function questionIntent(text) {
  const value = normalize(text);
  if (/나중에|미래의|다시한다면/.test(value)) return "future";
  if (/찍기전|직전|하기전|오기전|가기전/.test(value)) return "before";
  if (/찍은뒤|찍고난뒤|찍은후|그이후|찍고나서/.test(value)) return "after";
  if (/들렸|소리|냄새|향기/.test(value)) return "senses";
  if (/평소|달랐던|다른점/.test(value)) return "difference";
  if (/담기지|보이지않|사진밖/.test(value)) return "outside";
  if (/찍.*이유|남기.*이유/.test(value)) return "choice";
  if (/기분|감정|느꼈|느끼|마음/.test(value)) return "feeling";
  return null;
}

/** 두 글자씩 겹쳐 만든 묶음의 공통 비율로 0~1 유사도를 구합니다. 1에 가까울수록 표현이 비슷합니다. */
function similarity(a, b) {
  const grams = (value) => new Set(
    Array.from(
      { length: Math.max(0, value.length - 1) },
      (_, i) => value.slice(i, i + 2),
    ),
  );
  const first = grams(a);
  const second = grams(b);
  if (!first.size || !second.size) return 0;
  const common = [...first].filter((gram) => second.has(gram)).length;
  return (2 * common) / (first.size + second.size);
}

/** 새 질문이 기존 질문과 같거나, 같은 관점을 반복하거나, 매우 비슷하면 true를 반환합니다. */
export function repeatedQuestion(question, turns) {
  const candidate = normalize(question);
  const intent = questionIntent(question);
  return turns.some((turn) => {
    const previous = normalize(turn.question);
    const previousIntent = questionIntent(turn.question);
    // "그 순간"과 "그 직전"은 표현이 비슷해도 관점이 다릅니다.
    // 문장 유사도는 같은 관점끼리만 적용해 다른 질문까지 막지 않습니다.
    return (
      candidate === previous ||
      (intent === previousIntent && similarity(candidate, previous) >= 0.76) ||
      (intent !== null && previousIntent === intent)
    );
  });
}

/** 선택한 질문 수와 이미 사용한 주제를 읽어 이번에 사용할 주제 객체를 반환합니다. */
export function questionTopic(memory) {
  const limit = questionLimitFor(memory);
  // 짧은 대화는 마지막에 기분을 묻고, 긴 대화는 여러 사건을 살펴봅니다.
  // 1개를 고른 경우에는 실제로 무엇을 하던 순간인지부터 묻습니다.
  const plan = limit === 1
    ? TOPICS.slice(0, 1)
    : limit < 10
      ? [...TOPICS.slice(0, limit - 1), TOPICS[8]]
      : TOPICS;
  const used = new Set(memory.turns.map((turn) => turn.topic));
  const preferred = plan[memory.turns.length] || TOPICS[9];
  return (
    [preferred, ...plan, ...TOPICS].find((topic) =>
      !used.has(topic.id) && !repeatedQuestion(topic.question, memory.turns),
    ) || preferred
  );
}

/** AI 질문이 반복될 때 미사용 기본 질문을 반환합니다. 가능한 질문이 없으면 null입니다. */
export function guidedQuestion(memory, topic = questionTopic(memory)) {
  const selected = [topic, ...TOPICS].find(
    (item) => !repeatedQuestion(item.question, memory.turns),
  );
  if (!selected) return null;
  return { question: selected.question, topic: selected.id, questionSource: "guided" };
}
