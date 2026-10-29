/**
 * PostgreSQL 연결 풀과 첫 연결 실습용 테이블 함수를 관리합니다. 실제 기록 저장 함수는 app/repository.js에 있습니다.
 * 연결 풀은 매 요청마다 새 접속을 만들지 않고 소수의 DB 연결을 재사용하는 장치입니다.
 */
import pg from "pg";
import { requiredEnv } from "./http.js";
import { SafeError } from "./validation.js";

/** 서버 환경 변수로 최대 3개 연결을 공유하는 풀을 최초 한 번 만들고 반환합니다. */
export function getPool() {
  if (!globalThis.__photoMemoryDay1Pool) {
    const port = Number(requiredEnv("PGPORT"));
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new SafeError(503, "CONFIG_INVALID", "PGPORT 설정을 확인해주세요.");
    }
    globalThis.__photoMemoryDay1Pool = new pg.Pool({
      host: requiredEnv("PGHOST"),
      port,
      database: requiredEnv("PGDATABASE"),
      user: requiredEnv("PGUSER"),
      password: requiredEnv("PGPASSWORD"),
      max: 3,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      query_timeout: 10000,
    });
    // 비활성 연결 오류에도 계정·쿼리·사용자 문장을 남기지 않고 오류 종류만 기록합니다.
    globalThis.__photoMemoryDay1Pool.on("error", () => {
      console.error(JSON.stringify({ code: "IDLE_DB_CONNECTION_ERROR" }));
    });
  }
  return globalThis.__photoMemoryDay1Pool;
}

/** 실습 문자열 한 건을 INSERT한 뒤 SELECT해 DB 쓰기/읽기 왕복을 확인합니다. */
export async function checkDb(note) {
  const pool = getPool();
  await pool.query(`CREATE TABLE IF NOT EXISTS day1_checks (
    id BIGSERIAL PRIMARY KEY,
    note TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  // 사용자 값은 SQL 문자열에 이어 붙이지 않고 $1 자리의 매개변수로 넘깁니다.
  const inserted = await pool.query(
    "INSERT INTO day1_checks (note) VALUES ($1) RETURNING id",
    [note],
  );
  const selected = await pool.query(
    "SELECT id, note, created_at FROM day1_checks WHERE id = $1",
    [inserted.rows[0].id],
  );
  return { databaseRoundTrip: true, row: selected.rows[0] };
}

/** 첫 통합 실습의 사진 키·관찰·질문을 별도 실습 테이블에 저장하고 저장된 행을 반환합니다. */
export async function saveFirstMemory({ objectKey, observation, question }) {
  const pool = getPool();
  await pool.query(`CREATE TABLE IF NOT EXISTS day1_first_memories (
    id BIGSERIAL PRIMARY KEY,
    object_key TEXT NOT NULL,
    observation TEXT NOT NULL,
    question TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  const result = await pool.query(
    "INSERT INTO day1_first_memories (object_key, observation, question) VALUES ($1, $2, $3) RETURNING id, object_key, observation, question, created_at",
    [objectKey, observation, question],
  );
  return result.rows[0];
}
