#!/usr/bin/env node
// 연결(connect)로 발급된 자격증명을 읽어 .env.local 을 생성한다.
// 이용자는 값을 복사·붙여넣기 하지 않는다 — MCP 가 저장한 config 에서 가져온다.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const MCP_CONFIG = join(homedir(), ".prosell-mcp", "config.json");
const OUT = join(process.cwd(), ".env.local");
const DEFAULT_REDIRECT = "http://localhost:3000/auth/callback";

function read(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

const cfg = read(MCP_CONFIG);
if (!cfg || !cfg.shop) {
  console.error(
    `\n자격증명을 찾지 못했습니다: ${MCP_CONFIG}\n` +
    `MCP 에서 먼저 'connect' 를 실행해 연결을 완료하세요.\n` +
    `(또는 .env.example 을 복사해 .env.local 을 직접 작성)\n`
  );
  process.exit(1);
}

const apiBase = String(cfg.shop).replace(/\/$/, "");
// cfg.redirect_uri 는 connect 가 auth_client 에 등록한 OAuth 콜백(스토어프론트). 회원 로그인 시 일치 검사 대상.
const redirectUri = cfg.redirect_uri || process.env.PROSELL_REDIRECT_URI || DEFAULT_REDIRECT;

const lines = [
  `PROSELL_API_BASE=${apiBase}`,
  `PROSELL_CLIENT_ID=${cfg.client_id ?? ""}`,
  `PROSELL_CLIENT_SECRET=${cfg.client_secret ?? ""}`,
  `PROSELL_REDIRECT_URI=${redirectUri}`,
];
// 로컬 도커면 이미지/authorize 호스트 보정 힌트
if (/localhost|127\.0\.0\.1|shop\.local/.test(apiBase)) {
  lines.push(`PROSELL_IMAGE_BASE=${apiBase}`);
}

writeFileSync(OUT, lines.join("\n") + "\n");
console.log(`✓ ${OUT} 생성 완료 (shop=${apiBase}, client_id=${cfg.client_id ?? "(none)"})`);
console.log(`  PROSELL_REDIRECT_URI=${redirectUri} (auth_client 등록값과 일치)`);
