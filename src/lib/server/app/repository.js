/**
 * 기록을 저장하는 계층입니다. demo는 JSON 파일, ncloud는 PostgreSQL의 JSONB 행을 사용합니다.
 * 호출자는 저장 장소의 차이를 모르고 동일한 find/insert/save/remove 함수를 쓸 수 있습니다.
 */
import {
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getPool } from "../day1/db.js";
import { SafeError } from "../day1/validation.js";
import { appMode } from "./config.js";
import { assertId } from "./http.js";

// 실행 중 생성되는 개인 기록의 폴더입니다. turbopackIgnore는 빌드에 그 데이터를 따라 넣지 않게 합니다.
export const DATA_ROOT = path.resolve(
  /* turbopackIgnore: true */ process.cwd(),
  process.env.APP_DATA_DIR || ".data",
);
const recordsPath = path.join(DATA_ROOT, "memories");

/** 없는 기록과 다른 사람 소유의 기록에 같은 404를 사용해 기록의 존재 여부를 숨깁니다. */
function notFound() {
  return new SafeError(404, "NOT_FOUND", "기록을 찾을 수 없습니다.");
}

/** 테이블·소유자 인덱스를 최초 한 번 준비합니다. 실패한 Promise는 비워 다음 요청에서 재시도합니다. */
async function schema() {
  if (!globalThis.__memoryAppSchema) {
    globalThis.__memoryAppSchema = (async () => {
      const pool = getPool();
      await pool.query(`CREATE TABLE IF NOT EXISTS app_memories (
        id UUID PRIMARY KEY, owner_hash TEXT NOT NULL, version INTEGER NOT NULL,
        payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await pool.query(
        "CREATE INDEX IF NOT EXISTS app_memories_owner_idx ON app_memories (owner_hash, created_at DESC)",
      );
    })().catch((error) => {
      globalThis.__memoryAppSchema = null;
      throw error;
    });
  }
  await globalThis.__memoryAppSchema;
}

/**
 * 같은 기록의 변경 작업을 차례로 실행합니다. work는 DB client 또는 demo의 null을 받습니다.
 * 프로세스 안에서는 Promise 줄서기를, PostgreSQL에서는 트랜잭션 잠금을 추가로 사용합니다.
 * 여러 서버의 동시 수정도 DB가 막지만 demo 파일 저장은 한 프로세스 운용을 전제로 합니다.
 */
export async function withMemoryLock(key, work) {
  globalThis.__memoryAppQueues ??= new Map();
  const queues = globalThis.__memoryAppQueues;
  const previous = queues.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  queues.set(key, current);
  await previous;
  try {
    if (appMode() === "demo") return await work(null);
    // 작은 DB 연결 풀을 모두 장시간 AI 작업에 쓰지 않도록 동시 변경 작업은 2개로 제한합니다.
    globalThis.__memoryAppActiveWrites ??= 0;
    if (globalThis.__memoryAppActiveWrites >= 2)
      throw new SafeError(
        503,
        "BUSY",
        "서버가 다른 기록을 처리하고 있습니다. 잠시 후 다시 시도해주세요.",
      );
    globalThis.__memoryAppActiveWrites += 1;
    let client;
    try {
      await schema();
      client = await getPool().connect();
      // BEGIN부터 COMMIT까지 한 묶음입니다. 도중에 실패하면 DB 변경을 ROLLBACK으로 취소합니다.
      await client.query("BEGIN");
      // advisory_xact_lock은 key로 지정한 기록에 대한 트랜잭션 잠금입니다. 이미 잠겼으면 바로 409를 반환합니다.
      const lock = await client.query(
        "SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS locked",
        [key],
      );
      if (!lock.rows[0].locked)
        throw new SafeError(
          409,
          "BUSY",
          "같은 기록을 처리하고 있습니다. 잠시 후 다시 시도해주세요.",
        );
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client?.release();
      globalThis.__memoryAppActiveWrites -= 1;
    }
  } finally {
    // 성공·실패와 관계없이 다음 요청의 차례를 열어 잠금이 남지 않게 합니다.
    release();
    if (queues.get(key) === current) queues.delete(key);
  }
}

/** 임시 파일을 완성한 뒤 이름을 바꿉니다. 쓰다 만 JSON이 원본 자리를 차지하는 일을 줄입니다. */
async function writeAtomic(memory) {
  await mkdir(recordsPath, { recursive: true, mode: 0o700 });
  const filename = path.join(recordsPath, `${assertId(memory.id)}.json`);
  const temp = `${filename}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(memory), { mode: 0o600, flag: "wx" });
    await rename(temp, filename);
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw error;
  }
}

/** 소유자 해시가 일치하는 최근 기록을 최대 100개 반환합니다. SQL 값은 $1 매개변수로 전달합니다. */
export async function listMemories(owner, client = null) {
  if (appMode() === "ncloud") {
    await schema();
    const result = await (client || getPool()).query(
      "SELECT payload FROM app_memories WHERE owner_hash=$1 ORDER BY created_at DESC LIMIT 100",
      [owner],
    );
    return result.rows.map((row) => row.payload);
  }
  await mkdir(recordsPath, { recursive: true, mode: 0o700 });
  const files = (await readdir(recordsPath)).filter((name) =>
    /^[a-f0-9-]{36}\.json$/.test(name),
  );
  const records = await Promise.all(
    files.map(async (name) => {
      try {
        return JSON.parse(await readFile(path.join(recordsPath, name), "utf8"));
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    }),
  );
  return records
    .filter((record) => record?.ownerHash === owner)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100);
}

/** ID와 소유자를 함께 검사해 기록을 반환합니다. ID만 알아도 남의 기록을 읽을 수는 없습니다. */
export async function findMemory(id, owner, client = null) {
  assertId(id);
  if (appMode() === "ncloud") {
    await schema();
    const result = await (client || getPool()).query(
      "SELECT payload FROM app_memories WHERE id=$1 AND owner_hash=$2",
      [id, owner],
    );
    if (!result.rowCount) throw notFound();
    return result.rows[0].payload;
  }
  let record;
  try {
    record = JSON.parse(
      await readFile(path.join(recordsPath, `${id}.json`), "utf8"),
    );
  } catch (error) {
    if (error.code === "ENOENT") throw notFound();
    throw error;
  }
  if (record.ownerHash !== owner) throw notFound();
  return record;
}

/** 새 기록을 저장합니다. DB 잠금 안에서는 전달받은 client를 써 같은 트랜잭션에 참여합니다. */
export async function insertMemory(record, client = null) {
  if (appMode() === "demo") {
    await writeAtomic(record);
    return record;
  }
  await schema();
  await (client || getPool()).query(
    "INSERT INTO app_memories (id, owner_hash, version, payload) VALUES ($1,$2,$3,$4::jsonb)",
    [record.id, record.ownerHash, record.version, JSON.stringify(record)],
  );
  return record;
}

/**
 * 예상 버전이 현재 버전과 같을 때만 저장하고 버전을 1 올립니다.
 * 예: 두 화면이 version 3을 읽었다면 먼저 저장한 뒤 4가 되고, 늦은 화면의 3 저장은 409로 거절합니다.
 */
export async function saveMemory(record, expectedVersion, client = null) {
  const updated = {
    ...record,
    version: expectedVersion + 1,
    updatedAt: new Date().toISOString(),
  };
  if (appMode() === "demo") {
    const current = await findMemory(record.id, record.ownerHash);
    if (current.version !== expectedVersion)
      throw new SafeError(
        409,
        "VERSION_CONFLICT",
        "다른 화면에서 기록이 변경되었습니다. 새로고침 후 다시 저장해주세요.",
      );
    await writeAtomic(updated);
    return updated;
  }
  const result = await (client || getPool()).query(
    "UPDATE app_memories SET payload=$4::jsonb, version=$5, updated_at=NOW() WHERE id=$1 AND owner_hash=$2 AND version=$3 RETURNING id",
    [
      record.id,
      record.ownerHash,
      expectedVersion,
      JSON.stringify(updated),
      updated.version,
    ],
  );
  if (!result.rowCount)
    throw new SafeError(
      409,
      "VERSION_CONFLICT",
      "다른 화면에서 기록이 변경되었습니다. 새로고침 후 다시 저장해주세요.",
    );
  return updated;
}

/** 소유자 확인이 끝난 기록의 JSON 파일 또는 DB 행을 지웁니다. 사진 삭제는 service.js에서 먼저 처리합니다. */
export async function removeMemory(record, client = null) {
  if (appMode() === "demo") {
    await unlink(path.join(recordsPath, `${assertId(record.id)}.json`));
    return;
  }
  await (client || getPool()).query(
    "DELETE FROM app_memories WHERE id=$1 AND owner_hash=$2",
    [record.id, record.ownerHash],
  );
}
