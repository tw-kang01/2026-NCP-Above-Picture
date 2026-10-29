/**
 * 앱 실행 모드와 공개 가능한 설정 상태를 읽습니다. demo는 로컬 파일, ncloud는 NCP 서비스를 사용합니다.
 * API에는 설정 이름과 준비 여부만 보내고 키·비밀번호 값은 보내지 않습니다.
 */
import { SafeError } from "../day1/validation.js";
import { DEFAULT_QUESTION_LIMIT, MAX_QUESTION_LIMIT } from "../../memory-limits.js";
import { AI_MODELS } from "../clova-models.js";

// ncloud 모드에서 반드시 필요한 환경 변수 이름입니다. 실제 값은 .env.local 등 서버에 둡니다.
const REQUIRED = [
  "NCP_ACCESS_KEY",
  "NCP_SECRET_KEY",
  "NCP_BUCKET",
  "PGHOST",
  "PGPORT",
  "PGDATABASE",
  "PGUSER",
  "PGPASSWORD",
  "CLOVA_STUDIO_API_KEY",
];

/** 환경 변수를 검사해 { mode, configured, missing, 제한값, 모델 정보 }를 반환합니다. */
export function appConfiguration() {
  const mode = process.env.APP_MODE?.trim() || "demo";
  const valid = mode === "demo" || mode === "ncloud";
  const missing = !valid
    ? ["APP_MODE"]
    : mode === "ncloud"
      ? REQUIRED.filter((name) => !process.env[name]?.trim())
      : [];
  return {
    mode,
    configured: valid && missing.length === 0,
    missing,
    maxPhotos: 3,
    maxTurns: MAX_QUESTION_LIMIT,
    defaultTurns: DEFAULT_QUESTION_LIMIT,
    aiModels: AI_MODELS,
  };
}

/** 저장·AI 작업 전에 설정을 확인하고 demo/ncloud를 반환합니다. 잘못된 설정은 503 오류입니다. */
export function appMode() {
  const config = appConfiguration();
  if (!config.configured)
    throw new SafeError(
      503,
      "CONFIG_MISSING",
      "서버 실행 모드와 Ncloud 연결 설정을 확인해주세요.",
    );
  return config.mode;
}
