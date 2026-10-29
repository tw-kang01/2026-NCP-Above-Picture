/**
 * NCP Object Storage 접속 설정을 한곳에서 관리합니다.
 * Object Storage는 사진 파일을 보관하는 서비스이며 S3 통신 규격으로 접근합니다.
 * 앱의 사진 저장과 day1 연결 실습이 같은 설정을 써야 환경별 차이가 생기지 않습니다.
 */
import { S3Client } from "@aws-sdk/client-s3";
import { requiredEnv } from "./day1/http.js";

/** 서버 환경 변수의 키로 새 클라이언트를 만듭니다. 키는 브라우저에 보내지 않습니다. */
export function createObjectStorageClient() {
  return new S3Client({
    endpoint: "https://kr.object.ncloudstorage.com",
    region: "kr-standard",
    forcePathStyle: true,
    credentials: {
      accessKeyId: requiredEnv("NCP_ACCESS_KEY"),
      secretAccessKey: requiredEnv("NCP_SECRET_KEY"),
    },
    // S3 호환 저장소가 요구할 때만 체크섬을 계산·검사합니다.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    maxAttempts: 2,
  });
}
