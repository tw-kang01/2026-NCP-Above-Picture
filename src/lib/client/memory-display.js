/**
 * 화면에서 공통으로 쓰는 날짜·상태·답변 수 계산입니다.
 * 서버 요청이나 저장 없이, 전달받은 값으로 표시할 결과만 만듭니다.
 * MemoryApp과 MemoryCard가 같은 규칙을 공유하도록 분리했습니다.
 */
// 서버의 내부 상태 이름을 화면에 표시할 한국어로 바꾸는 대응표입니다.
export const statusLabel = {
  upload: "사진 준비",
  conversation: "기억 꺼내는 중",
  draft: "초안 작성",
  saved: "저장 완료",
};
/** 브라우저의 현재 지역 날짜를 날짜 입력창용 YYYY-MM-DD 문자열로 반환합니다. */
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** 날짜 문자열을 한국어 표시로 바꿉니다. long=true이면 연도와 요일도 넣습니다. */
export function formatDate(value, long = false) {
  if (!value) return "";
  // 자정 대신 정오를 사용해 날짜만 표시할 때 시간대 경계의 영향을 줄입니다.
  const d = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(
    "ko-KR",
    long
      ? { year: "numeric", month: "long", day: "numeric", weekday: "long" }
      : { month: "long", day: "numeric" },
  ).format(d);
}

/** 기록 객체에서 빈 답변을 제외한 실제 답변 개수를 계산합니다. 입력 객체는 바꾸지 않습니다. */
export function answered(memory) {
  return (
    memory?.turns?.filter(
      (t) => typeof t.answer === "string" && t.answer.trim(),
    ).length || 0
  );
}
