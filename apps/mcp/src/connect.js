// AI 연결(앱 자동 등록) 플로우.
//
// 1) loopback http 서버를 임시 포트로 띄운다 (redirect_uri).
// 2) 운영자 동의 URL 을 만들어 브라우저로 연다.
// 3) 운영자가 어드민 로그인 + 동의 → 쇼핑몰이 code 를 loopback 으로 redirect.
// 4) state 검증 후 code 를 자격증명으로 교환·저장. (provisioning.yaml)
import http from "node:http";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { shopBase, saveCredentials } from "./config.js";
import { exchangeProvisionCode } from "./api.js";
import { callbackPage } from "./callback-page.js";

const TIMEOUT_MS = 5 * 60 * 1000;

export async function runConnect({ app_name = "Prosell MCP", app_redirect_uri } = {}) {
  const base = shopBase();
  const state = randomUUID();
  // 스토어프론트 OAuth 콜백(auth_client 에 등록될 값). 회원 로그인 시 일치 검사 대상.
  // 기본은 create-prosell-app 의 콜백 규약. 환경변수로 재정의 가능.
  const appRedirect = app_redirect_uri || process.env.PROSELL_APP_REDIRECT_URI || "http://localhost:3000/auth/callback";

  // ★ 즉시 URL 반환 방식: loopback 서버를 띄우고 «정식 동의 URL»(redirect_uri·state 포함)을
  //   바로 도구 결과로 돌려준다. 브라우저 자동열기가 실패해도 AI/사용자가 이 URL 을 그대로 열면 된다.
  //   서버는 백그라운드에서 계속 대기하다가, 운영자가 로그인·동의하면 자격증명을 저장한다(그 뒤 login).
  //   (예전엔 콜백까지 blocking → 브라우저가 안 열리면 AI 가 URL 을 못 받아 임의 URL 을 지어내던 문제 해결)
  return await new Promise((resolve, reject) => {
    let settled = false;
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname !== "/callback") {
        res.writeHead(404).end("not found");
        return;
      }
      try {
        const code = url.searchParams.get("code");
        const gotState = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) throw new Error(`동의 거부/오류: ${error}`);
        if (!code) throw new Error("code 가 없습니다.");
        if (gotState !== state) throw new Error("state 불일치 (CSRF 의심)");

        const creds = await exchangeProvisionCode(code);
        saveCredentials(creds);

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(callbackPage({ ok: true, title: "연결 완료", message: "이 창을 닫고 AI 로 돌아가 login 도구를 실행하세요." }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(callbackPage({ ok: false, title: "연결 실패", message: e.message }));
      } finally {
        cleanup();
      }
    });

    // 백그라운드 대기 상한(자격증명 저장 전 서버가 무한정 떠있지 않게).
    const timer = setTimeout(() => { cleanup(); }, TIMEOUT_MS);
    function cleanup() { clearTimeout(timer); try { server.close(); } catch {} }

    server.on("error", (e) => { if (!settled) { settled = true; reject(e); } });

    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      const redirectUri = `http://localhost:${port}/callback`;
      const consent = new URL(`${base}/adm/apps/connect`);
      consent.searchParams.set("app_name", app_name);
      consent.searchParams.set("redirect_uri", redirectUri);     // 코드 수신 loopback
      consent.searchParams.set("app_redirect_uri", appRedirect);  // 등록될 OAuth 콜백
      consent.searchParams.set("state", state);
      const consentUrl = consent.toString();

      tryOpenBrowser(consentUrl);
      process.stderr.write(`\n[prosell-mcp] 운영자 동의 페이지를 여세요:\n${consentUrl}\n\n`);

      if (!settled) {
        settled = true;
        resolve({
          status: "awaiting_consent",
          consent_url: consentUrl,
          message:
            "이 주소를 브라우저에서 열어 관리자 로그인·동의하세요(자동으로 열렸을 수 있어요). " +
            "★주소를 절대 바꾸지 마세요(redirect_uri 가 빠지면 거부됩니다). " +
            "동의하면 앱(자격증명)이 자동 등록·저장됩니다. 그다음 login 도구를 실행하세요.",
        });
      }
    });
  });
}

// WSL 여부 — WSL 에선 xdg-open 이 Windows 브라우저를 못 여니 powershell.exe 로 우회한다.
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
    // 브라우저 자동 실행 실패해도 stderr 안내 URL 로 수동 진행 가능
  }
}
