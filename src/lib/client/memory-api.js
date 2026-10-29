/**
 * 브라우저 화면과 같은 웹사이트의 앱 API를 연결하는 통신 모듈입니다.
 * 화면이 서버 주소·JSON 형식·오류 처리를 반복해서 작성하지 않도록 한곳에 모읍니다.
 * Ncloud 인증 키와 DB 비밀번호는 서버에만 둡니다. 이 파일은 사용자 브라우저에 전달됩니다.
 */
/** 화면용 오류입니다. message와 함께 서버 코드·HTTP 상태·확인 번호를 보관합니다. */
export class ApiError extends Error {
  /** 서버 또는 네트워크 오류 정보를 하나의 Error 객체로 묶습니다. */
  constructor(message, code, status, requestId) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

/**
 * 상대 경로 path로 요청을 보내고 응답의 data만 반환합니다. 실패하면 ApiError를 던집니다.
 * body가 FormData이면 사진 전송, 일반 객체이면 JSON 전송으로 구분합니다.
 * timeout은 브라우저가 기다릴 최대 밀리초이며 초안 생성은 AI 재시도 때문에 길게 기다립니다.
 */
async function request(path, { method = "GET", body, timeout = 210000 } = {}) {
  const multipart = typeof FormData !== "undefined" && body instanceof FormData;
  let response;
  try {
    response = await fetch(path, {
      method,
      // 같은 사이트의 HttpOnly 쿠키를 함께 보내 서버가 이 브라우저의 기록을 구분하게 합니다.
      credentials: "same-origin",
      cache: "no-store",
      // FormData의 경계 문자열(boundary)은 브라우저가 만듭니다. Content-Type을 직접 지정하지 않습니다.
      headers:
        body !== undefined && !multipart
          ? { "Content-Type": "application/json" }
          : undefined,
      body:
        body === undefined
          ? undefined
          : multipart
            ? body
            : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    const timedOut =
      error.name === "TimeoutError" || error.name === "AbortError";
    throw new ApiError(
      timedOut
        ? "응답을 기다리는 시간이 길어졌어요. 이미 보낸 내용은 저장되어 있을 수 있으니 다시 시도해 주세요."
        : "서버에 연결하지 못했어요. 인터넷 연결과 앱 실행 상태를 확인해 주세요.",
      timedOut ? "TIMEOUT" : "NETWORK_ERROR",
    );
  }
  // HTTP 성공 여부와 앱의 ok 값을 모두 확인합니다. HTML 오류 페이지도 사용자용 오류로 바꿉니다.
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(
      "서버 응답을 읽지 못했어요. 잠시 후 다시 시도해 주세요.",
      "INVALID_RESPONSE",
      response.status,
    );
  }
  if (!response.ok || payload.ok !== true) {
    throw new ApiError(
      payload.error?.message || "요청을 처리하지 못했어요. 다시 시도해 주세요.",
      payload.error?.code || "REQUEST_FAILED",
      response.status,
      payload.requestId,
    );
  }
  return payload.data;
}

/** 기록 ID를 URL 경로에 안전하게 넣습니다. 최종 ID 형식과 소유권은 서버가 다시 검사합니다. */
const memoryPath = (id) => `/api/memories/${encodeURIComponent(id)}`;

/** 화면에서 사용하는 API 목록입니다. 각 함수는 Promise로 서버 결과(data)를 돌려줍니다. */
export const memoryApi = {
  // 앱 모드·설정 유무·사진과 질문 수 제한을 조회합니다.
  app: () => request("/api/app", { timeout: 15000 }),
  // 현재 브라우저가 소유한 기록 목록을 조회합니다.
  list: () => request("/api/memories", { timeout: 20000 }),
  // 기록 ID 하나의 최신 상태를 읽습니다.
  get: (id) => request(memoryPath(id), { timeout: 20000 }),
  // 날짜·장소·질문 수로 사진을 받을 빈 기록을 만듭니다.
  create: (date, place, questionLimit) =>
    request("/api/memories", { method: "POST", body: { date, place, questionLimit } }),
  // File 배열을 반복되는 files 항목으로 묶어 해당 기록에 업로드합니다.
  upload: (id, files) => {
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    return request(`${memoryPath(id)}/photos`, { method: "POST", body: form });
  },
  // 업로드한 사진으로 첫 질문을 요청합니다. 대화 시작 후 질문 수는 고정됩니다.
  start: (id, questionLimit) =>
    request(`${memoryPath(id)}/start`, { method: "POST", body: { questionLimit } }),
  // 어떤 질문에 대한 답변인지 questionId를 함께 보내 중복·뒤바뀐 답변을 서버가 검사하게 합니다.
  answer: (id, questionId, answer, skipped = false) =>
    request(`${memoryPath(id)}/answers`, {
      method: "POST",
      body: { questionId, answer, skipped },
    }),
  // 저장된 답변으로 초안을 만듭니다. options에는 명시적 재생성과 현재 version을 넣을 수 있습니다.
  draft: (id, options = {}) =>
    request(`${memoryPath(id)}/draft`, { method: "POST", body: options, timeout: 210000 }),
  // 편집한 제목·본문과 읽었던 버전을 보내 최종 기록을 저장합니다.
  save: (id, title, content, version) =>
    request(memoryPath(id), {
      method: "PATCH",
      body: { title, content, version },
    }),
  // 서버의 기록과 연결된 사진을 삭제합니다. 확인창은 이 호출 전 화면에서 처리합니다.
  remove: (id) => request(memoryPath(id), { method: "DELETE" }),
};

/**
 * 사용자 원본 File을 읽고 긴 변 1,600px 이하의 새 JPEG File을 반환합니다.
 * 캔버스로 픽셀만 다시 그리므로 원본 EXIF(촬영 위치 등)를 복사하지 않습니다.
 * 사진 속 얼굴·문구 등 픽셀에 담긴 내용은 남습니다. 전송할 사진은 사용자가 확인해야 합니다.
 */
export async function preparePhoto(file) {
  // 브라우저에서 먼저 형식·크기를 제한합니다. 서버도 전송된 파일을 별도로 검증합니다.
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error(
      "JPG, PNG, WebP 사진을 선택해 주세요. HEIC 사진은 JPG로 변환해 주세요.",
    );
  if (file.size > 30 * 1024 * 1024)
    throw new Error("원본 사진은 한 장당 30MB 이하로 선택해 주세요.");
  // object URL은 메모리에 있는 파일을 <img>가 읽을 임시 주소이며 서버 업로드 주소가 아닙니다.
  const localUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () =>
        reject(
          new Error("이 사진을 읽을 수 없어요. 다른 사진을 선택해 주세요."),
        );
      image.src = localUrl;
    });
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > 80000000
    )
      throw new Error(
        "사진 크기를 확인해 주세요. 해상도가 너무 크거나 손상된 사진일 수 있어요.",
      );
    // 원본보다 확대하지 않고, 가로·세로 중 긴 변을 1,600px 안에 맞춥니다.
    const scale = Math.min(
      1,
      1600 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const ratio =
      Math.max(image.naturalWidth, image.naturalHeight) /
      Math.min(image.naturalWidth, image.naturalHeight);
    if (
      ratio > 5 ||
      Math.round(Math.min(image.naturalWidth, image.naturalHeight) * scale) < 4
    ) {
      throw new Error(
        "가로 또는 세로로 너무 긴 사진이에요. 사진을 일반 비율로 잘라서 다시 선택해 주세요.",
      );
    }
    // 투명한 PNG도 JPEG로 바꿀 수 있도록 흰 바탕을 먼저 칠하고 사진을 그립니다.
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx)
      throw new Error(
        "사진을 준비할 수 없어요. 다른 브라우저에서 다시 시도해 주세요.",
      );
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    // 품질 0.86으로 JPEG 바이트를 만들고 서버의 장당 5MiB 제한에 맞는지 확인합니다.
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.86),
    );
    if (!blob || blob.size > 5 * 1024 * 1024)
      throw new Error("사진을 줄이지 못했어요. 더 작은 사진을 선택해 주세요.");
    return new File(
      [blob],
      `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`,
      { type: "image/jpeg" },
    );
  } finally {
    // 성공·실패와 무관하게 읽기용 임시 주소를 해제해 사진 메모리가 계속 쌓이지 않게 합니다.
    URL.revokeObjectURL(localUrl);
  }
}
