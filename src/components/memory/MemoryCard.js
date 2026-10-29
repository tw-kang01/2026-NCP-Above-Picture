/**
 * MemoryApp에서 분리한 표시 전용 컴포넌트입니다.
 * 전달받은 props(부모가 준 값)를 화면에 그리며, 데이터 저장은 부모에게 위임합니다.
 */
import { Icon } from "../icons";
import { answered, formatDate, statusLabel } from "@/lib/client/memory-display";

/** 기록 하나를 목록 카드로 표시합니다. 클릭 시 onOpen에 기록 ID를 전달합니다. */
export default function MemoryCard({ memory, onOpen, index = 0 }) {
  return (
    <button className="memory-card" onClick={() => onOpen(memory.id)}>
      <div className={`memory-cover cover-${index % 3}`}>
        {memory.photos?.[0] ? (
          <img src={memory.photos[0].url} alt="" loading="lazy" />
        ) : (
          <Icon name="image" size={38} />
        )}
        <span
          className={`status-badge ${memory.status === "saved" ? "saved" : ""}`}
        >
          {statusLabel[memory.status] || "작성 중"}
        </span>
      </div>
      <div className="memory-card-body">
        <span className="small-date">
          {formatDate(memory.date)}
          {memory.place ? ` · ${memory.place}` : ""}
        </span>
        <h3>{memory.title || "아직 쓰고 있는 하루"}</h3>
        <p>
          {memory.content ||
            (memory.status === "upload"
              ? "사진을 고르면 이야기가 시작돼요."
              : `${answered(memory)}개의 답변으로 기억을 모으고 있어요.`)}
        </p>
        <span className="card-read">
          {memory.status === "saved" ? "기록 읽기" : "이어서 쓰기"}
          <Icon name="arrow" size={17} />
        </span>
      </div>
    </button>
  );
}
