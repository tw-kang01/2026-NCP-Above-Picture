/**
 * 브라우저 요청에 익명 소유자를 연결하고 안전한 JSON/사진 응답을 만듭니다.
 * HTTP는 요청·응답 규칙이며, 쿠키는 같은 브라우저를 다시 알아보기 위한 임의의 식별표입니다.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { respond } from "../day1/http.js";
import { SafeError } from "../day1/validation.js";
import { questionLimitFor } from "../../memory-limits.js";
import { questionForDisplay } from "./question-format.js";

const COOKIE = "memory_session";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** URL 또는 JSON의 ID가 앱에서 발급하는 UUID v4인지 검사하고 원래 값을 반환합니다. */
export function assertId(value) {
  if (typeof value !== "string" || !UUID.test(value))
    throw new SafeError(404, "NOT_FOUND", "기록을 찾을 수 없습니다.");
  return value;
}

/** 변경 요청이 다른 웹사이트에서 시작됐는지 검사합니다. 읽기 요청과 Origin 없는 Postman은 허용합니다. */
function sameOrigin(request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const supplied = request.headers.get("origin");
  const expected =
    process.env.APP_PUBLIC_ORIGIN?.trim() || new URL(request.url).origin;
  // 브라우저는 같은 출처에서만 변경할 수 있고 쿠키에도 SameSite=Lax 조건을 붙입니다.
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (supplied && supplied !== expected)
  ) {
    throw new SafeError(
      403,
      "ORIGIN_DENIED",
      "이 웹사이트에서 시작한 요청만 처리할 수 있습니다.",
    );
  }
}

/** Cookie 헤더에서 올바른 길이·문자의 익명 식별표만 읽습니다. 없으면 null입니다. */
function readSessionToken(request) {
  const raw = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  return typeof raw === "string" && /^[a-f0-9]{64}$/.test(raw) ? raw : null;
}

/** 공개 접속 주소 또는 명시적 설정으로 HTTPS 전용 쿠키 여부를 판단합니다. */
function secureSessionCookie(request) {
  return (
    process.env.APP_COOKIE_SECURE === "true" ||
    (process.env.APP_COOKIE_SECURE !== "false" &&
      (new URL(request.url).protocol === "https:" ||
        process.env.APP_PUBLIC_ORIGIN?.startsWith("https://")))
  );
}

/**
 * 앱 API의 공통 입구입니다. 요청에서 소유자를 구하고 작업 결과를 JSON으로 감쌉니다.
 * 토큰은 쿠키에만, 토큰의 SHA-256 해시는 DB에 저장하여 원래 식별표를 분리합니다.
 * 계정 로그인이 아니므로 쿠키를 잃으면 같은 기록을 다시 찾을 수 없습니다.
 */
export async function appRespond(request, work) {
  const existingToken = readSessionToken(request);
  const token = existingToken || randomBytes(32).toString("hex");
  const owner = createHash("sha256").update(token).digest("hex");
  const response = await respond(async () => {
    sameOrigin(request);
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method))
      consumeLimit(owner, "mutation", 60);
    return work(owner);
  });
  const secure = secureSessionCookie(request);
  // HTTP→HTTPS 전환 시 같은 토큰을 다시 발급해 기존 기록의 소유자를 유지합니다.
  if (!existingToken || secure) {
    response.headers.set(
      "Set-Cookie",
      `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure ? "; Secure" : ""}`,
    );
  }
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

/** 사진 요청도 공통 소유자·오류 검사를 거칩니다. 성공하면 JSON 대신 이미지 바이트를 돌려줍니다. */
export async function imageRespond(request, work) {
  let bytesResponse;
  const wrapper = await appRespond(request, async (owner) => {
    bytesResponse = await work(owner);
    return {};
  });
  if (!bytesResponse) return wrapper;
  const cookie = wrapper.headers.get("Set-Cookie");
  if (cookie) bytesResponse.headers.set("Set-Cookie", cookie);
  bytesResponse.headers.set("X-Content-Type-Options", "nosniff");
  return bytesResponse;
}

/** 내부 기록에서 소유자 해시·저장소 키·체크섬·관찰문을 제외하고 화면에 필요한 값만 반환합니다. */
export function publicMemory(memory) {
  const {
    id,
    date,
    place,
    status,
    title,
    content,
    turns,
    version,
    createdAt,
    updatedAt,
    mode,
  } = memory;
  return {
    id,
    date,
    place,
    status,
    title,
    content,
    // 표시용 복사본만 정리합니다. 기존 답변과 연결된 원본 질문·ID는 저장소에서 유지합니다.
    turns: turns.map((turn) => ({ ...turn, question: questionForDisplay(turn.question) })),
    version,
    createdAt,
    updatedAt,
    mode,
    photos: memory.photos.map(({ id: photoId, name }) => ({
      id: photoId,
      name,
      url: `/api/memories/${id}/photos/${photoId}`,
    })),
    questionLimit: questionLimitFor(memory),
    draftSource: memory.draftSource || null,
    preservedAnswerCount: memory.preservedAnswerCount || 0,
    writingModel: memory.writingModel || null,
  };
}

/** 기록·질문을 서로 구분할 무작위 UUID를 만듭니다. 이름이나 개인정보를 ID로 쓰지 않습니다. */
export function newId() {
  return randomUUID();
}

/** 한 소유자의 작업별 요청 수를 1분 동안 셉니다. 단일 앱 프로세스의 메모리 제한입니다. */
export function consumeLimit(owner, operation, max) {
  globalThis.__memoryAppRates ??= new Map();
  const rates = globalThis.__memoryAppRates;
  const now = Date.now();
  if (rates.size > 10000)
    for (const [key, entry] of rates) if (entry.until < now) rates.delete(key);
  const key = `${operation}:${owner}`;
  const previous = rates.get(key);
  const entry =
    previous && previous.until > now
      ? previous
      : { count: 0, until: now + 60000 };
  if (entry.count >= max)
    throw new SafeError(
      429,
      "RATE_LIMIT",
      "요청이 너무 많습니다. 1분 후 다시 시도해주세요.",
    );
  entry.count += 1;
  rates.set(key, entry);
}
