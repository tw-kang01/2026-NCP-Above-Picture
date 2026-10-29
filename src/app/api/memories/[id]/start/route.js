/**
 * POST /api/memories/[id]/start: 사진 준비를 마치고 관찰·첫 질문을 시작합니다.
 * API 경로는 업무 규칙을 직접 구현하지 않고 공통 응답 함수와 서비스 계층으로 연결합니다.
 */
import { appRespond } from "@/lib/server/app/http.js";
import { start } from "@/lib/server/app/service.js";
// 파일·암호화·DB 라이브러리를 사용하므로 Node.js 서버 런타임에서 실행합니다.
export const runtime = "nodejs";
// 사용자별 응답과 서버 상태가 정적 페이지처럼 미리 저장되지 않게 합니다.
export const dynamic = "force-dynamic";
/** URL의 기록 ID와 요청 JSON을 서비스에 전달합니다. 성공하면 conversation 상태가 됩니다. */
export async function POST(request, { params }) {
  const { id } = await params;
  return appRespond(request, (owner) => start(request, id, owner));
}
