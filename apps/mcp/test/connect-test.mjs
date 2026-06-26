#!/usr/bin/env node
// AI 연결(관리자 앱 승인) 연결 테스트 — provisioning.yaml 전 구간 end-to-end 검증.
//
// 실제 MCP 도구(src/connect.js)와 동일한 loopback 핸드셰이크를 재현하되, 각 단계마다
// 단언(assert)을 걸어 "관리자 동의 → 앱 자동등록 → 자격증명 교환" 이 정상 동작하는지
// 테스터가 초기에 한 번에 확인할 수 있게 한다.
//
// 자동(코드)으로 검증하는 것:
//   1) state 왕복 일치(CSRF 방어)
//   2) provision_code → 자격증명 교환 성공 + 필드 완전성(client_id/secret/redirect_uri)
//   3) 동일 code 재교환 차단(일회성 — USED)
//   4) 발급된 auth_client 가 OAuth authorize 에서 유효 + redirect_uri 완전일치 통과
//
// 사람(테스터)이 브라우저에서 하는 것: 어드민 로그인 + [동의하고 연결] 클릭.
// (어드민 로그인은 RSA 암호화·세션·OTP 기반이라 헤드리스 자동화 대신 수동.)
//
// 사용법:
//   PROSELL_SHOP=https://{쇼핑몰아이디}.prosell.kr node test/connect-test.mjs
//
// 환경변수:
//   PROSELL_SHOP   (필수) 브라우저로 열 쇼핑몰 base URL (예: https://{쇼핑몰아이디}.prosell.kr)
//   PROSELL_HOST   (선택) 서버↔서버 fetch 에 붙일 Host 헤더(가상호스트 — IP 직결 디버깅용)
//   APP_NAME       (선택) 동의 화면에 표시할 도구 이름 (기본 "연결 테스트")
//   APP_REDIRECT   (선택) auth_client 에 등록할 OAuth 콜백 (기본 http://localhost:3000/auth/callback)
//   TIMEOUT_SEC    (선택) 동의 대기 제한(초, 기본 300)

import http from "node:http";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

// ── 설정 ─────────────────────────────────────────────────────────────────────
const SHOP = (process.env.PROSELL_SHOP || "").replace(/\/$/, "");
const HOST = process.env.PROSELL_HOST || "";
const APP_NAME = process.env.APP_NAME || "연결 테스트";
const APP_REDIRECT = process.env.APP_REDIRECT || "http://localhost:3000/auth/callback";
const TIMEOUT_MS = (Number(process.env.TIMEOUT_SEC) || 300) * 1000;

if (!SHOP) {
  fail("PROSELL_SHOP 환경변수가 필요합니다. 예: PROSELL_SHOP=https://{쇼핑몰아이디}.prosell.kr");
  process.exit(2);
}

// Host 헤더 오버라이드(가상호스트)용 fetch 래퍼.
function shopFetch(path, init = {}) {
  const headers = { ...(init.headers || {}) };
  if (HOST) headers["Host"] = HOST;
  return fetch(`${SHOP}${path}`, { ...init, headers, redirect: "manual" });
}

// ── 테스트 러너 (의존성 없는 미니 assert) ────────────────────────────────────
let passed = 0;
const failures = [];
function step(name, ok, detail = "") {
  if (ok) { passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}${detail ? `  \x1b[2m${detail}\x1b[0m` : ""}`); }
  else { failures.push(name); console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? `  — ${detail}` : ""}`); }
}
function fail(msg) { console.error(`\x1b[31m[연결 테스트] ${msg}\x1b[0m`); }

// ── 메인 ─────────────────────────────────────────────────────────────────────
const state = randomUUID();

