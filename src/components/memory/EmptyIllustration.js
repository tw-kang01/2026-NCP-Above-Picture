/**
 * MemoryApp에서 분리한 표시 전용 컴포넌트입니다.
 * 전달받은 props(부모가 준 값)를 화면에 그리며, 데이터 저장은 부모에게 위임합니다.
 */
import { Icon } from "../icons";

/** 홈 화면의 장식 그림입니다. 사용자 사진·외부 이미지 없이 SVG와 CSS로만 그립니다. */
export default function EmptyIllustration() {
  return (
    <div className="hero-art" aria-hidden="true">
      <div className="art-orbit orbit-one" />
      <div className="art-orbit orbit-two" />
      <div className="art-spark">
        <Icon name="spark" size={26} />
      </div>
      <div className="art-photo rear">
        <svg viewBox="0 0 210 250">
          <defs>
            <linearGradient id="sky" x2="0" y2="1">
              <stop stopColor="#c7d5f7" />
              <stop offset="1" stopColor="#f8e0c8" />
            </linearGradient>
          </defs>
          <rect width="210" height="250" fill="url(#sky)" />
          <circle cx="150" cy="65" r="27" fill="#fff6da" />
          <path d="M0 160Q60 110 115 160T230 140V250H0" fill="#70897c" />
          <path d="M0 195Q70 140 140 195T230 170V250H0" fill="#3d675c" />
        </svg>
        <span>어떤 하루였나요?</span>
      </div>
      <div className="art-note">
        <span className="note-icon">
          <Icon name="chat" size={19} />
        </span>
        <span>
          그 순간의 마음도
          <br />
          <strong>함께 남겨볼까요.</strong>
        </span>
        <i />
        <i className="short" />
      </div>
      <span className="art-dot dot-one" />
      <span className="art-dot dot-two" />
    </div>
  );
}
