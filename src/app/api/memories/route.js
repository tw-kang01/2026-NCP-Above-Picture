/**
 * /api/memories: 기록 목록을 읽거나 새 기록을 만드는 HTTP 입구입니다.
 * API 경로는 업무 규칙을 직접 구현하지 않고 공통 응답 함수와 서비스 계층으로 연결합니다.
 */
import { appRespond } from "@/lib/server/app/http.js";
import { create, list } from "@/lib/server/app/service.js";
// 파일·암호화·DB 라이브러리를 사용하므로 Node.js 서버 런타임에서 실행합니다.
export const runtime = "nodejs";
// 사용자별 응답과 서버 상태가 정적 페이지처럼 미리 저장되지 않게 합니다.
export const dynamic = "force-dynamic";
/** 익명 쿠키에서 구한 소유자에게 속한 기록 목록을 반환합니다. */
export async function GET(request) {
  return appRespond(request, (owner) => list(owner));
}
/** 날짜·장소·질문 수가 담긴 JSON을 서비스에 전달해 빈 기록을 생성합니다. */
export async function POST(request) {
  return appRespond(request, (owner) => create(request, owner));
}
