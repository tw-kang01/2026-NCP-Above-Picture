/**
 * 빌드한 앱을 별도 데모 서버로 실행하여 전체 HTTP 흐름을 검사합니다.
 * 매번 새 데이터 폴더와 가상 사용자 쿠키를 사용하고 자신의 서버만 종료합니다.
 * 실제 기록·AI·DB·클라우드는 건드리지 않습니다. 먼저 npm run build가 필요합니다.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

// 검사 전용 포트와 데이터 폴더를 사용하여 기존 개인 기록을 보존합니다.
const port = Number(process.env.TEST_PORT || 3101);
const base = `http://127.0.0.1:${port}`;
const dataDirectory = `.data/test-runs/${randomUUID()}`;
const server = spawn(
  process.execPath,
  [
    path.resolve("node_modules/next/dist/bin/next"),
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    cwd: process.cwd(),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
      APP_MODE: "demo",
      APP_DATA_DIR: dataDirectory,
      APP_PUBLIC_ORIGIN: base,
      APP_COOKIE_SECURE: "false",
    },
  },
);
let log = "";
let startupError;
let serverReady = false;
server.stdout.on("data", (chunk) => {
  log = (log + chunk.toString()).slice(-6000);
  serverReady ||= log.includes("Ready in");
});
server.stderr.on("data", (chunk) => {
  log = (log + chunk.toString()).slice(-6000);
});
server.on("error", (error) => {
  startupError = error;
});
let passed = 0;
const a = { cookie: "" },
  b = { cookie: "" };
const photo = await readFile(
  new URL("./fixtures/test-photo.png", import.meta.url),
);
/** 지정한 개수의 합성 사진을 multipart로 만듭니다. forged는 위조 파일 검사용입니다. */
function form(count = 1, forged = false, prefix = "test") {
  const body = new FormData();
  for (let index = 0; index < count; index += 1)
    body.append(
      "files",
      new Blob([forged ? "not an image" : photo], { type: "image/png" }),
      `${prefix}-${index}.png`,
    );
  return body;
}
/** 가상 사용자별 쿠키로 요청을 보내고 예상 HTTP 상태·응답 구조·확인 번호를 검증합니다. */
async function api(
  client,
  route,
  { method = "GET", body, expected = 200, origin } = {},
) {
  const multipart = body instanceof FormData;
  const response = await fetch(base + route, {
    method,
    headers: {
      ...(client.cookie ? { Cookie: client.cookie } : {}),
      ...(body !== undefined && !multipart
        ? { "Content-Type": "application/json" }
        : {}),
      ...(origin ? { Origin: origin } : {}),
    },
    body:
      body === undefined ? undefined : multipart ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (response.headers.get("set-cookie"))
    client.cookie = response.headers.get("set-cookie").split(";")[0];
  const payload = await response.json();
  assert.equal(
    response.status,
    expected,
    `${method} ${route}: ${JSON.stringify(payload)}`,
  );
  assert.equal(payload.ok, expected >= 200 && expected < 300);
  assert.equal(typeof payload.requestId, "string");
  return payload;
}
/** 한 시나리오가 성공한 경우에만 통과 횟수를 늘리고 설명을 출력합니다. */
async function check(name, work) {
  await work();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}
let memory;
try {
  for (let tries = 0; ; tries += 1) {
    if (startupError) throw startupError;
    if (server.exitCode !== null)
      throw new Error(
        "Server exited before readiness. Run npm run build first.\n" + log,
      );
    if (serverReady) {
      try {
        const r = await fetch(base + "/api/health", {
          signal: AbortSignal.timeout(1000),
        });
        if (r.ok) break;
      } catch {}
    }
    if (tries >= 100) throw new Error("Test server did not start.\n" + log);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  await check("HTML page and bundled font are served", async () => {
    const response = await fetch(base);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /사진 너머/);
    assert.equal(
      (await fetch(base + "/fonts/NanumSquareNeo-Variable.woff2")).status,
      200,
    );
  });
  await check("explicit demo mode and isolated anonymous cookies", async () => {
    assert.equal((await api(a, "/api/app")).data.mode, "demo");
    await api(b, "/api/app");
    assert.ok(a.cookie && b.cookie && a.cookie !== b.cookie);
    assert.equal((await api(a, "/api/memories")).data.memories.length, 0);
  });
  await check("invalid date and cross-origin mutation rejected", async () => {
    assert.equal(
      (
        await api(a, "/api/memories", {
          method: "POST",
          body: { date: "2026-02-30", place: "" },
          expected: 400,
        })
      ).error.code,
      "INVALID_DATE",
    );
    assert.equal(
      (
        await api(a, "/api/memories", {
          method: "POST",
          body: { date: "2026-10-23", place: "" },
          expected: 403,
          origin: "https://unrelated.example",
        })
      ).error.code,
      "ORIGIN_DENIED",
    );
  });
  await check("create record; private fields are not exposed", async () => {
    memory = (
      await api(a, "/api/memories", {
        method: "POST",
        body: { date: "2026-10-23", place: "테스트 장소" },
      })
    ).data.memory;
    assert.equal(memory.status, "upload");
    assert.equal(memory.questionLimit, 3);
    assert.equal(memory.ownerHash, undefined);
    assert.equal(memory.observation, undefined);
    await api(b, `/api/memories/${memory.id}`, { expected: 404 });
  });
  await check(
    "photo required and forged photo rejected before storage",
    async () => {
      await api(a, `/api/memories/${memory.id}/start`, {
        method: "POST",
        body: {},
        expected: 400,
      });
      await api(a, `/api/memories/${memory.id}/photos`, {
        method: "POST",
        body: form(1, true),
        expected: 400,
      });
    },
  );
  await check("upload three photos and enforce maximum count", async () => {
    memory = (
      await api(a, `/api/memories/${memory.id}/photos`, {
        method: "POST",
        body: form(3),
      })
    ).data.memory;
    assert.equal(memory.photos.length, 3);
    assert.equal(memory.photos[0].key, undefined);
    await api(a, `/api/memories/${memory.id}/photos`, {
      method: "POST",
      body: form(1, false, "new-name"),
      expected: 400,
    });
  });
  await check(
    "photo upload retry keeps IDs and version unchanged",
    async () => {
      const retried = (
        await api(a, `/api/memories/${memory.id}/photos`, {
          method: "POST",
          body: form(3),
        })
      ).data.memory;
      assert.equal(retried.version, memory.version);
      assert.deepEqual(retried.photos, memory.photos);
    },
  );
  await check(
    "private photo proxy returns original bytes; other owner denied",
    async () => {
      const response = await fetch(base + memory.photos[0].url, {
        headers: { Cookie: a.cookie },
      });
      assert.equal(response.status, 200);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), photo);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      await api(b, memory.photos[0].url, { expected: 404 });
    },
  );
  await check(
    "concurrent start is idempotent; upload closes after start",
    async () => {
      const results = await Promise.all(
        [1, 2].map(() =>
          api(a, `/api/memories/${memory.id}/start`, {
            method: "POST",
            body: {},
          }),
        ),
      );
      assert.equal(
        results[0].data.memory.turns[0].id,
        results[1].data.memory.turns[0].id,
      );
      memory = results[0].data.memory;
      assert.equal(memory.turns.length, 1);
      await api(a, `/api/memories/${memory.id}/photos`, {
        method: "POST",
        body: form(),
        expected: 409,
      });
    },
  );
  await check(
    "three answers; successful retry does not add a question",
    async () => {
      for (let index = 0; index < 3; index += 1) {
        const turn = memory.turns.find((item) => item.answer === null);
        const body = {
          questionId: turn.id,
          answer: [
            "발표를 마치고 쉬었다.",
            "준비했던 일을 이야기했다.",
            "마음이 편안해졌다.",
          ][index],
          skipped: false,
        };
        memory = (
          await api(a, `/api/memories/${memory.id}/answers`, {
            method: "POST",
            body,
          })
        ).data.memory;
        const retry = (
          await api(a, `/api/memories/${memory.id}/answers`, {
            method: "POST",
            body,
          })
        ).data.memory;
        assert.equal(retry.version, memory.version);
      }
      assert.equal(memory.turns.length, 3);
      assert.equal(
        memory.turns.filter((item) => item.answer === null).length,
        0,
      );
    },
  );
  await check(
    "draft uses supplied answers and retry reuses result",
    async () => {
      memory = (
        await api(a, `/api/memories/${memory.id}/draft`, {
          method: "POST",
          body: {},
        })
      ).data.memory;
      assert.equal(memory.status, "draft");
      assert.match(memory.content, /발표를 마치고 쉬었다/);
      assert.equal(
        (
          await api(a, `/api/memories/${memory.id}/draft`, {
            method: "POST",
            body: {},
          })
        ).data.memory.version,
        memory.version,
      );
    },
  );
  await check(
    "draft regeneration keeps the conversation and rejects stale or invalid requests",
    async () => {
      const route = `/api/memories/${memory.id}/draft`;
      const turns = structuredClone(memory.turns);
      const oldVersion = memory.version;
      await api(a, route, { method: "POST", body: { regenerate: "true", version: oldVersion }, expected: 400 });
      await api(a, route, { method: "POST", body: { regenerate: true }, expected: 409 });
      memory = (await api(a, route, { method: "POST", body: { regenerate: true, version: oldVersion } })).data.memory;
      assert.ok(memory.version > oldVersion);
      assert.deepEqual(memory.turns, turns);
      await api(a, route, { method: "POST", body: { regenerate: true, version: oldVersion }, expected: 409 });
    },
  );
  await check(
    "explicit save; stale version and later answers rejected",
    async () => {
      const oldVersion = memory.version;
      memory = (
        await api(a, `/api/memories/${memory.id}`, {
          method: "PATCH",
          body: {
            title: "내가 수정한 제목",
            content: "사용자가 직접 고친 기억입니다.",
            version: oldVersion,
          },
        })
      ).data.memory;
      assert.equal(memory.status, "saved");
      await api(a, `/api/memories/${memory.id}/draft`, {
        method: "POST", body: { regenerate: true, version: memory.version }, expected: 409,
      });
      assert.deepEqual((await api(a, `/api/memories/${memory.id}`)).data.memory.turns, memory.turns);
      await api(a, `/api/memories/${memory.id}`, {
        method: "PATCH",
        body: {
          title: "이전 화면",
          content: "덮어쓰면 안 됨",
          version: oldVersion,
        },
        expected: 409,
      });
      await api(a, `/api/memories/${memory.id}/answers`, {
        method: "POST",
        body: {
          questionId: memory.turns[0].id,
          answer: "추가",
          skipped: false,
        },
        expected: 409,
      });
      assert.equal(
        (
          await api(a, `/api/memories/${memory.id}/draft`, {
            method: "POST",
            body: {},
          })
        ).data.memory.content,
        "사용자가 직접 고친 기억입니다.",
      );
    },
  );
  await check(
    "list and detail persist saved edit; other owner sees none",
    async () => {
      assert.equal(
        (await api(a, "/api/memories")).data.memories[0].title,
        "내가 수정한 제목",
      );
      assert.equal(
        (await api(a, `/api/memories/${memory.id}`)).data.memory.content,
        "사용자가 직접 고친 기억입니다.",
      );
      assert.equal((await api(b, "/api/memories")).data.memories.length, 0);
      await api(b, `/api/memories/${memory.id}`, {
        method: "DELETE",
        expected: 404,
      });
    },
  );
  await check("all-skip flow requires at least one real answer", async () => {
    let skipped = (
      await api(b, "/api/memories", {
        method: "POST",
        body: { date: "2026-10-23", place: "" },
      })
    ).data.memory;
    skipped = (
      await api(b, `/api/memories/${skipped.id}/photos`, {
        method: "POST",
        body: form(),
      })
    ).data.memory;
    skipped = (
      await api(b, `/api/memories/${skipped.id}/start`, {
        method: "POST",
        body: {},
      })
    ).data.memory;
    for (let index = 0; index < 2; index += 1)
      skipped = (
        await api(b, `/api/memories/${skipped.id}/answers`, {
          method: "POST",
          body: {
            questionId: skipped.turns.at(-1).id,
            answer: "",
            skipped: true,
          },
        })
      ).data.memory;
    await api(b, `/api/memories/${skipped.id}/answers`, {
      method: "POST",
      body: { questionId: skipped.turns.at(-1).id, answer: "", skipped: true },
      expected: 400,
    });
    await api(b, `/api/memories/${skipped.id}/draft`, {
      method: "POST",
      body: {},
      expected: 400,
    });
    await api(b, `/api/memories/${skipped.id}`, { method: "DELETE" });
  });
  await check("delete removes record and blocks its photo URLs", async () => {
    await api(a, `/api/memories/${memory.id}`, { method: "DELETE" });
    await api(a, `/api/memories/${memory.id}`, { expected: 404 });
    await api(a, memory.photos[0].url, { expected: 404 });
    assert.equal((await api(a, "/api/memories")).data.memories.length, 0);
  });
  await check("question limits reject non-integers and values outside 1–10", async () => {
    const client = { cookie: "" };
    const config = (await api(client, "/api/app")).data;
    assert.equal(config.maxTurns, 10);
    assert.equal(config.defaultTurns, 3);
    for (const questionLimit of [0, 11, -1, 2.5, "5", null, true]) {
      const result = await api(client, "/api/memories", {
        method: "POST", body: { date: "2026-10-29", place: "", questionLimit }, expected: 400,
      });
      assert.equal(result.error.code, "INVALID_QUESTION_LIMIT");
    }
  });
  for (const limit of [1, 5, 10]) {
    await check(`chosen ${limit} questions persist and stop at the selected count`, async () => {
      const client = { cookie: "" };
      let record = (await api(client, "/api/memories", {
        method: "POST", body: { date: "2026-10-29", place: "", questionLimit: limit === 1 ? 5 : limit },
      })).data.memory;
      const route = `/api/memories/${record.id}`;
      await api(client, `${route}/photos`, { method: "POST", body: form() });
      await api(client, `${route}/start`, { method: "POST", body: { questionLimit: 0 }, expected: 400 });
      record = (await api(client, `${route}/start`, { method: "POST", body: { questionLimit: limit } })).data.memory;
      assert.equal(record.questionLimit, limit);
      assert.equal((await api(client, route)).data.memory.questionLimit, limit);
      assert.equal((await api(client, `${route}/start`, { method: "POST", body: { questionLimit: 9 } })).data.memory.questionLimit, limit);
      if (limit === 1) {
        const rejected = await api(client, `${route}/answers`, {
          method: "POST", body: { questionId: record.turns[0].id, answer: "", skipped: true }, expected: 400,
        });
        assert.equal(rejected.error.code, "ANSWER_REQUIRED");
      }
      for (let i = 0; i < limit; i++) {
        assert.equal(record.turns.length, i + 1);
        const turn = record.turns.at(-1);
        assert.ok(turn.question?.trim());
        record = (await api(client, `${route}/answers`, {
          method: "POST", body: { questionId: turn.id, answer: limit === 10 ? `기억 ${i + 1}을 남겼다.`.padEnd(2000, "가") : `기억 ${i + 1}을 남겼다.`, skipped: false },
        })).data.memory;
      }
      assert.equal(record.turns.length, limit);
      assert.ok(record.turns.every((turn) => turn.answer !== null));
      assert.equal(new Set(record.turns.map((turn) => turn.question)).size, limit);
      const draft = (await api(client, `${route}/draft`, { method: "POST", body: {} })).data.memory;
      assert.match(draft.content, new RegExp(`기억 ${limit}을 남겼다`));
      assert.deepEqual(draft.turns, record.turns);
      if (limit === 10) {
        assert.equal(draft.content.length, 20018);
        for (const turn of record.turns) assert.ok(draft.content.includes(turn.answer));
        const saved = (await api(client, route, { method: "PATCH", body: {
          title: draft.title, content: draft.content, version: draft.version,
        } })).data.memory;
        assert.equal(saved.content.length, 20018);
        assert.deepEqual((await api(client, route)).data.memory.turns, record.turns);
      }
      await api(client, route, { method: "DELETE" });
    });
  }
  await check("legacy records default to three; long conversations can finish early", async () => {
    const client = { cookie: "" };
    const record = (await api(client, "/api/memories", { method: "POST", body: { date: "2026-10-29", place: "" } })).data.memory;
    const route = `/api/memories/${record.id}`;
    const filename = path.join(dataDirectory, "memories", `${record.id}.json`);
    const stored = JSON.parse(await readFile(filename, "utf8"));
    delete stored.questionLimit;
    await writeFile(filename, JSON.stringify(stored));
    assert.equal((await api(client, route)).data.memory.questionLimit, 3);
    await api(client, `${route}/photos`, { method: "POST", body: form() });
    const started = (await api(client, `${route}/start`, { method: "POST", body: { questionLimit: 10 } })).data.memory;
    await api(client, `${route}/answers`, { method: "POST", body: { questionId: started.turns[0].id, answer: "친구와 이야기를 나눴다.", skipped: false } });
    const draft = (await api(client, `${route}/draft`, { method: "POST", body: {} })).data.memory;
    assert.equal(draft.status, "draft");
    assert.equal(draft.turns.length, 2);
    assert.match(draft.content, /친구와 이야기를 나눴다/);
    await api(client, route, { method: "DELETE" });
  });
  console.log(`\n${passed} HTTP scenarios passed. No paid cloud calls. Isolated data: ${dataDirectory}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (server.exitCode === null) {
    server.kill();
    await Promise.race([
      new Promise((resolve) => server.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  }
}
