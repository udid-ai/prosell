import Link from "next/link";
import { fetchFooter, type ShopFooter } from "@/lib/prosell";

// 푸터 상단 메뉴 — 정책/고객지원 바로가기. policy/privacy 는 페이지 API(/pages/[pid]).
const FOOT_LINKS = [
  { href: "/notice", label: "공지사항" },
  { href: "/faq", label: "자주묻는 질문" },
  { href: "/qna", label: "1:1 문의" },
  { href: "/pages/policy", label: "서비스이용약관" },
  { href: "/pages/privacy", label: "개인정보 처리방침", strong: true },
];

// 쇼핑몰 정보 푸터 — 데이터는 GET /api/v2/shop/footer (백엔드 Redis 캐시).
// 디자인 레이어이므로 className/마크업은 자유롭게 바꿔도 된다.

function telFmt(t?: string | null) {
  if (!t) return null;
  const d = t.replace(/[^0-9]/g, "");
  if (d.length === 8) return d.replace(/(\d{4})(\d{4})/, "$1-$2");
  if (d.length === 9) return d.replace(/(\d{2})(\d{3})(\d{4})/, "$1-$2-$3");
  if (d.length === 10) return d.replace(/(\d{2,3})(\d{3,4})(\d{4})/, "$1-$2-$3");
  if (d.length === 11) return d.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
  return t;
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
    <footer className="mt-16 border-t border-line bg-card">
      {/* 상단 메뉴 줄 */}
      <div className="border-b border-line">
        <nav aria-label="푸터 메뉴" className="mx-auto flex max-w-content flex-wrap items-center gap-x-5 gap-y-2 px-4 py-4 text-[13px]">
          {FOOT_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`hover:text-accent ${l.strong ? "font-bold text-text" : "text-sub"}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="mx-auto max-w-content px-4 py-10">
        <div className="grid gap-10 md:grid-cols-[1fr_auto]">
          {/* 고객센터 + 회사정보 */}
          <div className="space-y-5">
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
            {f.banks.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-text">입금 계좌</h3>
                <ul className="mt-1.5 space-y-0.5 text-[13px]">
                  {f.banks.map((b, i) => (
                    <li key={i} className="leading-relaxed">
                      <span className={dt}>{b.name || b.code} </span>
                      <span className="font-medium text-text">{b.num}</span>
                      {b.holder && <span className={dt}> (예금주 {b.holder})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 회사 정보 */}
            <div className="space-y-0.5 text-xs text-sub">
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
          </div>

          {/* 브랜드 */}
          <div className="md:text-right">
            <p className="text-[17px] font-extrabold text-text">{f.service || "프로셀 AI 스토어"}</p>
          </div>
        </div>

        <p className="mt-8 border-t border-line pt-5 text-xs text-sub">
          {f.copyright || `Copyright © ${f.service ?? ""}. All Rights Reserved.`}
        </p>
      </div>
    </footer>
  );
}
