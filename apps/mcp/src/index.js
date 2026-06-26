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

import { shopBase, credentials, saveShop, tokens } from "./config.js";
import {
  listProducts, getProduct, LIST_EXPAND, DETAIL_EXPAND,
  listOrders, getOrder, shipOrders, updateTracking,
  confirmBankPayment, setBankWaiting, setBankHold,
  setPreparing, setShippingDelay,
  listCancels, createCancel,
  listRefunds, createRefund, rejectRefund,
  listExchanges, createExchange, rejectExchange,
  getClaimReasons, updateClaimReasons,
  listCouriers, createCourier, updateCourier, deleteCourier,
} from "./api.js";
import { runConnect } from "./connect.js";
import { runLogin } from "./login.js";

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

const server = new McpServer({ name: "prosell-mcp", version: "0.3.0" });

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
      const tok = tokens();
      return ok({
        shop: shopBase(),
        connected: !!creds,            // connect 로 앱 자격증명 발급됨
        client_id: creds?.client_id ?? null,
        logged_in: !!tok,              // login 으로 운영자 토큰 보유(주문 관리 가능)
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

// ── 주문 관리(운영자) — Bearer 토큰 필요(먼저 login) ─────────────────────────
server.tool(
  "login",
  "운영자로 로그인해 주문 관리용 토큰을 발급한다. 브라우저가 열리며, 운영자가 로그인/동의하면 완료. (connect 로 앱 연결을 먼저 끝내야 함)",
  {
    scope: z.string().optional().describe("OAuth scope (기본 user)"),
  },
  async ({ scope }) => {
    try {
      const r = await runLogin({ scope });
      return ok({ message: "운영자 로그인 완료", ...r });
    } catch (e) {
      return fail(`로그인 실패: ${e.message}`);
    }
  }
);

server.tool(
  "list_orders",
  "주문 목록을 조회한다(운영자). 기간·주문상태·페이지로 필터. " +
    "용어: ono=주문서 유니크키(조회·결제·발송에 쓰는 API 키), dno=주문번호(쇼핑몰 표기), pno=결제번호, prno=상품주문번호. " +
    "★중요: 각 주문의 **`order.dno` 필드가 사용자에게 보여줄 주문번호**다(MCP 가 실제 dno 로 채워줌; " +
    "배송그룹이 여러 개면 배열). `payment.pno`(결제번호)·`order.ono`(주문서키)를 주문번호로 표시하지 마라. " +
    "혼동을 줄이기 위해 **주문번호(order.dno)와 결제번호(payment.pno)를 항상 함께 표시**하라. " +
    "결제·발송 API 호출에는 ono 를 쓴다(같은 주문 항목에 order.ono 가 함께 있다).",
  {
    period_start: z.string().optional().describe("검색 시작일 YYYY-MM-DD (기본 오늘)"),
    period_end: z.string().optional().describe("검색 종료일 YYYY-MM-DD (기본 오늘)"),
    pro_state: z.number().int().optional().describe("상품 주문상태 코드로 필터"),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(100).optional().describe("페이지당 건수(기본 10)"),
    ono_ids: z.string().optional().describe("주문서 유니크키(ono) 복수 조회 시 콤마 구분"),
    expand: z.string().optional().describe("기본: order,payment (product,delivery,tracking 등 추가 가능)"),
  },
  async (params) => {
    try {
      return ok(await listOrders(params));
    } catch (e) {
      return fail(e.message);
    }
  }
);

server.tool(
  "get_order",
  "주문 단건(상세)을 조회한다(운영자). 주문서 유니크키(ono)로 조회하며 상품·배송·운송장 포함. " +
    "주문번호로 보여줄 값은 응답의 `order.dno` 필드다(MCP 가 채워줌). 혼동 방지를 위해 주문번호(order.dno)와 " +
    "결제번호(payment.pno)를 함께 표시하라. 발송은 상품주문번호(prno).",
  {
    ono: z.union([z.number().int(), z.string()]).describe("주문서 유니크키(ono). 쇼핑몰의 대표 주문번호(dno)와 보통 같은 값"),
    expand: z.string().optional().describe("기본: order,payment,product,delivery,tracking"),
  },
  async ({ ono, expand }) => {
    try {
      return ok(await getOrder(ono, expand));
    } catch (e) {
      return fail(e.message);
    }
  }
);

server.tool(
  "list_couriers",
  "택배사 목록을 조회한다. 발송 처리(ship_order)의 pro_parcel_id 는 여기 `id` 값이다. " +
    "사용자가 택배사를 이름(예: CJ대한통운)으로 말하면 이 도구로 id 를 먼저 찾는다. title 로 이름 검색 가능.",
  {
    title: z.string().optional().describe("택배사 이름 부분검색"),
  },
  async ({ title }) => {
    try {
      return ok(await listCouriers({ title }));
    } catch (e) {
      return fail(e.message);
    }
  }
);

server.tool(
  "create_courier",
  "택배사를 등록한다(운영자). 발송에 쓸 택배사가 목록에 없을 때 추가한다. title 필수, 같은 이름이 있으면 거부.",
  {
    title: z.string().describe("택배사 이름(필수)"),
    en_code: z.string().optional().describe("영문 코드(영숫자, 최대 50)"),
    tel: z.string().optional().describe("연락처"),
    homepage: z.string().optional().describe("홈페이지 URL"),
    tracking_url: z.string().optional().describe("배송조회 URL"),
    country: z.number().int().min(0).max(1).optional().describe("0=국내 1=해외"),
    onoff: z.number().int().min(0).max(1).optional().describe("1=사용 0=미사용(기본 사용)"),
  },
  async (body) => {
    try {
      return ok(await createCourier(body));
    } catch (e) {
      return fail(e.message);
    }
  }
);

server.tool(
  "update_courier",
  "택배사 정보를 수정한다(운영자). id 와 바꿀 필드만 준다.",
  {
    id: z.number().int().describe("택배사 id (list_couriers 의 id)"),
    title: z.string().optional().describe("택배사 이름"),
    en_code: z.string().optional().describe("영문 코드"),
    tel: z.string().optional().describe("연락처"),
    homepage: z.string().optional().describe("홈페이지 URL"),
    tracking_url: z.string().optional().describe("배송조회 URL"),
    country: z.number().int().min(0).max(1).optional().describe("0=국내 1=해외"),
    onoff: z.number().int().min(0).max(1).optional().describe("1=사용 0=미사용"),
  },
  async ({ id, ...body }) => {
    try {
      return ok(await updateCourier(id, body));
    } catch (e) {
      return fail(e.message);
    }
  }
);

server.tool(
  "delete_courier",
  "택배사를 삭제한다(운영자).",
  {
    id: z.number().int().describe("삭제할 택배사 id (list_couriers 의 id)"),
  },
  async ({ id }) => {
    try {
      return ok(await deleteCourier(id));
    } catch (e) {
      return fail(e.message);
    }
  }
);

// 발송 처리·운송장 — 단위는 상품주문번호(prno). prno 는 get_order 의 items[].prno 에서 얻는다.
const shipItem = z.object({
  prno: z.union([z.number().int(), z.string()]).describe("상품주문번호(prno) — get_order 의 product.prno"),
  pro_parcel_id: z.number().int().describe("택배사 코드 — list_couriers 의 id 값(택배사 이름으로 먼저 조회)"),
  pro_parcel_num: z.string().describe("운송장번호"),
  pro_delivery_dt: z.string().optional().describe("발송일시 YYYY-MM-DDThh:mm:ss+09:00 (생략 시 현재)"),
});

server.tool(
  "ship_order",
  "발송 처리 — 상품주문번호(prno)들을 배송중으로 바꾸고 운송장을 등록한다(운영자). 한 번에 최대 50건.",
  {
    items: z.array(shipItem).min(1).max(50).describe("발송할 상품주문 목록(각 항목에 운송장 정보)"),
  },
  async ({ items }) => {
    try {
      return ok(await shipOrders(items));
    } catch (e) {
      return fail(e.message);
    }
  }
);

server.tool(
  "update_tracking",
  "이미 발송된 건의 운송장 정보를 수정한다(운영자). 한 번에 최대 50건.",
  {
    items: z
      .array(
        z.object({
          prno: z.union([z.number().int(), z.string()]).describe("상품주문번호(prno)"),
          pro_parcel_id: z.number().int().optional().describe("택배사 코드"),
          pro_parcel_num: z.string().optional().describe("운송장번호"),
          pro_delivery_dt: z.string().optional().describe("발송일시 YYYY-MM-DDThh:mm:ss+09:00"),
        })
      )
      .min(1)
      .max(50),
  },
  async ({ items }) => {
    try {
      return ok(await updateTracking(items));
    } catch (e) {
      return fail(e.message);
    }
  }
);

server.tool(
  "confirm_payment",
  "무통장 입금확인 → 결제완료 처리(운영자). 주문서 유니크키(ono)들을 결제완료로 바꾼다. " +
    "주문 전체(상품·재고·완료처리)가 일괄 반영된다. 무통장·입금대기 건에만 적용, 한 번에 최대 50건. " +
    "결과의 `processed[]` 에 처리된 각 건의 주문번호(dno)·결제번호(pno)가 담긴다 — " +
    "사용자에게는 '결제번호 {pno} 결제완료(주문번호 {dno})'처럼 결제번호를 명시해 보고하라.",
  {
    ono_ids: z
      .array(z.union([z.number().int(), z.string()]))
      .min(1)
      .max(50)
      .describe("결제완료 처리할 주문서 유니크키(ono) 목록"),
  },
  async ({ ono_ids }) => {
    try {
      return ok(await confirmBankPayment(ono_ids));
    } catch (e) {
      return fail(e.message);
    }
  }
);

const onoIdsParam = {
  ono_ids: z
    .array(z.union([z.number().int(), z.string()]))
    .min(1)
    .max(50)
    .describe("대상 주문서 유니크키(ono) 목록. 쇼핑몰 주문번호(dno)와 대표값은 보통 같다"),
};

server.tool(
  "set_payment_waiting",
  "무통장 주문을 입금대기 상태로 되돌린다(운영자). 무통장·결제보류/완료 건에만 적용, 한 번에 최대 50건.",
  onoIdsParam,
  async ({ ono_ids }) => {
    try {
      return ok(await setBankWaiting(ono_ids));
    } catch (e) {
      return fail(e.message);
    }
  }
);

server.tool(
  "set_payment_hold",
  "무통장 주문을 입금보류 상태로 변경한다(운영자). 무통장 건에만 적용, 한 번에 최대 50건.",
  onoIdsParam,
  async ({ ono_ids }) => {
    try {
      return ok(await setBankHold(ono_ids));
    } catch (e) {
      return fail(e.message);
    }
  }
);

const prnoIdsParam = {
  prno_ids: z
    .array(z.union([z.number().int(), z.string()]))
    .min(1)
    .max(50)
    .describe("대상 상품주문번호(prno) 목록. get_order 의 product.prno 에서 얻는다"),
};

server.tool(
  "set_preparing",
  "발주 확인 — 상품주문(prno)을 상품준비중 상태로 변경한다(운영자). 한 번에 최대 50건.",
  prnoIdsParam,
  async ({ prno_ids }) => {
    try {
      return ok(await setPreparing(prno_ids));
    } catch (e) {
      return fail(e.message);
    }
  }
);

server.tool(
  "set_shipping_delay",
  "발송 지연 — 상품주문(prno)을 발송지연 상태로 변경한다(운영자). 한 번에 최대 50건.",
  prnoIdsParam,
  async ({ prno_ids }) => {
    try {
      return ok(await setShippingDelay(prno_ids));
    } catch (e) {
      return fail(e.message);
    }
  }
);

// ── 클레임(취소·반품·교환) ─────────────────────────────────────────────────
server.tool(
  "get_claim_reasons",
  "취소·반품·교환의 사유 카테고리(선택지)를 조회한다(운영자). " +
    "create_cancel/create_refund/create_exchange 의 사유(can_ct/ref_ct/exc_ct)는 자유 입력이 아니라 " +
    "여기서 조회한 해당 유형의 사유 중에서 골라 넣어야 한다.",
  {},
  async () => {
    try {
      return ok(await getClaimReasons());
    } catch (e) {
      return fail(e.message);
    }
  }
);

server.tool(
  "update_claim_reasons",
  "취소·반품·교환 사유 카테고리를 업데이트한다(운영자). 보낸 유형만 **전체 교체**(부분추가 아님)한다. " +
    "취소는 제목 문자열 목록, 반품·교환은 {title, price(반품/교환 배송비)} 목록. " +
    "기존 목록을 유지하려면 get_claim_reasons 로 받아 수정 후 전체를 다시 보낸다.",
  {
    cancel: z.array(z.string()).optional().describe("취소 사유 제목 목록(전체 교체)"),
    refund: z
      .array(z.object({ title: z.string(), price: z.number().int().min(0).optional() }))
      .optional()
      .describe("반품 사유 {제목, 배송비} 목록(전체 교체)"),
    exchange: z
      .array(z.object({ title: z.string(), price: z.number().int().min(0).optional() }))
      .optional()
      .describe("교환 사유 {제목, 배송비} 목록(전체 교체)"),
  },
  async (body) => {
    try {
      return ok(await updateClaimReasons(body));
    } catch (e) {
      return fail(e.message);
    }
  }
);

// ── 반품(Refund) / 교환(Exchange) ─────────────────────────────────────────
const claimItems = z
  .array(
    z.object({
      prno: z.union([z.number().int(), z.string()]).describe("상품주문번호(prno)"),
      quantity: z.number().int().min(1).describe("수량(주문 수량 이하)"),
    })
  )
  .min(1);

server.tool(
  "list_refunds",
  "반품내역 목록을 조회한다(운영자). 결과의 refund.rno=반품번호.",
  {
    period_start: z.string().optional().describe("YYYY-MM-DD"),
    period_end: z.string().optional().describe("YYYY-MM-DD"),
    ono_ids: z.string().optional().describe("주문서 유니크키(ono) 콤마 구분"),
    rno_ids: z.string().optional().describe("반품번호(rno) 콤마 구분"),
    ref_state: z.number().int().optional().describe("반품상태 코드"),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  },
  async (params) => {
    try { return ok(await listRefunds(params)); } catch (e) { return fail(e.message); }
  }
);

server.tool(
  "create_refund",
  "반품 접수 — 주문(ono)의 상품(prno·수량)을 반품요청한다(운영자). 사유(ref_ct) 필수.",
  {
    ono: z.union([z.number().int(), z.string()]).describe("주문서 유니크키(ono)"),
    items: claimItems.describe("반품할 상품 목록"),
    ref_ct: z.string().describe("반품 사유 — get_claim_reasons 의 refund 카테고리 중 선택"),
    ref_content: z.string().optional().describe("반품 상세 내용"),
  },
  async (body) => {
    try { return ok(await createRefund(body)); } catch (e) { return fail(e.message); }
  }
);

server.tool(
  "reject_refund",
  "반품 거부 — 접수된 반품내역을 거부한다(운영자).",
  { rno: z.union([z.number().int(), z.string()]).describe("반품번호(rno)") },
  async ({ rno }) => {
    try { return ok(await rejectRefund(rno)); } catch (e) { return fail(e.message); }
  }
);

server.tool(
  "list_exchanges",
  "교환내역 목록을 조회한다(운영자). 결과의 exchange.eno=교환번호.",
  {
    period_start: z.string().optional().describe("YYYY-MM-DD"),
    period_end: z.string().optional().describe("YYYY-MM-DD"),
    ono_ids: z.string().optional().describe("주문서 유니크키(ono) 콤마 구분"),
    eno_ids: z.string().optional().describe("교환번호(eno) 콤마 구분"),
    exc_state: z.number().int().optional().describe("교환상태 코드"),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  },
  async (params) => {
    try { return ok(await listExchanges(params)); } catch (e) { return fail(e.message); }
  }
);

server.tool(
  "create_exchange",
  "교환 접수 — 주문(ono)의 상품(prno·수량)을 교환요청한다(운영자). 사유(exc_ct) 필수.",
  {
    ono: z.union([z.number().int(), z.string()]).describe("주문서 유니크키(ono)"),
    items: claimItems.describe("교환할 상품 목록"),
    exc_ct: z.string().describe("교환 사유 — get_claim_reasons 의 exchange 카테고리 중 선택"),
    exc_content: z.string().optional().describe("교환 상세 내용"),
  },
  async (body) => {
    try { return ok(await createExchange(body)); } catch (e) { return fail(e.message); }
  }
);

server.tool(
  "reject_exchange",
  "교환 거부 — 접수된 교환내역을 거부한다(운영자).",
  { eno: z.union([z.number().int(), z.string()]).describe("교환번호(eno)") },
  async ({ eno }) => {
    try { return ok(await rejectExchange(eno)); } catch (e) { return fail(e.message); }
  }
);

// ── 취소(Cancel) ─────────────────────────────────────────────────────────
server.tool(
  "list_cancels",
  "취소내역 목록을 조회한다(운영자). 기간·주문·취소상태로 필터. 결과의 cancel.cno=취소번호.",
  {
    period_start: z.string().optional().describe("검색 시작일 YYYY-MM-DD"),
    period_end: z.string().optional().describe("검색 종료일 YYYY-MM-DD"),
    ono_ids: z.string().optional().describe("주문서 유니크키(ono) 콤마 구분"),
    cno_ids: z.string().optional().describe("취소번호(cno) 콤마 구분"),
    can_state: z.number().int().optional().describe("취소상태 코드로 필터"),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  },
  async (params) => {
    try {
      return ok(await listCancels(params));
    } catch (e) {
      return fail(e.message);
    }
  }
);

server.tool(
  "create_cancel",
  "취소 접수 — 배송 전 상품을 취소요청한다(운영자). 주문서 유니크키(ono)와 취소할 상품(prno·수량), 사유를 받는다. " +
    "취소접수(상태 190) 이상인 상품은 불가.",
  {
    ono: z.union([z.number().int(), z.string()]).describe("주문서 유니크키(ono)"),
    items: z
      .array(
        z.object({
          prno: z.union([z.number().int(), z.string()]).describe("상품주문번호(prno)"),
          quantity: z.number().int().min(1).describe("취소 수량(주문 수량 이하)"),
        })
      )
      .min(1)
      .describe("취소할 상품 목록"),
    can_ct: z.string().describe("취소 사유 — get_claim_reasons 의 cancel 카테고리 중 선택"),
    can_content: z.string().optional().describe("취소 상세 내용"),
    can_bank_code: z.string().optional().describe("(무통장 환불) 은행코드"),
    can_bank_num: z.string().optional().describe("(무통장 환불) 계좌번호"),
    can_bank_holder: z.string().optional().describe("(무통장 환불) 예금주"),
  },
  async (body) => {
    try {
      return ok(await createCancel(body));
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
