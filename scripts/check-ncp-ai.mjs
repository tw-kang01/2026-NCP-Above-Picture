/**
 * NCP 서버의 비밀 설정을 사용해 HCX-007에 실제 유료 요청 한 번을 보냅니다.
 * 일반 npm test와 달리 운영자가 명시적으로 실행하는 연결 확인 도구입니다.
 * 키·응답 원문을 출력하지 않으며 경량 모델로 자동 전환하지 않습니다.
 * 실행: node --env-file=.env.local scripts/check-ncp-ai.mjs
 */
import { callClovaResult } from "../src/lib/server/day1/clova.js";
import { TEXT_MODEL } from "../src/lib/server/clova-models.js";
try {
  const result = await callClovaResult(TEXT_MODEL, [
    { role: "user", content: "다른 설명 없이 연결 성공이라고만 답하세요." },
  ], 512, { thinkingEffort: "none", timeoutMs: 90000 });
  if (result.finishReason === "length") throw new Error("AI_OUTPUT_TRUNCATED");
  console.log(`${TEXT_MODEL} 실제 API 연결 성공. 앱의 질문·작성·검토는 high 추론으로 실행됩니다.`);
} catch (error) {
  console.error(`연결 실패: ${error.code || "AI_CHECK_FAILED"}`);
  if (error.code === "AI_AUTH_FAILED") console.error("CLOVA Studio의 API 키와 HCX-007 사용 권한을 확인하세요. 키를 채팅에 붙여 넣지 마세요.");
  process.exitCode = 1;
}
