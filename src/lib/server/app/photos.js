/**
 * 사진 파일을 저장·조회·삭제합니다. 기록의 제목·답변은 repository.js, 실제 이미지 바이트는 이 파일이 담당합니다.
 * demo는 .data 아래에, ncloud는 비공개 Object Storage 버킷에 같은 형태의 메타데이터로 보관합니다.
 */
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requiredEnv } from "../day1/http.js";
import { createObjectStorageClient } from "../object-storage.js";
import {
  SafeError,
  validateImage,
  MAX_PHOTO_BYTES,
} from "../day1/validation.js";
import { appMode } from "./config.js";
import { DATA_ROOT } from "./repository.js";
import { assertId } from "./http.js";

/** 앱이 생성한 사진 키만 로컬 경로로 바꿔 ../ 같은 상위 폴더 접근을 막습니다. */
function localPath(key) {
  if (!/^app-photos\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(key))
    throw new SafeError(404, "PHOTO_NOT_FOUND", "사진을 찾을 수 없습니다.");
  return path.join(DATA_ROOT, ...key.split("/"));
}

/** 표시용 파일명과 SHA-256 체크섬을 구합니다. 같은 사진의 전송 재시도를 식별하는 내부 정보입니다. */
export function photoIdentity(file, bytes) {
  const name =
    String(file.name || "사진")
      .normalize("NFC")
      .replace(/[\x00-\x1f\x7f/\\]/g, "")
      .slice(0, 120) || "사진";
  return { name, checksum: createHash("sha256").update(bytes).digest("hex") };
}

/** File을 검증해 새 UUID 이름으로 저장하고 DB에 넣을 사진 메타데이터를 반환합니다. */
export async function putPhoto(memoryId, file) {
  const bytes = Buffer.from(await file.arrayBuffer());
  const image = validateImage(bytes, file.type);
  const id = randomUUID();
  const key = `app-photos/${assertId(memoryId)}/${id}.${image.extension}`;
  if (appMode() === "demo") {
    const filename = localPath(key);
    await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
    await writeFile(filename, bytes, { mode: 0o600, flag: "wx" });
  } else {
    await createObjectStorageClient().send(
      new PutObjectCommand({
        Bucket: requiredEnv("NCP_BUCKET"),
        Key: key,
        Body: bytes,
        ContentType: image.contentType,
      }),
      { abortSignal: AbortSignal.timeout(20000) },
    );
  }
  const { name, checksum } = photoIdentity(file, bytes);
  return {
    id,
    key,
    name,
    checksum,
    contentType: image.contentType,
    size: bytes.length,
  };
}

/** 소유자 검사가 끝난 사진 메타데이터로 이미지를 읽고 브라우저용 바이트 응답을 만듭니다. */
export async function getPhoto(photo) {
  let bytes;
  if (appMode() === "demo") {
    try {
      bytes = await readFile(localPath(photo.key));
    } catch (error) {
      if (error.code === "ENOENT")
        throw new SafeError(404, "PHOTO_NOT_FOUND", "사진을 찾을 수 없습니다.");
      throw error;
    }
  } else {
    const result = await createObjectStorageClient().send(
      new GetObjectCommand({
        Bucket: requiredEnv("NCP_BUCKET"),
        Key: photo.key,
      }),
      { abortSignal: AbortSignal.timeout(20000) },
    );
    if (!result.Body || Number(result.ContentLength) > MAX_PHOTO_BYTES)
      throw new SafeError(
        502,
        "INVALID_PHOTO",
        "저장된 사진을 읽을 수 없습니다.",
      );
    bytes = Buffer.from(await result.Body.transformToByteArray());
  }
  // 저장된 파일도 다시 검사합니다. 공개 캐시에 남기지 않도록 아래 응답에 private/no-store를 붙입니다.
  validateImage(bytes, photo.contentType);
  return new Response(bytes, {
    headers: {
      "Content-Type": photo.contentType,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** 비공개 사진을 CLOVA가 읽을 수 있도록 5분짜리 서명 URL을 발급합니다. 버킷 자체는 공개하지 않습니다. */
export async function signedPhoto(photo) {
  return getSignedUrl(
    createObjectStorageClient(),
    new GetObjectCommand({ Bucket: requiredEnv("NCP_BUCKET"), Key: photo.key }),
    { expiresIn: 300 },
  );
}

/** 사진 파일을 지웁니다. 로컬 파일이 이미 없으면 삭제 재시도가 성공한 것으로 처리합니다. */
export async function deletePhoto(photo) {
  if (appMode() === "demo") {
    await unlink(localPath(photo.key)).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    return;
  }
  await createObjectStorageClient().send(
    new DeleteObjectCommand({
      Bucket: requiredEnv("NCP_BUCKET"),
      Key: photo.key,
    }),
    { abortSignal: AbortSignal.timeout(20000) },
  );
}