console.log("\n\x1b[1m프로셀 AI 연결 — 관리자 앱 승인 연결 테스트\x1b[0m");
console.log(`  쇼핑몰     : ${SHOP}${HOST ? `  (Host: ${HOST})` : ""}`);
console.log(`  도구 이름  : ${APP_NAME}`);
console.log(`  앱 콜백    : ${APP_REDIRECT}`);
console.log(`  대기 제한  : ${TIMEOUT_MS / 1000}초\n`);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname !== "/callback") { res.writeHead(404).end("not found"); return; }

  const code = url.searchParams.get("code");
  const gotState = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  console.log("\n[3/4] loopback 콜백 수신 — 핸드셰이크 검증");

  try {
    step("동의 거부/오류 없음", !error, error ? `error=${error}` : "");
    if (error) throw new Error(`동의 거부됨: ${error}`);

    step("provision code 수신", !!code);
    step("state 왕복 일치 (CSRF 방어)", gotState === state, gotState === state ? "" : `보낸값≠받은값`);
    if (!code || gotState !== state) throw new Error("핸드셰이크 파라미터 불량");

    console.log("\n[4/4] 자격증명 교환 + 발급 앱 검증");

    // (2) code → 자격증명 교환
    const creds = await exchange(code);
    step("provision_code 교환 성공", !!creds.client_id);
    step("client_id 발급됨", !!creds.client_id, creds.client_id || "");
    step("client_secret 발급됨", !!creds.client_secret, creds.client_secret ? "(숨김)" : "");
    step("redirect_uri 반환됨", !!creds.redirect_uri, creds.redirect_uri || "");
    step("redirect_uri 가 요청한 앱 콜백과 일치", creds.redirect_uri === APP_REDIRECT,
      creds.redirect_uri === APP_REDIRECT ? "" : `등록값=${creds.redirect_uri}`);

    // (3) 동일 code 재사용 차단(일회성)
    const replay = await exchangeRaw(code);
    step("동일 code 재교환 차단 (일회성)", replay.status === 400,
      `HTTP ${replay.status}${replay.body?.error?.code ? ` ${replay.body.error.code}` : ""}`);

    // (4) 발급된 auth_client 가 OAuth authorize 에서 유효 + redirect_uri 완전일치
    const authz = await probeAuthorize(creds.client_id, creds.redirect_uri);
    step("발급 client_id 가 authorize 에서 유효 (미등록 아님)", !authz.unregistered,
      authz.unregistered ? "NONEXISTENT" : "");
    step("등록 redirect_uri 완전일치 통과", authz.redirectMatched,
      authz.redirectMatched ? "" : (authz.error || "MATCH_REDIRECT_URI"));

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(page("연결 테스트 완료", `client_id <code>${escapeHtml(creds.client_id)}</code> 발급·검증됨. 터미널 결과를 확인하세요.`));
  } catch (e) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(page("연결 테스트 실패", escapeHtml(e.message)));
  } finally {
    finish();
  }
});

const timer = setTimeout(() => {
  fail(`대기 시간 초과(${TIMEOUT_MS / 1000}초). 브라우저에서 동의를 완료하지 못했습니다.`);
  finish(3);
}, TIMEOUT_MS);

function finish(forceExit) {
  clearTimeout(timer);
  try { server.close(); } catch {}
  if (typeof forceExit === "number") { report(); process.exit(forceExit); }
  // 정상 핸들러 종료 후 요약 출력
  setImmediate(() => { report(); process.exit(failures.length ? 1 : 0); });
}

function report() {
  console.log("\n" + "─".repeat(52));
  if (!passed && !failures.length) { console.log("실행된 검증 없음."); return; }
  if (failures.length) {
    console.log(`\x1b[31m실패 ${failures.length} / 통과 ${passed}\x1b[0m`);
    for (const f of failures) console.log(`  \x1b[31m·\x1b[0m ${f}`);
    console.log("\n관리자 앱 승인 흐름에 문제가 있습니다. 위 항목을 확인하세요.");
  } else {
    console.log(`\x1b[32m전체 통과 — ${passed}개 검증 OK\x1b[0m`);
    console.log("관리자 앱 승인(프로비저닝) 흐름이 정상입니다.");
  }
  console.log("─".repeat(52) + "\n");
}

