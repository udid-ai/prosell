import Link from "next/link";
import { fetchAccount, getToken, won, formatPhone, type AccountField } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 폭·중앙정렬·상하 여백은 account/layout 이 담당 → 카드는 콘텐츠 열을 채운다.
const cardCls = "rounded-md border border-line bg-card p-6";

// ── 표시용 포맷터 ───────────────────────────────────────────
const v = (x: AccountField) => (x == null || x === "" ? null : x); // 빈값 → null(미표시)
const fmtDate = (x: AccountField) => (x ? String(x).replace("T", " ").slice(0, 16) : null); // ISO → YYYY-MM-DD HH:mm
const fmtDay = (x: AccountField) => (x ? String(x).slice(0, 10) : null);
const won_ = (x: AccountField) => (x != null ? won(Number(x)) : null);
const point_ = (x: AccountField) => (x != null ? `${Number(x).toLocaleString("ko-KR")} P` : null);
const genderLabel = (x: AccountField) => (x === 1 || x === "1" ? "남성" : x === 2 || x === "2" ? "여성" : null);
const yn = (x: AccountField) => (x === 1 || x === "1" ? "동의" : "미동의");
// 본인확인 항목 코드 → 라벨 ("1,2,3" → 성명·성인·휴대폰)
const CERTIFY_LABEL: Record<string, string> = { "1": "성명", "2": "성인", "3": "휴대폰", "4": "이메일" };
const certifyLabels = (x: AccountField) =>
  x ? String(x).split(",").map((c) => CERTIFY_LABEL[c.trim()]).filter(Boolean).join(" · ") || null : null;
// 거래은행 코드 → 은행명 (레거시 Models\Bank::bankCodes() 와 동일)
const BANK_NAME: Record<string, string> = {
  "2": "KDB산업은행", "3": "IBK기업은행", "4": "KB국민은행", "7": "수협은행", "11": "NH농협",
  "20": "우리은행", "23": "SC제일은행", "27": "한국씨티은행", "31": "대구은행(아이엠뱅크)", "32": "부산은행",
  "34": "광주은행", "35": "제주은행", "37": "전북은행", "39": "경남은행", "45": "새마을금고",
  "48": "신협", "64": "산림조합", "71": "우체국", "81": "KEB하나은행", "88": "신한은행",
  "89": "케이뱅크", "90": "카카오뱅크", "92": "토스뱅크",
};
// 코드면 은행명으로, 매핑에 없으면 원본 값 그대로 표시(미리 이름이 저장된 경우 대비)
const bankName = (x: AccountField) => (x == null || x === "" ? null : BANK_NAME[String(x).trim()] ?? String(x));

type Row = [string, AccountField];
const Section = ({ title, rows }: { title: string; rows: Row[] }) => {
  const filled = rows.filter(([, val]) => val != null && val !== "");
  if (filled.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="mb-1 border-b border-line pb-1 text-[13px] font-bold text-sub">{title}</h2>
      <table className="w-full border-collapse">
        <tbody>
          {filled.map(([k, val]) => (
            <tr key={k} className="align-top">
              <td className="w-[110px] py-2 text-[13px] text-sub">{k}</td>
              <td className="py-2 text-[15px] text-text">{val}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

export default async function AccountPage() {
  const token = await getToken();

  if (!token) {
    return (
      <div className={cardCls}>
        <h1 className="text-xl">내 정보</h1>
        <p className="mt-2 text-sub">로그인이 필요합니다.</p>
        <div className="mt-3 flex gap-2">
          <Link href="/auth/login" className="rounded-sm bg-accent px-4 py-2 text-accent-foreground">로그인</Link>
          <Link href="/auth/join" className="rounded-sm border border-line px-4 py-2 text-text">회원가입</Link>
        </div>
      </div>
    );
  }

  const acc = await fetchAccount(token);
  if (!acc) {
    return (
      <div className={cardCls}>
        <h1 className="text-xl">내 정보</h1>
        <p className="mt-2 text-sale">회원정보를 불러오지 못했습니다. 다시 로그인해 주세요.</p>
        <Link href="/auth/login" className="mt-3 inline-block rounded-sm bg-accent px-4 py-2 text-accent-foreground">로그인</Link>
      </div>
    );
  }

  const o = acc.origin;
  const i = acc.info;
  const active = (o.onoff === 1 || o.onoff === "1") && (o.state === 0 || o.state === "0" || o.state == null);

  const account: Row[] = [
    ["아이디", v(o.uid)],
    ["회원등급", v(o.level_name) ?? (o.level != null ? `LV.${o.level}` : null)],
    ["상태", active ? "정상" : "이용제한"],
    ["가입일", fmtDate(o.dt)],
    ["최근 로그인", fmtDate(o.login_dt)],
    ["비밀번호 변경", fmtDate(o.upw_dt)],
  ];
  const profile: Row[] = [
    ["이름", v(o.name)],
    ["생년월일", fmtDay(o.birth)],
    ["성별", genderLabel(o.gender)],
    ["이메일", o.email ? `${o.email} (수신 ${yn(o.email_receive)})` : null],
    ["휴대폰", o.hp ? `${formatPhone(o.hp)} (수신 ${yn(o.hp_receive)})` : null],
    ["일반전화", o.tel ? formatPhone(o.tel) : null],
  ];
  const address: Row[] = [
    ["우편번호", v(o.zipcode)],
    ["기본주소", v(o.addr1)],
    ["상세주소", v(o.addr2)],
  ];
  const certify: Row[] = [
    ["인증항목", certifyLabels(i.certify)],
    ["인증일", fmtDate(i.certify_dt)],
  ];
  const extra: Row[] = [
    ["거래은행", bankName(i.bank)],
    ["계좌번호", v(i.banknum)],
    ["예금주", v(i.bankholder)],
    ["관심분야", v(i.interest)],
    ["자기소개", v(i.profile)],
    ["추천인", i.recommend ? String(i.recommend) : null],
  ];
  const activity: Row[] = [
    ["보유 포인트", point_(o.point)],
    ["주문", i.order_cnt != null ? `${Number(i.order_cnt).toLocaleString("ko-KR")}건 / ${won_(i.order_price)}` : null],
    ["쿠폰", i.coupon_cnt != null ? `${i.coupon_cnt}장` : null],
    ["작성 리뷰", i.review_cnt != null ? `${i.review_cnt}건` : null],
    ["상품문의", i.qna_cnt != null ? `${i.qna_cnt}건` : null],
    ["1:1문의", i.inquiry_cnt != null ? `${i.inquiry_cnt}건` : null],
  ];

  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between">
        <h1 className="text-xl">내 정보</h1>
        <Link href="/account/edit" className="rounded-sm border border-line px-3 py-1.5 text-[13px] text-text hover:bg-line">정보 수정</Link>
      </div>

      <Section title="계정정보" rows={account} />
      <Section title="회원정보" rows={profile} />
      <Section title="주소" rows={address} />
      <Section title="본인확인" rows={certify} />
      <Section title="부가정보" rows={extra} />
      <Section title="활동내역" rows={activity} />
    </div>
  );
}
