/**
 * MemoryApp에서 분리한 표시 전용 컴포넌트입니다.
 * 전달받은 props(부모가 준 값)를 화면에 그리며, 데이터 저장은 부모에게 위임합니다.
 */

/** photos 배열을 사진 버튼으로 표시합니다. 선택하면 부모의 onOpen(photos, index)를 호출합니다. */
export default function PhotoStrip({ photos = [], large = false, onOpen }) {
  return (
    <div
      className={`photo-strip ${large ? "large" : ""} ${photos.length === 1 ? "single" : ""}`}
    >
      {photos.map((p, i) => (
        <button type="button" className="photo-frame" key={p.id || p.url} onClick={() => onOpen(photos, i)} aria-label={`사진 ${i + 1} 크게 보기`}>
          <img src={p.url} alt={`이 기록의 사진 ${i + 1}`} loading="lazy" />
          <span className="photo-number">{String(i + 1).padStart(2, "0")}</span>
        </button>
      ))}
    </div>
  );
}
