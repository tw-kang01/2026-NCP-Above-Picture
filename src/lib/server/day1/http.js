/**
 * 연결 실습과 실제 앱이 함께 쓰는 HTTP 도구입니다. 요청 바이트·JSON을 읽고 성공/실패 응답을 통일합니다.
 * day1 이름은 첫 연결 실습에서 시작했기 때문이며 앱도 이 공통 함수를 사용합니다.
 */
import { randomUUID } from "node:crypto";
import { SafeError } from "./validation.js";

/** 환경 변수 값을 읽습니다. 비었으면 설정 이름만 포함한 안전한 오류를 만들고 값은 공개하지 않습니다. */
export function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new SafeError(
      503,
      "CONFIG_MISSING",
      `서버의 ${name} 설정을 확인해주세요.`,
    );
  }
  return value.trim();
}

/** 요청 본문을 maxBytes까지만 읽어 Buffer로 반환합니다. 길이 헤더와 실제 수신량을 모두 검사합니다. */
export async function readBytes(request, maxBytes) {
  const length = request.headers.get("content-length");
  if (length && Number(length) > maxBytes) {
    throw new SafeError(
      413,
      "BODY_TOO_LARGE",
      "보내는 데이터가 허용 크기를 초과했습니다.",
    );
  }
  if (!request.body) return Buffer.alloc(0);
  // Content-Length는 없거나 부정확할 수 있으므로 스트림을 읽는 동안에도 누적 크기를 셉니다.
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new SafeError(
          413,
          "BODY_TOO_LARGE",
          "보내는 데이터가 허용 크기를 초과했습니다.",
        );
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

/** application/json 본문을 크기 제한 내에서 읽고 배열이 아닌 객체로 해석합니다. */
export async function readJson(request, maxBytes = 16 * 1024) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    throw new SafeError(
      415,
      "JSON_REQUIRED",
      "Body를 JSON 형식으로 보내주세요.",
    );
  }
  const bytes = await readBytes(request, maxBytes);
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new SafeError(400, "INVALID_JSON", "JSON 문법을 확인해주세요.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SafeError(
      400,
      "INVALID_JSON",
      "이름과 값으로 구성된 JSON 객체를 보내주세요.",
    );
  }
  return parsed;
}

/** 작업을 실행해 { ok, data/error, requestId } 응답으로 감쌉니다. requestId는 오류를 찾는 확인 번호입니다. */
export async function respond(work) {
  const requestId = randomUUID();
  try {
    const data = await work();
    return Response.json(
      { ok: true, data, requestId },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const safe = error instanceof SafeError;
    const status = safe ? error.status : 500;
    const code = safe ? error.code : "INTERNAL_ERROR";
    // 제공업체 오류의 message·stack·본문에는 키나 사용자 데이터가 섞일 수 있어 로그에 쓰지 않습니다.
    const providerCode =
      typeof error?.code === "string" &&
      /^[A-Za-z0-9_.-]{1,64}$/.test(error.code)
        ? error.code
        : undefined;
    const providerStatus = Number.isInteger(error?.$metadata?.httpStatusCode)
      ? error.$metadata.httpStatusCode
      : undefined;
    console.error(
      JSON.stringify({
        requestId,
        status,
        code,
        errorType: error?.name ?? "Error",
        providerCode,
        providerStatus,
      }),
    );
    return Response.json(
      {
        ok: false,
        error: {
          code,
          message: safe
            ? error.message
            : "처리하지 못했습니다. 서버 설정과 연결 상태를 확인해주세요.",
        },
        requestId,
      },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
