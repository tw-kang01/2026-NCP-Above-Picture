/**
 * GET /api/app: 실행 모드·설정 준비 상태·사용 모델과 제한값을 알려주는 입구입니다.
 * API 경로는 업무 규칙을 직접 구현하지 않고 공통 응답 함수와 서비스 계층으로 연결합니다.
 */
import { appRespond } from "@/lib/server/app/http.js";
import { appConfiguration } from "@/lib/server/app/config.js";
// 파일·암호화·DB 라이브러리를 사용하므로 Node.js 서버 런타임에서 실행합니다.
export const runtime = "nodejs";
// 사용자별 응답과 서버 상태가 정적 페이지처럼 미리 저장되지 않게 합니다.
export const dynamic = "force-dynamic";
/** 실행 모드·설정 준비 여부·사용 모델·제한값을 조회합니다. 실제 환경 변수 값은 보내지 않습니다. */
export async function GET(request) {
  return appRespond(request, () => appConfiguration());
}
