/**
 * 모델 이름·출력 토큰 한도·텍스트 모델 옵션을 한곳에서 정의합니다. 토큰은 글을 나눠 계산하는 처리 단위입니다.
 * high 사고 옵션은 글자 수를 보장하지 않으며 실제 요금·지연은 제공업체 사용량에 따라 달라집니다.
 */
// 사진 입력은 HCX-005, 질문·초안·검토 텍스트는 HCX-007로 분리합니다.
export const VISION_MODEL = "HCX-005";
export const TEXT_MODEL = "HCX-007";
// 생각 과정과 실제 출력을 합친 상한입니다. 한국어 글자 수와 일대일로 대응하지 않습니다.
export const QUESTION_TOKENS = 20480;
export const WRITING_TOKENS = 32768;
export const TEXT_OPTIONS = Object.freeze({
  thinkingEffort: "high",
  timeoutMs: 90000,
});
// 앱 상태 API에서 화면에 알려주는 모델 이름입니다. 인증키·내부 접속 정보는 포함하지 않습니다.
export const AI_MODELS = Object.freeze({
  vision: VISION_MODEL,
  question: TEXT_MODEL,
  writing: TEXT_MODEL,
  review: TEXT_MODEL,
  thinking: "high",
});
