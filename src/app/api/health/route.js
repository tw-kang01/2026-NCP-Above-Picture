/**
 * GET /api/health: 웹 서버 자체가 응답하는지만 확인하는 가벼운 점검 주소입니다.
 * API 경로는 업무 규칙을 직접 구현하지 않고 공통 응답 함수와 서비스 계층으로 연결합니다.
 */
// 파일·암호화·DB 라이브러리를 사용하므로 Node.js 서버 런타임에서 실행합니다.
export const runtime = "nodejs";
// 사용자별 응답과 서버 상태가 정적 페이지처럼 미리 저장되지 않게 합니다.
export const dynamic = "force-dynamic";

/** 현재 서버 시간을 반환합니다. DB·Object Storage·CLOVA 연결까지 정상이라는 뜻은 아닙니다. */
export async function GET() {
  return Response.json(
    {
      ok: true,
      data: {
        service: "photo-memory",
        serverTime: new Date().toISOString(),
        message:
          "웹 서버 응답 확인. 외부 서비스 연결 상태는 포함하지 않습니다.",
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
