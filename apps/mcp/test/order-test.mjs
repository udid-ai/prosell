// 주문 관리 도구 로컬/실제 검증 harness — login.js·api.js 실제 코드를 그대로 구동한다.
//
// 흐름: login(운영자 OAuth, 브라우저 1회) → list_orders → (있으면) get_order(ono).
//   ① /oauth/authorize 로 운영자 로그인 → loopback 으로 code 수신 → /oauth/token 교환
//   ② access_token 으로 GET /order/search
//   ③ 첫 주문의 ono 로 GET /order/{ono}
//
// 전제:
//   - PROSELL_SHOP (필수)  예: http://localhost:8080 (로컬 도커) / https://{id}.prosell.kr
//   - connect 로 자격증명 저장돼 있어야 함(~/.prosell-mcp/config.json).
//     아직이면 먼저 `PROSELL_SHOP=... npm run test:connect` 로 앱 등록을 끝내라.
//   - redirect_uri 정합성: 등록값 정확일치를 요구하면 PROSELL_LOGIN_REDIRECT_URI 로 지정.
//
// 사용:
//   PROSELL_SHOP=http://localhost:8080 npm run test:order
import { runLogin } from "../src/login.js";
import { listOrders, getOrder } from "../src/api.js";
import { credentials, shopBase, tokens } from "../src/config.js";

const G = "\x1b[32m", R = "\x1b[31m", C = "\x1b[36m", X = "\x1b[0m";
const okLine = (m) => console.log(`${G}✓${X} ${m}`);
const info = (m) => console.log(`${C}·${X} ${m}`);
function die(m) { console.error(`${R}✗ ${m}${X}`); process.exit(1); }

try {
  if (!process.env.PROSELL_SHOP) die("PROSELL_SHOP 환경변수가 필요합니다. 예: PROSELL_SHOP=http://localhost:8080");
  info(`쇼핑몰: ${shopBase()}`);

  if (!credentials()) die("자격증명이 없습니다. 먼저 `npm run test:connect` 로 앱을 등록하세요.");
  okLine("자격증명 확인됨(connect 완료)");

  // ① 운영자 로그인(OAuth) — 브라우저에서 로그인/동의
  info("운영자 로그인을 시작합니다. 브라우저에서 로그인 후 동의하세요…");
  const r = await runLogin({});
  if (!tokens()) die("토큰이 저장되지 않았습니다.");
  okLine(`로그인 완료 (access 만료 ${r.expires_in ?? "?"}s, scope=${r.scope ?? "?"})`);

  // ② 주문 목록
  const list = await listOrders({ limit: 5 });
  const orders = list.orders ?? list.items ?? [];
  okLine(`list_orders OK — total_count=${list.total_count ?? "?"}, 표시 ${orders.length}건`);

  // ③ 첫 주문 상세
  const first = orders[0]?.order ?? orders[0];
  const ono = first?.ono ?? first?.order?.ono;
  if (ono) {
    const detail = await getOrder(ono);
    const items = detail.items ?? [];
    okLine(`get_order(${ono}) OK — 품목 ${items.length}건`);
    const prno = items[0]?.product?.prno ?? items[0]?.prno;
    if (prno) info(`발송 처리 테스트용 상품주문번호(prno): ${prno}`);
    info("ship_order 는 실제 상태를 바꾸므로 이 harness 는 자동 실행하지 않는다(수동 확인).");
  } else {
    info("조회된 주문이 없어 get_order 는 건너뜀(기간 필터 조정: period_start/period_end).");
  }

  console.log(`\n${G}=== 주문 관리 흐름 검증 통과 ===${X}`);
} catch (e) {
  die(e.message);
}
