/**
 * Next.js의 빌드 기준 폴더와 모든 웹 응답의 공통 헤더를 설정합니다.
 * 실제 비밀값은 이 파일에 넣지 않고 서버 환경 변수에서만 읽습니다.
 */
import { fileURLToPath } from "node:url";

const nextConfig = {
  // 응답 헤더로 사용 프레임워크를 따로 광고하지 않습니다.
  poweredByHeader: false,
  turbopack: {
    // 상위 폴더의 다른 프로젝트가 빌드 기준에 섞이지 않도록 이 폴더를 지정합니다.
    root: fileURLToPath(new URL(".", import.meta.url)),
  },
  /** 파일 형식 추측·다른 사이트의 화면 삽입·불필요한 브라우저 권한을 제한합니다. */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
