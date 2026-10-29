"use client";

/**
 * 사진을 크게 보여주는 브라우저 모달입니다.
 * 부모가 photos(사진 배열), initialIndex(처음 볼 위치), onClose(닫기 함수)를 전달합니다.
 * 사진 읽기 실패 표시는 이 창에서만 관리하며, 기록이나 서버의 사진을 수정하지 않습니다.
 */
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

/** 사진 확대·좌우 이동·Esc 닫기를 제공하는 화면 요소를 반환합니다. */
export default function PhotoViewer({ photos, initialIndex = 0, onClose }) {
  const dialogRef = useRef(null);
  const [index, setIndex] = useState(initialIndex);
  const [failed, setFailed] = useState(false);
  const photo = photos[index];

  // 창을 열기 전의 초점과 스크롤 설정을 기억했다가 닫을 때 복원합니다.
  // showModal()을 쓰면 브라우저가 모달 바깥의 조작을 제한하고 키보드 초점을 관리합니다.
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  /** offset이 -1이면 이전, +1이면 다음 사진을 선택합니다. 끝에서는 처음·마지막으로 순환합니다. */
  function move(offset) {
    if (photos.length < 2) return;
    setFailed(false);
    setIndex((value) => (value + offset + photos.length) % photos.length);
  }

  // Esc로 브라우저만 닫히지 않도록 onCancel에서 부모 상태도 함께 변경합니다.
  return (
    <dialog
      ref={dialogRef}
      className="photo-viewer"
      aria-labelledby="photo-viewer-title"
      aria-describedby="photo-viewer-help"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          move(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}
    >
      <div className="photo-viewer-inner">
        <div className="photo-viewer-header">
          <h2 id="photo-viewer-title" aria-live="polite">사진 {index + 1} / {photos.length}</h2>
          <button type="button" className="photo-viewer-button" aria-label="사진 확대 닫기" onClick={onClose} autoFocus>
            <Icon name="close" size={24} />
          </button>
        </div>
        <div className="photo-viewer-stage">
          {failed ? <p role="alert">사진을 불러오지 못했어요. 닫은 뒤 다시 열어 주세요.</p> : (
            <img key={photo.url} src={photo.url} alt={`크게 보는 사진 ${index + 1}`} onError={() => setFailed(true)} />
          )}
        </div>
        <div className="photo-viewer-footer">
          {photos.length > 1 && <button type="button" className="photo-viewer-button" aria-label="이전 사진" onClick={() => move(-1)}><Icon name="back" /></button>}
          <p id="photo-viewer-help">{photos.length > 1 ? "화살표로 사진을 넘겨 보세요. " : ""}Esc 키로 닫을 수 있어요.</p>
          {photos.length > 1 && <button type="button" className="photo-viewer-button" aria-label="다음 사진" onClick={() => move(1)}><Icon name="arrow" /></button>}
        </div>
      </div>
    </dialog>
  );
}
