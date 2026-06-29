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
  getClaimShipping,
  getClaimReasons, updateClaimReasons,
  listCouriers, createCourier, updateCourier, deleteCourier,
  createProduct, updateProduct, deleteProduct, getProductOption, uploadProductImages,
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

const server = new McpServer({ name: "prosell-mcp", version: "0.11.0" });

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
    "비용(배송비/회수비/기타)을 청구·부담시키려면 ref_del_price/ref_ret_price/ref_deduct_price 를 넣는다. " +
    "★비용 부호 규칙: **음수=구매자 부담(환불액에서 차감), 0 이상=판매자 부담**. " +
    "판단 근거(구매자가 낸 배송비 등)는 list_refunds 의 paymentInfo(ref_delivery_price=구매자 결제 배송비, " +
    "ref_price=상품 환불액 등)로 확인하고, 판매자가 최종 결정한 금액을 넣는다.",
  {
    ono: z.union([z.number().int(), z.string()]).describe("주문서 유니크키(ono)"),
    items: claimItems.describe("반품할 상품 목록"),
    ref_ct: z.string().describe("반품 사유 — get_claim_reasons 의 refund 카테고리 중 선택"),
    ref_content: z.string().optional().describe("반품 상세 내용"),
    ref_del_price: z.number().int().optional().describe("상품 배송비용 — 음수=구매자 부담, 0이상=판매자 부담(무료배송 상품에 배송비 청구 시 입력)"),
    ref_ret_price: z.number().int().optional().describe("상품 회수비용 — 음수=구매자 부담, 0이상=판매자 부담"),
    ref_deduct_price: z.number().int().optional().describe("기타비용 — 음수=구매자 부담, 0이상=판매자 부담"),
  },
  async ({ ono, items, ref_ct, ref_content, ref_del_price, ref_ret_price, ref_deduct_price }) => {
    // 백엔드 규격: 사유는 refund 객체, 비용은 paymentInfo 객체로 중첩.
    const refund = { ref_ct };
    if (ref_content !== undefined) refund.ref_content = ref_content;
    const paymentInfo = {};
    if (ref_del_price !== undefined) paymentInfo.ref_del_price = ref_del_price;
    if (ref_ret_price !== undefined) paymentInfo.ref_ret_price = ref_ret_price;
    if (ref_deduct_price !== undefined) paymentInfo.ref_deduct_price = ref_deduct_price;
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
    "반품완료(ref_state=30) 처리 전, list_refunds 의 paymentInfo 로 구매자 결제 배송비 등을 확인하고 비용을 확정하라. " +
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
    addressInfo: z.record(z.any()).optional().describe("회수지·회수 운송장 등(ref_ret_parcel/ref_ret_num/ref_ret_zipcode/ref_ret_addr1...)"),
  },
  async ({ rno, addressInfo, ref_del_price, ref_ret_price, ref_deduct_price, ...refund }) => {
    try {
      // refund(사유/상태/이름) · paymentInfo(비용) · addressInfo(회수지) 로 분리 중첩
      const body = { refund };
      const paymentInfo = {};
      if (ref_del_price !== undefined) paymentInfo.ref_del_price = ref_del_price;
      if (ref_ret_price !== undefined) paymentInfo.ref_ret_price = ref_ret_price;
      if (ref_deduct_price !== undefined) paymentInfo.ref_deduct_price = ref_deduct_price;
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
    "교환 비용(구매자 청구)을 정하려면 exc_del_price/exc_ret_price/exc_deduct_price 를 넣는다. " +
    "★반품과 달리 교환 비용은 **0 이상 양수만**(구매자에게 청구·결제요청하는 금액, 음수 불가). " +
    "판단 근거는 list_exchanges 의 paymentInfo 로 확인한다.",
  {
    ono: z.union([z.number().int(), z.string()]).describe("주문서 유니크키(ono)"),
    items: claimItems.describe("교환할 상품 목록"),
    exc_ct: z.string().describe("교환 사유 — get_claim_reasons 의 exchange 카테고리 중 선택"),
    exc_content: z.string().optional().describe("교환 상세 내용"),
    exc_del_price: z.number().int().min(0).optional().describe("상품 배송비용 — 구매자 청구액(0 이상). 음수 불가"),
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
    "결제요청(exc_state=22) 전 list_exchanges 의 paymentInfo 로 금액을 확인·확정하라. 사유는 get_claim_reasons 의 exchange 중 선택.",
  {
    eno: z.union([z.number().int(), z.string()]).describe("교환번호(eno) — list_exchanges 의 exchange.eno"),
    exc_state: z.number().int().optional().describe("교환상태: 10=교환접수 20=회수중 21=검수중/수거완료 22=결제요청 29=재배송중 30=교환완료"),
    exc_ct: z.string().optional().describe("교환 사유(get_claim_reasons 의 exchange 중 선택)"),
    exc_content: z.string().optional().describe("교환 상세 내용"),
    exc_name: z.string().optional().describe("교환자명"),
    exc_request: z.string().optional().describe("요청사항"),
    exc_del_price: z.number().int().min(0).optional().describe("상품 배송비용 — 구매자 청구액(0 이상). 음수 불가"),
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

// ── 클레임 배송비 안내 ────────────────────────────────────────────────────
server.tool(
  "get_claim_shipping",
  "반품/교환 시 배송비 결정을 위한 안내 도구(운영자). 주문(ono)의 배송그룹별 '구매 시 배송비'를 요약한다: " +
    "paid_delivery_price(구매자가 결제한 배송비)·delivery_payment(선/착불)·free_threshold(무료배송 기준)·" +
    "delivery_cost(배송 원가). 이 값을 구매자에게 안내하고, 판매자가 왕복 배송비(보내는+회수)를 결정하라. " +
    "왕복은 보내는(출고)=ref_del_price/exc_del_price, 회수=ref_ret_price/exc_ret_price 로 나눠 입력한다 " +
    "(반품은 음수=구매자 부담, 교환은 0이상 양수=구매자 청구). 그 뒤 create/update_refund·exchange 로 반영.",
  {
    ono: z.union([z.number().int(), z.string()]).describe("주문서 유니크키(ono)"),
  },
  async ({ ono }) => {
    try { return ok(await getClaimShipping(ono)); } catch (e) { return fail(e.message); }
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

server.tool(
  "create_product",
  "상품을 등록한다(운영자). 본문은 섹션 객체로 구성한다: " +
    "origin(기본정보 — title 필수, option_type 필수(0=단일,1~3=옵션단계), category 등), " +
    "product(주문옵션 행 배열 — 옵션 조합별 price/quantity/code 등; 단일상품도 1행), " +
    "delivery(배송), request(요청사항), content(상세내용 — file_photo=대표이미지 id 등), benefit(혜택). " +
    "이미지는 먼저 upload_product_images 로 올려 받은 id 를 content.file_photo 등에 넣는다. " +
    "정확한 필드 스펙은 guide(prosell://guide/llms.txt)·openapi 의 상품 스키마를 참고하라.",
  {
    origin: looseObj().describe("기본정보 — title(필수), option_type(필수), category/onoff 등"),
    product: z.array(looseObj()).optional().describe("주문옵션 행 목록(옵션 조합별 가격/재고/코드). 단일상품도 최소 1행"),
    delivery: looseObj().optional().describe("배송정보"),
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
    "origin.option_type 는 함께 보내는 것이 안전하다. 옵션 행 변경은 product 배열로.",
  {
    id: z.union([z.number().int(), z.string()]).describe("상품 id"),
    origin: looseObj().optional(),
    product: z.array(looseObj()).optional(),
    delivery: looseObj().optional(),
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
  "upload_product_images",
  "상품 이미지를 업로드한다(운영자). 로컬 파일 경로(최대 10개)를 올려 file id 를 받는다. " +
    "받은 items[].id 를 create_product/update_product 의 content.file_photo(대표)·file_list·" +
    "file_gallery 또는 product[].photo 등 해당 field 에 넣어 상품과 연결한다.",
  {
    field: z.string().describe("대상 필드 — file_photo(대표) / file_list / file_gallery / photo / detail_photo / pc_description_photo / productsupload 등"),
    files: z.array(z.string()).min(1).max(10).describe("업로드할 로컬 이미지 파일 경로 목록"),
  },
  async ({ field, files }) => {
    try { return ok(await uploadProductImages(field, files)); } catch (e) { return fail(e.message); }
  }
);

// ── 카테고리 ────────────────────────────────────────────────────────────────
const listParams = {
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(1000).optional().describe("페이지당 건수(기본 10, 최대 1000)"),
  id: z.string().optional().describe("id 단건 또는 콤마 구분 복수"),
  title: z.string().optional().describe("이름 부분검색"),
};

server.tool(
  "list_categories",
  "상품 카테고리 목록을 조회한다. 응답 items[].origin.code 가 상품의 category 값으로 쓰인다.",
  { ...listParams, code: z.string().optional().describe("카테고리 코드로 필터"), order: z.number().int().min(0).max(2).optional().describe("0=등록역순 1=위치순 2=위치역순") },
  async (params) => { try { return ok(await listCategories(params)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "create_category",
  "상품 카테고리를 등록한다(운영자). origin.num(1~4 깊이)·origin.title 필수. " +
    "design 섹션으로 스킨/정렬 등 설정 가능(선택).",
  {
    origin: looseObj().describe("기본정보 — num(1~4 필수), title(필수), onoff/position/parent_id/title_s 등"),
    design: looseObj().optional().describe("디자인 — pc/m 스킨·정렬·필터 노출 등"),
  },
  async (body) => { try { return ok(await createCategory(body)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "update_category",
  "상품 카테고리를 수정한다(운영자). id 와 바꿀 섹션(origin/design)만 보낸다. num/parent_id 는 변경 불가.",
  {
    id: z.union([z.number().int(), z.string()]).describe("카테고리 id"),
    origin: looseObj().optional().describe("title/title_s/onoff/position/allitem 등"),
    design: looseObj().optional(),
  },
  async ({ id, ...body }) => { try { return ok(await updateCategory(id, body)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "delete_category",
  "상품 카테고리를 삭제한다(운영자).",
  { id: z.union([z.number().int(), z.string()]).describe("삭제할 카테고리 id") },
  async ({ id }) => { try { return ok(await deleteCategory(id)); } catch (e) { return fail(e.message); } }
);

// ── 공급자 ──────────────────────────────────────────────────────────────────
server.tool(
  "list_suppliers",
  "공급자(매입처) 목록을 조회한다. id 는 상품 origin.supplier 값으로 쓰인다(기본 1).",
  listParams,
  async (params) => { try { return ok(await listSuppliers(params)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "create_supplier",
  "공급자를 등록한다(운영자). 필수: title, uid, email, tel, warehouse_zipcode, warehouse_addr1, " +
    "return_zipcode, return_addr1. 그 외 배송/반품/해외 설정은 선택.",
  { body: looseObj().describe("공급자 정보 — 필수 필드(title/uid/email/tel/warehouse_zipcode/warehouse_addr1/return_zipcode/return_addr1) 포함") },
  async ({ body }) => { try { return ok(await createSupplier(body)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "update_supplier",
  "공급자 정보를 수정한다(운영자). id 와 바꿀 필드만 보낸다.",
  { id: z.union([z.number().int(), z.string()]).describe("공급자 id"), body: looseObj().describe("바꿀 필드") },
  async ({ id, body }) => { try { return ok(await updateSupplier(id, body)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "delete_supplier",
  "공급자를 삭제한다(운영자). 기본 공급자(id=1)는 삭제 불가.",
  { id: z.union([z.number().int(), z.string()]).describe("삭제할 공급자 id") },
  async ({ id }) => { try { return ok(await deleteSupplier(id)); } catch (e) { return fail(e.message); } }
);

// ── 브랜드 (+이미지) ─────────────────────────────────────────────────────────
server.tool(
  "list_brands",
  "브랜드 목록을 조회한다. id 는 상품 product[].brand 값으로 쓰인다. expand=images 로 이미지 포함.",
  { ...listParams, expand: z.string().optional().describe("images 지정 시 브랜드 이미지 포함") },
  async (params) => { try { return ok(await listBrands(params)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "create_brand",
  "브랜드를 등록한다(운영자). title 필수(중복 불가). 로고가 있으면 먼저 upload_brand_image 로 올려 " +
    "받은 id 를 image 에 넣는다.",
  {
    title: z.string().describe("브랜드명(필수, 중복 불가)"),
    image: z.number().int().optional().describe("브랜드 이미지 id(upload_brand_image 결과)"),
  },
  async (body) => { try { return ok(await createBrand(body)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "update_brand",
  "브랜드를 수정한다(운영자). id 와 바꿀 필드(title/image)만. 기본 브랜드(id<2)는 수정 불가.",
  {
    id: z.union([z.number().int(), z.string()]).describe("브랜드 id"),
    title: z.string().optional(),
    image: z.number().int().optional().describe("브랜드 이미지 id"),
  },
  async ({ id, ...body }) => { try { return ok(await updateBrand(id, body)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "delete_brand",
  "브랜드를 삭제한다(운영자). 기본 브랜드(id<2)는 삭제 불가.",
  { id: z.union([z.number().int(), z.string()]).describe("삭제할 브랜드 id") },
  async ({ id }) => { try { return ok(await deleteBrand(id)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "upload_brand_image",
  "브랜드 로고 이미지를 업로드한다(운영자). 로컬 파일 1개(JPEG/GIF/PNG). " +
    "응답 items[0].id 를 create_brand/update_brand 의 image 로 넣는다.",
  { file: z.string().describe("업로드할 로컬 이미지 파일 경로") },
  async ({ file }) => { try { return ok(await uploadBrandImage(file)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "delete_brand_image",
  "브랜드 이미지를 삭제한다(운영자).",
  { id: z.union([z.number().int(), z.string()]).describe("삭제할 브랜드 이미지 id") },
  async ({ id }) => { try { return ok(await deleteBrandImage(id)); } catch (e) { return fail(e.message); } }
);

// ── 추가주문옵션 ────────────────────────────────────────────────────────────
const addoptionItems = z.array(z.object({
  name: z.string().describe("옵션값 이름('|' 불가, 최대 200자)"),
  price: z.number().int().min(0).optional().describe("추가금액"),
})).optional();

server.tool(
  "list_addoptions",
  "추가주문옵션(상품에 덧붙이는 선택형 옵션) 목록을 조회한다. id 는 상품 origin.addoption 값으로 쓰인다.",
  listParams,
  async (params) => { try { return ok(await listAddoptions(params)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "create_addoption",
  "추가주문옵션을 등록한다(운영자). title 필수. options 로 옵션값(name/price) 목록을 넣는다.",
  {
    title: z.string().describe("추가옵션 제목(필수, 최대 50자)"),
    req_type: z.number().int().min(0).max(1).optional().describe("0=선택 1=필수"),
    options: addoptionItems.describe("옵션값 목록 [{name, price}]"),
  },
  async (body) => { try { return ok(await createAddoption(body)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "update_addoption",
  "추가주문옵션을 수정한다(운영자). id 와 바꿀 필드만. options 를 보내면 옵션값 전체 교체.",
  {
    id: z.union([z.number().int(), z.string()]).describe("추가옵션 id"),
    title: z.string().optional(),
    req_type: z.number().int().min(0).max(1).optional(),
    options: addoptionItems,
  },
  async ({ id, ...body }) => { try { return ok(await updateAddoption(id, body)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "delete_addoption",
  "추가주문옵션을 삭제한다(운영자).",
  { id: z.union([z.number().int(), z.string()]).describe("삭제할 추가옵션 id") },
  async ({ id }) => { try { return ok(await deleteAddoption(id)); } catch (e) { return fail(e.message); } }
);

// ── 필터 색상 ───────────────────────────────────────────────────────────────
server.tool(
  "list_colors",
  "필터(검색) 색상 목록을 조회한다. id 는 상품 product[].standard_color 값으로 쓰인다.",
  listParams,
  async (params) => { try { return ok(await listColors(params)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "create_colors",
  "필터 색상을 등록한다(운영자). 여러 개를 한 번에 등록. 각 항목은 {title, color(6자리 hex, # 제외)}.",
  {
    items: z.array(z.object({
      title: z.string().describe("색상명(최대 50자)"),
      color: z.string().regex(/^[0-9a-fA-F]{6}$/).describe("색상 hex 6자리(# 없이, 예: ff0000)"),
    })).min(1).describe("등록할 색상 목록"),
  },
  async ({ items }) => { try { return ok(await createColors(items)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "update_color",
  "필터 색상을 수정한다(운영자). id 와 바꿀 필드(title/color)만.",
  {
    id: z.union([z.number().int(), z.string()]).describe("색상 id"),
    title: z.string().optional(),
    color: z.string().regex(/^[0-9a-fA-F]{6}$/).optional().describe("hex 6자리(# 없이)"),
  },
  async ({ id, ...body }) => { try { return ok(await updateColor(id, body)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "delete_color",
  "필터 색상을 삭제한다(운영자).",
  { id: z.union([z.number().int(), z.string()]).describe("삭제할 색상 id") },
  async ({ id }) => { try { return ok(await deleteColor(id)); } catch (e) { return fail(e.message); } }
);

// ── 필터 사이즈 ─────────────────────────────────────────────────────────────
server.tool(
  "list_sizes",
  "필터(검색) 사이즈 목록을 조회한다. id 는 상품 product[].standard_size 값으로 쓰인다. ct(그룹) 필터 가능.",
  { ...listParams, ct: z.number().int().optional().describe("사이즈 그룹(카테고리) id 로 필터") },
  async (params) => { try { return ok(await listSizes(params)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "create_sizes",
  "필터 사이즈를 등록한다(운영자). 두 방식 중 하나: " +
    "(A) 새 그룹 — ct(새 그룹명) + items(사이즈명 배열), " +
    "(B) 기존 그룹에 추가 — group(기존 그룹 id) + items(사이즈명 배열).",
  {
    ct: z.string().optional().describe("(방식 A) 새 사이즈 그룹명"),
    group: z.number().int().optional().describe("(방식 B) 기존 그룹 id"),
    items: z.array(z.string()).min(1).describe("사이즈명 목록(각 최대 50자)"),
  },
  async (body) => { try { return ok(await createSizes(body)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "update_size",
  "필터 사이즈명을 수정한다(운영자). id 와 title 만(그룹 변경 불가).",
  {
    id: z.union([z.number().int(), z.string()]).describe("사이즈 id"),
    title: z.string().describe("바꿀 사이즈명(최대 50자)"),
  },
  async ({ id, title }) => { try { return ok(await updateSize(id, { title })); } catch (e) { return fail(e.message); } }
);

server.tool(
  "delete_size",
  "필터 사이즈를 삭제한다(운영자). 그룹의 마지막 사이즈를 지우면 그룹도 함께 삭제된다.",
  { id: z.union([z.number().int(), z.string()]).describe("삭제할 사이즈 id") },
  async ({ id }) => { try { return ok(await deleteSize(id)); } catch (e) { return fail(e.message); } }
);

// ── 아이콘 ──────────────────────────────────────────────────────────────────
server.tool(
  "list_icons",
  "상품 아이콘(NEW/BEST 등 라벨) 목록을 조회한다. id 는 상품 content.icon 값으로 쓰인다. ct(1~4) 필터 가능.",
  { ...listParams, ct: z.number().int().min(1).max(4).optional().describe("아이콘 분류(1~4)") },
  async (params) => { try { return ok(await listIcons(params)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "create_icon",
  "아이콘을 등록한다(운영자). ct(1~4)·title 필수, 이미지 파일 필수(JPEG/GIF/PNG). " +
    "title 은 최대 8자.",
  {
    ct: z.number().int().min(1).max(4).describe("아이콘 분류(1~4)"),
    title: z.string().describe("아이콘명(최대 8자)"),
    onoff: z.number().int().min(0).max(1).optional().describe("1=사용 0=미사용"),
    file: z.string().describe("아이콘 이미지 로컬 파일 경로(필수)"),
  },
  async ({ file, ...fields }) => { try { return ok(await createIcon(fields, file)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "update_icon",
  "아이콘을 수정한다(운영자). id 와 바꿀 필드(ct/title/onoff). 이미지를 바꾸려면 file 경로를 함께 보낸다(선택).",
  {
    id: z.union([z.number().int(), z.string()]).describe("아이콘 id"),
    ct: z.number().int().min(1).max(4).optional(),
    title: z.string().optional().describe("최대 8자"),
    onoff: z.number().int().min(0).max(1).optional(),
    file: z.string().optional().describe("교체할 이미지 로컬 파일 경로(선택)"),
  },
  async ({ id, file, ...fields }) => { try { return ok(await updateIcon(id, fields, file)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "delete_icon",
  "아이콘을 삭제한다(운영자). 상품/회원등급/게시판에서 사용 중이면 삭제 불가.",
  { id: z.union([z.number().int(), z.string()]).describe("삭제할 아이콘 id") },
  async ({ id }) => { try { return ok(await deleteIcon(id)); } catch (e) { return fail(e.message); } }
);

// ── 공통 템플릿(상세내용 서식) ────────────────────────────────────────────────
server.tool(
  "list_templates",
  "공통 템플릿(상세페이지 배송/교환·반품/AS 등 공통 영역 서식) 목록을 조회한다. " +
    "id 는 상품 content 의 delivery_template/return_template/as_template 등에 쓰인다.",
  listParams,
  async (params) => { try { return ok(await listTemplates(params)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "create_template",
  "공통 템플릿을 등록한다(운영자). device(1=PC 2=모바일)·ct(영역: 202/203/204/206/1)·" +
    "pc_mode·m_mode(1/2)·title·pc_content·m_content.",
  {
    device: z.number().int().describe("1=PC 2=모바일"),
    ct: z.number().int().describe("영역 코드(202/203/204/206/1)"),
    pc_mode: z.number().int().describe("PC 모드(1/2)"),
    m_mode: z.number().int().describe("모바일 모드(1/2)"),
    title: z.string().describe("템플릿명(최대 100자)"),
    pc_content: z.string().describe("PC 내용(HTML)"),
    m_content: z.string().describe("모바일 내용(HTML)"),
  },
  async (body) => { try { return ok(await createTemplate(body)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "update_template",
  "공통 템플릿을 수정한다(운영자). id 와 바꿀 필드만.",
  {
    id: z.union([z.number().int(), z.string()]).describe("템플릿 id"),
    device: z.number().int().optional(),
    ct: z.number().int().optional(),
    pc_mode: z.number().int().optional(),
    m_mode: z.number().int().optional(),
    title: z.string().optional(),
    pc_content: z.string().optional(),
    m_content: z.string().optional(),
  },
  async ({ id, ...body }) => { try { return ok(await updateTemplate(id, body)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "delete_template",
  "공통 템플릿을 삭제한다(운영자).",
  { id: z.union([z.number().int(), z.string()]).describe("삭제할 템플릿 id") },
  async ({ id }) => { try { return ok(await deleteTemplate(id)); } catch (e) { return fail(e.message); } }
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
// 운영자(admin) 토큰은 전체 문의를 조회하고, update 로 답변(reply_content)을 등록한다.
server.tool(
  "list_product_inquiries",
  "상품문의 목록을 조회한다(운영자). 답변 대기/완료를 함께 본다. 각 항목: id(문의번호)·product_id(상품)·" +
    "title·content·secret(비밀글)·reply_content(답변)·reply_dt(답변일). 답변이 비어 있으면 미답변.",
  {
    period_start: z.string().optional().describe("검색 시작일 YYYY-MM-DD (기본 오늘)"),
    period_end: z.string().optional().describe("검색 종료일 YYYY-MM-DD (기본 오늘)"),
    id: z.string().optional().describe("문의번호(id) 단건/콤마 복수"),
    title: z.string().optional().describe("제목 부분검색"),
    mid: z.number().int().optional().describe("작성 회원번호로 필터"),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
  },
  async (params) => { try { return ok(await listProductInquiries(params)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "answer_product_inquiry",
  "상품문의에 답변을 등록/수정한다(운영자). 문의번호(id)와 답변 내용(reply_content)을 보내면 " +
    "로그인한 운영자를 답변자로 자동 등록한다. 문의 원문(title/content/secret) 수정도 가능(보통 불필요).",
  {
    id: z.union([z.number().int(), z.string()]).describe("상품문의 번호(list_product_inquiries 의 id)"),
    reply_content: z.string().optional().describe("답변 내용(작성 시 운영자를 답변자로 자동 등록)"),
    reply_mid: z.number().int().optional().describe("답변자 회원번호 — 생략 시 로그인 운영자 본인(관리자 등급이어야 함)"),
    title: z.string().optional().describe("문의 제목 수정"),
    content: z.string().optional().describe("문의 본문 수정"),
    secret: z.number().int().min(0).max(1).optional().describe("비밀글 여부 0/1"),
  },
  async ({ id, reply_content, reply_mid, ...rest }) => {
    try {
      const body = {};
      if (reply_content !== undefined) {
        body.reply_mid = reply_mid ?? (await operatorMid());
        body.reply_content = reply_content;
      } else if (reply_mid !== undefined) {
        body.reply_mid = reply_mid;
      }
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) body[k] = v;
      return ok(await updateProductInquiry(id, body));
    } catch (e) { return fail(e.message); }
  }
);

server.tool(
  "create_product_inquiry",
  "상품문의를 등록한다(운영자 작성). 회원으로 등록되며 product_id·title·content 필수. " +
    "(고객 셀프 문의는 스토어프론트에서 처리; 이 도구는 운영자 대리등록용)",
  {
    product_id: z.union([z.number().int(), z.string()]).describe("상품 id"),
    title: z.string().describe("제목"),
    content: z.string().describe("내용"),
    secret: z.number().int().min(0).max(1).optional().describe("비밀글 0/1"),
  },
  async (body) => { try { return ok(await createProductInquiry(body)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "delete_product_inquiry",
  "상품문의를 삭제한다(운영자).",
  { id: z.union([z.number().int(), z.string()]).describe("삭제할 상품문의 번호") },
  async ({ id }) => { try { return ok(await deleteProductInquiry(id)); } catch (e) { return fail(e.message); } }
);

// ── 고객문의 (운영자) ────────────────────────────────────────────────────────
server.tool(
  "list_customer_inquiries",
  "고객문의(1:1 문의) 목록을 조회한다(운영자). 각 항목: id·category(분류)·title·content·" +
    "reply_content(답변)·files(첨부). 답변이 비어 있으면 미답변.",
  {
    period_start: z.string().optional().describe("검색 시작일 YYYY-MM-DD (기본 오늘)"),
    period_end: z.string().optional().describe("검색 종료일 YYYY-MM-DD (기본 오늘)"),
    id: z.string().optional().describe("문의번호(id) 단건/콤마 복수"),
    title: z.string().optional().describe("제목 부분검색"),
    mid: z.number().int().optional().describe("작성 회원번호로 필터"),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
  },
  async (params) => { try { return ok(await listCustomerInquiries(params)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "answer_customer_inquiry",
  "고객문의에 답변을 등록/수정한다(운영자). 문의번호(id)와 답변 내용(reply_content)을 보내면 " +
    "로그인한 운영자를 답변자로 자동 등록한다. 문의 원문(category/title/content/editor/files) 수정도 가능.",
  {
    id: z.union([z.number().int(), z.string()]).describe("고객문의 번호(list_customer_inquiries 의 id)"),
    reply_content: z.string().optional().describe("답변 내용(작성 시 운영자를 답변자로 자동 등록)"),
    reply_mid: z.number().int().optional().describe("답변자 회원번호 — 생략 시 로그인 운영자 본인"),
    category: z.string().optional().describe("문의 분류 수정"),
    title: z.string().optional(),
    content: z.string().optional(),
    editor: z.number().int().min(0).max(1).optional().describe("0=텍스트 1=HTML"),
    files: z.array(z.number().int()).optional().describe("첨부 file id 목록(upload_customer_inquiry_files 결과)"),
  },
  async ({ id, reply_content, reply_mid, ...rest }) => {
    try {
      const body = {};
      if (reply_content !== undefined) {
        body.reply_mid = reply_mid ?? (await operatorMid());
        body.reply_content = reply_content;
      } else if (reply_mid !== undefined) {
        body.reply_mid = reply_mid;
      }
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) body[k] = v;
      return ok(await updateCustomerInquiry(id, body));
    } catch (e) { return fail(e.message); }
  }
);

server.tool(
  "create_customer_inquiry",
  "고객문의를 등록한다(운영자 작성, 회원 전용). item_type(0=일반,1=주문상품,2=장바구니,3=보관,4=최근)·" +
    "category·title·content 필수. 첨부는 먼저 upload_customer_inquiry_files 로 올려 files 에 id 를 넣는다. " +
    "분류(category) 선택지는 customer_inquiry_setup 에서 확인.",
  {
    item_type: z.number().int().min(0).max(4).describe("0=일반 1=주문상품 2=장바구니 3=보관 4=최근"),
    category: z.string().describe("문의 분류"),
    title: z.string().describe("제목"),
    content: z.string().describe("내용"),
    item_ids: z.string().optional().describe("연관 항목 id 콤마구분(item_type 1~4)"),
    editor: z.number().int().min(0).max(1).optional().describe("0=텍스트 1=HTML"),
    files: z.array(z.number().int()).optional().describe("첨부 file id 목록"),
  },
  async (body) => { try { return ok(await createCustomerInquiry(body)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "delete_customer_inquiry",
  "고객문의를 삭제한다(운영자). 첨부파일도 함께 비활성화된다.",
  { id: z.union([z.number().int(), z.string()]).describe("삭제할 고객문의 번호") },
  async ({ id }) => { try { return ok(await deleteCustomerInquiry(id)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "customer_inquiry_setup",
  "고객문의 설정을 조회한다(운영자). 분류(categories) 목록과 첨부 제한(uploadCount/uploadSize)을 반환. " +
    "create_customer_inquiry 의 category 는 여기 categories 중에서 고른다.",
  {},
  async () => { try { return ok(await getCustomerInquirySetup()); } catch (e) { return fail(e.message); } }
);

server.tool(
  "upload_customer_inquiry_files",
  "고객문의 첨부파일을 업로드한다(운영자). 로컬 파일(최대 3). 응답 items[].id 를 " +
    "create_customer_inquiry/answer_customer_inquiry 의 files 에 넣는다.",
  { files: z.array(z.string()).min(1).max(3).describe("업로드할 로컬 파일 경로 목록(최대 3)") },
  async ({ files }) => { try { return ok(await uploadCustomerInquiryFiles(files)); } catch (e) { return fail(e.message); } }
);

// ── 상품평(리뷰) (운영자) ─────────────────────────────────────────────────────
server.tool(
  "list_reviews",
  "상품평(리뷰) 목록을 조회한다(운영자). 각 항목: id·product_id(상품)·score(별점 1~5)·content·" +
    "best(베스트)·files(사진)·reply_content(운영자 답변)·reply_dt. 답변이 비어 있으면 미답변. " +
    "별점·사진여부·상품으로 필터 가능.",
  {
    period_start: z.string().optional().describe("검색 시작일 YYYY-MM-DD (기본 오늘)"),
    period_end: z.string().optional().describe("검색 종료일 YYYY-MM-DD (기본 오늘)"),
    id: z.string().optional().describe("리뷰번호(id) 단건/콤마 복수"),
    product_id: z.number().int().optional().describe("상품 id 로 필터"),
    prno: z.number().int().optional().describe("상품주문번호(prno)로 필터"),
    mid: z.number().int().optional().describe("작성 회원번호로 필터"),
    score: z.number().int().min(1).max(5).optional().describe("별점(1~5)으로 필터"),
    photo: z.number().int().min(0).max(1).optional().describe("1=사진 리뷰만, 0=사진 없는 것"),
    best: z.number().int().min(0).max(1).optional().describe("1=베스트 리뷰만"),
    content: z.string().optional().describe("내용 부분검색"),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
  },
  async (params) => { try { return ok(await listReviews(params)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "answer_review",
  "상품평에 답변(댓글)을 등록/수정한다(운영자). 리뷰번호(id)와 답변 내용(reply_content)을 보내면 " +
    "로그인한 운영자를 답변자로 자동 등록한다. 리뷰 원문(content/score/files)·베스트 지정(best) 수정도 가능.",
  {
    id: z.union([z.number().int(), z.string()]).describe("상품평 번호(list_reviews 의 id)"),
    reply_content: z.string().optional().describe("답변(댓글) 내용(작성 시 운영자를 답변자로 자동 등록)"),
    reply_mid: z.number().int().optional().describe("답변자 회원번호 — 생략 시 로그인 운영자 본인"),
    content: z.string().optional().describe("리뷰 본문 수정"),
    score: z.number().int().min(1).max(5).optional().describe("별점 수정(1~5)"),
    best: z.number().int().min(0).max(1).optional().describe("베스트 리뷰 지정 1/0"),
    files: z.array(z.number().int()).optional().describe("첨부 file id 목록(upload_review_files 결과)"),
  },
  async ({ id, reply_content, reply_mid, ...rest }) => {
    try {
      const body = {};
      if (reply_content !== undefined) {
        body.reply_mid = reply_mid ?? (await operatorMid());
        body.reply_content = reply_content;
      } else if (reply_mid !== undefined) {
        body.reply_mid = reply_mid;
      }
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) body[k] = v;
      return ok(await updateReview(id, body));
    } catch (e) { return fail(e.message); }
  }
);

server.tool(
  "create_review",
  "상품평을 등록한다(운영자 작성, 회원). 상품주문번호(prno)·content·score(1~5) 필수. " +
    "첨부는 먼저 upload_review_files 로 올려 files 에 id 를 넣는다. " +
    "(고객 셀프 리뷰는 스토어프론트에서 처리; 이 도구는 운영자 대리등록용)",
  {
    prno: z.union([z.number().int(), z.string()]).describe("상품주문번호(prno) — 구매한 상품주문"),
    content: z.string().describe("리뷰 내용"),
    score: z.number().int().min(1).max(5).describe("별점(1~5)"),
    files: z.array(z.number().int()).optional().describe("첨부 file id 목록(최대 5)"),
  },
  async (body) => { try { return ok(await createReview(body)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "delete_review",
  "상품평을 삭제한다(운영자).",
  { id: z.union([z.number().int(), z.string()]).describe("삭제할 상품평 번호") },
  async ({ id }) => { try { return ok(await deleteReview(id)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "review_setup",
  "상품평 설정을 조회한다(운영자). 적립 포인트(point_basic/point_photo)·작성가능 기간(review_day)·" +
    "별점 감정표현(emotion) 등을 반환.",
  {},
  async () => { try { return ok(await getReviewSetup()); } catch (e) { return fail(e.message); } }
);

server.tool(
  "upload_review_files",
  "상품평 첨부파일(사진)을 업로드한다(운영자). 로컬 파일(최대 5). 응답 items[].id 를 " +
    "create_review/answer_review 의 files 에 넣는다.",
  { files: z.array(z.string()).min(1).max(5).describe("업로드할 로컬 파일 경로 목록(최대 5)") },
  async ({ files }) => { try { return ok(await uploadReviewFiles(files)); } catch (e) { return fail(e.message); } }
);

// ── 공지사항 (운영자) ────────────────────────────────────────────────────────
server.tool(
  "list_notices",
  "공지사항 목록을 조회한다. 각 항목: id·category(분류)·title·content·dt·views(조회수)·files. " +
    "응답 fixeds 는 상단고정된 공지 id 목록.",
  {
    period_start: z.string().optional().describe("검색 시작일 YYYY-MM-DD (기본 오늘)"),
    period_end: z.string().optional().describe("검색 종료일 YYYY-MM-DD (기본 오늘)"),
    id: z.string().optional().describe("공지 id 단건/콤마 복수"),
    title: z.string().optional().describe("제목 부분검색"),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
  },
  async (params) => { try { return ok(await listNotices(params)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "create_notice",
  "공지사항을 등록한다(운영자). category·title·content 필수. 작성자는 로그인 운영자로 자동 등록. " +
    "fixed=1 이면 상단고정. 첨부는 먼저 upload_notice_files 로 올려 files 에 id 를 넣는다. " +
    "분류(category)는 notice_setup 에서 확인.",
  {
    category: z.string().describe("분류(notice_setup 의 categories 중 선택)"),
    title: z.string().describe("제목"),
    content: z.string().describe("내용(HTML 가능)"),
    fixed: z.number().int().min(0).max(1).optional().describe("1=상단고정"),
    files: z.array(z.number().int()).optional().describe("첨부 file id 목록(최대 3)"),
  },
  async ({ ...body }) => {
    try {
      body.mid = await operatorMid();
      return ok(await createNotice(body));
    } catch (e) { return fail(e.message); }
  }
);

server.tool(
  "update_notice",
  "공지사항을 수정한다(운영자). id 와 바꿀 필드만(category/title/content/fixed/files).",
  {
    id: z.union([z.number().int(), z.string()]).describe("공지 id"),
    category: z.string().optional(),
    title: z.string().optional(),
    content: z.string().optional(),
    fixed: z.number().int().min(0).max(1).optional().describe("1=상단고정"),
    files: z.array(z.number().int()).optional().describe("첨부 file id 목록"),
  },
  async ({ id, ...body }) => { try { return ok(await updateNotice(id, body)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "delete_notice",
  "공지사항을 삭제한다(운영자).",
  { id: z.union([z.number().int(), z.string()]).describe("삭제할 공지 id") },
  async ({ id }) => { try { return ok(await deleteNotice(id)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "notice_setup",
  "공지사항 설정을 조회한다(운영자). 분류(categories)·첨부 제한(uploadCount/uploadSize) 반환.",
  {},
  async () => { try { return ok(await getNoticeSetup()); } catch (e) { return fail(e.message); } }
);

server.tool(
  "upload_notice_files",
  "공지사항 첨부파일을 업로드한다(운영자). 로컬 파일(최대 3). items[].id 를 create_notice/update_notice 의 files 로.",
  { files: z.array(z.string()).min(1).max(3).describe("업로드할 로컬 파일 경로 목록(최대 3)") },
  async ({ files }) => { try { return ok(await uploadNoticeFiles(files)); } catch (e) { return fail(e.message); } }
);

// ── 자주묻는 질문(FAQ) (운영자) ───────────────────────────────────────────────
server.tool(
  "list_faqs",
  "FAQ(자주묻는 질문) 목록을 조회한다. 각 항목: id·category(분류)·title·content·views·files.",
  {
    period_start: z.string().optional().describe("검색 시작일 YYYY-MM-DD (기본 오늘)"),
    period_end: z.string().optional().describe("검색 종료일 YYYY-MM-DD (기본 오늘)"),
    id: z.string().optional().describe("FAQ id 단건/콤마 복수"),
    title: z.string().optional().describe("제목 부분검색"),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
  },
  async (params) => { try { return ok(await listFaqs(params)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "create_faq",
  "FAQ를 등록한다(운영자). category·title·content 필수. 작성자는 로그인 운영자로 자동 등록. " +
    "첨부는 먼저 upload_faq_files 로 올려 files 에 id 를 넣는다. 분류(category)는 faq_setup 에서 확인.",
  {
    category: z.string().describe("분류(faq_setup 의 categories 중 선택)"),
    title: z.string().describe("질문 제목"),
    content: z.string().describe("답변 내용(HTML 가능)"),
    files: z.array(z.number().int()).optional().describe("첨부 file id 목록(최대 3)"),
  },
  async ({ ...body }) => {
    try {
      body.mid = await operatorMid();
      return ok(await createFaq(body));
    } catch (e) { return fail(e.message); }
  }
);

server.tool(
  "update_faq",
  "FAQ를 수정한다(운영자). id 와 바꿀 필드만(category/title/content/files).",
  {
    id: z.union([z.number().int(), z.string()]).describe("FAQ id"),
    category: z.string().optional(),
    title: z.string().optional(),
    content: z.string().optional(),
    files: z.array(z.number().int()).optional().describe("첨부 file id 목록"),
  },
  async ({ id, ...body }) => { try { return ok(await updateFaq(id, body)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "delete_faq",
  "FAQ를 삭제한다(운영자).",
  { id: z.union([z.number().int(), z.string()]).describe("삭제할 FAQ id") },
  async ({ id }) => { try { return ok(await deleteFaq(id)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "faq_setup",
  "FAQ 설정을 조회한다(운영자). 분류(categories)·첨부 제한(uploadCount/uploadSize) 반환.",
  {},
  async () => { try { return ok(await getFaqSetup()); } catch (e) { return fail(e.message); } }
);

server.tool(
  "upload_faq_files",
  "FAQ 첨부파일을 업로드한다(운영자). 로컬 파일(최대 3). items[].id 를 create_faq/update_faq 의 files 로.",
  { files: z.array(z.string()).min(1).max(3).describe("업로드할 로컬 파일 경로 목록(최대 3)") },
  async ({ files }) => { try { return ok(await uploadFaqFiles(files)); } catch (e) { return fail(e.message); } }
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

server.tool(
  "list_members",
  "회원 목록을 조회한다(운영자). 가입일·아이디·휴대폰·등급으로 필터. 기본 expand=origin(기본정보). " +
    "활동정보(주문수·포인트 등)·파일까지 보려면 expand=origin,info,files. " +
    "⚠️ 응답에는 이름·연락처·이메일·주소·계좌 등 개인정보(PII)가 포함되니 취급에 주의하라.",
  memberListParams,
  async (params) => { try { return ok(await listMembers(params)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "get_member",
  "회원 상세를 조회한다(운영자). 회원번호(mid)로 origin(기본정보)·info(활동정보)·files(파일)를 반환. " +
    "⚠️ 개인정보(PII: 이름/연락처/이메일/주소/계좌)가 복호화되어 포함되니 취급에 주의하라.",
  {
    mid: z.union([z.number().int(), z.string()]).describe("회원번호(mid)"),
    expand: z.string().optional().describe("기본: origin,info,files"),
  },
  async ({ mid, expand }) => { try { return ok(await getMember(mid, expand || "origin,info,files")); } catch (e) { return fail(e.message); } }
);

server.tool(
  "list_dormant_members",
  "휴면회원 목록을 조회한다(운영자). 필터는 list_members 와 동일. (state=2 휴면 계정)",
  memberListParams,
  async (params) => { try { return ok(await listDormantMembers(params)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "list_dropout_members",
  "탈퇴회원 목록을 조회한다(운영자). 필터는 list_members 와 동일. (state=3 탈퇴 계정)",
  memberListParams,
  async (params) => { try { return ok(await listDropoutMembers(params)); } catch (e) { return fail(e.message); } }
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

server.tool(
  "list_levels",
  "회원등급 목록을 조회한다(운영자). 각 항목: level(등급번호)·title·discount(등급할인)·point(적립)·" +
    "levelup(자동등업 조건)·coupon(지급쿠폰)·icon.",
  {
    level: z.string().optional().describe("등급번호 단건/콤마 복수로 필터"),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
  },
  async (params) => { try { return ok(await listLevels(params)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "create_level",
  "회원등급을 등록한다(운영자). level(등급번호, 중복불가)·title(최대 8자) 필수. " +
    "discount(등급할인)·point(적립)·levelup(자동등업)·coupon(지급쿠폰)은 선택. icon 은 아이콘 id(ct=3).",
  {
    level: z.number().int().describe("등급번호(중복 불가)"),
    title: z.string().describe("등급명(최대 8자)"),
    onoff: z.number().int().min(0).max(1).optional().describe("1=사용"),
    icon: z.number().int().optional().describe("아이콘 id (list_icons, ct=3)"),
    levelup: z.object({
      use: z.number().int().min(0).max(3).optional().describe("자동등업 조건 사용(0~3)"),
      order: z.number().int().min(0).optional().describe("주문 횟수 조건"),
      price: z.number().int().min(0).optional().describe("주문 금액 조건"),
    }).optional(),
    discount: levelDiscount.describe("등급 할인 {type,price,max}"),
    point: levelDiscount.describe("등급 적립 {type,price,max}"),
    coupon: levelCoupon,
  },
  async (body) => { try { return ok(await createLevel(body)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "update_level",
  "회원등급을 수정한다(운영자). id(등급번호)와 바꿀 필드만(create_level 과 같은 구조).",
  {
    id: z.union([z.number().int(), z.string()]).describe("수정할 등급번호"),
    title: z.string().optional().describe("등급명(최대 8자)"),
    onoff: z.number().int().min(0).max(1).optional(),
    icon: z.number().int().optional(),
    levelup: z.object({
      use: z.number().int().min(0).max(3).optional(),
      order: z.number().int().min(0).optional(),
      price: z.number().int().min(0).optional(),
    }).optional(),
    discount: levelDiscount,
    point: levelDiscount,
    coupon: levelCoupon,
  },
  async ({ id, ...body }) => { try { return ok(await updateLevel(id, body)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "delete_level",
  "회원등급을 삭제한다(운영자). 기본등급(<2)·관리자등급(>100)은 삭제 불가.",
  { id: z.union([z.number().int(), z.string()]).describe("삭제할 등급번호") },
  async ({ id }) => { try { return ok(await deleteLevel(id)); } catch (e) { return fail(e.message); } }
);

// ── 쿠폰 설정 (운영자) ────────────────────────────────────────────────────────
server.tool(
  "list_coupons",
  "쿠폰(설정/템플릿) 목록을 조회한다(운영자). 각 항목: id·title·coupon_type·discount_type·할인값·" +
    "사용조건·발급/사용 수량 등. 발급 시 이 쿠폰 id 를 쓴다.",
  {
    period_start: z.string().optional().describe("등록일 검색 시작 YYYY-MM-DD (기본 오늘)"),
    period_end: z.string().optional().describe("등록일 검색 종료 YYYY-MM-DD (기본 오늘)"),
    id: z.string().optional().describe("쿠폰 id 단건/콤마 복수"),
    title: z.string().optional().describe("제목 부분검색"),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
  },
  async (params) => { try { return ok(await listCoupons(params)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "list_coupon_designs",
  "쿠폰 디자인 목록을 조회한다(운영자). create_coupon 의 design_id 는 여기 id 에서 고른다.",
  {
    id: z.string().optional().describe("디자인 id 단건/콤마 복수"),
    title: z.string().optional(),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
  },
  async (params) => { try { return ok(await listCouponDesigns(params)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "create_coupon",
  "쿠폰을 등록한다(운영자). 필수: coupon_type(1=일반,2=상품할인,3=배송할인)·discount_type(0=배송비,1=정액,2=%)·" +
    "discount_price(정액/배송 할인액; %면 0)·discount_percent(%값 0~99; 정액이면 0)·use_type(1=발급후N일,2=지정만료일)·" +
    "design_id(list_coupon_designs). use_type=1 이면 use_day, use_type=2 이면 use_dt(YYYY-MM-DDThh:mm:ss+09:00) 필요. " +
    "discount_terms_price(최소주문액)·discount_max_price(최대할인)·level(대상등급)·pincode 등은 선택.",
  {
    coupon_type: z.number().int().min(1).max(3).describe("1=일반 2=상품할인 3=배송할인"),
    discount_type: z.number().int().min(0).max(2).describe("0=배송비 1=정액 2=퍼센트"),
    discount_price: z.number().int().min(0).describe("정액/배송 할인액(%면 0)"),
    discount_percent: z.number().int().min(0).max(99).describe("% 할인값(정액이면 0)"),
    use_type: z.number().int().min(1).max(2).describe("1=발급후 N일 2=지정 만료일"),
    design_id: z.number().int().describe("쿠폰 디자인 id (list_coupon_designs)"),
    use_day: z.number().int().min(0).max(999).optional().describe("use_type=1: 사용가능 일수"),
    use_dt: z.string().optional().describe("use_type=2: 만료일시 YYYY-MM-DDThh:mm:ss+09:00"),
    discount_terms_price: z.number().int().min(0).optional().describe("최소 주문금액"),
    discount_max_price: z.number().int().min(0).optional().describe("최대 할인액(%쿠폰)"),
    name: z.string().optional().describe("쿠폰명(내부)"),
    title: z.string().optional().describe("쿠폰 제목"),
    category: z.string().optional().describe("대상 카테고리 code"),
    level: z.number().int().optional().describe("대상 회원등급"),
    pincode: z.string().optional().describe("핀코드"),
    overlap: z.number().int().optional().describe("중복사용 0/1/7/30/999"),
    onoff: z.number().int().min(0).max(1).optional().describe("1=사용"),
    down_max: z.number().int().optional().describe("최대 다운로드 수"),
  },
  async (body) => { try { return ok(await createCoupon(body)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "update_coupon",
  "쿠폰을 수정한다(운영자). id 와 바꿀 필드만(create_coupon 과 같은 필드).",
  {
    id: z.union([z.number().int(), z.string()]).describe("쿠폰 id"),
    coupon_type: z.number().int().min(1).max(3).optional(),
    discount_type: z.number().int().min(0).max(2).optional(),
    discount_price: z.number().int().min(0).optional(),
    discount_percent: z.number().int().min(0).max(99).optional(),
    use_type: z.number().int().min(1).max(2).optional(),
    use_day: z.number().int().min(0).max(999).optional(),
    use_dt: z.string().optional(),
    discount_terms_price: z.number().int().min(0).optional(),
    discount_max_price: z.number().int().min(0).optional(),
    design_id: z.number().int().optional(),
    name: z.string().optional(),
    title: z.string().optional(),
    category: z.string().optional(),
    level: z.number().int().optional(),
    pincode: z.string().optional(),
    overlap: z.number().int().optional(),
    onoff: z.number().int().min(0).max(1).optional(),
    down_max: z.number().int().optional(),
  },
  async ({ id, ...body }) => { try { return ok(await updateCoupon(id, body)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "delete_coupon",
  "쿠폰을 삭제한다(운영자).",
  { id: z.union([z.number().int(), z.string()]).describe("삭제할 쿠폰 id") },
  async ({ id }) => { try { return ok(await deleteCoupon(id)); } catch (e) { return fail(e.message); } }
);

// ── 쿠폰 발급 (운영자) ────────────────────────────────────────────────────────
server.tool(
  "list_coupon_issues",
  "발급된 쿠폰 내역을 조회한다(운영자). 쿠폰·회원·기간으로 필터. 각 항목: id(발급 id)·coupon_id·mid·" +
    "사용상태(state)·use_dt 등.",
  {
    period_start: z.string().optional().describe("발급일 검색 시작 YYYY-MM-DD (기본 오늘)"),
    period_end: z.string().optional().describe("발급일 검색 종료 YYYY-MM-DD (기본 오늘)"),
    id: z.string().optional().describe("발급 id 단건/콤마 복수"),
    coupon_id: z.number().int().optional().describe("쿠폰 id 로 필터"),
    mid: z.number().int().optional().describe("회원번호로 필터"),
    uid: z.string().optional().describe("아이디로 필터"),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
  },
  async (params) => { try { return ok(await listCouponIssues(params)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "issue_coupon",
  "쿠폰을 회원에게 발급한다(운영자). 1회 호출당 회원 1명. coupon_id(list_coupons)·mid(대상 회원)·" +
    "coupon_name(발급 쿠폰명, 최대 20자)·ct(발급 구분) 필수. 여러 명에게 주려면 회원마다 반복 호출한다.",
  {
    coupon_id: z.number().int().describe("발급할 쿠폰 id (list_coupons)"),
    mid: z.number().int().describe("대상 회원번호(mid)"),
    coupon_name: z.string().max(20).describe("발급 쿠폰명(최대 20자)"),
    ct: z.number().int().describe("발급 구분 코드(쇼핑몰 정의)"),
  },
  async (body) => { try { return ok(await issueCoupon(body)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "delete_coupon_issue",
  "발급된 쿠폰을 삭제(회수)한다(운영자). list_coupon_issues 의 발급 id.",
  { id: z.union([z.number().int(), z.string()]).describe("삭제할 발급 id") },
  async ({ id }) => { try { return ok(await deleteCouponIssue(id)); } catch (e) { return fail(e.message); } }
);

// ── 포인트 (운영자) ───────────────────────────────────────────────────────────
server.tool(
  "list_points",
  "포인트 내역을 조회한다(운영자). 회원·기간으로 필터. 각 항목: id·mid·point(부호 있음)·" +
    "total_point(누적)·content(사유)·dt.",
  {
    period_start: z.string().optional().describe("검색 시작 YYYY-MM-DD (기본 오늘)"),
    period_end: z.string().optional().describe("검색 종료 YYYY-MM-DD (기본 오늘)"),
    mid: z.number().int().optional().describe("회원번호로 필터"),
    uid: z.string().optional().describe("아이디로 필터"),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
  },
  async (params) => { try { return ok(await listPoints(params)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "create_point",
  "회원 포인트를 지급/차감한다(운영자). mid(대상 회원)·point(금액, **부호로 방향**: 양수=지급, 음수=차감)·" +
    "content(사유) 필수. ct 는 포인트 구분 코드(0~5). 처리자(cre_mid)는 로그인 운영자로 자동 등록.",
  {
    mid: z.number().int().describe("대상 회원번호(mid)"),
    point: z.number().int().describe("포인트 금액 — 양수=지급, 음수=차감 (예: 1000 지급, -500 차감)"),
    content: z.string().max(255).describe("지급/차감 사유"),
    ct: z.number().int().min(0).max(5).optional().describe("포인트 구분 코드(0~5, 기본 0)"),
  },
  async ({ mid, point, content, ct }) => {
    try {
      const body = { mid, point, content, ct: ct ?? 0, cre_mid: await operatorMid() };
      return ok(await createPoint(body));
    } catch (e) { return fail(e.message); }
  }
);

server.tool(
  "update_point",
  "포인트 내역을 수정한다(운영자). 금액은 변경 불가하고 사유(content)만 수정된다.",
  {
    id: z.union([z.number().int(), z.string()]).describe("포인트 내역 id (list_points 의 id 값 그대로)"),
    content: z.string().max(255).describe("수정할 사유"),
  },
  async ({ id, content }) => { try { return ok(await updatePoint(id, { content })); } catch (e) { return fail(e.message); } }
);

server.tool(
  "delete_point",
  "포인트 내역을 삭제한다(운영자). 회원 누적 포인트도 함께 조정된다.",
  { id: z.union([z.number().int(), z.string()]).describe("삭제할 포인트 내역 id") },
  async ({ id }) => { try { return ok(await deletePoint(id)); } catch (e) { return fail(e.message); } }
);

// ── 쇼핑몰 기본정보 (운영자) ──────────────────────────────────────────────────
server.tool(
  "get_shop_company",
  "쇼핑몰 기본정보(회사정보)를 조회한다(운영자). 상호·고객센터·운영시간·사업자정보·주소·" +
    "개인정보보호책임자·AS 연락처 등. 푸터·약관에 노출되는 공식 정보.",
  {},
  async () => { try { return ok(await getShopCompany()); } catch (e) { return fail(e.message); } }
);

server.tool(
  "update_shop_company",
  "쇼핑몰 기본정보(회사정보)를 수정한다(운영자). 보낸 필드만 갱신된다. 변경 시 푸터 캐시가 자동 갱신됨. " +
    "전화/팩스/사업자번호는 숫자만(하이픈 자동 제거).",
  {
    title: z.string().optional().describe("상호(쇼핑몰명)"),
    service: z.string().optional().describe("고객센터 안내(전화/시간 등 표기 문구)"),
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
  },
  async (data) => { try { return ok(await updateShopCompany(data)); } catch (e) { return fail(e.message); } }
);

// ── 통합 게시판 (board_type=1, 운영자) ────────────────────────────────────────
// 쇼핑몰 설정 board_type=1(통합 게시판)일 때 사용. 공지/1:1문의/FAQ/상품문의/구매후기가
// 단일 게시판으로 통합되어 board_type 코드(notice|qna|faq|inquiry|review)로 구분된다.
// (board_type=0 기본형이면 기존 개별 도구 — list_notices/list_faqs/list_reviews/문의 도구 — 를 쓴다.)
server.tool(
  "board_setup",
  "통합 게시판(board_type=1) 설정을 조회한다(운영자). 5개 게시판(notice/qna/faq/inquiry/review)의 " +
    "코드·이름·카테고리 목록·기능 사용여부(댓글/상품/별점)를 반환한다. 게시글 등록/필터 전에 호출해 " +
    "board_type 코드와 카테고리를 확인한다.",
  {},
  async () => { try { return ok(await getBoardSetup()); } catch (e) { return fail(e.message); } }
);

server.tool(
  "list_board",
  "통합 게시판 글 목록을 조회한다(운영자, board_type=1). 5개 게시판을 한 번에 조회하며 " +
    "board_types(notice/qna/faq/inquiry/review)·카테고리·별점·답변상태로 필터한다. " +
    "각 항목: id·board_type·category·title·writer_name·state(1대기/2완료/3추가문의)·reply_count·score.",
  {
    board_types: z.string().optional().describe("게시판 코드 콤마구분(notice,qna,faq,inquiry,review)"),
    category: z.string().optional().describe("카테고리로 필터"),
    score: z.number().int().min(1).max(5).optional().describe("별점 필터(구매후기)"),
    states: z.string().optional().describe("답변상태 콤마구분(1=대기,2=완료,3=추가문의)"),
    notice: z.number().int().min(0).max(1).optional().describe("1=상단고정만"),
    best: z.number().int().min(0).max(1).optional().describe("1=베스트만"),
    keyword: z.enum(["title", "content", "uid", "writer_name"]).optional().describe("검색 필드"),
    q: z.string().optional().describe("검색어(keyword 와 함께)"),
    period: z.enum(["dt", "update_dt"]).optional().describe("기간 기준(기본 dt)"),
    period_start: z.string().optional().describe("YYYY-MM-DD"),
    period_end: z.string().optional().describe("YYYY-MM-DD"),
    order: z.number().int().min(1).max(4).optional().describe("1=최신 2=오래된순 3=댓글많은순 4=조회순"),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
  },
  async (params) => { try { return ok(await listBoard(params)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "get_board_post",
  "통합 게시판 글 상세를 조회한다(운영자). 본문·첨부·상품·댓글(답변)까지 포함.",
  { id: z.union([z.number().int(), z.string()]).describe("게시글 번호(list_board 의 id)") },
  async ({ id }) => { try { return ok(await getBoardPost(id)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "answer_board_post",
  "통합 게시판 글에 운영자 답변(댓글)을 등록한다(운영자). 답변자는 로그인 운영자로 자동 등록되고 " +
    "게시글이 답변완료(state=2)로 바뀐다. 1:1문의·상품문의 답변에 사용.",
  {
    article_id: z.union([z.number().int(), z.string()]).describe("게시글 번호"),
    content: z.string().describe("답변 내용"),
    photo: z.string().optional().describe("첨부 file id 콤마구분(upload_board_files 결과)"),
  },
  async ({ article_id, content, photo }) => {
    try { return ok(await replyBoardPost({ article_id, content, ...(photo ? { photo } : {}) })); }
    catch (e) { return fail(e.message); }
  }
);

server.tool(
  "delete_board_reply",
  "통합 게시판 답변(댓글)을 삭제한다(운영자). 삭제 후 게시글 답변상태가 재계산된다.",
  { id: z.union([z.number().int(), z.string()]).describe("답변(댓글) id") },
  async ({ id }) => { try { return ok(await deleteBoardReply(id)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "create_board_post",
  "통합 게시판 글을 등록한다(운영자 작성). board_type(게시판 코드)·title·content·writer_name 필수. " +
    "카테고리는 board_setup 의 categories 중 선택. 상품문의·후기는 products_id/product_id, 후기는 score(1~5). " +
    "첨부는 먼저 upload_board_files 로 올려 photo 에 콤마구분 id 를 넣는다.",
  {
    board_type: z.enum(["notice", "qna", "faq", "inquiry", "review"]).describe("게시판 코드"),
    title: z.string().describe("제목"),
    content: z.string().describe("내용(HTML 가능)"),
    writer_name: z.string().describe("작성자명"),
    category: z.string().optional().describe("카테고리(board_setup 참조)"),
    score: z.number().int().min(0).max(5).optional().describe("별점(구매후기 1~5)"),
    products_id: z.number().int().optional().describe("상품 id(상품문의/후기)"),
    product_id: z.number().int().optional().describe("옵션 id(상품문의/후기)"),
    secret: z.number().int().min(0).max(1).optional().describe("1=비밀글"),
    notice: z.number().int().min(0).max(1).optional().describe("1=상단고정"),
    best: z.number().int().min(0).max(1).optional().describe("1=베스트"),
    url: z.string().optional().describe("외부 링크"),
    video_url: z.string().optional().describe("동영상 URL"),
    photo: z.string().optional().describe("첨부 file id 콤마구분"),
    uid: z.string().optional().describe("작성자 아이디(선택)"),
    dt: z.string().optional().describe("작성일시 YYYY-MM-DD HH:MM:SS (생략 시 현재)"),
  },
  async (body) => { try { return ok(await createBoardPost(body)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "update_board_post",
  "통합 게시판 글을 수정한다(운영자). id 와 바꿀 필드만(create_board_post 와 같은 필드).",
  {
    id: z.union([z.number().int(), z.string()]).describe("게시글 번호"),
    board_type: z.enum(["notice", "qna", "faq", "inquiry", "review"]).optional(),
    title: z.string().optional(),
    content: z.string().optional(),
    writer_name: z.string().optional(),
    category: z.string().optional(),
    score: z.number().int().min(0).max(5).optional(),
    products_id: z.number().int().optional(),
    product_id: z.number().int().optional(),
    secret: z.number().int().min(0).max(1).optional(),
    notice: z.number().int().min(0).max(1).optional(),
    best: z.number().int().min(0).max(1).optional(),
    url: z.string().optional(),
    video_url: z.string().optional(),
    photo: z.string().optional(),
    dt: z.string().optional().describe("YYYY-MM-DD HH:MM:SS"),
  },
  async ({ id, ...body }) => { try { return ok(await updateBoardPost(id, body)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "delete_board_post",
  "통합 게시판 글을 삭제한다(운영자). 댓글·첨부도 함께 정리되고 후기/문의 카운터가 보정된다.",
  { id: z.union([z.number().int(), z.string()]).describe("삭제할 게시글 번호") },
  async ({ id }) => { try { return ok(await deleteBoardPost(id)); } catch (e) { return fail(e.message); } }
);

server.tool(
  "upload_board_files",
  "통합 게시판 첨부파일을 업로드한다(운영자). 로컬 파일(최대 5). items[].id 를 " +
    "create_board_post/update_board_post/answer_board_post 의 photo(콤마구분)로 넣는다.",
  { files: z.array(z.string()).min(1).max(5).describe("업로드할 로컬 파일 경로(최대 5)") },
  async ({ files }) => { try { return ok(await uploadBoardFiles(files)); } catch (e) { return fail(e.message); } }
);

// 시작 시 PROSELL_SHOP 이 주어지면 저장(다음 실행부터 생략 가능)
if (process.env.PROSELL_SHOP) {
  try { saveShop(process.env.PROSELL_SHOP); } catch {}
}

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write("[prosell-mcp] started (stdio)\n");
