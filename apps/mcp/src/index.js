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
  listCancels, createCancel, updateCancel, rejectCancel,
  listRefunds, createRefund, updateRefund, rejectRefund,
  listExchanges, createExchange, updateExchange, rejectExchange,
  getClaimPreview,
  getClaimReasons, updateClaimReasons,
  listCouriers, createCourier, updateCourier, deleteCourier,
  createProduct, updateProduct, deleteProduct, getProductOption, uploadProductImages,
  salesByPeriod, salesByProduct,
  listCategories, createCategory, updateCategory, deleteCategory,
  listSuppliers, createSupplier, updateSupplier, deleteSupplier,
  listBrands, createBrand, updateBrand, deleteBrand, uploadBrandImage, deleteBrandImage,
  listAddoptions, createAddoption, updateAddoption, deleteAddoption,
  listColors, createColors, updateColor, deleteColor,
  listSizes, createSizes, updateSize, deleteSize,
  listIcons, createIcon, updateIcon, deleteIcon,
  listTemplates, createTemplate, updateTemplate, deleteTemplate,
  listInformation,
  operatorMid,
  listProductInquiries, createProductInquiry, updateProductInquiry, deleteProductInquiry,
  listCustomerInquiries, createCustomerInquiry, updateCustomerInquiry, deleteCustomerInquiry,
  getCustomerInquirySetup, uploadCustomerInquiryFiles,
  listReviews, createReview, updateReview, deleteReview, getReviewSetup, uploadReviewFiles,
  listNotices, createNotice, updateNotice, deleteNotice, getNoticeSetup, uploadNoticeFiles,
  listFaqs, createFaq, updateFaq, deleteFaq, getFaqSetup, uploadFaqFiles,
  listSkins,
  listMembers, getMember, listDormantMembers, listDropoutMembers,
  listLevels, createLevel, updateLevel, deleteLevel,
  listCoupons, createCoupon, updateCoupon, deleteCoupon, listCouponDesigns,
  listCouponIssues, issueCoupon, deleteCouponIssue,
  listPoints, createPoint, updatePoint, deletePoint,
  getShopCompany, updateShopCompany,
  listBoard, getBoardPost, createBoardPost, updateBoardPost, deleteBoardPost,
  replyBoardPost, deleteBoardReply, getBoardSetup, uploadBoardFiles,
  listPrivatePays, getPrivatePay, createPrivatePay, updatePrivatePay, deletePrivatePay,
  confirmPrivatePayBanking, cancelPrivatePay, createPrivatePayReceipt, cancelPrivatePayReceipt,
  listPrivatePayMemos, createPrivatePayMemo, deletePrivatePayMemo,
  createExchangePrivatePay, createRefundPrivatePay,
  listCashReceipts, getCashReceipt, issueCashReceipt, cancelCashReceipt,
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

