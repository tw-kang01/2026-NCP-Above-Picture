/**
 * MemoryApp에서 분리한 표시 전용 컴포넌트입니다.
 * 전달받은 props(부모가 준 값)를 화면에 그리며, 데이터 저장은 부모에게 위임합니다.
 */

/** 로딩 중임을 나타내는 장식입니다. small 값으로 크기만 선택하며 요청은 실행하지 않습니다. */
export default function Spinner({ small = false }) {
  return (
    <span className={`spinner ${small ? "small" : ""}`} aria-hidden="true" />
  );
}
