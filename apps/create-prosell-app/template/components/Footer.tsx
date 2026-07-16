import Link from "next/link";
import { fetchFooter, type ShopFooter } from "@/lib/prosell";
import { formatPhoneNumber } from "@/lib/format";
import EscrowButton from "@/components/EscrowButton";

// 상단 메뉴 줄 — 기존 정책/고객지원 바로가기(복원·유지). policy/privacy 는 페이지 API(/pages/[pid]).
const FOOT_LINKS = [
  { href: "/notice", label: "공지사항" },
  { href: "/faq", label: "자주묻는 질문" },
  { href: "/account/qna", label: "1:1 문의" },
  { href: "/pages/policy", label: "서비스이용약관" },
  { href: "/pages/privacy", label: "개인정보 처리방침", strong: true },
];

// 1단 퀵메뉴 — 자주 쓰는 바로가기.
const QUICK_LINKS = [
  { href: "/account/orders", label: "주문/배송 조회" },
  { href: "/account/coupons", label: "쿠폰 보관함" },
  { href: "/cart", label: "장바구니" },
  { href: "/account/history", label: "최근 본 상품" },
  { href: "/notice", label: "공지사항" },
  { href: "/account/qna", label: "1:1 문의" },
];

// 쇼핑몰 정보 푸터 — 데이터는 GET /api/v2/shop/footer (백엔드 Redis 캐시).
// 디자인 레이어이므로 className/마크업은 자유롭게 바꿔도 된다.

// 전화/팩스 표기 — 지역번호 자리수별로 하이픈(lib/format.formatPhoneNumber). 값 없으면 null.
function telFmt(t?: string | null) {
  if (!t) return null;
  return formatPhoneNumber({ phoneNumber: t });
}

function bizFmt(b?: string | null) {
  if (!b) return null;
  const d = b.replace(/[^0-9]/g, "");
  return d.length === 10 ? d.replace(/(\d{3})(\d{2})(\d{5})/, "$1-$2-$3") : b;
}

