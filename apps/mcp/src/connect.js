// AI 연결(앱 자동 등록) 플로우.
//
// 1) loopback http 서버를 임시 포트로 띄운다 (redirect_uri).
// 2) 운영자 동의 URL 을 만들어 브라우저로 연다.
// 3) 운영자가 어드민 로그인 + 동의 → 쇼핑몰이 code 를 loopback 으로 redirect.
// 4) state 검증 후 code 를 자격증명으로 교환·저장. (provisioning.yaml)
import http from "node:http";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { shopBase, saveCredentials } from "./config.js";
import { exchangeProvisionCode } from "./api.js";

const TIMEOUT_MS = 5 * 60 * 1000;

export async function runConnect({ app_name = "Prosell MCP", app_redirect_uri } = {}) {
  const base = shopBase();
  const state = randomUUID();
  // 스토어프론트 OAuth 콜백(auth_client 에 등록될 값). 회원 로그인 시 일치 검사 대상.
  // 기본은 create-prosell-app 의 콜백 규약. 환경변수로 재정의 가능.
  const appRedirect = app_redirect_uri || process.env.PROSELL_APP_REDIRECT_URI || "http://localhost:3000/auth/callback";

  return await new Promise((resolve, reject) => {
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
        res.end("<h2>연결 완료</h2><p>이 창을 닫고 AI 로 돌아가세요.</p>");
        cleanup();
        resolve({ ok: true, client_id: creds.client_id, client_name: creds.client_name });
      } catch (e) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<h2>연결 실패</h2><p>${escapeHtml(e.message)}</p>`);
        cleanup();
        reject(e);
      }
    });

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("연결 시간 초과(5분). 다시 시도하세요."));
    }, TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timer);
      try { server.close(); } catch {}
    }

    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      const redirectUri = `http://localhost:${port}/callback`;
      const consent = new URL(`${base}/adm/apps/connect`);
      consent.searchParams.set("app_name", app_name);
      consent.searchParams.set("redirect_uri", redirectUri);     // 코드 수신 loopback
      consent.searchParams.set("app_redirect_uri", appRedirect);  // 등록될 OAuth 콜백
      consent.searchParams.set("state", state);

      tryOpenBrowser(consent.toString());
      // URL 은 호출한 AI/이용자에게도 보여주기 위해 stderr 로 안내
      process.stderr.write(`\n[prosell-mcp] 운영자 동의 페이지를 여세요:\n${consent.toString()}\n\n`);
    });

    server.on("error", reject);
  });
}

function tryOpenBrowser(url) {
  const cmd =
    process.platform === "darwin" ? "open" :
    process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    // 브라우저 자동 실행 실패해도 stderr 안내 URL 로 수동 진행 가능
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
