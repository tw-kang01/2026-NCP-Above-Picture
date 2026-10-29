/**
 * 앱의 업무 순서를 구현합니다. route.js는 요청을 이곳으로 넘기고, 이곳은 검증·저장소·AI를 연결합니다.
 * 기록 상태는 upload(사진 준비) → conversation(질문·답변) → draft(편집 전 초안) → saved(사용자 저장)입니다.
 * 각 변경은 소유자 확인과 기록 잠금 안에서 처리하여 다른 요청의 저장 결과를 덮어쓰지 않게 합니다.
 */
import { readBytes, readJson } from "../day1/http.js";
import {
  SafeError,
  requireText,
  MAX_PHOTO_BYTES,
  validateImage,
} from "../day1/validation.js";
import { appMode } from "./config.js";
import { assertId, newId, publicMemory } from "./http.js";
import {
  findMemory,
  insertMemory,
  listMemories,
  removeMemory,
  saveMemory,
  withMemoryLock,
} from "./repository.js";
import { deletePhoto, getPhoto, photoIdentity, putPhoto } from "./photos.js";
import { makeDraft, nextQuestionTurn, observePhotos } from "./ai.js";
import { MAX_DRAFT_CHARACTERS } from "./draft-format.js";
import {
  DEFAULT_QUESTION_LIMIT,
  questionLimitFor,
  validQuestionLimit,
} from "../../memory-limits.js";

/** 누락된 질문 수에는 기본값을, 전달된 값에는 1~10 정수 검사 결과를 적용합니다. */
function readQuestionLimit(value, fallback = DEFAULT_QUESTION_LIMIT) {
  if (value === undefined) return fallback;
  if (!validQuestionLimit(value))
    throw new SafeError(
      400,
      "INVALID_QUESTION_LIMIT",
      "질문 수는 1~10 사이의 정수로 선택해주세요.",
    );
  return value;
}

/** 현재 브라우저 소유자의 목록을 화면용 필드만 남겨 반환합니다. */
export async function list(owner) {
  return { memories: (await listMemories(owner)).map(publicMemory) };
}
/** 기록 하나를 소유자 확인 후 반환합니다. */
export async function get(id, owner) {
  return { memory: publicMemory(await findMemory(id, owner)) };
}

/** JSON의 날짜·장소·질문 수를 검사한 뒤 upload 상태의 빈 기록을 만듭니다. */
export async function create(request, owner) {
  const mode = appMode();
  const body = await readJson(request);
  const questionLimit = readQuestionLimit(body.questionLimit);
  const date = requireText(body.date, "날짜", 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(`${date}T12:00:00Z`)) ||
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date
  ) {
    throw new SafeError(
      400,
      "INVALID_DATE",
      "실제 날짜를 YYYY-MM-DD 형식으로 입력해주세요.",
    );
  }
  if (typeof body.place !== "string" || body.place.length > 100)
    throw new SafeError(
      400,
      "INVALID_PLACE",
      "장소는 100자 이하로 입력해주세요.",
    );
  // 새 기록은 아직 ID별 잠금이 없으므로 소유자별로 잠가 최대 기록 수 검사를 함께 보호합니다.
  return withMemoryLock(`owner:${owner}`, async (client) => {
    if ((await listMemories(owner, client)).length >= 100)
      throw new SafeError(
        400,
        "MEMORY_LIMIT",
        "체험 기록은 최대 100개입니다. 오래된 기록을 지운 뒤 다시 만들어주세요.",
      );
    const now = new Date().toISOString();
    const memory = {
      id: newId(),
      ownerHash: owner,
      date,
      place: body.place.trim(),
      status: "upload",
      title: "",
      content: "",
      photos: [],
      turns: [],
      questionLimit,
      observation: "",
      version: 1,
      createdAt: now,
      updatedAt: now,
      mode,
    };
    await insertMemory(memory, client);
    return { memory: publicMemory(memory) };
  });
}

