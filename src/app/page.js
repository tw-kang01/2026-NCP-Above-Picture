/**
 * App Router가 주소 "/"에서 보여줄 첫 화면입니다.
 * 이 파일은 화면의 진입점만 맡고, 조작 가능한 앱 전체는 MemoryApp으로 연결합니다.
 */
import MemoryApp from "@/components/MemoryApp";

/** Next.js가 첫 주소를 처리할 때 사용자 화면을 반환합니다. 별도 입력값은 없습니다. */
export default function Page() {
  return <MemoryApp />;
}
