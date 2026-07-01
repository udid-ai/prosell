// 운영자 로그인(OAuth 2.0 authorization_code) → access/refresh 토큰 발급·저장.
//
// 주문 관리 도구(list_orders/get_order/ship_order/update_tracking)가 쓰는 Bearer 토큰을
// 발급한다. connect(앱 등록)와 달리, 이건 운영자 "로그인"이라 토큰을 받는다.
//
// 1) loopback http 서버를 임시 포트로 띄운다 (redirect_uri).
// 2) /oauth/authorize 로 브라우저를 보낸다 → 운영자 로그인/동의.
// 3) 쇼핑몰이 code 를 loopback 으로 redirect → state 검증.
// 4) POST /oauth/token (grant_type=authorization_code, client_secret) 으로 토큰 교환·저장.
//
// 참고: redirect_uri 는 OAuth 정합성상 authorize 와 token 에서 동일해야 하며, 앱에 등록된
//       redirect_uri 와도 일치해야 한다(RFC 8252 loopback). 일부 쇼핑몰은 등록값 정확일치를
//       요구할 수 있어 PROSELL_LOGIN_REDIRECT_URI 로 재정의할 수 있게 둔다(그 경우 고정 포트).
import http from "node:http";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { shopBase, apiBase, credentials, saveTokens } from "./config.js";
import { exchangeAuthCode } from "./api.js";
import { callbackPage } from "./callback-page.js";

const TIMEOUT_MS = 5 * 60 * 1000;

export async function runLogin({ scope = "user" } = {}) {
  const creds = credentials();
  if (!creds) throw new Error("먼저 `connect` 로 앱을 연결하세요(자격증명 필요).");
  shopBase(); // 쇼핑몰 URL 미설정이면 여기서 에러
  const state = randomUUID();

  // 고정 redirect_uri 재정의 시: 그 호스트/포트로 수신해야 한다.
  const fixed = process.env.PROSELL_LOGIN_REDIRECT_URI;

  let authorizeUrl = ""; // listen 후 채워짐 — 실패/타임아웃 시 결과로 노출(브라우저 자동열기 실패 대비)
  return await new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, "http://localhost");
      const cbPath = fixed ? new URL(fixed).pathname : "/callback";
      if (url.pathname !== cbPath) {
        res.writeHead(404).end("not found");
        return;
      }
      try {
        const code = url.searchParams.get("code");
        const gotState = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        if (error) throw new Error(`로그인 거부/오류: ${error}`);
        if (!code) throw new Error("code 가 없습니다.");
        if (gotState !== state) throw new Error("state 불일치 (CSRF 의심)");

        const tok = await exchangeAuthCode(code, redirectUri, state);
        saveTokens(tok);

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(callbackPage({ ok: true, title: "로그인 완료", message: "이 창을 닫고 AI 로 돌아가세요." }));
        cleanup();
        resolve({ ok: true, expires_in: tok.expires_in, scope: tok.scope ?? scope });
      } catch (e) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(callbackPage({ ok: false, title: "로그인 실패", message: e.message }));
        cleanup();
        reject(e);
      }
    });

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(
        "로그인 시간 초과(5분). 브라우저가 자동으로 열리지 않았을 수 있습니다. " +
        (authorizeUrl ? `아래 전체 주소를 브라우저에서 직접 여세요(주소를 임의로 바꾸지 마세요):\n${authorizeUrl}` : "다시 시도하세요.")
      ));
    }, TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timer);
      try { server.close(); } catch {}
    }

    let redirectUri;
    const listenPort = fixed ? Number(new URL(fixed).port || 80) : 0;
    server.listen(listenPort, "127.0.0.1", () => {
      const port = server.address().port;
      redirectUri = fixed || `http://127.0.0.1:${port}/callback`;
      const authorize = new URL(`${apiBase()}/oauth/authorize`);
      authorize.searchParams.set("client_id", creds.client_id);
      authorize.searchParams.set("redirect_uri", redirectUri);
      authorize.searchParams.set("response_type", "code");
      authorize.searchParams.set("scope", scope);
      authorize.searchParams.set("state", state);

      authorizeUrl = authorize.toString();
      tryOpenBrowser(authorizeUrl);
      process.stderr.write(`\n[prosell-mcp] 운영자 로그인 페이지를 여세요:\n${authorizeUrl}\n\n`);
    });

    server.on("error", reject);
  });
}

// WSL 여선 xdg-open 이 Windows 브라우저를 못 여니 powershell.exe 로 우회한다.
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
    // ENOENT 는 비동기 'error' 이벤트 → 핸들러로 흡수(미처리 시 프로세스 크래시).
    const ch = spawn(cmd, args, { stdio: "ignore", detached: true });
    ch.on("error", () => {});
    ch.unref();
  } catch {
    /* 자동 실행 실패해도 stderr 안내 URL 로 수동 진행 가능 */
  }
}
