/**
 * 브라우저와 서버가 함께 사용하는 질문 수 규칙입니다.
 * 한쪽만 숫자를 바꿔 화면과 API의 허용 범위가 달라지지 않도록 한 파일에서 관리합니다.
 */
export const DEFAULT_QUESTION_LIMIT = 3;
export const MIN_QUESTION_LIMIT = 1;
export const MAX_QUESTION_LIMIT = 10;

/** 입력값이 허용 범위의 정수이면 true를 반환합니다. 문자열 숫자는 허용하지 않습니다. */
export function validQuestionLimit(value) {
  return Number.isInteger(value) && value >= MIN_QUESTION_LIMIT && value <= MAX_QUESTION_LIMIT;
}

/** 기록에 유효한 questionLimit이 있으면 사용하고, 이 속성이 없던 기존 기록은 기본값 3으로 읽습니다. */
export function questionLimitFor(memory) {
  return validQuestionLimit(memory?.questionLimit)
    ? memory.questionLimit
    : DEFAULT_QUESTION_LIMIT;
}
