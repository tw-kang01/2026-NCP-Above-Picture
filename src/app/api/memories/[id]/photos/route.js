/**
 * POST /api/memories/[id]/photos: multipart/form-data의 files 항목으로 사진을 받습니다.
 * API 경로는 업무 규칙을 직접 구현하지 않고 공통 응답 함수와 서비스 계층으로 연결합니다.
 */
import { appRespond } from "@/lib/server/app/http.js";
import { upload } from "@/lib/server/app/service.js";
// 파일·암호화·DB 라이브러리를 사용하므로 Node.js 서버 런타임에서 실행합니다.
export const runtime = "nodejs";
// 사용자별 응답과 서버 상태가 정적 페이지처럼 미리 저장되지 않게 합니다.
export const dynamic = "force-dynamic";
/** 소유자·기록 상태·사진 형식·총 장수 검사는 upload 서비스에서 처리합니다. */
export async function POST(request, { params }) {
  const { id } = await params;
  return appRespond(request, (owner) => upload(request, id, owner));
}
