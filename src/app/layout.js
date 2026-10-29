/**
 * 모든 페이지를 감싸는 공통 HTML 틀입니다.
 * 전역 스타일과 문서 제목을 한 번 설정하고, children 자리에 현재 페이지를 넣습니다.
 */
import "./globals.css";

// 검색 결과·브라우저 탭에 사용할 정보입니다. robots 설정은 검색 수집 안내이며 접근 제어는 아닙니다.
export const metadata = {
  title: "사진 너머 · 사진에서 시작하는 나의 기록",
  description:
    "사진 한 장에서 떠오른 장면, 대화, 마음을 질문과 함께 천천히 기록하세요.",
  robots: { index: false, follow: false },
};

/** Next.js가 전달한 페이지 children을 한국어 문서의 body 안에 배치합니다. */
export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
