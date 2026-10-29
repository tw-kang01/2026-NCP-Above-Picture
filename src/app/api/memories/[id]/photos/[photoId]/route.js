/**
 * GET /api/memories/[id]/photos/[photoId]: 비공개 사진을 소유자에게만 전달하는 주소입니다.
 * API 경로는 업무 규칙을 직접 구현하지 않고 공통 응답 함수와 서비스 계층으로 연결합니다.
 */
import { imageRespond } from "@/lib/server/app/http.js";
import { photo } from "@/lib/server/app/service.js";
// 파일·암호화·DB 라이브러리를 사용하므로 Node.js 서버 런타임에서 실행합니다.
export const runtime = "nodejs";
// 사용자별 응답과 서버 상태가 정적 페이지처럼 미리 저장되지 않게 합니다.
export const dynamic = "force-dynamic";
/** 성공 응답은 이미지 바이트이고 실패 응답은 다른 API와 같은 안전한 JSON 형식입니다. */
export async function GET(request, { params }) {
  const { id, photoId } = await params;
  return imageRespond(request, (owner) => photo(id, photoId, owner));
}
