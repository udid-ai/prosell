// 설정/자격증명 저장. 이용자는 쇼핑몰 URL 만 환경변수로 주고,
// client_id/secret 은 connect 플로우가 자동으로 받아 여기 저장한다(복붙 없음).
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

const DIR = join(homedir(), ".prosell-mcp");
const FILE = join(DIR, "config.json");

/** 쇼핑몰 base URL. 끝 슬래시 제거. 환경변수 PROSELL_SHOP 우선. */
export function shopBase() {
  const fromEnv = process.env.PROSELL_SHOP;
  const fromFile = read().shop;
  const base = fromEnv || fromFile;
  if (!base) {
    throw new Error(
      "쇼핑몰 URL 이 없습니다. PROSELL_SHOP 환경변수(예: https://{쇼핑몰아이디}.prosell.kr)를 설정하세요."
    );
  }
  return base.replace(/\/$/, "");
}

export function apiBase() {
  return `${shopBase()}/api/v2`;
}

/** 저장된 클라이언트 자격증명 (connect 로 발급) */
export function credentials() {
  const c = read();
  return c.client_id ? { client_id: c.client_id, client_secret: c.client_secret, redirect_uri: c.redirect_uri } : null;
}

export function clientId() {
  const c = credentials();
  return c?.client_id || process.env.PROSELL_CLIENT_ID || null;
}

export function saveCredentials(creds) {
  const c = read();
  write({ ...c, ...creds });
}

export function saveShop(shop) {
  const c = read();
  write({ ...c, shop: shop.replace(/\/$/, "") });
}

function read() {
  try {
    if (!existsSync(FILE)) return {};
    return JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
}

function write(obj) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(obj, null, 2), { mode: 0o600 });
}
