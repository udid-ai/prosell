#!/usr/bin/env node
// 프로셀 스토어프론트 스캐폴더.
//   npx create-prosell-app [폴더명]
// template/ 을 대상 폴더로 복사하고 다음 단계를 안내한다(git clone 불필요).
import { cpSync, existsSync, readdirSync, renameSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = join(__dir, "template");

const name = process.argv[2] || "my-prosell-shop";
const dest = resolve(process.cwd(), name);

if (!existsSync(TEMPLATE)) {
  console.error("template 이 없습니다. (개발 중이면 `npm run sync-template` 먼저 실행)");
  process.exit(1);
}
if (existsSync(dest) && readdirSync(dest).length > 0) {
  console.error(`대상 폴더가 비어있지 않습니다: ${dest}`);
  process.exit(1);
}

cpSync(TEMPLATE, dest, { recursive: true });

// _gitignore → .gitignore 복원
const gi = join(dest, "_gitignore");
if (existsSync(gi)) renameSync(gi, join(dest, ".gitignore"));

const label = basename(dest);
console.log(`
✅ 프로셀 스토어프론트를 만들었어요: ${label}

다음 단계:
  cd ${label}
  npm install
  npm run setup     # 연결 정보(.env.local) 자동 채우기 — 먼저 AI 에서 'connect' 완료
  npm run dev       # http://localhost:3000

화면 디자인은 AI 에게 맡기세요: "첫 화면에 인기 상품 모음을 추가해줘."
`);
