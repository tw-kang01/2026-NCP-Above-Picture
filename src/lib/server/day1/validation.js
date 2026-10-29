/**
 * 사용자가 보낸 문자열·이미지의 형식을 검사합니다. 브라우저 검사만 믿지 않고 서버에서도 같은 경계를 지킵니다.
 */
// MB 대신 1,024 기준 바이트를 사용합니다. 파일 한 장은 최대 5×1,024×1,024바이트입니다.
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_FORM_BYTES = MAX_PHOTO_BYTES + 256 * 1024;

/** 사용자에게 공개해도 되는 HTTP 상태·오류 코드·설명을 담는 오류 타입입니다. */
export class SafeError extends Error {
  /** status는 HTTP 번호, code는 프로그램용 이름, message는 화면에 보여줄 설명입니다. */
  constructor(status, code, message) {
    super(message);
    this.name = "SafeError";
    this.status = status;
    this.code = code;
  }
}

/** 비어 있지 않은 문자열을 검사하고 앞뒤 공백을 제거합니다. label은 오류 설명에 쓰입니다. */
export function requireText(value, label, maxLength) {
  if (typeof value !== "string" || !value.trim()) {
    throw new SafeError(400, "INVALID_INPUT", `${label}을(를) 입력해주세요.`);
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw new SafeError(
      400,
      "INPUT_TOO_LONG",
      `${label}은(는) ${maxLength}자 이하로 입력해주세요.`,
    );
  }
  return text;
}

/** 크기와 JPEG/PNG/WebP 파일 시작 바이트를 확인해 { contentType, extension }을 반환합니다. */
export function validateImage(bytes, contentType) {
  if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) {
    throw new SafeError(
      400,
      "INVALID_FILE_SIZE",
      "사진은 0바이트보다 크고 5MB 이하여야 합니다.",
    );
  }
  // 파일명 확장자나 브라우저 MIME만 믿지 않고 실제 파일의 서명 바이트와 일치하는지 봅니다.
  // 이 검사는 이미지 전체 디코딩·악성 파일 분석을 대신하지 않습니다.
  let actualType = null;
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    actualType = "image/jpeg";
  } else if (
    bytes.length >= 8 &&
    Buffer.from(bytes.subarray(0, 8)).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    )
  ) {
    actualType = "image/png";
  } else if (
    bytes.length >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
  ) {
    actualType = "image/webp";
  }
  if (!actualType || actualType !== contentType) {
    throw new SafeError(
      400,
      "INVALID_FILE_TYPE",
      "파일 내용과 형식이 일치하는 JPEG, PNG, WebP 사진을 사용해주세요.",
    );
  }
  return {
    contentType: actualType,
    extension: {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    }[actualType],
  };
}