export default async function Footer() {
  const f: ShopFooter | null = await fetchFooter();
  if (!f) return null;

  const dt = "text-sub";
  const dd = "text-text";
  const sep = <span className="mx-2 text-line">|</span>;

  // 한 줄에 라벨:값 항목들을 구분자로 이어 출력
  type Item = { k: string; v: React.ReactNode };
  const Row = ({ items }: { items: (Item | string | false | null | undefined)[] }) => {
    const ok = items.filter((it): it is Item => typeof it === "object" && it !== null);
    if (!ok.length) return null;
    return (
      <p className="leading-relaxed">
        {ok.map((it, i) => (
          <span key={it.k}>
            {i > 0 && sep}
            <span className={dt}>{it.k} </span>
            <span className={dd}>{it.v}</span>
          </span>
        ))}
      </p>
    );
  };

  const addr = [f.zipcode && `(${f.zipcode})`, f.addr1, f.addr2].filter(Boolean).join(" ");

  return (
    <footer className="border-t border-line bg-card">
      {/* 상단 메뉴 줄(기존 유지) */}
      <div className="border-b border-line">
        <nav aria-label="푸터 메뉴" className="mx-auto flex max-w-content flex-wrap items-center gap-x-5 gap-y-2 px-4 py-4 text-[13px]">
          {FOOT_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={`hover:text-accent ${l.strong ? "font-bold text-text" : "text-sub"}`}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="mx-auto max-w-content px-4 py-10">
        {/* ── 1단: 고객센터 | 입금계좌 | 퀵메뉴 ── */}
        <div className="grid gap-8 border-b border-line pb-8 sm:grid-cols-2 lg:grid-cols-3">
          {/* 고객센터 */}
          <div>
            <h3 className="text-sm font-bold text-text">고객센터</h3>
            {f.tel && <p className="mt-1.5 text-2xl font-extrabold tracking-tight text-text">{telFmt(f.tel)}</p>}
            <div className="mt-1 space-y-0.5 text-[13px]">
              <Row
                items={[
                  f.worktime && { k: "운영시간", v: f.worktime },
                  f.fax && { k: "팩스", v: telFmt(f.fax) },
                ]}
              />
              {f.email && (
                <p className="leading-relaxed">
                  <span className={dt}>이메일 </span>
                  <a href={`mailto:${f.email}`} className="text-text hover:text-accent">{f.email}</a>
                </p>
              )}
            </div>
          </div>

          {/* 입금 계좌 */}
          <div>
            <h3 className="text-sm font-bold text-text">입금 계좌</h3>
            {f.banks.length > 0 ? (
              <ul className="mt-1.5 space-y-0.5 text-[13px]">
                {f.banks.map((b, i) => (
                  <li key={i} className="leading-relaxed">
                    <span className={dt}>{b.name || b.code} </span>
                    <span className="font-medium text-text">{b.num}</span>
                    {b.holder && <span className={dt}> (예금주 {b.holder})</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-[13px] text-sub">등록된 입금 계좌가 없습니다.</p>
            )}
          </div>

          {/* 퀵메뉴 */}
          <div>
            <h3 className="text-sm font-bold text-text">바로가기</h3>
            <ul className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
              {QUICK_LINKS.map((l, i) => (
                <li key={i}>
                  <Link href={l.href} className="text-sub hover:text-accent">{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── 2단: (왼쪽) 쇼핑몰 이름 + 회사정보 · (오른쪽) 인증 아이콘 ── */}
        <div className="flex flex-col gap-6 pt-8 md:flex-row md:items-start md:justify-between">
          {/* 왼쪽: 상호 전체 그룹 */}
          <div className="min-w-0">
          {/* 쇼핑몰 이름 — 상호 위에 위치 */}
          <p className="text-[17px] font-extrabold text-text">{f.service || "프로셀 AI 스토어"}</p>

          {/* 회사 정보(상호부터 — 기존 유지) */}
          <div className="mt-3 space-y-0.5 text-xs text-sub">
            <Row
              items={[
                f.company && { k: "상호", v: f.company },
                f.ceo && { k: "대표자", v: f.ceo },
              ]}
            />
            <Row
              items={[
                f.biznum && {
                  k: "사업자등록번호",
                  v: (
                    <>
                      {bizFmt(f.biznum)}
                      {f.biznum_url && (
                        <a href={f.biznum_url} target="_blank" rel="noreferrer" className="ml-1.5 text-accent hover:underline">사업자정보확인</a>
                      )}
                    </>
                  ),
                },
                f.salenum && { k: "통신판매업신고", v: f.salenum },
              ]}
            />
            {addr && (
              <p className="leading-relaxed">
                <span className={dt}>주소 </span>
                <span className={dd}>{addr}</span>
              </p>
            )}
            <Row
              items={[
                f.pri_name && {
                  k: "개인정보 관리책임자",
                  v: f.pri_email ? `${f.pri_name} (${f.pri_email})` : f.pri_name,
                },
              ]}
            />
            {f.hosting?.name && (
              <p className="leading-relaxed">
                <span className={dt}>호스팅바이 </span>
                {f.hosting.url ? (
                  <a href={f.hosting.url} target="_blank" rel="noreferrer" className="text-text hover:text-accent">{f.hosting.name}</a>
                ) : (
                  <span className={dd}>{f.hosting.name}</span>
                )}
              </p>
            )}
          </div>

          <p className="mt-6 text-xs text-sub">
            {f.copyright || `Copyright © ${f.service ?? ""}. All Rights Reserved.`}
          </p>
          </div>

          {/* 오른쪽: 인증 아이콘 영역 (에스크로 — 추가 인증마크는 여기에 나열) */}
          <div className="flex shrink-0 flex-wrap items-start gap-2 md:justify-end">
            <EscrowButton biznum={f.biznum} />
          </div>
        </div>
      </div>
    </footer>
  );
}
