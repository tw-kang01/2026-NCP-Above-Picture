/**
 * /api/memories/[id]: URL의 id에 해당하는 기록을 조회·편집·삭제합니다.
 * API 경로는 업무 규칙을 직접 구현하지 않고 공통 응답 함수와 서비스 계층으로 연결합니다.
 */
import { appRespond } from "@/lib/server/app/http.js";
import { edit, get, remove } from "@/lib/server/app/service.js";
// 파일·암호화·DB 라이브러리를 사용하므로 Node.js 서버 런타임에서 실행합니다.
export const runtime = "nodejs";
// 사용자별 응답과 서버 상태가 정적 페이지처럼 미리 저장되지 않게 합니다.
export const dynamic = "force-dynamic";
/** 소유자 확인 후 기록을 조회합니다. await params는 Next.js의 비동기 URL 매개변수를 읽습니다. */
export async function GET(request, { params }) {
  const { id } = await params;
  return appRespond(request, (owner) => get(id, owner));
}
/** 편집한 제목·본문·version을 전달합니다. 버전이 달라졌으면 서비스에서 409로 거절합니다. */
export async function PATCH(request, { params }) {
  const { id } = await params;
  return appRespond(request, (owner) => edit(request, id, owner));
}
/** 해당 소유자의 기록과 연결된 사진을 삭제합니다. */
export async function DELETE(request, { params }) {
  const { id } = await params;
  return appRespond(request, (owner) => remove(id, owner));
}