/** multipart/form-data의 files 사진 1~3장을 검증·저장하고 기록에 연결합니다. */
export async function upload(request, id, owner) {
  assertId(id);
  // 큰 파일을 읽기 전에 이 기록을 사용할 권한부터 검사합니다.
  await findMemory(id, owner);
  const type = request.headers.get("content-type") || "";
  if (!type.toLowerCase().startsWith("multipart/form-data"))
    throw new SafeError(
      415,
      "MULTIPART_REQUIRED",
      "사진은 multipart/form-data로 보내주세요.",
    );
  const bytes = await readBytes(request, 3 * MAX_PHOTO_BYTES + 256 * 1024);
  let form;
  try {
    form = await new Response(bytes, {
      headers: { "Content-Type": type },
    }).formData();
  } catch {
    throw new SafeError(400, "INVALID_FORM", "사진 전송 형식을 확인해주세요.");
  }
  const files = form.getAll("files");
  if (
    !files.length ||
    files.length > 3 ||
    [...form.keys()].some((name) => name !== "files") ||
    files.some(
      (file) =>
        typeof file === "string" || typeof file.arrayBuffer !== "function",
    )
  ) {
    throw new SafeError(
      400,
      "INVALID_PHOTOS",
      "files 항목으로 사진을 1~3장 보내주세요.",
    );
  }
  // 하나라도 잘못된 사진이 있으면 저장을 시작하지 않습니다.
  // 체크섬+정리된 파일명이 같은 사진은 재전송으로 보아 중복 추가하지 않습니다.
  const incoming = [];
  const batchIdentities = new Set();
  for (const file of files) {
    const fileBytes = Buffer.from(await file.arrayBuffer());
    validateImage(fileBytes, file.type);
    const identity = photoIdentity(file, fileBytes);
    const signature = `${identity.checksum}:${identity.name}`;
    if (!batchIdentities.has(signature)) {
      incoming.push({ file, ...identity });
      batchIdentities.add(signature);
    }
  }
  return withMemoryLock(id, async (client) => {
    const memory = await findMemory(id, owner, client);
    if (memory.status !== "upload")
      throw new SafeError(
        409,
        "UPLOAD_CLOSED",
        "대화를 시작한 뒤에는 사진을 추가할 수 없습니다.",
      );
    const toAdd = incoming.filter(
      (item) =>
        !memory.photos.some(
          (existing) =>
            existing.checksum === item.checksum && existing.name === item.name,
        ),
    );
    if (!toAdd.length) return { memory: publicMemory(memory) };
    if (memory.photos.length + toAdd.length > 3)
      throw new SafeError(
        400,
        "PHOTO_LIMIT",
        "사진은 총 3장까지 선택할 수 있습니다.",
      );
    const added = [];
    try {
      for (const { file } of toAdd) added.push(await putPhoto(id, file));
      const updated = await saveMemory(
        { ...memory, photos: [...memory.photos, ...added] },
        memory.version,
        client,
      );
      return { memory: publicMemory(updated) };
    } catch (error) {
      // 파일 저장 후 DB 저장이 실패했다면 이번 요청에서 새로 만든 파일을 지워 흔적을 정리합니다.
      // 외부 저장소 작업은 DB 트랜잭션으로 취소되지 않으므로 직접 보상 삭제합니다.
      const cleanup = await Promise.allSettled(added.map(deletePhoto));
      if (cleanup.some((result) => result.status === "rejected"))
        console.error(
          JSON.stringify({ code: "PHOTO_ROLLBACK_CLEANUP_FAILED" }),
        );
      throw error;
    }
  });
}

/** 기록의 소유자를 먼저 검사하고 그 기록에 포함된 photoId만 이미지로 반환합니다. */
export async function photo(id, photoId, owner) {
  assertId(photoId);
  const memory = await findMemory(id, owner);
  const found = memory.photos.find((item) => item.id === photoId);
  if (!found)
    throw new SafeError(404, "PHOTO_NOT_FOUND", "사진을 찾을 수 없습니다.");
  return getPhoto(found);
}

/** 사진 관찰과 첫 질문이 모두 준비된 뒤 upload에서 conversation으로 전환합니다. */
export async function start(request, id, owner) {
  const body = await readJson(request);
  return withMemoryLock(assertId(id), async (client) => {
    let memory = await findMemory(id, owner, client);
    if (memory.status !== "upload") return { memory: publicMemory(memory) };
    memory = {
      ...memory,
      questionLimit: readQuestionLimit(body.questionLimit, questionLimitFor(memory)),
    };
    if (!memory.photos.length)
      throw new SafeError(
        400,
        "PHOTO_REQUIRED",
        "먼저 사진을 한 장 이상 선택해주세요.",
      );
    const observation = await observePhotos(memory);
    const next = await nextQuestionTurn({ ...memory, observation });
    memory = await saveMemory(
      {
        ...memory,
        observation,
        status: "conversation",
        turns: [{ id: newId(), ...next, answer: null, skipped: false }],
      },
      memory.version,
      client,
    );
    return { memory: publicMemory(memory) };
  });
}