// ── API 호출 ─────────────────────────────────────────────────────────────────
async function exchange(code) {
  const r = await exchangeRaw(code);
  if (r.status !== 200 || !r.body?.client_id) {
    throw new Error(r.body?.error?.message || `자격증명 교환 실패: HTTP ${r.status}`);
  }
  return r.body; // { client_id, client_secret, redirect_uri, client_name }
}

async function exchangeRaw(code) {
  const res = await shopFetch("/api/v2/oauth/register/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ provision_code: code }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

// authorize 에 더미 인증코드 + 등록 redirect_uri 로 요청 → 302 Location 으로 클라이언트
// 유효성/콜백 완전일치를 판별(회원 로그인 없이 검증 가능). Authorize.php get() 분기 참조.
async function probeAuthorize(client_id, redirect_uri) {
  const q = new URLSearchParams({
    code: "connection-test-probe",
    client_id,
    redirect_uri,
    state,
  });
  const res = await shopFetch(`/api/v2/oauth/authorize?${q}`, { method: "GET" });
  const loc = res.headers.get("location") || "";
  const m = loc.match(/[?&]error=([^&]+)/);
  const err = m ? decodeURIComponent(m[1]) : "";
  return {
    unregistered: err === "NONEXISTENT" || err === "BAD_CLIENT_ID",
    // 에러 없이 code 를 콜백으로 그대로 돌려주면 client+redirect 완전일치 통과.
    redirectMatched: !err && /[?&]code=/.test(loc),
    error: err,
  };
}

// ── loopback 기동 + 동의 페이지 안내 ─────────────────────────────────────────
server.on("error", (e) => { fail(`loopback 서버 오류: ${e.message}`); finish(2); });
server.listen(0, "127.0.0.1", () => {
  const port = server.address().port;
  const redirectUri = `http://localhost:${port}/callback`;
  const consent = new URL(`${SHOP}/adm/apps/connect`);
  consent.searchParams.set("app_name", APP_NAME);
  consent.searchParams.set("redirect_uri", redirectUri);   // 코드 수신 loopback
  consent.searchParams.set("app_redirect_uri", APP_REDIRECT); // 등록될 OAuth 콜백
  consent.searchParams.set("state", state);

  console.log("[1/4] loopback 콜백 서버 기동:", redirectUri);
  console.log("[2/4] 브라우저에서 아래 동의 페이지를 열고 \x1b[1m어드민 로그인 + [동의하고 연결]\x1b[0m 을 누르세요:\n");
  console.log("  \x1b[36m" + consent.toString() + "\x1b[0m\n");
  tryOpenBrowser(consent.toString());
});

function isWSL() {
  if (process.platform !== "linux") return false;
  try { return /microsoft/i.test(readFileSync("/proc/version", "utf8")); } catch { return false; }
}

function tryOpenBrowser(url) {
  let cmd, args;
  if (process.platform === "darwin") { cmd = "open"; args = [url]; }
  else if (process.platform === "win32") { cmd = "cmd"; args = ["/c", "start", "", url]; }
  else if (isWSL()) { cmd = "powershell.exe"; args = ["-NoProfile", "-Command", "Start-Process", `'${url}'`]; }
  else { cmd = "xdg-open"; args = [url]; }
  try {
    // spawn 의 ENOENT 는 비동기 'error' 이벤트로 오므로 반드시 핸들러로 흡수(미처리 시 프로세스 크래시).
    const ch = spawn(cmd, args, { stdio: "ignore", detached: true });
    ch.on("error", () => {});
    ch.unref();
  } catch {}
}

// ── HTML/escape ──────────────────────────────────────────────────────────────
function page(title, body) {
  return `<!DOCTYPE html><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
    `<div style="font-family:sans-serif;max-width:440px;margin:60px auto;text-align:center">` +
    `<h2>${escapeHtml(title)}</h2><p>${body}</p><p style="color:#888">이 창을 닫아도 됩니다.</p></div>`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
