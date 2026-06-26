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

/** 클라이언트 자격증명. connect 로 발급한 저장값 우선, 없으면 환경변수 사용.
 *  이미 앱(client_id/secret)이 있으면 connect 없이 env 로 바로 login 할 수 있다.
 *    PROSELL_CLIENT_ID / PROSELL_CLIENT_SECRET / PROSELL_REDIRECT_URI */
export function credentials() {
  const c = read();
  const client_id = c.client_id || process.env.PROSELL_CLIENT_ID || null;
  if (!client_id) return null;
  return {
    client_id,
    client_secret: c.client_secret || process.env.PROSELL_CLIENT_SECRET || null,
    redirect_uri: c.redirect_uri || process.env.PROSELL_REDIRECT_URI || null,
  };
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

// ── 운영자 토큰(주문 관리용) ──────────────────────────────────────────
// 주문 관리 API 는 Bearer access_token 이 필요하다. login 플로우가 발급해 저장하고,
// 만료 시 refresh_token 으로 갱신한다. (access 3h / refresh 30d)
export function saveTokens(t) {
  const c = read();
  const now = Date.now();
  // 만료 60초 전을 만료로 간주(시계오차·왕복 여유).
  const exp = (sec) => (sec ? now + (Number(sec) - 60) * 1000 : null);
  write({
    ...c,
    access_token: t.access_token,
    refresh_token: t.refresh_token ?? c.refresh_token,
    access_expires_at: exp(t.expires_in),
    refresh_expires_at: t.refresh_token_expires_in ? exp(t.refresh_token_expires_in) : c.refresh_expires_at,
  });
}

export function tokens() {
  const c = read();
  if (!c.access_token) return null;
  return {
    access_token: c.access_token,
    refresh_token: c.refresh_token ?? null,
    access_expires_at: c.access_expires_at ?? 0,
    refresh_expires_at: c.refresh_expires_at ?? 0,
  };
}

export function clearTokens() {
  const c = read();
  for (const k of ["access_token", "refresh_token", "access_expires_at", "refresh_expires_at"]) delete c[k];
  write(c);
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
