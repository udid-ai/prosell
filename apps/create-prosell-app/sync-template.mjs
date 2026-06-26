// template/ 을 apps/starter 에서 동기화한다(중복 소스 방지 — 배포 직전 prepublishOnly 에서 실행).
// 무거운/비밀 파일은 제외하고, .gitignore 는 npm 발행 시 사라지므로 _gitignore 로 보관.
import { cpSync, rmSync, existsSync, renameSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, "..", "starter");
const DST = join(__dir, "template");

// 제외(이름 기준): 빌드 산출물·의존성·로컬 비밀·git
const EXCLUDE = new Set([
  "node_modules",
  ".next",
  "out",
  ".git",
  ".env.local",
  "tsconfig.tsbuildinfo",
  ".DS_Store",
]);

if (existsSync(DST)) rmSync(DST, { recursive: true, force: true });

cpSync(SRC, DST, {
  recursive: true,
  filter: (src) => !EXCLUDE.has(basename(src)),
});

// .gitignore → _gitignore (npm 은 발행 시 .gitignore 를 누락/리네임하므로 우회)
const gi = join(DST, ".gitignore");
if (existsSync(gi)) renameSync(gi, join(DST, "_gitignore"));

console.log("✅ template 동기화 완료 (apps/starter → template)");
