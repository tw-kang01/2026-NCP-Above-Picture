/**
 * MemoryApp에서 분리한 표시 전용 컴포넌트입니다.
 * 전달받은 props(부모가 준 값)를 화면에 그리며, 데이터 저장은 부모에게 위임합니다.
 */
import { useEffect, useRef } from "react";
import { Icon } from "../icons";
import Spinner from "./Spinner";

/** state.type으로 안내·삭제·이동·초안 재생성 확인창을 고릅니다. 실제 처리는 부모 콜백이 맡습니다. */
export default function MemoryDialog({ state, onClose, busy, onDelete, error }) {
  const ref = useRef(null);
  // React의 표시 여부와 브라우저 기본 모달(dialog)의 열림 상태를 맞춥니다.
  useEffect(() => {
    if (state && ref.current && !ref.current.open) ref.current.showModal();
  }, [state]);
  if (!state) return null;
  const help = state.type === "help",
    remove = state.type === "delete",
    regenerate = state.type === "regenerate";
  return (
    <dialog
      ref={ref}
      className="dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="dialog-inner">
        <div className={`dialog-icon ${remove ? "danger" : ""}`}>
          <Icon name={help ? "lock" : remove ? "trash" : "edit"} size={28} />
        </div>
        <h2 id="dialog-title">
          {help
            ? "나의 사진, 나의 기억"
            : remove
              ? "이 기록을 삭제할까요?"
              : regenerate ? "답변으로 초안을 다시 만들까요?"
              : "다른 화면으로 이동할까요?"}
        </h2>
        {help ? (
          <div className="help-copy">
            <p>
              사진 너머는 사진을 단서로 질문하고,{" "}
              <strong>직접 들려준 이야기</strong>를 기록으로 정리해요. 사진만
              보고 기분이나 사건을 단정하지 않아요.
            </p>
            <p>
              이 브라우저의 익명 쿠키로 기록을 구분해요.{" "}
              <strong>
                쿠키를 지우거나 다른 브라우저를 사용하면 기존 기록에 접근할 수
                없어요.
              </strong>{" "}
              로그인과 다른 기기 동기화는 제공하지 않아요.
            </p>
            <p>
              사진은 전송 전에 길이 1,600px 이하 JPEG로 바꾸고 촬영 위치 등 EXIF
              정보를 제거해요. 날짜와 장소는 직접 입력해 주세요.
            </p>
            <p>
              체험 모드는 실제 AI를 호출하지 않아요. Ncloud 모드는 비공개 사진
              저장소와 CLOVA Studio를 사용해요.
            </p>
          </div>
        ) : remove ? (
          <p>
            사진과 질문·답변, 작성한 글이 함께 삭제돼요. 삭제한 기록은 되돌릴 수
            없어요.
          </p>
        ) : regenerate ? (
          <p>질문과 답변은 그대로 두고, 지금의 제목과 본문을 새 초안으로 바꿔요. 직접 고친 문장이 있다면 먼저 복사해 두세요. 새 초안 생성에 실패하면 현재 글은 유지돼요.</p>
        ) : (
          <p>
            아직 보내거나 저장하지 않은 입력이 있어요. 이미 전송한 사진과 답변은
            이어서 쓸 수 있지만, 새로고침하면 전송 전 입력은 사라질 수 있어요.
          </p>
        )}
        {remove && error && (
          <p className="dialog-error" role="alert">
            {error.message}
          </p>
        )}
        <div className="dialog-actions">
          {help ? (
            <button className="button primary" onClick={onClose}>
              알겠어요
            </button>
          ) : (
            <>
              <button
                className="button secondary"
                onClick={onClose}
                disabled={busy}
              >
                {remove ? "취소" : "계속 작성하기"}
              </button>
              <button
                className={`button ${remove ? "danger-button" : "primary"}`}
                disabled={busy}
                onClick={() =>
                  remove ? onDelete(state.memory) : state.action()
                }
              >
                {busy ? <Spinner small /> : null}
                {remove ? "삭제하기" : regenerate ? "초안 다시 만들기" : "이동하기"}
              </button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
