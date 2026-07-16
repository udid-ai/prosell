"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Zipcode, { type ZipcodeResult } from "@/components/Zipcode";

// 배송지 변경 모달 — 레거시 order-receive-edit. 배송 시작 전(del_state≤10)·본인 주문에서만 노출.
// del_use==2(해외) 또는 rec_country 있으면 해외 필드, 아니면 국내 주소(우편번호 검색).
type Delivery = {
  dno: number; del_use?: number;
  rec_name?: string | null; rec_hp?: string | null; rec_tel?: string | null; rec_place?: string | null; rec_admcode?: string | null;
  rec_zipcode?: string | null; rec_addr1?: string | null; rec_addr2?: string | null;
  rec_country?: string | null; rec_postcode?: string | null; rec_state?: string | null; rec_city?: string | null; rec_detail?: string | null;
  del_message?: string | null;
};

export default function ReceiveEditModal({ delivery, onClose }: { delivery: Delivery; onClose: () => void }) {
  const router = useRouter();
  const overseas = delivery.del_use === 2 || !!delivery.rec_country;

  const [name, setName] = useState(delivery.rec_name ?? "");
  const [hp, setHp] = useState(delivery.rec_hp ?? "");
  const [tel, setTel] = useState(delivery.rec_tel ?? "");
  const [msg, setMsg] = useState(delivery.del_message ?? "");
  // 국내
  const [zip, setZip] = useState(delivery.rec_zipcode ?? "");
  const [addr1, setAddr1] = useState(delivery.rec_addr1 ?? "");
  const [addr2, setAddr2] = useState(delivery.rec_addr2 ?? "");
  const [admcode, setAdmcode] = useState(delivery.rec_admcode ?? "");
  const [place, setPlace] = useState(delivery.rec_place ?? "");
  // 해외
  const [country, setCountry] = useState(delivery.rec_country ?? "");
  const [postcode, setPostcode] = useState(delivery.rec_postcode ?? "");
  const [state, setState] = useState(delivery.rec_state ?? "");
  const [city, setCity] = useState(delivery.rec_city ?? "");
  const [detail, setDetail] = useState(delivery.rec_detail ?? "");

  const [zipOpen, setZipOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function onZip(r: ZipcodeResult | null) {
    setZipOpen(false);
    if (!r) return;
    setZip(r.zipcode);
    setAddr1(r.address);
    setAdmcode(r.admcode);
    setPlace(r.place);
  }

  async function submit() {
    setErr("");
    // 클라이언트 1차 검증(서버 재검증)
    if (!name.trim()) return setErr("받는 분 성함을 입력해 주세요.");
    if (!hp.replace(/\D/g, "")) return setErr("받는 분 휴대폰 번호를 입력해 주세요.");
    if (overseas) {
      if (!country.trim()) return setErr("국가를 입력해 주세요.");
      if (!detail.trim()) return setErr("상세주소를 입력해 주세요.");
    } else {
      if (!zip) return setErr("우편번호를 검색해 주세요.");
      if (!addr1) return setErr("주소를 입력해 주세요.");
      if (!addr2.trim()) return setErr("상세주소를 입력해 주세요.");
    }
    const body = overseas
      ? { dno: String(delivery.dno), rec_name: name, rec_hp: hp, del_message: msg, rec_country: country, rec_postcode: postcode, rec_state: state, rec_city: city, rec_detail: detail }
      : { dno: String(delivery.dno), rec_name: name, rec_hp: hp, rec_tel: tel, del_message: msg, rec_zipcode: zip, rec_addr1: addr1, rec_addr2: addr2, rec_admcode: admcode, rec_place: place };
    setBusy(true);
    try {
      const res = await fetch("/api/order/receive", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => null);
      if (!j?.ok) { setErr(j?.error || "배송지 변경에 실패했습니다."); setBusy(false); return; }
      onClose();
      router.refresh();
    } catch { setErr("요청 중 오류가 발생했습니다."); setBusy(false); }
  }

  const inputCls = "w-full rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent";
  const labelCls = "mb-1 block text-[13px] font-medium text-sub";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-card p-6 shadow-xl" style={{ maxHeight: "90vh" }}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-text">배송지 변경</h2>
          <button type="button" onClick={onClose} className="text-sub hover:text-text" aria-label="닫기">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className={labelCls}>받는 분</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>휴대폰</label>
            <input className={inputCls} value={hp} onChange={(e) => setHp(e.target.value)} inputMode="numeric" placeholder="'-' 없이 숫자만" />
          </div>

          {overseas ? (
            <>
              <div>
                <label className={labelCls}>국가</label>
                <input className={inputCls} value={country} onChange={(e) => setCountry(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>우편번호</label>
                  <input className={inputCls} value={postcode} onChange={(e) => setPostcode(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>주(State)</label>
                  <input className={inputCls} value={state} onChange={(e) => setState(e.target.value)} />
                </div>
              </div>
              <div>
                <label className={labelCls}>도시(City)</label>
                <input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>상세주소</label>
                <input className={inputCls} value={detail} onChange={(e) => setDetail(e.target.value)} />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className={labelCls}>전화번호(선택)</label>
                <input className={inputCls} value={tel} onChange={(e) => setTel(e.target.value)} inputMode="numeric" placeholder="'-' 없이 숫자만" />
              </div>
              <div>
                <label className={labelCls}>우편번호</label>
                <div className="flex gap-2">
                  <input className={inputCls} value={zip} readOnly placeholder="주소 검색" />
                  <button type="button" onClick={() => setZipOpen(true)} className="shrink-0 rounded-md border border-accent bg-accent/5 px-3 text-[13px] font-medium text-accent hover:bg-accent/10">주소 검색</button>
                </div>
              </div>
              <div>
                <label className={labelCls}>주소</label>
                <input className={inputCls} value={addr1} readOnly />
              </div>
              <div>
                <label className={labelCls}>상세주소</label>
                <input className={inputCls} value={addr2} onChange={(e) => setAddr2(e.target.value)} />
              </div>
            </>
          )}

          <div>
            <label className={labelCls}>배송메시지</label>
            <input className={inputCls} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="예) 부재 시 경비실에 맡겨주세요" />
          </div>

          {err && <p className="text-[13px] text-sale">{err}</p>}

          <div className="mt-2 flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-md border border-line py-2.5 text-sm font-medium text-text hover:bg-surface">취소</button>
            <button type="button" onClick={submit} disabled={busy} className="flex-1 rounded-md bg-accent py-2.5 text-sm font-bold text-accent-foreground hover:opacity-90 disabled:opacity-50">
              {busy ? "변경 중…" : "변경하기"}
            </button>
          </div>
        </div>
      </div>

      {zipOpen && <Zipcode onClose={onZip} />}
    </>
  );
}
