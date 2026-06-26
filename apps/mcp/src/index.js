#!/usr/bin/env node
// Prosell MCP 서버 (stdio).
//   resources: API 명세(openapi) + AI 가이드(llms.txt) — AI 가 읽어 API 형태 파악
//   tools    : connect(자동등록) / list_products / get_product / status
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { shopBase, credentials, saveShop } from "./config.js";
import { listProducts, getProduct, LIST_EXPAND, DETAIL_EXPAND } from "./api.js";
import { runConnect } from "./connect.js";

const __dir = dirname(fileURLToPath(import.meta.url));

// 명세는 공식 guide 사이트가 정적 서빙한다(/openapi.json, /llms.txt).
// PROSELL_SPEC_BASE 로 재정의(로컬 dev: http://localhost:3001). 미설정 시 공식 도메인.
const SPEC_BASE = (process.env.PROSELL_SPEC_BASE || "https://ai.prosell.kr").replace(/\/$/, "");

// 중앙 fetch → 실패 시 레포 내 guide/public 로 폴백(개발용). npm 배포본에선 fetch 만 동작.
async function specFile(rel) {
  try {
    const res = await fetch(`${SPEC_BASE}/${rel}`);
    if (res.ok) return await res.text();
  } catch {
    /* 네트워크 실패 → 로컬 폴백 */
  }
  try {
    return readFileSync(join(__dir, "..", "..", "guide", "public", rel), "utf8");
  } catch (e) {
    return `# (명세를 읽을 수 없음: ${rel})\n# SPEC_BASE=${SPEC_BASE} / ${e.message}`;
  }
}

const server = new McpServer({ name: "prosell-mcp", version: "0.1.0" });

// ── Resources: 계약(병합 OpenAPI) + 가이드 — guide 가 서빙하는 정적 파일 ──────
const RESOURCES = [
  ["prosell-openapi", "prosell://openapi", "openapi.json", "전체 API 명세(병합 OpenAPI 3.1)"],
  ["prosell-guide", "prosell://guide/llms.txt", "llms.txt", "AI 가이드 (개념·인증·성능규칙·함정)"],
];
for (const [name, uri, rel, desc] of RESOURCES) {
  server.resource(name, uri, { description: desc, mimeType: "text/plain" }, async (u) => ({
    contents: [{ uri: u.href, text: await specFile(rel) }],
  }));
}

// ── Tools ────────────────────────────────────────────────────────────────
const ok = (obj) => ({ content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }] });
const fail = (msg) => ({ isError: true, content: [{ type: "text", text: String(msg) }] });

server.tool(
  "status",
  "현재 연결 상태(쇼핑몰 URL, 자격증명 발급 여부)를 확인한다.",
  {},
  async () => {
    try {
      const creds = credentials();
      return ok({
        shop: shopBase(),
        connected: !!creds,
        client_id: creds?.client_id ?? null,
        list_expand: LIST_EXPAND,
        detail_expand: DETAIL_EXPAND,
      });
    } catch (e) {
      return fail(e.message);
    }
  }
);

server.tool(
  "connect",
  "운영자 동의로 OAuth 앱을 자동 등록하고 자격증명을 받아 저장한다. 브라우저가 열리며, 운영자가 어드민 로그인 후 동의하면 완료. (복사·붙여넣기 불필요)",
  {
    app_name: z.string().optional().describe("동의 화면에 표시할 도구 이름"),
    app_redirect_uri: z.string().optional().describe("스토어프론트 OAuth 콜백(등록될 값). 기본 http://localhost:3000/auth/callback"),
  },
  async ({ app_name, app_redirect_uri }) => {
    try {
      const r = await runConnect({ app_name, app_redirect_uri });
      return ok({ message: "연결 완료", ...r });
    } catch (e) {
      return fail(`연결 실패: ${e.message}`);
    }
  }
);

server.tool(
  "list_products",
  "상품 목록 조회. 목록용 경량 expand(이미지/옵션 대표만)를 기본 사용한다.",
  {
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
    category: z.string().optional(),
    keyword: z.string().optional(),
    order: z.number().int().min(0).max(8).optional().describe("0=등록역순 5=저가순 8=등록일 등"),
    expand: z.string().optional().describe(`기본: ${LIST_EXPAND}`),
  },
  async (params) => {
    try {
      return ok(await listProducts(params));
    } catch (e) {
      return fail(e.message);
    }
  }
);

server.tool(
  "get_product",
  "상품 단건(상세) 조회.",
  {
    id: z.union([z.number().int(), z.string()]).describe("상품 id"),
    expand: z.string().optional().describe(`기본: ${DETAIL_EXPAND}`),
  },
  async ({ id, expand }) => {
    try {
      return ok(await getProduct(id, expand || DETAIL_EXPAND));
    } catch (e) {
      return fail(e.message);
    }
  }
);

// 시작 시 PROSELL_SHOP 이 주어지면 저장(다음 실행부터 생략 가능)
if (process.env.PROSELL_SHOP) {
  try { saveShop(process.env.PROSELL_SHOP); } catch {}
}

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write("[prosell-mcp] started (stdio)\n");
