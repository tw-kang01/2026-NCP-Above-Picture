/**
 * POST /api/memories/[id]/draft: 대화 답변을 바탕으로 편집 가능한 초안을 만듭니다.
 * API 경로는 업무 규칙을 직접 구현하지 않고 공통 응답 함수와 서비스 계층으로 연결합니다.
 */
import { appRespond } from "@/lib/server/app/http.js";
import { draft } from "@/lib/server/app/service.js";
// 파일·암호화·DB 라이브러리를 사용하므로 Node.js 서버 런타임에서 실행합니다.
export const runtime = "nodejs";
// 사용자별 응답과 서버 상태가 정적 페이지처럼 미리 저장되지 않게 합니다.
export const dynamic = "force-dynamic";
/** 초안 생성 또는 버전 확인이 필요한 재생성 요청을 서비스에 전달합니다. */
export async function POST(request, { params }) {
  const { id } = await params;
  return appRespond(request, (owner) => draft(request, id, owner));
}
