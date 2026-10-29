/**
 * 첫 연결 실습용 Object Storage 왕복 검사입니다. 실제 앱 사진 저장은 app/photos.js가 담당합니다.
 * 업로드한 바이트를 다시 읽어 같은지 확인하고, 이번 서버 실행 중 발급한 키만 다음 실습에서 허용합니다.
 */
import { randomUUID } from "node:crypto";
import {
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requiredEnv } from "./http.js";
import { createObjectStorageClient } from "../object-storage.js";
import { MAX_PHOTO_BYTES, SafeError, validateImage } from "./validation.js";

/** 이 프로세스에서 실습 업로드한 키 목록을 메모리에 보관합니다. 재시작하면 초기화됩니다. */
function issuedUploads() {
  globalThis.__photoMemoryDay1Uploads ??= new Map();
  return globalThis.__photoMemoryDay1Uploads;
}

/** 이미지 Buffer를 저장·재조회·비교하고 점검 결과와 objectKey를 반환합니다. */
export async function uploadAndRead(bytes, contentType) {
  const image = validateImage(bytes, contentType);
  const objectKey = `day1-checks/${randomUUID()}.${image.extension}`;
  const Bucket = requiredEnv("NCP_BUCKET");
  const client = createObjectStorageClient();
  await client.send(
    new PutObjectCommand({
      Bucket,
      Key: objectKey,
      Body: bytes,
      ContentType: image.contentType,
    }),
  );
  const result = await client.send(
    new GetObjectCommand({ Bucket, Key: objectKey }),
  );
  const downloaded = Buffer.from(await result.Body.transformToByteArray());
  if (downloaded.length !== bytes.length || !downloaded.equals(bytes)) {
    throw new SafeError(
      502,
      "STORAGE_ROUNDTRIP_FAILED",
      "사진을 저장한 뒤 다시 읽은 결과가 일치하지 않습니다.",
    );
  }
  issuedUploads().set(objectKey, {
    contentType: image.contentType,
    byteLength: bytes.length,
  });
  return {
    objectKey,
    bytes: bytes.length,
    contentType: image.contentType,
    storageRoundTrip: true,
  };
}

/** 실습에서 발급했던 키인지 확인한 뒤 CLOVA용 임시 읽기 URL을 만듭니다. */
export async function readIssuedImage(objectKey) {
  const issued = issuedUploads().get(objectKey);
  if (!issued) {
    throw new SafeError(
      400,
      "UPLOAD_REQUIRED",
      "이 서버 실행 중 사진 업로드 점검을 먼저 실행하고 받은 objectKey를 사용해주세요.",
    );
  }
  const client = createObjectStorageClient();
  const result = await client.send(
    new GetObjectCommand({ Bucket: requiredEnv("NCP_BUCKET"), Key: objectKey }),
  );
  if (!result.Body || Number(result.ContentLength) > MAX_PHOTO_BYTES) {
    throw new SafeError(
      400,
      "INVALID_FILE_SIZE",
      "분석할 사진의 크기를 확인해주세요.",
    );
  }
  const bytes = Buffer.from(await result.Body.transformToByteArray());
  const image = validateImage(bytes, result.ContentType ?? issued.contentType);
  if (bytes.length !== issued.byteLength) {
    throw new SafeError(
      409,
      "PHOTO_CHANGED",
      "업로드 점검 이후 사진이 변경되었습니다. 다시 업로드해주세요.",
    );
  }
  // 버킷 공개 설정을 바꾸지 않고 CLOVA에만 유효기간 5분의 읽기 권한을 줍니다.
  const imageUrl = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: requiredEnv("NCP_BUCKET"), Key: objectKey }),
    { expiresIn: 300 },
  );
  return { imageUrl };
}
