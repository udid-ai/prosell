#!/usr/bin/env node
// Prosell MCP 원격 게이트웨이 (Streamable HTTP) — PoC 1단계.
//
// 목적: 중앙 ai.prosell.kr 한 곳에서 모든 쇼핑몰의 MCP 를 서빙한다.
//   · 트랜스포트: MCP Streamable HTTP (POST/GET/DELETE 단일 /mcp 엔드포인트)
//   · 멀티테넌트: 요청마다 (shop, accessToken) 을 풀어 runWithContext 로 감싼다.
//     → 기존 index.js/api.js 도구를 그대로 재사용하되, 그 요청 동안만 쇼핑몰을 결정.
//   · 백엔드 무변경: 토큰 검증은 {shop}.prosell.kr 가 자기 DB로(프록시).
//
// ⚠️ PoC 단계: OAuth(인가서버 페더레이션)는 아직 없다. 토큰을 직접 받는다.
//   인증 헤더 형식 (둘 중 하나):
//     1) Authorization: Bearer {shop}~{access_token}   ← 합성 토큰(권장, §5 T1)
//     2) Authorization: Bearer {access_token}  +  X-Prosell-Shop: {shop}
//   shop 은 아이디(pro260519) / 호스트(pro260519.prosell.kr) / 전체 URL 모두 허용.
//   다음 단계(2)에서 이 토큰을 OAuth authorize/token 페더레이션으로 발급하게 된다.

process.env.PROSELL_MCP_HTTP = "1"; // index.js 가 stdio 로 기동하지 않도록

import http from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { runWithContext } from "./config.js";
import { handleOAuth, protectedResourceMetadataUrl } from "./oauth.js";
// ⚠️ index.js 는 import 시 평가되며, ESM 은 import 를 다른 최상위 문장보다 먼저
// 실행한다. 위 PROSELL_MCP_HTTP 설정이 확실히 먼저 적용되도록 동적 import 로 불러온다
// (정적 import 면 stdio 가드가 켜지기 전에 index.js 가 stdio 로 기동해버린다).
const { buildServer } = await import("./index.js");

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";

// shop 문자열 → 쇼핑몰 origin (config 가 뒤에 /api/v2 를 붙인다)
function shopId(s) {
  let host = String(s || "").trim().replace(/\/$/, "");
  if (/^https?:\/\//i.test(host)) { try { host = new URL(host).host; } catch { return null; } }
  return host.split(":")[0].split(".")[0] || null;
}
function shopToBase(shop) {
  const s = String(shop || "").trim().replace(/\/$/, "");
  if (!s) return null;
  // 커스텀 도메인/스테이징 오버라이드 (PROSELL_SHOP_BASES = {"id":"https://..."})
  try {
    const map = JSON.parse(process.env.PROSELL_SHOP_BASES || "{}");
    const ov = map[s] || map[shopId(s)];
    if (ov) return ov.replace(/\/$/, "");
  } catch {}
  if (/^https?:\/\//i.test(s)) return s;        // 전체 URL
  if (s.includes(".")) return `https://${s}`;   // 호스트(pro260519.prosell.kr)
  return `https://${s}.prosell.kr`;             // 아이디(pro260519)
}

// 요청에서 (shopBase, accessToken) 해석
function resolveContext(req) {
  const auth = req.headers["authorization"] || "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) return { error: "Authorization: Bearer 토큰이 필요합니다." };
  let token = m[1].trim();
  let shop = null;
  const tilde = token.indexOf("~");
  if (tilde > 0) {                              // 합성 토큰 {shop}~{token}
    shop = token.slice(0, tilde);
    token = token.slice(tilde + 1);
  } else {
    shop = req.headers["x-prosell-shop"] || process.env.PROSELL_SHOP || null;
  }
  const shopBase = shopToBase(shop);
  if (!shopBase) return { error: "쇼핑몰을 알 수 없습니다. 합성 토큰({shop}~{token}) 또는 X-Prosell-Shop 헤더를 주세요." };
  if (!token) return { error: "access_token 이 비어 있습니다." };
  return { shopBase, accessToken: token };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve(undefined);
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body);
}

const httpServer = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    // 요청 액세스 로그(디버그) — method path → status. 토큰/시크릿은 남기지 않는다.
    if (process.env.PROSELL_GW_LOG !== "0") {
      const started = Date.now();
      res.on("finish", () => {
        process.stderr.write(
          `[gw] ${req.method} ${url.pathname}${url.search ? "?…" : ""} → ${res.statusCode} (${Date.now() - started}ms)\n`
        );
      });
    }

    // CORS — 브라우저/Electron MCP 클라이언트가 fetch 로 접근. WWW-Authenticate 를 읽으려면
    // Expose-Headers 가 필요하고, preflight(OPTIONS)에 응답해야 디스커버리가 진행된다.
    const origin = req.headers.origin;
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Mcp-Session-Id, mcp-protocol-version, Last-Event-ID, MCP-Protocol-Version");
    res.setHeader("Access-Control-Expose-Headers", "WWW-Authenticate, Mcp-Session-Id, MCP-Protocol-Version");
    res.setHeader("Access-Control-Max-Age", "86400");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

    if (url.pathname === "/healthz") {
      return sendJson(res, 200, { ok: true, service: "prosell-mcp-gateway" });
    }

    // OAuth AS façade (.well-known / authorize / federation / token / register)
    if (await handleOAuth(req, res, url)) return;

    if (url.pathname !== "/mcp") {
      return sendJson(res, 404, { error: "not found" });
    }

    const ctx = resolveContext(req);
    if (ctx.error) {
      // MCP 클라이언트가 OAuth 를 발견하도록 보호된 리소스 메타데이터를 가리킨다.
      res.writeHead(401, {
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer resource_metadata="${protectedResourceMetadataUrl(req)}"`,
      });
      return res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: ctx.error } }));
    }

    const body = req.method === "POST" ? await readBody(req) : undefined;

    // 상태 비저장(stateless): 요청마다 새 트랜스포트+서버. 단일 쇼핑몰 컨텍스트로 처리.
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = buildServer();
    res.on("close", () => { try { transport.close(); } catch {} try { server.close(); } catch {} });
    await server.connect(transport);

    // 이 요청 동안만 shop/token 을 컨텍스트에 묶는다 → 도구들이 그 쇼핑몰을 호출.
    await runWithContext(
      { shopBase: ctx.shopBase, accessToken: ctx.accessToken },
      () => transport.handleRequest(req, res, body)
    );
  } catch (e) {
    if (!res.headersSent) {
      sendJson(res, 500, { jsonrpc: "2.0", error: { code: -32603, message: String(e?.message || e) } });
    } else {
      try { res.end(); } catch {}
    }
  }
});

httpServer.listen(PORT, HOST, () => {
  process.stderr.write(`[prosell-mcp] gateway listening on http://${HOST}:${PORT}/mcp\n`);
});
