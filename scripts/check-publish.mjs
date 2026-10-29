/**
 * 공개할 소스와 문서에서 알려진 개인정보·비밀값·제외 경로를 찾습니다.
 * 기본은 추적 파일과 공개 가능한 새 파일, --staged는 실제 Git 인덱스를 검사합니다.
 * 값 원문은 출력하지 않습니다. 자동 검사가 모든 개인정보를 판별하지는 못하므로
 * 이름·소속·문맥 등의 수동 검토를 함께 해야 합니다.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const staged = process.argv.includes("--staged");
const git = (args) => execFileSync("git", args, { encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
const files = [...new Set(git(["ls-files", "-z", "--cached", ...(staged ? [] : ["--others", "--exclude-standard"])]).split("\0").filter(Boolean))];
const problems = [];
const report = (file, line, reason) => problems.push(`${file}:${line}: ${reason}`);
const blocked = /(^|\/)(?:node_modules|\.next|\.data|artifacts|presentation|screenshots|\.ssh)(?:\/|$)|\.(?:zip(?:\.previous)?|pem|key|pfx|p12|sqlite\w*|db|pptx|pdf|log)$/i;
const textFile = /\.(?:js|mjs|json|md|css|sh|ps1|html|txt)$|(^|\/)\.(?:env\.example|gitignore|gitattributes)$/i;
const safeBinary = new Set(["public/fonts/NanumSquareNeo-Variable.woff2", "scripts/fixtures/test-photo.png"]);

/** 실제 인터넷 서버를 가리키지 않는 문서용·내부용 IPv4인지 확인합니다. */
function exampleAddress(value) {
  const octets = value.split(".").map(Number);
  if (octets.some((n) => n > 255)) return true;
  const [a, b, c] = octets;
  return value === "0.0.0.0" || value === "255.255.255.255" || a === 127 || a === 10 ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 2) || (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113);
}

for (const file of files) {
  if (blocked.test(file) || (/\/(?:\.env)(?:\.|$)/.test(`/${file}`) && !file.endsWith(".env.example"))) {
    report(file, 1, "비공개 설정·데이터·생성물 경로입니다."); continue;
  }
  // 심볼릭 링크가 점검하지 않은 외부 파일을 가리키는 상황을 막습니다.
  if (git(["ls-files", "--stage", "--", file]).startsWith("120000 ")) {
    report(file, 1, "공개 대상에 심볼릭 링크가 있습니다."); continue;
  }
  if (!textFile.test(file)) {
    if (!safeBinary.has(file)) report(file, 1, "검토 목록에 없는 바이너리 파일입니다.");
    continue;
  }
  const text = staged ? git(["show", `:${file}`]) : readFileSync(file, "utf8");
  const license = /(^|\/)LICENSE[^/]*\.txt$/i.test(file);
  text.split(/\r?\n/).forEach((line, index) => {
    const n = index + 1;
    if (/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(line)) report(file, n, "개인키가 있습니다.");
    if (/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16})\b/.test(line)) report(file, n, "인증 토큰으로 보이는 값이 있습니다.");
    if (/[A-Za-z]:[\\/]Users[\\/][^\s"'<>]+/i.test(line)) report(file, n, "개인 PC 사용자 경로가 있습니다.");
    if (/\b[a-z0-9-]+\.(?:vpc-[a-z0-9.-]+\.)?pg\.ntruss\.com\b/i.test(line)) report(file, n, "실제 DB 호스트로 보이는 값이 있습니다.");
    for (const match of line.matchAll(/(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/g)) {
      if (!exampleAddress(match[0])) report(file, n, "문서용 주소가 아닌 공인 IPv4가 있습니다.");
    }
    // 라이선스 원저작자 연락처는 원문 보존 대상입니다.
    if (!license) for (const match of line.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
      if (!/@(?:example\.(?:com|org)|users\.noreply\.github\.com)$/i.test(match[0])) report(file, n, "개인 이메일일 수 있는 값이 있습니다.");
    }
    const assignment = line.match(/^\s*(?:export\s+)?(?:NCP_ACCESS_KEY|NCP_SECRET_KEY|PGPASSWORD|CLOVA_STUDIO_API_KEY)\s*=\s*(.*?)\s*$/);
    if (assignment && assignment[1] && !/^(?:["']?["']?|<[^>]+>|YOUR_[A-Z_]+|REPLACE_[A-Z_]+)(?:\s*#.*)?$/.test(assignment[1])) report(file, n, "공개 설정 예제에 비어 있지 않은 비밀값이 있습니다.");
  });
  // 공개에서 제외한 사진·발표자료 등을 가리키는 상대 링크도 확인합니다.
  if (file.endsWith(".md")) for (const match of text.matchAll(/\]\(([^)\n]+)\)/g)) {
    let target = match[1].replace(/^<|>$/g, "").split(/\s+"/)[0];
    if (/^(?:https?:|mailto:|#)/.test(target)) continue;
    target = decodeURIComponent(target.split("#")[0]);
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), target));
    if (target && !files.includes(resolved)) report(file, text.slice(0, match.index).split("\n").length, "공개 목록에 없는 상대 링크입니다.");
  }
}
if (!files.length) problems.push("검사 대상이 없습니다. 공개 폴더에서 git add를 먼저 실행하세요.");
if (problems.length) { console.error(problems.join("\n")); process.exitCode = 1; }
else console.log(`공개 전 점검: ${files.length} 파일, 알려진 문제 없음 (${staged ? "staged" : "working tree"}).`);