// 서버 인스턴스를 만들고 모든 resource/tool 을 등록해 반환한다.
// stdio(단일 쇼핑몰)와 HTTP 게이트웨이(요청별 쇼핑몰) 양쪽에서 재사용한다.
export function buildServer() {
const server = new McpServer({ name: "prosell-mcp", version: "0.28.0" });

// 원격 게이트웨이 모드: 인증은 커넥터 OAuth(합성 토큰)로 처리된다.
// 이 모드에서는 connect/login(로컬 루프백+브라우저 전제)이 의미가 없고 오히려 서버에서
// 무한 대기하게 되므로 노출하지 않는다. status 도 컨텍스트 토큰 기준으로 표시한다.
const REMOTE = process.env.PROSELL_MCP_HTTP === "1";

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
  "현재 연결 상태(쇼핑몰 URL, 인증 여부)를 확인한다.",
  {},
  async () => {
    try {
      const tok = tokens();
      if (REMOTE) {
        // 원격: 인증은 커넥터 OAuth 로 처리됨. 토큰 유무가 곧 연결 여부다(connect/login 불필요).
        return ok({
          shop: shopBase(),
          mode: "remote",
          connected: !!tok,
          logged_in: !!tok,
          note: tok
            ? "커넥터 OAuth 로 인증됨 — connect/login 은 필요 없습니다. 관리 도구를 바로 사용하세요."
            : "운영자 토큰이 없습니다. 커넥터를 다시 연결(재인증)하세요.",
          list_expand: LIST_EXPAND,
          detail_expand: DETAIL_EXPAND,
        });
      }
      const creds = credentials();
      return ok({
        shop: shopBase(),
        mode: "local",
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

if (!REMOTE) server.tool(
  "connect",
  "운영자 동의로 OAuth 앱을 자동 등록·저장한다. 이 도구를 실행하면 «동의 URL(consent_url)»을 즉시 돌려준다(브라우저도 자동으로 열림). " +
    "운영자가 그 URL 에서 어드민 로그인 후 동의하면 앱이 백그라운드로 등록·저장된다. 그다음 login 도구를 실행하면 된다. " +
    "⚠️반드시 이 도구를 실행하라. `/adm/apps/connect` URL 을 직접 만들지 마라(redirect_uri·state 가 빠져 거부된다). " +
    "브라우저가 안 열리면(예: Claude Code) 반환된 consent_url 을 파라미터 변경 없이 그대로 사용자에게 안내해 열게 하라.",
  {
    app_name: z.string().optional().describe("동의 화면에 표시할 도구 이름"),
    app_redirect_uri: z.string().optional().describe("스토어프론트 OAuth 콜백(등록될 값). 기본 http://localhost:3000/auth/callback"),
  },
  async ({ app_name, app_redirect_uri }) => {
    try {
      // 즉시 consent_url 반환(대기 안 함). 동의 완료는 백그라운드에서 저장된다.
      return ok(await runConnect({ app_name, app_redirect_uri }));
    } catch (e) {
      return fail(`연결 시작 실패: ${e.message}`);
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
  "상품 단건(상세) 조회. ★ID 용어: 최상위 `id`=상품번호(조회/수정 키), `product[].id`(=`product_id` CSV)=옵션번호, content.file_photo=대표이미지 id. " +
    "`product_id` 는 옵션번호 목록이지 상품번호가 아니다.",
  {
    id: z.union([z.number().int(), z.string()]).describe("상품 id(=상품번호). 옵션번호(product[].id) 아님"),
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

// ── 주문 관리(운영자) — Bearer 토큰 필요 ─────────────────────────────────────
// (원격 게이트웨이는 커넥터 OAuth 로 토큰이 주입되므로 login 을 노출하지 않는다.)
if (!REMOTE) server.tool(
  "login",
  "운영자로 로그인해 주문 관리용 토큰을 발급한다. 브라우저가 열리며, 운영자가 로그인/동의하면 완료. (connect 로 앱 연결을 먼저 끝내야 함) " +
    "⚠️URL 을 직접 만들지 말고 이 도구를 실행하라. 브라우저가 자동으로 안 열리면 이 도구가 알려주는 전체 주소를 그대로 열어라.",
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
crudTool(
  "claim_reasons",
  "취소·반품·교환 사유 카테고리. action: get|update. get 은 선택지 조회 — create_cancel/refund/exchange 의 사유(can_ct/ref_ct/exc_ct)는 " +
    "여기 해당 유형 사유 중에서 골라 넣는다. update 는 보낸 유형만 **전체 교체**(취소=제목 목록, 반품·교환={title,price} 목록; " +
    "유지하려면 get 으로 받아 수정 후 전체 재전송).",
  {
    get: () => getClaimReasons(),
    update: ({ cancel, refund, exchange }) => updateClaimReasons({ cancel, refund, exchange }),
  },
  {
    cancel: z.array(z.string()).optional().describe("(update) 취소 사유 제목 목록(전체 교체)"),
    refund: z.array(z.object({ title: z.string(), price: z.number().int().min(0).optional() })).optional().describe("(update) 반품 사유 {제목,배송비} 목록"),
    exchange: z.array(z.object({ title: z.string(), price: z.number().int().min(0).optional() })).optional().describe("(update) 교환 사유 {제목,배송비} 목록"),
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

// 교환 전용 — 항목별 교환받을 상품(exc_product_id)으로 동일/다른 상품 교환을 결정.
const exchangeItems = z
  .array(
    z.object({
      prno: z.union([z.number().int(), z.string()]).describe("상품주문번호(prno)"),
      quantity: z.number().int().min(1).describe("교환 수량(주문 수량 이하)"),
      exc_product_id: z.number().int().optional().describe(
        "교환받을 **주문옵션 id**(같은 상품페이지 products_id 안의 다른 옵션). 생략하거나 원본과 같으면 **동일옵션 교환**, " +
          "다른 옵션 id 면 **다른옵션 교환**. 다른 옵션으로 바꿀 때는 get_product(products_id, expand=product) 로 그 상품의 " +
          "주문옵션 목록(product[].id/옵션명/가격/재고)을 조회해 사용자가 고른 옵션의 id 를 넣는다."
      ),
    })
  )
  .min(1);

server.tool(
  "list_refunds",
  "반품내역 목록을 조회한다(운영자). 결과의 refund.rno=반품번호. " +
    "응답의 paymentInfo 에 비용 판단 근거가 있다: ref_delivery_price(구매자가 결제한 배송비)·ref_price(상품 환불액)·" +
    "ref_free_price(무료배송 기준) 등. 현재 차감 설정값은 ref_del_price/ref_ret_price/ref_deduct_price(음수=구매자 부담). " +
    "비용 차감은 update_refund/create_refund 로 판매자가 최종 결정해 반영한다.",
  {
    period_start: z.string().optional().describe("YYYY-MM-DD"),
    period_end: z.string().optional().describe("YYYY-MM-DD"),
    ono_ids: z.string().optional().describe("주문서 유니크키(ono) 콤마 구분"),
    rno_ids: z.string().optional().describe("반품번호(rno) 콤마 구분"),
    ref_state: z.number().int().optional().describe("반품상태로 필터: 10=반품접수 20=회수중 21=검수중/수거완료 22=결제요청 30=반품완료"),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  },
  async (params) => {
    try { return ok(await listRefunds(params)); } catch (e) { return fail(e.message); }
  }
);

server.tool(
  "create_refund",
  "반품 접수 — 주문(ono)의 상품(prno·수량)을 반품요청한다(운영자). 사유(ref_ct) 필수. " +
    "★배송비 부담을 정하거나 사용자에게 묻기 전에, 반드시 먼저 get_claim_preview(ono)을 호출해 " +
    "'구매 시 배송비 OO원'을 사용자에게 안내한 뒤 진행하라(안내 없이 비용을 정하지 말 것). " +
    "비용(배송비/회수비/기타)을 청구·부담시키려면 ref_del_price/ref_ret_price/ref_deduct_price 를 넣는다. " +
    "★비용 부호 규칙: **음수=구매자 부담(환불액에서 차감), 0 이상=판매자 부담**. " +
    "판단 근거(구매자가 낸 배송비 등)는 get_claim_preview 또는 list_refunds 의 paymentInfo 로 확인하고, " +
    "판매자가 최종 결정한 금액을 넣는다. " +
    "★무통장·가상계좌 결제건(get_claim_preview.refund_account.needs_account=true)은 PG 자동취소가 안 되므로 " +
    "환불계좌(ref_bank_code/ref_bank_num/ref_bank_holder)를 사용자에게 안내·확인해 함께 입력하라. " +
    "★(희박) 반품에서 추가비용을 구매자에게 실제 청구(결제창 발급)해야 하면 반품번호 rno 로 create_refund_private_pay(rno, price) 를 호출하라.",
  {
    ono: z.union([z.number().int(), z.string()]).describe("주문서 유니크키(ono)"),
    items: claimItems.describe("반품할 상품 목록"),
    ref_ct: z.string().describe("반품 사유 — get_claim_reasons 의 refund 카테고리 중 선택"),
    ref_content: z.string().optional().describe("반품 상세 내용"),
    ref_del_price: z.number().int().optional().describe("상품 배송비용 — 음수=구매자 부담, 0이상=판매자 부담(무료배송 상품에 배송비 청구 시 입력)"),
    ref_ret_price: z.number().int().optional().describe("상품 회수비용 — 음수=구매자 부담, 0이상=판매자 부담"),
    ref_deduct_price: z.number().int().optional().describe("기타비용 — 음수=구매자 부담, 0이상=판매자 부담"),
    ref_bank_code: z.string().optional().describe("(무통장·가상계좌 환불) 은행코드 — get_claim_preview.refund_account 로 확인/안내"),
    ref_bank_num: z.string().optional().describe("(무통장·가상계좌 환불) 환불 계좌번호"),
    ref_bank_holder: z.string().optional().describe("(무통장·가상계좌 환불) 예금주"),
  },
  async ({ ono, items, ref_ct, ref_content, ref_del_price, ref_ret_price, ref_deduct_price, ref_bank_code, ref_bank_num, ref_bank_holder }) => {
    // 백엔드 규격: 사유는 refund 객체, 비용·환불계좌는 paymentInfo 객체로 중첩.
    const refund = { ref_ct };
    if (ref_content !== undefined) refund.ref_content = ref_content;
    const paymentInfo = {};
    if (ref_del_price !== undefined) paymentInfo.ref_del_price = ref_del_price;
    if (ref_ret_price !== undefined) paymentInfo.ref_ret_price = ref_ret_price;
    if (ref_deduct_price !== undefined) paymentInfo.ref_deduct_price = ref_deduct_price;
    if (ref_bank_code !== undefined) paymentInfo.ref_bank_code = ref_bank_code;
    if (ref_bank_num !== undefined) paymentInfo.ref_bank_num = ref_bank_num;
    if (ref_bank_holder !== undefined) paymentInfo.ref_bank_holder = ref_bank_holder;
    const body = { ono, items, refund };
    if (Object.keys(paymentInfo).length) body.paymentInfo = paymentInfo;
    try { return ok(await createRefund(body)); } catch (e) { return fail(e.message); }
  }
);

server.tool(
  "update_refund",
  "반품내역을 수정한다(운영자). 반품번호(rno)와 바꿀 필드만 보낸다. 사유(ref_ct)·상세(ref_content)·" +
    "상태(ref_state)·반품자명(ref_name) 등. 회수지/회수 운송장 등은 addressInfo 객체로 보낸다 " +
    "(예: ref_ret_parcel=회수 택배사 id, ref_ret_num=회수 운송장번호, ref_ret_zipcode/ref_ret_addr1 등). " +
    "비용은 ref_del_price/ref_ret_price/ref_deduct_price 로 차감/부담을 정한다(음수=구매자 부담, 0이상=판매자 부담). " +
    "★배송비 부담을 정하거나 묻기 전에 반드시 먼저 get_claim_preview(ono)으로 '구매 시 배송비 OO원'을 사용자에게 안내하라. " +
    "사유는 get_claim_reasons 의 refund 중 선택.",
  {
    rno: z.union([z.number().int(), z.string()]).describe("반품번호(rno) — list_refunds 의 refund.rno"),
    ref_state: z.number().int().optional().describe("반품상태: 10=반품접수 20=회수중 21=검수중/수거완료 22=결제요청 30=반품완료"),
    ref_ct: z.string().optional().describe("반품 사유(get_claim_reasons 의 refund 중 선택)"),
    ref_content: z.string().optional().describe("반품 상세 내용"),
    ref_name: z.string().optional().describe("반품자명"),
    ref_request: z.string().optional().describe("요청사항"),
    ref_del_price: z.number().int().optional().describe("상품 배송비용 — 음수=구매자 부담, 0이상=판매자 부담"),
    ref_ret_price: z.number().int().optional().describe("상품 회수비용 — 음수=구매자 부담, 0이상=판매자 부담"),
    ref_deduct_price: z.number().int().optional().describe("기타비용 — 음수=구매자 부담, 0이상=판매자 부담"),
    ref_bank_code: z.string().optional().describe("(무통장·가상계좌 환불) 은행코드 — get_claim_preview.refund_account 로 확인/안내"),
    ref_bank_num: z.string().optional().describe("(무통장·가상계좌 환불) 환불 계좌번호"),
    ref_bank_holder: z.string().optional().describe("(무통장·가상계좌 환불) 예금주"),
    addressInfo: z.record(z.any()).optional().describe("회수지·회수 운송장 등(ref_ret_parcel/ref_ret_num/ref_ret_zipcode/ref_ret_addr1...)"),
  },
  async ({ rno, addressInfo, ref_del_price, ref_ret_price, ref_deduct_price, ref_bank_code, ref_bank_num, ref_bank_holder, ...refund }) => {
    try {
      // refund(사유/상태/이름) · paymentInfo(비용·환불계좌) · addressInfo(회수지) 로 분리 중첩
      const body = { refund };
      const paymentInfo = {};
      if (ref_del_price !== undefined) paymentInfo.ref_del_price = ref_del_price;
      if (ref_ret_price !== undefined) paymentInfo.ref_ret_price = ref_ret_price;
      if (ref_deduct_price !== undefined) paymentInfo.ref_deduct_price = ref_deduct_price;
      if (ref_bank_code !== undefined) paymentInfo.ref_bank_code = ref_bank_code;
      if (ref_bank_num !== undefined) paymentInfo.ref_bank_num = ref_bank_num;
      if (ref_bank_holder !== undefined) paymentInfo.ref_bank_holder = ref_bank_holder;
      if (Object.keys(paymentInfo).length) body.paymentInfo = paymentInfo;
      if (addressInfo) body.addressInfo = addressInfo;
      return ok(await updateRefund(rno, body));
    } catch (e) { return fail(e.message); }
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
  "교환내역 목록을 조회한다(운영자). 결과의 exchange.eno=교환번호. " +
    "응답의 paymentInfo 에 비용 판단 근거가 있다: exc_price(교환 결제요청 금액)·exc_del_price(배송비)·" +
    "exc_ret_price(회수비)·exc_deduct_price(기타). 교환은 반품과 달리 구매자에게 청구하는 **양수** 금액이다. " +
    "비용은 update_exchange/create_exchange 로 판매자가 정해 결제요청(상태 22)에 반영한다.",
  {
    period_start: z.string().optional().describe("YYYY-MM-DD"),
    period_end: z.string().optional().describe("YYYY-MM-DD"),
    ono_ids: z.string().optional().describe("주문서 유니크키(ono) 콤마 구분"),
    eno_ids: z.string().optional().describe("교환번호(eno) 콤마 구분"),
    exc_state: z.number().int().optional().describe("교환상태로 필터: 10=교환접수 20=회수중 21=검수중/수거완료 22=결제요청 29=재배송중 30=교환완료"),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  },
  async (params) => {
    try { return ok(await listExchanges(params)); } catch (e) { return fail(e.message); }
  }
);

server.tool(
  "create_exchange",
  "교환 접수 — 주문(ono)의 상품(prno·수량)을 교환요청한다(운영자). 사유(exc_ct) 필수. " +
    "★접수 시 사용자에게 두 가지를 반드시 물어 정하라: " +
    "(1) **교환 옵션** — 동일 옵션으로 교환할지, 같은 상품페이지(products_id)의 다른 주문옵션으로 교환할지. " +
    "다른 옵션이면 get_product(products_id, expand=product) 로 그 상품의 주문옵션(옵션명/가격/재고)을 보여주고 사용자가 고르게 한 뒤 " +
    "items[].exc_product_id 에 그 옵션 id 를 지정한다. " +
    "(2) **비용 청구 여부** — 재배송비(exc_del_price)·회수비(exc_ret_price)·**기타비용(exc_deduct_price)**을 구매자에게 청구할지 각각 확인. " +
    "비용/상품을 정하기 전 먼저 get_claim_preview(ono)으로 상품·구매 시 배송비·결제정보를 안내하라. " +
    "★반품과 달리 교환 비용은 **0 이상 양수만**(구매자 청구·결제요청 금액, 음수 불가). " +
    "★추가비용을 구매자에게 **실제로 청구**(결제창 발급)하려면, 교환 접수로 받은 eno 로 create_exchange_private_pay(eno, price) 를 호출해 " +
    "개인 결제창을 발급하라(구매자에게 결제 url 발송).",
  {
    ono: z.union([z.number().int(), z.string()]).describe("주문서 유니크키(ono)"),
    items: exchangeItems.describe("교환할 상품 목록(항목별 exc_product_id 로 동일/다른 상품 교환 결정)"),
    exc_ct: z.string().describe("교환 사유 — get_claim_reasons 의 exchange 카테고리 중 선택"),
    exc_content: z.string().optional().describe("교환 상세 내용"),
    exc_del_price: z.number().int().min(0).optional().describe("상품 재배송비용 — 구매자 청구액(0 이상). 음수 불가"),
    exc_ret_price: z.number().int().min(0).optional().describe("상품 회수비용 — 구매자 청구액(0 이상)"),
    exc_deduct_price: z.number().int().min(0).optional().describe("기타비용 — 구매자 청구액(0 이상)"),
  },
  async ({ ono, items, exc_ct, exc_content, exc_del_price, exc_ret_price, exc_deduct_price }) => {
    // 백엔드 규격: 사유는 exchange 객체, 비용은 paymentInfo 객체로 중첩.
    const exchange = { exc_ct };
    if (exc_content !== undefined) exchange.exc_content = exc_content;
    const paymentInfo = {};
    if (exc_del_price !== undefined) paymentInfo.exc_del_price = exc_del_price;
    if (exc_ret_price !== undefined) paymentInfo.exc_ret_price = exc_ret_price;
    if (exc_deduct_price !== undefined) paymentInfo.exc_deduct_price = exc_deduct_price;
    const body = { ono, items, exchange };
    if (Object.keys(paymentInfo).length) body.paymentInfo = paymentInfo;
    try { return ok(await createExchange(body)); } catch (e) { return fail(e.message); }
  }
);

server.tool(
  "update_exchange",
  "교환내역을 수정한다(운영자). 교환번호(eno)와 바꿀 필드만 보낸다. 사유(exc_ct)·상세(exc_content)·" +
    "상태(exc_state)·교환자명(exc_name) 등. 회수지/회수 운송장 등은 addressInfo 객체로 보낸다 " +
    "(예: exc_ret_parcel=회수 택배사 id, exc_ret_num=회수 운송장번호, exc_ret_zipcode/exc_ret_addr1 등). " +
    "비용은 exc_del_price/exc_ret_price/exc_deduct_price 로 구매자 청구액을 정한다(반품과 달리 **0 이상 양수만**). " +
    "★배송비 청구를 정하거나 묻기 전에 반드시 먼저 get_claim_preview(ono)으로 '구매 시 배송비 OO원'을 사용자에게 안내하라. " +
    "★추가비용을 구매자에게 실제 청구(결제창 발급)하려면 결제요청(exc_state=22)과 함께 create_exchange_private_pay(eno, price) 를 호출하라. " +
    "사유는 get_claim_reasons 의 exchange 중 선택.",
  {
    eno: z.union([z.number().int(), z.string()]).describe("교환번호(eno) — list_exchanges 의 exchange.eno"),
    exc_state: z.number().int().optional().describe("교환상태: 10=교환접수 20=회수중 21=검수중/수거완료 22=결제요청 29=재배송중 30=교환완료"),
    exc_ct: z.string().optional().describe("교환 사유(get_claim_reasons 의 exchange 중 선택)"),
    exc_content: z.string().optional().describe("교환 상세 내용"),
    exc_name: z.string().optional().describe("교환자명"),
    exc_request: z.string().optional().describe("요청사항"),
    exc_del_price: z.number().int().min(0).optional().describe("상품 재배송비용 — 구매자 청구액(0 이상). 음수 불가"),
    exc_ret_price: z.number().int().min(0).optional().describe("상품 회수비용 — 구매자 청구액(0 이상)"),
    exc_deduct_price: z.number().int().min(0).optional().describe("기타비용 — 구매자 청구액(0 이상)"),
    addressInfo: z.record(z.any()).optional().describe("회수지·회수 운송장 등(exc_ret_parcel/exc_ret_num/exc_ret_zipcode/exc_ret_addr1...)"),
  },
  async ({ eno, addressInfo, exc_del_price, exc_ret_price, exc_deduct_price, ...exchange }) => {
    try {
      // exchange(사유/상태/이름) · paymentInfo(비용) · addressInfo(회수지) 로 분리 중첩
      const body = { exchange };
      const paymentInfo = {};
      if (exc_del_price !== undefined) paymentInfo.exc_del_price = exc_del_price;
      if (exc_ret_price !== undefined) paymentInfo.exc_ret_price = exc_ret_price;
      if (exc_deduct_price !== undefined) paymentInfo.exc_deduct_price = exc_deduct_price;
      if (Object.keys(paymentInfo).length) body.paymentInfo = paymentInfo;
      if (addressInfo) body.addressInfo = addressInfo;
      return ok(await updateExchange(eno, body));
    } catch (e) { return fail(e.message); }
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

// ── 클레임 접수 미리보기 ──────────────────────────────────────────────────
server.tool(
  "get_claim_preview",
  "반품/교환 접수 초기 안내용(운영자). 주문(ono)의 **대상 상품 기본정보 + 배송비 + 결제정보**를 한 번에 요약한다. " +
    "반환: payment(결제정보 — 결제번호/결제수단/총 결제금액/포인트/결제일), " +
    "groups[].items(상품 — prno/상품명/옵션/수량/단가/주문상태), " +
    "groups[].shipping(배송 — paid_delivery_price=구매 시 결제 배송비/선착불/무료배송기준/배송원가), " +
    "refund_account(환불계좌 — needs_account=true면 무통장·가상계좌라 PG 자동취소 불가 → 환불계좌 안내·입력 필요, " +
    "주문에 등록된 bank_code/bank_num/bank_holder 가 있으면 함께 표시). " +
    "반품·교환 접수 시작 시 이 내용을 먼저 사용자에게 안내한 뒤, 왕복 배송비를 결정하라 " +
    "(*_del_price=반품 배송비/교환 재배송비, *_ret_price=회수비; 반품은 음수=구매자 부담, 교환은 0이상 양수=구매자 청구). " +
    "그 뒤 create/update_refund·exchange 로 반영한다.",
  {
    ono: z.union([z.number().int(), z.string()]).describe("주문서 유니크키(ono)"),
  },
  async ({ ono }) => {
    try { return ok(await getClaimPreview(ono)); } catch (e) { return fail(e.message); }
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
    can_state: z.number().int().min(0).max(2).optional().describe("취소상태로 필터: 0=취소접수 1=취소중 2=취소완료"),
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

server.tool(
  "update_cancel",
  "취소내역을 수정한다(운영자). 취소번호(cno)와 바꿀 필드만 보낸다. 사유(can_ct)·상세(can_content)·" +
    "환불계좌(can_bank_code/can_bank_num/can_bank_holder)·상태(can_state) 등을 변경한다. " +
    "★can_state=2(취소완료)로 바꾸면 실제 취소·환불 완료 처리가 실행된다(되돌릴 수 없음). " +
    "이미 취소완료(2)된 내역은 상태를 변경할 수 없다. 사유는 get_claim_reasons 의 cancel 중 선택.",
  {
    cno: z.union([z.number().int(), z.string()]).describe("취소번호(cno) — list_cancels 의 cancel.cno"),
    can_state: z.number().int().min(0).max(2).optional().describe("취소상태: 0=취소접수 1=취소중 2=취소완료(=PG승인취소 실행, 되돌릴 수 없음)"),
    can_ct: z.string().optional().describe("취소 사유(get_claim_reasons 의 cancel 중 선택)"),
    can_content: z.string().optional().describe("취소 상세 내용"),
    can_bank_code: z.string().optional().describe("(무통장 환불) 은행코드"),
    can_bank_num: z.string().optional().describe("(무통장 환불) 계좌번호"),
    can_bank_holder: z.string().optional().describe("(무통장 환불) 예금주"),
    can_name: z.string().optional().describe("취소자명"),
  },
  async ({ cno, ...body }) => {
    try {
      return ok(await updateCancel(cno, body));
    } catch (e) {
      return fail(e.message);
    }
  }
);

server.tool(
  "reject_cancel",
  "취소 철회 — 접수된 취소내역을 되돌린다(운영자). 취소번호(cno) 지정. " +
    "이미 취소완료(can_state=2)된 내역은 철회할 수 없다.",
  { cno: z.union([z.number().int(), z.string()]).describe("철회할 취소번호(cno)") },
  async ({ cno }) => {
    try {
      return ok(await rejectCancel(cno));
    } catch (e) {
      return fail(e.message);
    }
  }
);

// ── 상품 관리(운영자) ───────────────────────────────────────────────────────
// 등록/수정 본문은 섹션(origin/product/delivery/request/content/benefit)이 깊어 전 필드를
// 스키마로 강제하지 않고 느슨한 객체로 받는다. 정확한 필드는 guide(llms.txt)/openapi 의 상품 스키마 참고.
const looseObj = () => z.record(z.any());

// 멀티플렉스 CRUD 도구 — 한 도구에서 action 으로 분기해 등록 도구 수를 줄인다(클라이언트 도구 상한 대응).
// actions: { [action]: (rest) => Promise }. rest 는 action 을 제외한 입력값. 각 핸들러가 필요한 필드만 골라 쓴다.
function crudTool(name, description, actions, shape) {
  server.tool(
    name,
    description,
    { action: z.enum(Object.keys(actions)).describe("수행할 작업"), ...shape },
    async ({ action, ...rest }) => {
      const fn = actions[action];
      if (!fn) return fail(`지원하지 않는 action 입니다: ${action}`);
      try { return ok(await fn(rest)); } catch (e) { return fail(e.message); }
    }
  );
}

server.tool(
  "create_product",
  "상품을 등록한다(운영자). 본문은 섹션 객체로 구성한다: " +
    "origin(기본정보 — title 필수, option_type 필수(0=단일,1~3=옵션단계), category 등), " +
    "product(주문옵션 행 배열 — 옵션 조합별 price/quantity/code 등; 단일상품도 1행), " +
    "delivery(배송), request(요청사항), content(상세내용 — file_photo=대표이미지 id 등), benefit(혜택). " +
    "이미지는 먼저 upload_product_images 로 올려 받은 id 를 content.file_photo 등에 넣는다. " +
    "★배송/택배: delivery 객체를 함께 보내면 그 설정으로 등록된다. delivery 를 생략하면(사용자가 배송/택배를 언급하지 않으면) " +
    "가장 최근 등록한 상품의 배송설정을 그대로 상속한다(최초 상품이라 상속할 게 없으면 배송 미설정). " +
    "delivery.parcel_type 이 마스터 스위치다: 10/11/12=무료(이때 배송비는 강제로 0), 21/22=조건부무료, " +
    "31=유료(선불) · 32=유료(착불) · 33=고객선택. **유료 배송비는 parcel_type=31(또는 32) + parcel_basic_price 를 함께** 넣어야 적용된다. " +
    "★ID 용어(응답 보고 시 정확히): 최상위 `id` = **상품번호**(get_product/update_product/delete_product 에 쓰는 값). " +
    "`product[].id`(= 응답의 `product_id` CSV 각 값) = **옵션번호**(주문옵션/품목 고유키). content.file_photo = **대표이미지 id**. " +
    "⚠️`product_id` 필드는 옵션번호 목록이지 상품번호가 아니다 — 사용자에게 상품번호라고 말하지 말 것. " +
    "정확한 필드 스펙은 guide(prosell://guide/llms.txt)·openapi 의 상품 스키마를 참고하라.",
  {
    origin: looseObj().describe("기본정보 — title(필수), option_type(필수), category/onoff 등"),
    product: z.array(looseObj()).optional().describe("주문옵션 행 목록(옵션 조합별 가격/재고/코드). 단일상품도 최소 1행"),
    delivery: looseObj().optional().describe(
      "배송정보(중첩객체). 주요 필드: delivery_use(0=배송안함/1=배송/2=해외직배송), " +
        "parcel_type(★배송비 스위치: 10·11·12=무료→배송비0, 21·22=조건부무료, 31=유료선불, 32=유료착불, 33=고객선택), " +
        "parcel_basic_price(기본 배송비 원 — parcel_type이 무료면 무시됨), " +
        "parcel_free_price(조건부무료 기준금액 — parcel_type 21/22), " +
        "parcel_area1_price(제주 할증)/parcel_area2_price(도서산간 할증), parcel_id(택배사 id — list_couriers), bundle(묶음배송 0/1/2), " +
        "extra_charge(추가배송비 0=없음/1=무게/2=2구간/3=3구간/9=수량, 구간·수량별은 parcel_type=31만), " +
        "range2_from/range2_price/range3_from/range3_price/repeat_quantity. " +
        "예) 유료배송비 3000원: { delivery_use:1, parcel_type:31, parcel_basic_price:3000 }"
    ),
    request: looseObj().optional().describe("요청사항"),
    content: looseObj().optional().describe("상세내용 — file_photo(대표이미지 id), 상세설명 등"),
    benefit: looseObj().optional().describe("혜택정보"),
  },
  async (body) => {
    try { return ok(await createProduct(body)); } catch (e) { return fail(e.message); }
  }
);

server.tool(
  "update_product",
  "상품을 수정한다(운영자). id 와 바꿀 섹션만 보낸다(create_product 와 같은 섹션 구조). " +
    "origin.option_type 는 함께 보내는 것이 안전하다. 옵션 행 변경은 product 배열로. " +
    "★배송비 설정/수정 시 delivery.parcel_type(31=유료선불 등) + parcel_basic_price 를 함께 보낸다(parcel_type이 무료(1x)면 배송비는 0으로 강제).",
  {
    id: z.union([z.number().int(), z.string()]).describe("상품 id"),
    origin: looseObj().optional(),
    product: z.array(looseObj()).optional(),
    delivery: looseObj().optional().describe(
      "배송정보(중첩객체). delivery_use(0/1/2), parcel_type(10·11·12=무료→배송비0, 21·22=조건부무료, 31=유료선불, 32=유료착불, 33=고객선택), " +
        "parcel_basic_price(기본 배송비), parcel_free_price(조건부무료 기준), parcel_area1_price/parcel_area2_price(제주/도서산간 할증), " +
        "parcel_id(택배사 id), bundle, extra_charge. 예) 배송비 3000원: { delivery_use:1, parcel_type:31, parcel_basic_price:3000 }"
    ),
    request: looseObj().optional(),
    content: looseObj().optional(),
    benefit: looseObj().optional(),
  },
  async ({ id, ...body }) => {
    try { return ok(await updateProduct(id, body)); } catch (e) { return fail(e.message); }
  }
);

server.tool(
  "delete_product",
  "상품을 삭제한다(운영자).",
  { id: z.union([z.number().int(), z.string()]).describe("삭제할 상품 id") },
  async ({ id }) => {
    try { return ok(await deleteProduct(id)); } catch (e) { return fail(e.message); }
  }
);

server.tool(
  "get_product_option",
  "주문옵션 상세를 조회한다. 주문옵션 유니크키(옵션 행 id)로 단건 조회 — 가격/재고/옵션값/이미지 등.",
  { id: z.union([z.number().int(), z.string()]).describe("주문옵션 유니크키(옵션 행 id)") },
  async ({ id }) => {
    try { return ok(await getProductOption(id)); } catch (e) { return fail(e.message); }
  }
);

server.tool(
  "sales_stats",
  "매출 통계 조회(운영자, 조회 전용). 관리자 매출통계와 동일 집계다. " +
    "action=period → 기간·결제수단별(일자별 daily + 결제수단별 pay_methods + 합계 summary). " +
    "action=product → 상품별 판매(products: 상품명/수량/판매액, 합계 포함). " +
    "★기간(period_start~period_end, YYYY-MM-DD)은 최대 3개월. 사용자가 '오늘/어제/이번 달/지난주' 처럼 말하면 " +
    "오늘 날짜 기준으로 실제 날짜 범위(예: 오늘=오늘~오늘, 이번 달=1일~오늘)로 변환해 넣어라. " +
    "판매액은 pay_price(실결제액)/item_price(판매가 합계) 등으로 제공되며 text 필드에 '1,234 원' 형태 문자열도 있다.",
  {
    action: z.enum(["period", "product"]).describe("period=기간·수단별 매출 / product=상품별 매출"),
    period_start: z.string().describe("조회 시작일 YYYY-MM-DD"),
    period_end: z.string().describe("조회 종료일 YYYY-MM-DD (시작~종료 최대 3개월)"),
    state: z.number().int().optional().describe("주문상태 필터(2=결제완료 3=상품준비중 4=배송중 5=배송완료 6=구매확정 8=발송지연)"),
    pay_method: z.string().optional().describe("(period) 결제수단 코드 필터. 999=전자결제(무통장제외), 300=무통장 등"),
    sort_type: z.number().int().min(0).max(1).optional().describe("(product) 0=옵션별 1=상품별 집계"),
    orderby_type: z.number().int().min(0).max(5).optional().describe("(product) 정렬 0=매출↓ 1=매출↑ 2=이름↑ 3=이름↓ 4=수량↓ 5=수량↑"),
    search_products_title: z.string().optional().describe("(product) 상품명 부분검색"),
  },
  async ({ action, period_start, period_end, state, pay_method, sort_type, orderby_type, search_products_title }) => {
    try {
      if (action === "product") {
        return ok(await salesByProduct({ period_start, period_end, state, sort_type, orderby_type, search_products_title }));
      }
      return ok(await salesByPeriod({ period_start, period_end, state, pay_method }));
    } catch (e) { return fail(e.message); }
  }
);

const IMAGE_FIELD = z.enum([
  "file_photo", "file_list", "file_gallery",
  "pc_description_photo", "m_description_photo",
  "pc_information_photo", "m_information_photo",
  "pc_delivery_photo", "m_delivery_photo",
  "pc_return_photo", "m_return_photo",
  "pc_as_photo", "m_as_photo",
  "pc_header_photo", "m_header_photo",
  "productsupload", "photo", "detail_photo", "detail_photo_m",
]).describe("대상 필드 — file_photo(대표) / file_list / file_gallery / pc_description_photo(상세) / photo(주문옵션) 등");

if (REMOTE) {
  // 커넥터형(원격): 두 가지 입력을 받는다.
  //   · image_urls — 공개 URL(Chat 모드 등 로컬 파일 접근 불가 환경). 서버가 받아 검증·업로드.
  //   · images(base64) — 호출자가 **실제 파일 바이트**를 가진 경우(예: Claude Desktop "Code" 모드가
  //     로컬 사진을 읽어 전달). 매직바이트(JPEG/PNG/GIF)+최소크기 검증으로 가짜/깨짐은 거부.
  // (files[로컬경로]는 원격 서버가 사용자 PC 를 못 읽으므로 미지원 — Code 모드는 파일을 읽어 base64 로 전달)
  server.tool(
    "upload_product_images",
    "상품 이미지를 업로드해 파일 유니크키(items[].id)를 받는다(운영자/원격 커넥터). 받은 id 를 create_product/update_product 의 " +
      "content.file_photo(대표)·file_list·file_gallery·pc/m_description_photo 또는 주문옵션 product[].photo 에 연결. 합쳐 최대 10.\n" +
      "입력 두 가지:\n" +
      "  • image_urls: 공개 http/https 이미지 주소 → 서버가 받아 검증(JPEG/PNG/GIF) 후 업로드. (Chat 모드 권장)\n" +
      "  • images:[{data(base64), name}]: **실제 파일 바이트**의 base64.\n" +
      "★로컬 파일(예: C:\\\\Users\\\\..\\\\1.png)을 올리려면 — 이 도구를 그대로 쓴다: " +
      "파일을 **직접 읽어** 바이트를 base64 로 인코딩해 images 에 넣어 호출하라. Claude Desktop 'Code' 모드는 로컬 파일을 읽을 수 있다. " +
      "**인증 토큰을 따로 구할 필요 없다 — 커넥터가 자동 인증한다.** curl/PowerShell 로 직접 업로드하려 하지 마라" +
      "(OAuth 액세스 토큰은 의도적으로 노출되지 않으며, 설정파일에도 없다). 큰 파일(수백 KB↑)이라 base64 가 부담되면 image_urls(공개 URL)로.\n" +
      "★Chat 모드/채팅에 끌어다 놓은 첨부는 모델이 'vision'만 받아 실제 바이트가 없다 → base64 가 가짜가 되어 거부된다. 그 경우 image_urls 를 쓰거나 'Code' 모드에서 로컬 파일을 읽어 올려라.",
    {
      field: IMAGE_FIELD,
      image_urls: z.array(z.string().url()).max(10).optional().describe("공개 이미지 URL 목록(http/https)"),
      images: z.array(z.object({
        data: z.string().describe("이미지 바이트의 base64(data:...;base64, 접두어 허용). Code 모드가 로컬 파일을 읽어 전달"),
        name: z.string().optional().describe("파일명(확장자 포함, 예: 1.png)"),
      })).max(10).optional().describe("실제 파일 바이트의 base64 목록(채팅 첨부 vision 은 불가)"),
    },
    async ({ field, image_urls, images }) => {
      try { return ok(await uploadProductImages(field, { urls: image_urls, images })); } catch (e) { return fail(e.message); }
    }
  );
} else {
  // 설치형(로컬 stdio): 로컬 파일 경로(files)가 가장 확실. URL/실바이트 base64 도 허용.
  server.tool(
    "upload_product_images",
    "상품 이미지를 업로드해 **파일 유니크키(items[].id)** 를 받는다(운영자, 로컬 설치형). 받은 id 를 create_product/update_product 의 " +
      "content.file_photo(대표·단일)·file_list(최대2,콤마)·file_gallery(최대10,콤마)·pc/m_description_photo(콤마) 등, " +
      "또는 주문옵션 이미지는 field=photo 로 올려 product[].photo 에 넣어 연결한다. (합쳐 최대 10)\n" +
      "★권장: files:[로컬경로] — 로컬 서버가 파일 바이트를 직접 읽어 업로드(가장 확실).\n" +
      "  • image_urls:[공개 URL] — 서버가 받아 검증 후 업로드.\n" +
      "  • images:[{data(base64), name}] 는 호출자가 **실제 파일 바이트**를 base64 로 가진 경우에만(채팅 첨부는 vision 이라 바이트 없음→금지). " +
      "디코드 결과가 JPEG/PNG/GIF 가 아니거나 너무 작으면 업로드를 거부한다.",
    {
      field: IMAGE_FIELD,
      files: z.array(z.string()).max(10).optional().describe("로컬 파일 경로 목록 — 서버가 직접 읽음(권장)"),
      image_urls: z.array(z.string().url()).max(10).optional().describe("공개 이미지 URL 목록(http/https)"),
      images: z.array(z.object({
        data: z.string().describe("이미지 바이트를 base64 로 인코딩한 문자열(data:...;base64, 접두어 허용)"),
        name: z.string().optional().describe("파일명(확장자 포함, 예: 1.png)"),
      })).max(10).optional().describe("실제 파일 바이트의 base64 목록(채팅 첨부 vision 은 불가). 잘못된 이미지는 거부됨"),
    },
    async ({ field, images, files, image_urls }) => {
      try { return ok(await uploadProductImages(field, { images, files, urls: image_urls })); } catch (e) { return fail(e.message); }
    }
  );
}

// ── 카테고리 ────────────────────────────────────────────────────────────────
const listParams = {
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(1000).optional().describe("페이지당 건수(기본 10, 최대 1000)"),
  id: z.string().optional().describe("id 단건 또는 콤마 구분 복수"),
  title: z.string().optional().describe("이름 부분검색"),
};

crudTool(
  "categories",
  "상품 카테고리 관리(운영자). action: list|create|update|delete. " +
    "list 응답 items[].origin.code 가 상품 origin.category 값으로 쓰인다. " +
    "create/update 는 origin(num 1~4 깊이·title 필수)·design(스킨/정렬) 섹션. update/delete 는 id 필수.",
  {
    list: ({ page, limit, id, title, code, order }) => listCategories({ page, limit, id, title, code, order }),
    create: ({ origin, design }) => createCategory({ origin, design }),
    update: ({ id, origin, design }) => updateCategory(id, { origin, design }),
    delete: ({ id }) => deleteCategory(id),
  },
  {
    ...listParams,
    code: z.string().optional().describe("(list) 카테고리 코드 필터"),
    order: z.number().int().min(0).max(2).optional().describe("(list) 0=등록역순 1=위치순 2=위치역순"),
    origin: looseObj().optional().describe("(create/update) num(1~4)·title·onoff/position/parent_id 등"),
    design: looseObj().optional().describe("(create/update) pc/m 스킨·정렬·필터 노출 등"),
  }
);

// ── 공급자 ──────────────────────────────────────────────────────────────────
crudTool(
  "suppliers",
  "공급자(매입처) 관리(운영자). action: list|create|update|delete. list id 는 상품 origin.supplier 값(기본 1). " +
    "create 필수: body.{title,uid,email,tel,warehouse_zipcode,warehouse_addr1,return_zipcode,return_addr1}. " +
    "update/delete 는 id 필수(기본 공급자 id=1 삭제 불가).",
  {
    list: ({ page, limit, id, title }) => listSuppliers({ page, limit, id, title }),
    create: ({ body }) => createSupplier(body),
    update: ({ id, body }) => updateSupplier(id, body),
    delete: ({ id }) => deleteSupplier(id),
  },
  { ...listParams, body: looseObj().optional().describe("(create/update) 공급자 정보") }
);

// ── 브랜드 (+이미지) ─────────────────────────────────────────────────────────
crudTool(
  "brands",
  "브랜드 관리(운영자). action: list|create|update|delete|upload_image|delete_image. " +
    "list id 는 상품 product[].brand 값(expand=images 로 이미지 포함). create 는 title 필수(중복 불가). " +
    "로고는 upload_image(file 1개)로 올려 받은 id 를 create/update 의 image 로 넣는다. 기본 브랜드(id<2) 수정/삭제 불가.",
  {
    list: ({ page, limit, id, title, expand }) => listBrands({ page, limit, id, title, expand }),
    create: ({ title, image }) => createBrand({ title, image }),
    update: ({ id, title, image }) => updateBrand(id, { title, image }),
    delete: ({ id }) => deleteBrand(id),
    upload_image: ({ file }) => uploadBrandImage(file),
    delete_image: ({ id }) => deleteBrandImage(id),
  },
  {
    ...listParams,
    expand: z.string().optional().describe("(list) images 지정 시 이미지 포함"),
    image: z.number().int().optional().describe("(create/update) 브랜드 이미지 id"),
    file: z.string().optional().describe("(upload_image) 로컬 이미지 파일 경로"),
  }
);

// ── 추가주문옵션 ────────────────────────────────────────────────────────────
const addoptionItems = z.array(z.object({
  name: z.string().describe("옵션값 이름('|' 불가, 최대 200자)"),
  price: z.number().int().min(0).optional().describe("추가금액"),
})).optional();

crudTool(
  "addoptions",
  "추가주문옵션(상품에 덧붙이는 선택형 옵션) 관리(운영자). action: list|create|update|delete. " +
    "list id 는 상품 origin.addoption 값. create 는 title 필수, options 로 옵션값([{name,price}]) 목록. " +
    "update 에 options 를 보내면 옵션값 전체 교체. update/delete 는 id 필수.",
  {
    list: ({ page, limit, id, title }) => listAddoptions({ page, limit, id, title }),
    create: ({ title, req_type, options }) => createAddoption({ title, req_type, options }),
    update: ({ id, title, req_type, options }) => updateAddoption(id, { title, req_type, options }),
    delete: ({ id }) => deleteAddoption(id),
  },
  {
    ...listParams,
    req_type: z.number().int().min(0).max(1).optional().describe("(create/update) 0=선택 1=필수"),
    options: addoptionItems.describe("(create/update) 옵션값 목록 [{name, price}]"),
  }
);

// ── 필터 색상 ───────────────────────────────────────────────────────────────
crudTool(
  "colors",
  "필터(검색) 색상 관리(운영자). action: list|create|update|delete. list id 는 상품 product[].standard_color 값. " +
    "create 는 items([{title, color}]) 로 여러 개 동시 등록(color=hex 6자리, # 제외). update/delete 는 id 필수.",
  {
    list: ({ page, limit, id, title }) => listColors({ page, limit, id, title }),
    create: ({ items }) => createColors(items),
    update: ({ id, title, color }) => updateColor(id, { title, color }),
    delete: ({ id }) => deleteColor(id),
  },
  {
    ...listParams,
    color: z.string().regex(/^[0-9a-fA-F]{6}$/).optional().describe("(update) hex 6자리(# 없이)"),
    items: z.array(z.object({
      title: z.string().describe("색상명(최대 50자)"),
      color: z.string().regex(/^[0-9a-fA-F]{6}$/).describe("hex 6자리(# 없이, 예: ff0000)"),
    })).optional().describe("(create) 등록할 색상 목록"),
  }
);

// ── 필터 사이즈 ─────────────────────────────────────────────────────────────
crudTool(
  "sizes",
  "필터(검색) 사이즈 관리(운영자). action: list|create|update|delete. list id 는 상품 product[].standard_size 값(ct=그룹 필터). " +
    "create 두 방식: (A) 새 그룹 ct(그룹명)+items, (B) 기존 그룹 group(id)+items. " +
    "update 는 id+title(그룹 변경 불가). delete 시 그룹 마지막 사이즈면 그룹도 삭제.",
  {
    list: ({ page, limit, id, title, ct }) => listSizes({ page, limit, id, title, ct }),
    create: ({ ct, group, items }) => createSizes({ ct, group, items }),
    update: ({ id, title }) => updateSize(id, { title }),
    delete: ({ id }) => deleteSize(id),
  },
  {
    ...listParams,
    ct: z.union([z.number().int(), z.string()]).optional().describe("(list) 그룹 id 필터 / (create A) 새 그룹명"),
    group: z.number().int().optional().describe("(create B) 기존 그룹 id"),
    items: z.array(z.string()).optional().describe("(create) 사이즈명 목록(각 최대 50자)"),
  }
);

// ── 아이콘 ──────────────────────────────────────────────────────────────────
crudTool(
  "icons",
  "상품 아이콘(NEW/BEST 등 라벨) 관리(운영자). action: list|create|update|delete. list id 는 상품 content.icon 값(ct 1~4 필터). " +
    "create 는 ct(1~4)·title(≤8자)·file(이미지 필수). update 는 id+바꿀 필드(이미지 교체 시 file). 사용 중이면 삭제 불가.",
  {
    list: ({ page, limit, id, title, ct }) => listIcons({ page, limit, id, title, ct }),
    create: ({ ct, title, onoff, file }) => createIcon({ ct, title, onoff }, file),
    update: ({ id, ct, title, onoff, file }) => updateIcon(id, { ct, title, onoff }, file),
    delete: ({ id }) => deleteIcon(id),
  },
  {
    ...listParams,
    ct: z.number().int().min(1).max(4).optional().describe("아이콘 분류(1~4)"),
    onoff: z.number().int().min(0).max(1).optional().describe("(create/update) 1=사용 0=미사용"),
    file: z.string().optional().describe("(create 필수/update 선택) 아이콘 이미지 로컬 파일 경로"),
  }
);

// ── 공통 템플릿(상세내용 서식) ────────────────────────────────────────────────
crudTool(
  "templates",
  "공통 템플릿(상세페이지 배송/교환·반품/AS 등 공통 영역 서식) 관리(운영자). action: list|create|update|delete. " +
    "id 는 상품 content 의 delivery_template/return_template/as_template 등에 쓰인다. " +
    "create 는 device(1=PC/2=모바일)·ct(202/203/204/206/1)·pc_mode·m_mode(1/2)·title·pc_content·m_content. update/delete 는 id 필수.",
  {
    list: ({ page, limit, id, title }) => listTemplates({ page, limit, id, title }),
    create: ({ device, ct, pc_mode, m_mode, title, pc_content, m_content }) => createTemplate({ device, ct, pc_mode, m_mode, title, pc_content, m_content }),
    update: ({ id, device, ct, pc_mode, m_mode, title, pc_content, m_content }) => updateTemplate(id, { device, ct, pc_mode, m_mode, title, pc_content, m_content }),
    delete: ({ id }) => deleteTemplate(id),
  },
  {
    ...listParams,
    device: z.number().int().optional().describe("(create/update) 1=PC 2=모바일"),
    ct: z.number().int().optional().describe("(create/update) 영역 코드(202/203/204/206/1)"),
    pc_mode: z.number().int().optional().describe("(create/update) PC 모드(1/2)"),
    m_mode: z.number().int().optional().describe("(create/update) 모바일 모드(1/2)"),
    pc_content: z.string().optional().describe("(create/update) PC 내용(HTML)"),
    m_content: z.string().optional().describe("(create/update) 모바일 내용(HTML)"),
  }
);

// ── 서식(상품정보제공고시) — 조회 전용 ───────────────────────────────────────
server.tool(
  "list_information",
  "상품정보제공고시 서식 목록을 조회한다(조회 전용). 응답 informations[].id 를 상품 " +
    "content.information.id 로 연결한다.",
  listParams,
  async (params) => { try { return ok(await listInformation(params)); } catch (e) { return fail(e.message); } }
);

// ── 상품문의 (운영자) ────────────────────────────────────────────────────────
// 운영자(admin) 토큰은 전체 문의를 조회하고, answer 로 답변(reply_content)을 등록한다.
crudTool(
  "product_inquiries",
  "상품문의 관리(운영자). action: list|answer|create|delete. " +
    "list 는 답변대기/완료 함께(각 항목 id·product_id·title·content·secret·reply_content; reply_content 비면 미답변). " +
    "answer 는 id+reply_content(로그인 운영자가 답변자로 자동 등록); 원문(title/content/secret) 수정도 가능. " +
    "create 는 product_id·title·content 필수(운영자 대리등록). delete 는 id 필수.",
  {
    list: ({ period_start, period_end, id, title, mid, page, limit }) =>
      listProductInquiries({ period_start, period_end, id, title, mid, page, limit }),
    answer: async ({ id, reply_content, reply_mid, title, content, secret }) => {
      const body = {};
      if (reply_content !== undefined) { body.reply_mid = reply_mid ?? (await operatorMid()); body.reply_content = reply_content; }
      else if (reply_mid !== undefined) body.reply_mid = reply_mid;
      if (title !== undefined) body.title = title;
      if (content !== undefined) body.content = content;
      if (secret !== undefined) body.secret = secret;
      return updateProductInquiry(id, body);
    },
    create: ({ product_id, title, content, secret }) => createProductInquiry({ product_id, title, content, secret }),
    delete: ({ id }) => deleteProductInquiry(id),
  },
  {
    period_start: z.string().optional().describe("(list) 시작일 YYYY-MM-DD"),
    period_end: z.string().optional().describe("(list) 종료일 YYYY-MM-DD"),
    id: z.union([z.number().int(), z.string()]).optional().describe("문의번호 — list 필터(콤마 복수) / answer·delete 대상"),
    title: z.string().optional().describe("list 제목검색 / create·answer 제목"),
    mid: z.number().int().optional().describe("(list) 작성 회원번호 필터"),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
    product_id: z.union([z.number().int(), z.string()]).optional().describe("(create) 상품 id"),
    content: z.string().optional().describe("create 내용 / answer 원문 수정"),
    secret: z.number().int().min(0).max(1).optional().describe("비밀글 0/1"),
    reply_content: z.string().optional().describe("(answer) 답변 내용"),
    reply_mid: z.number().int().optional().describe("(answer) 답변자 회원번호 — 생략 시 로그인 운영자"),
  }
);

// ── 고객문의 (운영자) ────────────────────────────────────────────────────────
crudTool(
  "customer_inquiries",
  "고객문의(1:1 문의) 관리(운영자). action: list|answer|create|delete|setup|upload. " +
    "list 각 항목 id·category·title·content·reply_content·files(reply_content 비면 미답변). " +
    "answer 는 id+reply_content(운영자 자동 답변자); 원문(category/title/content/editor/files) 수정 가능. " +
    "create 는 item_type(0~4)·category·title·content 필수(회원 대리등록). setup 은 분류·첨부 제한 조회. " +
    "upload 는 로컬파일(files, 최대 3) 올려 items[].id 를 create/answer 의 files 로.",
  {
    list: ({ period_start, period_end, id, title, mid, page, limit }) =>
      listCustomerInquiries({ period_start, period_end, id, title, mid, page, limit }),
    answer: async ({ id, reply_content, reply_mid, category, title, content, editor, files }) => {
      const body = {};
      if (reply_content !== undefined) { body.reply_mid = reply_mid ?? (await operatorMid()); body.reply_content = reply_content; }
      else if (reply_mid !== undefined) body.reply_mid = reply_mid;
      if (category !== undefined) body.category = category;
      if (title !== undefined) body.title = title;
      if (content !== undefined) body.content = content;
      if (editor !== undefined) body.editor = editor;
      if (files !== undefined) body.files = files;
      return updateCustomerInquiry(id, body);
    },
    create: ({ item_type, category, title, content, item_ids, editor, files }) =>
      createCustomerInquiry({ item_type, category, title, content, item_ids, editor, files }),
    delete: ({ id }) => deleteCustomerInquiry(id),
    setup: () => getCustomerInquirySetup(),
    upload: ({ files }) => uploadCustomerInquiryFiles(files),
  },
  {
    period_start: z.string().optional().describe("(list) 시작일 YYYY-MM-DD"),
    period_end: z.string().optional().describe("(list) 종료일 YYYY-MM-DD"),
    id: z.union([z.number().int(), z.string()]).optional().describe("문의번호 — list 필터 / answer·delete 대상"),
    title: z.string().optional().describe("list 제목검색 / create·answer 제목"),
    mid: z.number().int().optional().describe("(list) 작성 회원번호 필터"),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
    item_type: z.number().int().min(0).max(4).optional().describe("(create) 0=일반 1=주문상품 2=장바구니 3=보관 4=최근"),
    category: z.string().optional().describe("create/answer 분류"),
    content: z.string().optional().describe("create/answer 내용"),
    item_ids: z.string().optional().describe("(create) 연관 항목 id 콤마구분(item_type 1~4)"),
    editor: z.number().int().min(0).max(1).optional().describe("create/answer 0=텍스트 1=HTML"),
    files: z.array(z.union([z.number().int(), z.string()])).optional().describe("create/answer=첨부 file id 목록 / upload=로컬파일 경로(최대 3)"),
    reply_content: z.string().optional().describe("(answer) 답변 내용"),
    reply_mid: z.number().int().optional().describe("(answer) 답변자 회원번호 — 생략 시 로그인 운영자"),
  }
);

// ── 상품평(리뷰) (운영자) ─────────────────────────────────────────────────────
crudTool(
  "reviews",
  "상품평(리뷰) 관리(운영자). action: list|answer|create|delete|setup|upload. " +
    "list 각 항목 id·product_id·score(1~5)·content·best·files·reply_content(비면 미답변); 별점/사진/상품 필터. " +
    "answer 는 id+reply_content(운영자 자동 답변자); 원문(content/score/best/files) 수정 가능. " +
    "create 는 prno·content·score 필수(회원 대리등록). setup 은 적립/기간/감정표현 조회. upload 는 사진(files, 최대 5).",
  {
    list: ({ period_start, period_end, id, product_id, prno, mid, score, photo, best, content, page, limit }) =>
      listReviews({ period_start, period_end, id, product_id, prno, mid, score, photo, best, content, page, limit }),
    answer: async ({ id, reply_content, reply_mid, content, score, best, files }) => {
      const body = {};
      if (reply_content !== undefined) { body.reply_mid = reply_mid ?? (await operatorMid()); body.reply_content = reply_content; }
      else if (reply_mid !== undefined) body.reply_mid = reply_mid;
      if (content !== undefined) body.content = content;
      if (score !== undefined) body.score = score;
      if (best !== undefined) body.best = best;
      if (files !== undefined) body.files = files;
      return updateReview(id, body);
    },
    create: ({ prno, content, score, files }) => createReview({ prno, content, score, files }),
    delete: ({ id }) => deleteReview(id),
    setup: () => getReviewSetup(),
    upload: ({ files }) => uploadReviewFiles(files),
  },
  {
    period_start: z.string().optional().describe("(list) 시작일 YYYY-MM-DD"),
    period_end: z.string().optional().describe("(list) 종료일 YYYY-MM-DD"),
    id: z.union([z.number().int(), z.string()]).optional().describe("리뷰번호 — list 필터 / answer·delete 대상"),
    product_id: z.number().int().optional().describe("(list) 상품 id 필터"),
    prno: z.union([z.number().int(), z.string()]).optional().describe("list 필터 / create 상품주문번호"),
    mid: z.number().int().optional().describe("(list) 작성 회원번호 필터"),
    score: z.number().int().min(1).max(5).optional().describe("list 필터 / create·answer 별점(1~5)"),
    photo: z.number().int().min(0).max(1).optional().describe("(list) 1=사진리뷰만"),
    best: z.number().int().min(0).max(1).optional().describe("list 필터 / answer 베스트 지정"),
    content: z.string().optional().describe("list 내용검색 / create·answer 내용"),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
    files: z.array(z.union([z.number().int(), z.string()])).optional().describe("create/answer=첨부 file id / upload=로컬파일 경로(최대 5)"),
    reply_content: z.string().optional().describe("(answer) 답변 내용"),
    reply_mid: z.number().int().optional().describe("(answer) 답변자 회원번호 — 생략 시 로그인 운영자"),
  }
);

// ── 공지사항 (운영자) ────────────────────────────────────────────────────────
crudTool(
  "notices",
  "공지사항 관리(운영자). action: list|create|update|delete|setup|upload. " +
    "list 각 항목 id·category·title·content·dt·views·files(응답 fixeds=상단고정 id). " +
    "create 는 category·title·content 필수(작성자=로그인 운영자 자동), fixed=1 상단고정. update 는 id+바꿀 필드. " +
    "setup 은 분류·첨부 제한 조회. upload 는 로컬파일(files, 최대 3)→items[].id 를 create/update 의 files 로.",
  {
    list: ({ period_start, period_end, id, title, page, limit }) =>
      listNotices({ period_start, period_end, id, title, page, limit }),
    create: async ({ category, title, content, fixed, files }) =>
      createNotice({ category, title, content, fixed, files, mid: await operatorMid() }),
    update: ({ id, category, title, content, fixed, files }) =>
      updateNotice(id, { category, title, content, fixed, files }),
    delete: ({ id }) => deleteNotice(id),
    setup: () => getNoticeSetup(),
    upload: ({ files }) => uploadNoticeFiles(files),
  },
  {
    period_start: z.string().optional().describe("(list) 시작일 YYYY-MM-DD"),
    period_end: z.string().optional().describe("(list) 종료일 YYYY-MM-DD"),
    id: z.union([z.number().int(), z.string()]).optional().describe("공지 id — list 필터 / update·delete 대상"),
    title: z.string().optional().describe("list 제목검색 / create·update 제목"),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
    category: z.string().optional().describe("create/update 분류(setup 의 categories 중)"),
    content: z.string().optional().describe("create/update 내용(HTML 가능)"),
    fixed: z.number().int().min(0).max(1).optional().describe("create/update 1=상단고정"),
    files: z.array(z.union([z.number().int(), z.string()])).optional().describe("create/update=첨부 file id / upload=로컬파일 경로(최대 3)"),
  }
);

// ── 자주묻는 질문(FAQ) (운영자) ───────────────────────────────────────────────
crudTool(
  "faqs",
  "FAQ(자주묻는 질문) 관리(운영자). action: list|create|update|delete|setup|upload. " +
    "list 각 항목 id·category·title·content·views·files. create 는 category·title·content 필수(작성자=로그인 운영자 자동). " +
    "update 는 id+바꿀 필드. setup 은 분류·첨부 제한 조회. upload 는 로컬파일(files, 최대 3)→items[].id 를 create/update 의 files 로.",
  {
    list: ({ period_start, period_end, id, title, page, limit }) =>
      listFaqs({ period_start, period_end, id, title, page, limit }),
    create: async ({ category, title, content, files }) =>
      createFaq({ category, title, content, files, mid: await operatorMid() }),
    update: ({ id, category, title, content, files }) => updateFaq(id, { category, title, content, files }),
    delete: ({ id }) => deleteFaq(id),
    setup: () => getFaqSetup(),
    upload: ({ files }) => uploadFaqFiles(files),
  },
  {
    period_start: z.string().optional().describe("(list) 시작일 YYYY-MM-DD"),
    period_end: z.string().optional().describe("(list) 종료일 YYYY-MM-DD"),
    id: z.union([z.number().int(), z.string()]).optional().describe("FAQ id — list 필터 / update·delete 대상"),
    title: z.string().optional().describe("list 제목검색 / create·update 질문 제목"),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
    category: z.string().optional().describe("create/update 분류(setup 의 categories 중)"),
    content: z.string().optional().describe("create/update 답변 내용(HTML 가능)"),
    files: z.array(z.union([z.number().int(), z.string()])).optional().describe("create/update=첨부 file id / upload=로컬파일 경로(최대 3)"),
  }
);

// ── 스킨 조회 (운영자) ────────────────────────────────────────────────────────
server.tool(
  "list_skins",
  "스킨(디자인 템플릿) 이름 목록을 조회한다(운영자). device(pc/m)와 skin(스킨 종류)을 지정한다.",
  {
    device: z.enum(["pc", "m"]).describe("pc 또는 m"),
    skin: z.string().describe("스킨 종류(그룹) 식별자"),
  },
  async ({ device, skin }) => { try { return ok(await listSkins(device, skin)); } catch (e) { return fail(e.message); } }
);

// ── 회원계정 (운영자 조회 전용) ────────────────────────────────────────────────
const memberListParams = {
  period_start: z.string().optional().describe("가입일 검색 시작 YYYY-MM-DD (기본 오늘)"),
  period_end: z.string().optional().describe("가입일 검색 종료 YYYY-MM-DD (기본 오늘)"),
  mid: z.string().optional().describe("회원번호(mid) 단건/콤마 복수"),
  uid: z.string().optional().describe("아이디 검색"),
  hp: z.string().optional().describe("휴대폰번호 검색"),
  level: z.number().int().optional().describe("회원등급으로 필터"),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  expand: z.string().optional().describe("origin(기본)/info/files 조합. 활동정보·파일까지 보려면 origin,info,files"),
};

crudTool(
  "members",
  "회원계정 조회(운영자, 조회 전용). action: list|get|dormant|dropout. " +
    "list/dormant(휴면 state=2)/dropout(탈퇴 state=3)는 가입일·아이디(uid)·휴대폰(hp)·등급(level) 필터(기본 expand=origin). " +
    "get 은 mid 단건으로 origin·info·files 반환. ⚠️PII(이름/연락처/이메일/주소/계좌)가 복호화되어 포함되니 취급에 주의.",
  {
    list: (p) => listMembers(p),
    get: ({ mid, expand }) => getMember(mid, expand || "origin,info,files"),
    dormant: (p) => listDormantMembers(p),
    dropout: (p) => listDropoutMembers(p),
  },
  { ...memberListParams }
);

// ── 회원등급 (운영자 CRUD) ─────────────────────────────────────────────────────
const levelDiscount = z.object({
  type: z.number().int().min(1).max(2).optional().describe("1=% 2=정액"),
  price: z.number().int().min(0).optional().describe("할인값(type=1이면 0~99)"),
  max: z.number().int().min(0).optional().describe("최대 할인액"),
}).optional();
const levelCoupon = z.array(z.object({
  id: z.number().int().describe("쿠폰 id"),
  quantity: z.number().int().min(0).optional().describe("지급 수량"),
})).max(4).optional().describe("등급 지급 쿠폰(최대 4)");

crudTool(
  "levels",
  "회원등급 관리(운영자). action: list|create|update|delete. " +
    "list 각 항목 level·title·discount·point·levelup·coupon·icon. " +
    "create 는 level(중복불가)·title(≤8자) 필수, discount/point/levelup/coupon/icon 선택. " +
    "update 는 id(등급번호)+바꿀 필드. 기본등급(<2)·관리자등급(>100)은 삭제 불가.",
  {
    list: ({ level, page, limit }) => listLevels({ level, page, limit }),
    create: ({ level, title, onoff, icon, levelup, discount, point, coupon }) =>
      createLevel({ level, title, onoff, icon, levelup, discount, point, coupon }),
    update: ({ id, title, onoff, icon, levelup, discount, point, coupon }) =>
      updateLevel(id, { title, onoff, icon, levelup, discount, point, coupon }),
    delete: ({ id }) => deleteLevel(id),
  },
  {
    level: z.union([z.number().int(), z.string()]).optional().describe("list=등급번호 필터(콤마 복수) / create=등급번호(중복불가)"),
    id: z.union([z.number().int(), z.string()]).optional().describe("(update/delete) 대상 등급번호"),
    title: z.string().optional().describe("(create/update) 등급명(최대 8자)"),
    onoff: z.number().int().min(0).max(1).optional().describe("1=사용"),
    icon: z.number().int().optional().describe("아이콘 id (icons ct=3)"),
    levelup: z.object({
      use: z.number().int().min(0).max(3).optional().describe("자동등업 조건 사용(0~3)"),
      order: z.number().int().min(0).optional().describe("주문 횟수 조건"),
      price: z.number().int().min(0).optional().describe("주문 금액 조건"),
    }).optional().describe("(create/update) 자동등업 조건"),
    discount: levelDiscount.describe("(create/update) 등급 할인 {type,price,max}"),
    point: levelDiscount.describe("(create/update) 등급 적립 {type,price,max}"),
    coupon: levelCoupon,
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
  }
);

// ── 쿠폰 설정 (운영자) ────────────────────────────────────────────────────────
crudTool(
  "coupons",
  "쿠폰 설정/디자인 관리(운영자). action: list|designs|create|update|delete. " +
    "list 항목 id·title·coupon_type·discount_type·할인값·사용조건. designs 는 쿠폰 디자인 목록(create 의 design_id). " +
    "create 필수: coupon_type(1=일반/2=상품/3=배송)·discount_type(0=배송비/1=정액/2=%)·discount_price(%면0)·discount_percent(정액이면0)·" +
    "use_type(1=발급후N일→use_day / 2=만료일→use_dt)·design_id. update 는 id+바꿀 필드.",
  {
    list: ({ period_start, period_end, id, title, page, limit }) => listCoupons({ period_start, period_end, id, title, page, limit }),
    designs: ({ id, title, page, limit }) => listCouponDesigns({ id, title, page, limit }),
    create: (b) => createCoupon(b),
    update: ({ id, ...b }) => updateCoupon(id, b),
    delete: ({ id }) => deleteCoupon(id),
  },
  {
    period_start: z.string().optional().describe("(list) 등록일 시작 YYYY-MM-DD"),
    period_end: z.string().optional().describe("(list) 등록일 종료 YYYY-MM-DD"),
    id: z.union([z.number().int(), z.string()]).optional().describe("쿠폰/디자인 id — list/designs 필터 / update·delete 대상"),
    title: z.string().optional().describe("list 제목검색 / create·update 쿠폰 제목"),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
    coupon_type: z.number().int().min(1).max(3).optional().describe("(create/update) 1=일반 2=상품할인 3=배송할인"),
    discount_type: z.number().int().min(0).max(2).optional().describe("(create/update) 0=배송비 1=정액 2=%"),
    discount_price: z.number().int().min(0).optional().describe("(create/update) 정액/배송 할인액(%면 0)"),
    discount_percent: z.number().int().min(0).max(99).optional().describe("(create/update) % 할인값(정액이면 0)"),
    use_type: z.number().int().min(1).max(2).optional().describe("(create/update) 1=발급후 N일 2=지정 만료일"),
    design_id: z.number().int().optional().describe("(create/update) 쿠폰 디자인 id (designs)"),
    use_day: z.number().int().min(0).max(999).optional().describe("use_type=1 사용가능 일수"),
    use_dt: z.string().optional().describe("use_type=2 만료일시 YYYY-MM-DDThh:mm:ss+09:00"),
    discount_terms_price: z.number().int().min(0).optional().describe("최소 주문금액"),
    discount_max_price: z.number().int().min(0).optional().describe("최대 할인액(%쿠폰)"),
    name: z.string().optional().describe("쿠폰명(내부)"),
    category: z.string().optional().describe("대상 카테고리 code"),
    level: z.number().int().optional().describe("대상 회원등급"),
    pincode: z.string().optional().describe("핀코드"),
    overlap: z.number().int().optional().describe("중복사용 0/1/7/30/999"),
    onoff: z.number().int().min(0).max(1).optional().describe("1=사용"),
    down_max: z.number().int().optional().describe("최대 다운로드 수"),
  }
);

// ── 쿠폰 발급 (운영자) ────────────────────────────────────────────────────────
crudTool(
  "coupon_issues",
  "쿠폰 발급 관리(운영자). action: list|issue|delete. list 는 쿠폰·회원·기간 필터(항목 id·coupon_id·mid·state·use_dt). " +
    "issue 는 1회 1명(coupon_id·mid·coupon_name(≤20자)·ct 필수; 여러 명은 반복 호출). delete 는 발급 id 회수.",
  {
    list: ({ period_start, period_end, id, coupon_id, mid, uid, page, limit }) =>
      listCouponIssues({ period_start, period_end, id, coupon_id, mid, uid, page, limit }),
    issue: ({ coupon_id, mid, coupon_name, ct }) => issueCoupon({ coupon_id, mid, coupon_name, ct }),
    delete: ({ id }) => deleteCouponIssue(id),
  },
  {
    period_start: z.string().optional().describe("(list) 발급일 시작 YYYY-MM-DD"),
    period_end: z.string().optional().describe("(list) 발급일 종료 YYYY-MM-DD"),
    id: z.union([z.number().int(), z.string()]).optional().describe("발급 id — list 필터 / delete 대상"),
    coupon_id: z.number().int().optional().describe("list 필터 / issue 발급할 쿠폰 id"),
    mid: z.number().int().optional().describe("list 필터 / issue 대상 회원번호"),
    uid: z.string().optional().describe("(list) 아이디 필터"),
    coupon_name: z.string().max(20).optional().describe("(issue) 발급 쿠폰명(최대 20자)"),
    ct: z.number().int().optional().describe("(issue) 발급 구분 코드"),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
  }
);

// ── 포인트 (운영자) ───────────────────────────────────────────────────────────
crudTool(
  "points",
  "포인트 관리(운영자). action: list|create|update|delete. list 는 회원·기간 필터(항목 id·mid·point·total_point·content·dt). " +
    "create 는 mid·point(**부호로 방향**: 양수=지급/음수=차감)·content 필수(처리자 자동). " +
    "update 는 사유(content)만 수정(금액 변경 불가). delete 시 누적 포인트도 조정.",
  {
    list: ({ period_start, period_end, mid, uid, page, limit }) => listPoints({ period_start, period_end, mid, uid, page, limit }),
    create: async ({ mid, point, content, ct }) => createPoint({ mid, point, content, ct: ct ?? 0, cre_mid: await operatorMid() }),
    update: ({ id, content }) => updatePoint(id, { content }),
    delete: ({ id }) => deletePoint(id),
  },
  {
    period_start: z.string().optional().describe("(list) 시작 YYYY-MM-DD"),
    period_end: z.string().optional().describe("(list) 종료 YYYY-MM-DD"),
    id: z.union([z.number().int(), z.string()]).optional().describe("포인트 내역 id — update·delete 대상"),
    mid: z.number().int().optional().describe("list 필터 / create 대상 회원번호"),
    uid: z.string().optional().describe("(list) 아이디 필터"),
    point: z.number().int().optional().describe("(create) 양수=지급, 음수=차감 (예: 1000 / -500)"),
    content: z.string().max(255).optional().describe("create/update 사유"),
    ct: z.number().int().min(0).max(5).optional().describe("(create) 포인트 구분 코드(0~5, 기본 0)"),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
  }
);

// ── 쇼핑몰 기본정보 (운영자) ──────────────────────────────────────────────────
crudTool(
  "shop_company",
  "쇼핑몰 기본정보(회사정보). action: get|update. get 은 상호·고객센터·운영시간·사업자정보·주소·개인정보보호책임자·AS 등 조회. " +
    "update 는 보낸 필드만 갱신(푸터 캐시 자동 갱신; 전화/팩스/사업자번호는 숫자만, 하이픈 자동 제거).",
  {
    get: () => getShopCompany(),
    update: (data) => updateShopCompany(data),
  },
  {
    title: z.string().optional().describe("상호(쇼핑몰명)"),
    service: z.string().optional().describe("고객센터 안내 문구"),
    email: z.string().optional().describe("대표 이메일"),
    tel: z.string().optional().describe("대표 전화(숫자)"),
    fax: z.string().optional().describe("팩스(숫자)"),
    worktime: z.string().optional().describe("운영시간 안내"),
    ceo: z.string().optional().describe("대표자명"),
    company: z.string().optional().describe("법인/회사명"),
    biznum: z.string().optional().describe("사업자등록번호(숫자, 최대 10)"),
    salenum: z.string().optional().describe("통신판매업 신고번호"),
    business: z.string().optional().describe("업태"),
    bizct: z.string().optional().describe("업종"),
    seller: z.number().int().min(0).max(3).optional().describe("통신판매업자 구분(0~3)"),
    zipcode: z.string().optional().describe("우편번호"),
    addr1: z.string().optional().describe("주소"),
    addr2: z.string().optional().describe("상세주소"),
    admcode: z.string().optional().describe("법정동코드"),
    pri_name: z.string().optional().describe("개인정보보호책임자명"),
    pri_email: z.string().optional().describe("개인정보보호책임자 이메일"),
    as_tel: z.string().optional().describe("AS 연락처"),
    as_url: z.string().optional().describe("AS 안내 URL"),
  }
);

// ── 통합 게시판 (board_type=1, 운영자) ────────────────────────────────────────
// 쇼핑몰 설정 board_type=1(통합 게시판)일 때 사용. 공지/1:1문의/FAQ/상품문의/구매후기가
// 단일 게시판으로 통합되어 board_type 코드(notice|qna|faq|inquiry|review)로 구분된다.
// (board_type=0 기본형이면 기존 개별 도구 — list_notices/list_faqs/list_reviews/문의 도구 — 를 쓴다.)
crudTool(
  "board",
  "통합 게시판(board_type=1) 관리(운영자). action: setup|list|get|create|update|delete|answer|delete_reply|upload. " +
    "⚠️board_type=0(기본형) 쇼핑몰이면 이 도구 대신 notices/faqs/reviews/product_inquiries/customer_inquiries 개별 도구를 쓴다. " +
    "setup(게시판 코드·카테고리 확인) → list(5개 게시판 통합, board_types/카테고리/별점/states 필터) → get(상세+댓글). " +
    "create/update 는 board_type·title·content·writer_name 등(후기는 score 1~5, 상품문의/후기는 products_id/product_id). " +
    "answer 는 article_id+content(운영자 자동 답변, state=2). delete_reply 는 reply_id. upload 는 files(로컬, 최대5)→items[].id 를 photo(콤마구분)로.",
  {
    setup: () => getBoardSetup(),
    list: ({ board_types, category, score, states, notice, best, keyword, q, period, period_start, period_end, order, page, limit }) =>
      listBoard({ board_types, category, score, states, notice, best, keyword, q, period, period_start, period_end, order, page, limit }),
    get: ({ id }) => getBoardPost(id),
    create: ({ board_type, title, content, writer_name, category, score, products_id, product_id, secret, notice, best, url, video_url, photo, uid, dt }) =>
      createBoardPost({ board_type, title, content, writer_name, category, score, products_id, product_id, secret, notice, best, url, video_url, photo, uid, dt }),
    update: ({ id, board_type, title, content, writer_name, category, score, products_id, product_id, secret, notice, best, url, video_url, photo, dt }) =>
      updateBoardPost(id, { board_type, title, content, writer_name, category, score, products_id, product_id, secret, notice, best, url, video_url, photo, dt }),
    delete: ({ id }) => deleteBoardPost(id),
    answer: ({ article_id, content, photo }) => replyBoardPost({ article_id, content, ...(photo ? { photo } : {}) }),
    delete_reply: ({ reply_id }) => deleteBoardReply(reply_id),
    upload: ({ files }) => uploadBoardFiles(files),
  },
  {
    id: z.union([z.number().int(), z.string()]).optional().describe("게시글 번호 — get/update/delete 대상"),
    board_type: z.enum(["notice", "qna", "faq", "inquiry", "review"]).optional().describe("(create/update) 게시판 코드"),
    board_types: z.string().optional().describe("(list) 게시판 코드 콤마구분(notice,qna,faq,inquiry,review)"),
    title: z.string().optional().describe("(create/update) 제목"),
    content: z.string().optional().describe("create/update 내용 / answer 답변 내용"),
    writer_name: z.string().optional().describe("(create/update) 작성자명"),
    category: z.string().optional().describe("list 필터 / create·update 카테고리(board_setup 참조)"),
    score: z.number().int().min(0).max(5).optional().describe("list 별점 필터 / create·update 별점(구매후기 1~5)"),
    states: z.string().optional().describe("(list) 답변상태 콤마구분(1=대기,2=완료,3=추가문의)"),
    notice: z.number().int().min(0).max(1).optional().describe("list=상단고정만 / create·update=1 상단고정"),
    best: z.number().int().min(0).max(1).optional().describe("list=베스트만 / create·update=1 베스트"),
    keyword: z.enum(["title", "content", "uid", "writer_name"]).optional().describe("(list) 검색 필드"),
    q: z.string().optional().describe("(list) 검색어(keyword 와 함께)"),
    period: z.enum(["dt", "update_dt"]).optional().describe("(list) 기간 기준(기본 dt)"),
    period_start: z.string().optional().describe("(list) YYYY-MM-DD"),
    period_end: z.string().optional().describe("(list) YYYY-MM-DD"),
    order: z.number().int().min(1).max(4).optional().describe("(list) 1=최신 2=오래된순 3=댓글많은순 4=조회순"),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
    products_id: z.number().int().optional().describe("(create/update) 상품 id(상품문의/후기)"),
    product_id: z.number().int().optional().describe("(create/update) 옵션 id(상품문의/후기)"),
    secret: z.number().int().min(0).max(1).optional().describe("(create/update) 1=비밀글"),
    url: z.string().optional().describe("(create/update) 외부 링크"),
    video_url: z.string().optional().describe("(create/update) 동영상 URL"),
    photo: z.string().optional().describe("create/update/answer 첨부 file id 콤마구분"),
    uid: z.string().optional().describe("(create) 작성자 아이디"),
    dt: z.string().optional().describe("(create/update) 작성일시 YYYY-MM-DD HH:MM:SS"),
    article_id: z.union([z.number().int(), z.string()]).optional().describe("(answer) 답변 달 게시글 번호"),
    reply_id: z.union([z.number().int(), z.string()]).optional().describe("(delete_reply) 답변(댓글) id"),
    files: z.array(z.string()).optional().describe("(upload) 로컬 파일 경로 목록(최대 5)"),
  }
);

// ── 개인결제(private_pay) (운영자) ───────────────────────────────────────────
// 관리자가 발급/관리하는 개인 결제창. 주문(dno)/반품(rno)/교환(eno)에 연계해 추가비용을 청구한다.
//  결제유형 ct: 1=주문관련 2=해외배송비 10/11=반품비용(선/후납) 20/21=교환비용(선/후납) 99=기타결제
//  결제상태 pay_state: 0=발급완료 1=입금대기 10=결제완료 90=취소접수 99=취소완료
//  결제수단 pay_method: 130=가상계좌·300=무통장(취소 시 계좌이체 환불) / 그 외 PG는 승인취소

crudTool(
  "private_pay",
  "개인결제(개인 결제창) 관리(운영자). action: list|get|create|update|delete|banking|cancel|receipt_issue|receipt_cancel|memo_list|memo_add|memo_delete|exchange_pay|refund_pay. " +
    "create 는 발급 즉시 안내 메시지 발송 + data·url 반환(사용자에게 url·금액 안내). 회원은 uid, 비회원은 name/hp/email. " +
    "update 는 발급완료(0)면 ct/price/dno/content/pg_id, 결제 후엔 무통장/환불계좌(pay_bank_*/refund_bank_*). " +
    "banking=무통장 입금확인(→10), cancel=취소(PG 승인취소/무통장). receipt_issue=현금영수증 발급(48h), receipt_cancel=취소(발행완료·1년내). " +
    "memo_list/memo_add(content)/memo_delete(memo_id). exchange_pay(eno,price)=교환 추가비용(ct=21), refund_pay(rno,price)=반품 추가비용(ct=11).",
  {
    list: ({ page, limit, period, period_start, period_end, pay_state, ct, name, email, hp, title, code, codes, order }) =>
      listPrivatePays({ page, limit, period, period_start, period_end, pay_state, ct, name, email, hp, title, code, codes, order }),
    get: ({ ppno }) => getPrivatePay(ppno),
    create: ({ ct, price, uid, name, hp, email, dno, rno, eno, content, pg_id }) =>
      createPrivatePay({ ct, price, uid, name, hp, email, dno, rno, eno, content, pg_id }),
    update: ({ ppno, ct, price, dno, content, pg_id, pay_bank_code, pay_bank_num, pay_bank_holder, pay_bank_name, refund_bank_code, refund_bank_num, refund_bank_holder, refund_bank_title }) =>
      updatePrivatePay(ppno, { ct, price, dno, content, pg_id, pay_bank_code, pay_bank_num, pay_bank_holder, pay_bank_name, refund_bank_code, refund_bank_num, refund_bank_holder, refund_bank_title }),
    delete: ({ ppno }) => deletePrivatePay(ppno),
    banking: ({ ppno, pay_bank_code, pay_bank_name }) => confirmPrivatePayBanking({ ppno, pay_bank_code, pay_bank_name }),
    cancel: ({ ppno }) => cancelPrivatePay({ ppno }),
    receipt_issue: ({ ppno, pay_receipt_type, pay_receipt_name, pay_receipt_num, pay_receipt_dt }) =>
      createPrivatePayReceipt({ ppno, pay_receipt_type, pay_receipt_name, pay_receipt_num, pay_receipt_dt }),
    receipt_cancel: ({ ppno }) => cancelPrivatePayReceipt(ppno),
    memo_list: ({ ppno }) => listPrivatePayMemos(ppno),
    memo_add: ({ ppno, content }) => createPrivatePayMemo({ ppno, content }),
    memo_delete: ({ memo_id }) => deletePrivatePayMemo(memo_id),
    exchange_pay: ({ eno, price, content }) => createExchangePrivatePay({ eno, price, content }),
    refund_pay: ({ rno, price, content }) => createRefundPrivatePay({ rno, price, content }),
  },
  {
    ppno: z.union([z.number().int(), z.string()]).optional().describe("결제창번호 — get/update/delete/banking/cancel/receipt_*/memo_* 대상"),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
    period: z.enum(["dt", "pay_dt", "can_dt"]).optional().describe("(list) dt=발급/pay_dt=결제/can_dt=취소"),
    period_start: z.string().optional().describe("(list) YYYY-MM-DD"),
    period_end: z.string().optional().describe("(list) YYYY-MM-DD"),
    pay_state: z.string().optional().describe("(list) 결제상태 콤마구분(0,1,10,90,99)"),
    ct: z.union([z.number().int(), z.string()]).optional().describe("list=유형 콤마필터 / create·update=결제유형(1=주문 2=해외배송비 10/11=반품 20/21=교환 99=기타)"),
    name: z.string().optional().describe("list 필터 / create 수신자명(비회원)"),
    email: z.string().optional().describe("list 필터 / create 수신자 이메일"),
    hp: z.string().optional().describe("list 필터 / create 수신자 휴대폰(숫자 10~11)"),
    title: z.string().optional().describe("(list) 결제명 부분검색"),
    code: z.enum(["ppno", "dno", "pay_no"]).optional().describe("(list) 번호검색 항목"),
    codes: z.string().optional().describe("(list) 번호검색 값(콤마/개행)"),
    order: z.enum(["1", "2", "3"]).optional().describe("(list) 1=발급최신 2=결제최신 3=취소최신"),
    price: z.union([z.number().int(), z.string()]).optional().describe("create/update/exchange_pay/refund_pay 금액(원, 0 초과)"),
    uid: z.string().optional().describe("(create) 회원 아이디(dno 와 함께면 주문자 검증)"),
    dno: z.union([z.number().int(), z.string()]).optional().describe("create/update 관련 주문번호(dno)"),
    rno: z.union([z.number().int(), z.string()]).optional().describe("create 반품번호 / refund_pay 대상 반품번호"),
    eno: z.union([z.number().int(), z.string()]).optional().describe("create 교환번호 / exchange_pay 대상 교환번호"),
    content: z.string().optional().describe("create/update 안내메시지 / memo_add 메모 / exchange·refund_pay 안내"),
    pg_id: z.number().int().optional().describe("create/update PG id(미지정 시 기본 PG)"),
    pay_bank_code: z.string().optional().describe("update/banking 입금은행 코드"),
    pay_bank_num: z.string().optional().describe("(update) 무통장 입금 계좌번호"),
    pay_bank_holder: z.string().optional().describe("(update) 무통장 입금 예금주"),
    pay_bank_name: z.string().optional().describe("update/banking 입금자명"),
    refund_bank_code: z.string().optional().describe("(update) 환불 은행 코드"),
    refund_bank_num: z.string().optional().describe("(update) 환불 계좌번호"),
    refund_bank_holder: z.string().optional().describe("(update) 환불 예금주"),
    refund_bank_title: z.string().optional().describe("(update) 환불 은행명"),
    pay_receipt_type: z.number().int().optional().describe("(receipt_issue) 1=소득공제 2=지출증빙"),
    pay_receipt_name: z.string().optional().describe("(receipt_issue) 대상 이름/명의"),
    pay_receipt_num: z.string().optional().describe("(receipt_issue) 휴대폰번호/사업자번호"),
    pay_receipt_dt: z.string().optional().describe("(receipt_issue) 거래일시 YYYY-MM-DD HH:MM:SS(48h 이내)"),
    memo_id: z.union([z.number().int(), z.string()]).optional().describe("(memo_delete) 메모 id"),
  }
);

// ── 현금영수증 관리(Cash) (운영자) ───────────────────────────────────────────
// 주문 결제(pno) 대상 현금영수증. (개인결제 결제창의 현금영수증은 create/cancel_private_pay_receipt 사용)
//  발행상태 pay_receipt_state: 1=신청안함 2=발행요청 3=발행완료 4=취소완료
//  용도구분 pay_receipt_type: 1=소득공제(휴대폰) 2=지출증빙(사업자) 3=세금계산서 4=자진발급

crudTool(
  "cash_receipts",
  "현금영수증 관리(주문 결제 pno 기준, 운영자). action: list|get|issue|cancel. " +
    "(개인결제 결제창 현금영수증은 private_pay 의 receipt_issue/receipt_cancel) " +
    "list 는 기간(dt/pay_dt/pay_receipt_dt, 기본 -30일)·발행상태(state 1~4)·주문상태(order_state)·수신자/번호 검색. " +
    "get 은 pno 발행정보+발행가능금액. issue 는 결제완료(pay_state=10)+48h 이내(type 1=소득공제/2=지출증빙). cancel 은 발행완료+1년 이내.",
  {
    list: ({ page, limit, period, period_start, period_end, state, order_state, pay_receipt_name, pay_receipt_num, name, email, code, codes }) =>
      listCashReceipts({ page, limit, period, period_start, period_end, state, order_state, pay_receipt_name, pay_receipt_num, name, email, code, codes }),
    get: ({ pno }) => getCashReceipt(pno),
    issue: ({ pno, pay_receipt_type, pay_receipt_name, pay_receipt_num, pay_receipt_dt }) =>
      issueCashReceipt({ pno, pay_receipt_type, pay_receipt_name, pay_receipt_num, pay_receipt_dt }),
    cancel: ({ pno }) => cancelCashReceipt(pno),
  },
  {
    pno: z.union([z.number().int(), z.string()]).optional().describe("결제번호 — get/issue/cancel 대상"),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
    period: z.enum(["dt", "pay_dt", "pay_receipt_dt"]).optional().describe("(list) dt=주문/pay_dt=결제/pay_receipt_dt=발행"),
    period_start: z.string().optional().describe("(list) YYYY-MM-DD(기본 -30일)"),
    period_end: z.string().optional().describe("(list) YYYY-MM-DD(기본 오늘)"),
    state: z.enum(["1", "2", "3", "4"]).optional().describe("(list) 발행상태 1=신청안함 2=발행요청 3=발행완료 4=취소완료"),
    order_state: z.enum(["pay", "cancel", "refund", "exchange"]).optional().describe("(list) 주문상태"),
    pay_receipt_name: z.string().optional().describe("list 필터 / issue 수신자명·사업자명"),
    pay_receipt_num: z.string().optional().describe("list 필터 / issue 휴대폰·사업자번호"),
    name: z.string().optional().describe("(list) 주문자명 필터"),
    email: z.string().optional().describe("(list) 주문자 이메일 필터"),
    code: z.enum(["pno", "dno", "pay_receipt_no"]).optional().describe("(list) 번호검색 항목"),
    codes: z.string().optional().describe("(list) 번호검색 값(콤마/개행)"),
    pay_receipt_type: z.number().int().optional().describe("(issue) 1=소득공제/휴대폰 2=지출증빙/사업자"),
    pay_receipt_dt: z.string().optional().describe("(issue) 발행일시 YYYY-MM-DD HH:MM:SS(48h 이내)"),
  }
);

  return server;
}

// ── stdio 엔트리 ─────────────────────────────────────────────────────────
// HTTP 게이트웨이 모드(PROSELL_MCP_HTTP=1)에서는 stdio 로 기동하지 않는다.
// 그 경우 이 모듈은 buildServer 만 export 하고 gateway.js 가 사용한다.
if (process.env.PROSELL_MCP_HTTP !== "1") {
  // 시작 시 PROSELL_SHOP 이 주어지면 저장(다음 실행부터 생략 가능)
  if (process.env.PROSELL_SHOP) {
    try { saveShop(process.env.PROSELL_SHOP); } catch {}
  }
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[prosell-mcp] started (stdio)\n");
}
