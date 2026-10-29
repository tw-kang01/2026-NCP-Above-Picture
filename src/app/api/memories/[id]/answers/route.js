/**
 * POST /api/memories/[id]/answers: 현재 질문에 대한 답변 또는 건너뛰기를 받습니다.
 * API 경로는 업무 규칙을 직접 구현하지 않고 공통 응답 함수와 서비스 계층으로 연결합니다.
 */
import { appRespond } from "@/lib/server/app/http.js";
import { answer } from "@/lib/server/app/service.js";
// 파일·암호화·DB 라이브러리를 사용하므로 Node.js 서버 런타임에서 실행합니다.
export const runtime = "nodejs";
// 사용자별 응답과 서버 상태가 정적 페이지처럼 미리 저장되지 않게 합니다.
export const dynamic = "force-dynamic";
/** JSON의 questionId·answer·skipped를 서비스에 넘기고 갱신된 대화를 반환합니다. */
export async function POST(request, { params }) {
  const { id } = await params;
  return appRespond(request, (owner) => answer(request, id, owner));
}