/** 현재 질문의 답변/건너뛰기를 저장하고 선택한 질문 수가 남았으면 다음 질문을 추가합니다. */
export async function answer(request, id, owner) {
  const body = await readJson(request);
  const questionId = assertId(body.questionId);
  if (typeof body.skipped !== "boolean")
    throw new SafeError(
      400,
      "INVALID_SKIP",
      "skipped는 true 또는 false로 보내주세요.",
    );
  const answerValue = body.skipped
    ? ""
    : requireText(body.answer, "답변", 2000);
  return withMemoryLock(assertId(id), async (client) => {
    let memory = await findMemory(id, owner, client);
    if (memory.status !== "conversation")
      throw new SafeError(
        409,
        "CONVERSATION_CLOSED",
        "질문에 답할 수 있는 상태가 아닙니다.",
      );
    const index = memory.turns.findIndex((turn) => turn.id === questionId);
    if (index < 0)
      throw new SafeError(
        409,
        "QUESTION_CHANGED",
        "현재 질문을 다시 확인해주세요.",
      );
    const turn = memory.turns[index];
    // 같은 답변의 재전송은 이미 처리된 성공으로 돌려주고, 내용이 달라지면 중복 수정을 막습니다.
    if (turn.answer !== null) {
      if (turn.answer === answerValue && turn.skipped === body.skipped)
        return { memory: publicMemory(memory) };
      throw new SafeError(
        409,
        "ALREADY_ANSWERED",
        "이미 답한 질문입니다. 현재 질문을 확인해주세요.",
      );
    }
    if (index !== memory.turns.length - 1)
      throw new SafeError(409, "QUESTION_CHANGED", "현재 질문에 답해주세요.");
    // 마지막 질문까지 모두 건너뛰면 글의 근거가 없으므로 답변을 최소 한 개 요구합니다.
    if (
      body.skipped &&
      memory.turns.length >= questionLimitFor(memory) &&
      !memory.turns.some((item) => item.answer?.trim())
    ) {
      throw new SafeError(
        400,
        "ANSWER_REQUIRED",
        "기록을 만들려면 기억을 한 가지 이상 적어주세요.",
      );
    }
    const turns = memory.turns.map((item, i) =>
      i === index
        ? { ...item, answer: answerValue, skipped: body.skipped }
        : item,
    );
    const changed = { ...memory, turns };
    if (turns.length < questionLimitFor(memory))
      turns.push({
        id: newId(),
        ...(await nextQuestionTurn(changed)),
        answer: null,
        skipped: false,
      });
    memory = await saveMemory(changed, memory.version, client);
    return { memory: publicMemory(memory) };
  });
}

/** 답변으로 초안을 만들고 draft로 바꿉니다. 재생성은 저장 전 초안과 일치하는 버전에서만 허용합니다. */
export async function draft(request, id, owner) {
  const body = await readJson(request);
  if (body.regenerate !== undefined && typeof body.regenerate !== "boolean")
    throw new SafeError(
      400,
      "INVALID_REGENERATE",
      "regenerate는 true 또는 false로 보내주세요.",
    );
  return withMemoryLock(assertId(id), async (client) => {
    let memory = await findMemory(id, owner, client);
    if (body.regenerate === true) {
      if (memory.status !== "draft")
        throw new SafeError(
          409,
          "DRAFT_REQUIRED",
          "저장 전 초안에서만 다시 만들 수 있어요. 저장한 기록은 직접 수정해주세요.",
        );
      if (body.version !== memory.version)
        throw new SafeError(
          409,
          "VERSION_CONFLICT",
          "기록이 변경되었습니다. 다시 열고 시도해주세요.",
        );
    } else if (memory.status === "draft" || memory.status === "saved")
      return { memory: publicMemory(memory) };
    if (memory.status !== "conversation" && body.regenerate !== true)
      throw new SafeError(
        409,
        "CONVERSATION_REQUIRED",
        "사진을 보며 기억을 먼저 적어주세요.",
      );
    const generated = await makeDraft(memory);
    memory = await saveMemory(
      { ...memory, ...generated, status: "draft" },
      memory.version,
      client,
    );
    return { memory: publicMemory(memory) };
  });
}

/** 사용자가 편집한 제목·본문을 버전 확인 후 저장하고 saved 상태로 바꿉니다. */
export async function edit(request, id, owner) {
  const body = await readJson(request, 128 * 1024);
  const title = requireText(body.title, "제목", 80);
  const content = requireText(body.content, "기록", MAX_DRAFT_CHARACTERS);
  if (!Number.isInteger(body.version) || body.version < 1)
    throw new SafeError(
      400,
      "INVALID_VERSION",
      "저장할 기록의 version을 확인해주세요.",
    );
  return withMemoryLock(assertId(id), async (client) => {
    const memory = await findMemory(id, owner, client);
    if (!["draft", "saved"].includes(memory.status))
      throw new SafeError(
        409,
        "DRAFT_REQUIRED",
        "기록 초안을 먼저 만들어주세요.",
      );
    if (memory.version !== body.version)
      throw new SafeError(
        409,
        "VERSION_CONFLICT",
        "다른 화면에서 기록이 변경되었습니다. 새로고침 후 다시 저장해주세요.",
      );
    const updated = await saveMemory(
      { ...memory, title, content, status: "saved" },
      body.version,
      client,
    );
    return { memory: publicMemory(updated) };
  });
}

/** 같은 기록의 작업을 잠근 뒤 사진 파일과 기록을 삭제합니다. */
export async function remove(id, owner) {
  return withMemoryLock(assertId(id), async (client) => {
    const memory = await findMemory(id, owner, client);
    // 사진부터 지워 삭제 실패 시 재시도할 기록을 남깁니다. 외부 파일과 DB 전체가 원자적으로 지워지는 것은 아닙니다.
    await Promise.all(memory.photos.map(deletePhoto));
    await removeMemory(memory, client);
    return { deleted: true };
  });
}
