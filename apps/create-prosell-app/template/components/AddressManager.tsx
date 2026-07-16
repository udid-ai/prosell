"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SavedAddress, CountryAddress, CountryOption } from "@/lib/prosell";
import Zipcode from "./Zipcode";
import { fieldCls, labelCls, bigBtnCls, inlineBtnCls } from "./joinShared";

const cardCls = "rounded-md border border-line bg-card p-6";

// 해외 배송지 폼 상태(회원당 1개, upsert).
type CountryForm = { name: string; hp: string; country: string; postcode: string; state: string; city: string; detail: string };
const emptyCountry = (): CountryForm => ({ name: "", hp: "", country: "", postcode: "", state: "", city: "", detail: "" });
const fromCountry = (c: CountryAddress): CountryForm => ({ name: c.name, hp: c.hp, country: c.country, postcode: c.postcode, state: c.state, city: c.city, detail: c.detail });

type FormState = {
  id?: number; name: string; hp: string; tel: string;
  zipcode: string; addr1: string; addr2: string; admcode: string; place: string; is_default: boolean;
};
const empty = (): FormState => ({ name: "", hp: "", tel: "", zipcode: "", addr1: "", addr2: "", admcode: "", place: "", is_default: false });
const fromAddr = (a: SavedAddress): FormState => ({
  id: a.id, name: a.name, hp: a.hp, tel: a.tel, zipcode: a.zipcode, addr1: a.addr1, addr2: a.addr2,
  admcode: a.admcode, place: a.place, is_default: a.is_default,
});

export default function AddressManager({ initial, countryOnoff = false, country = null, countries = [] }: { initial: SavedAddress[]; countryOnoff?: boolean; country?: CountryAddress | null; countries?: CountryOption[] }) {
  const router = useRouter();
  const [list, setList] = useState<SavedAddress[]>(initial);
  // router.refresh() 로 서버가 새 목록(initial)을 내려주면 클라이언트 목록에 동기화
  // (useState 는 마운트 시점 값만 잡으므로 prop 변화를 반영해야 저장 직후 목록이 갱신됨).
  useEffect(() => { setList(initial); }, [initial]);
  const [form, setForm] = useState<FormState | null>(null); // null=목록, 값=추가/수정 폼
  const [cform, setCform] = useState<CountryForm | null>(null); // 해외 배송지 폼
  const [zipOpen, setZipOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  // 국가 코드 → 표시명(한글)
  const countryName = (code: string) => countries.find((c) => c.code === code)?.name_kr || code;

  async function saveCountry() {
    if (!cform || busy) return;
    setMsg("");
    if (!cform.name.trim()) { setMsg("받는분을 입력해 주세요."); return; }
    if (cform.hp.replace(/[^0-9]/g, "").length < 7) { setMsg("연락처를 확인해 주세요."); return; }
    if (!cform.country) { setMsg("국가를 선택해 주세요."); return; }
    if (!cform.postcode.trim()) { setMsg("우편번호(Zip code)를 입력해 주세요."); return; }
    if (!cform.city.trim()) { setMsg("도시(City)를 입력해 주세요."); return; }
    if (!cform.detail.trim()) { setMsg("주소(Address)를 입력해 주세요."); return; }
    setBusy(true);
    try {
      const r = await fetch("/account/address/save", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "country", name: cform.name.trim(), hp: cform.hp.replace(/[^0-9]/g, ""), country: cform.country, postcode: cform.postcode.trim(), state: cform.state.trim(), city: cform.city.trim(), detail: cform.detail.trim() }),
      });
      const d = await r.json();
      if (!d.ok) { setMsg(d.error || "저장에 실패했습니다."); setBusy(false); return; }
      setCform(null); setBusy(false); await reload();
    } catch { setMsg("통신 오류가 발생했습니다."); setBusy(false); }
  }

  async function removeCountry() {
    if (busy || !country) return;
    if (!confirm("해외 배송지를 삭제하시겠습니까?")) return;
    setBusy(true);
    try {
      const r = await fetch("/account/address/save", {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "country" }),
      });
      const d = await r.json();
      if (!d.ok) { alert(d.error || "삭제에 실패했습니다."); setBusy(false); return; }
      setBusy(false); await reload();
    } catch { alert("통신 오류가 발생했습니다."); setBusy(false); }
  }

  async function reload() {
    // 서버 컴포넌트 재조회로 최신 목록 반영
    router.refresh();
  }

  async function save() {
    if (!form || busy) return;
    setMsg("");
    if (!form.place.trim()) { setMsg("주소 명칭을 입력해 주세요."); return; }
    if (!form.name.trim()) { setMsg("받는분을 입력해 주세요."); return; }
    if (form.hp.replace(/[^0-9]/g, "").length < 10) { setMsg("연락처를 확인해 주세요."); return; }
    if (!form.zipcode || !form.addr1) { setMsg("주소를 검색해 주세요."); return; }
    setBusy(true);
    try {
      const r = await fetch("/account/address/save", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id,
          name: form.name.trim(), hp: form.hp.replace(/[^0-9]/g, ""), tel: form.tel.replace(/[^0-9]/g, ""),
          zipcode: form.zipcode, addr1: form.addr1, addr2: form.addr2.trim(),
          admcode: form.admcode, place: form.place, is_default: form.is_default,
        }),
      });
      const d = await r.json();
      if (!d.ok) { setMsg(d.error || "저장에 실패했습니다."); setBusy(false); return; }
      setForm(null); setBusy(false);
      await reload();
    } catch { setMsg("통신 오류가 발생했습니다."); setBusy(false); }
  }

  async function remove(a: SavedAddress) {
    if (busy) return;
    if (a.is_default) { alert("기본 배송지는 삭제할 수 없습니다. 다른 배송지를 기본으로 지정한 뒤 삭제해 주세요."); return; }
    if (!confirm("이 배송지를 삭제하시겠습니까?")) return;
    setBusy(true);
    try {
      const r = await fetch("/account/address/save", {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.id }),
      });
      const d = await r.json();
      if (!d.ok) { alert(d.error || "삭제에 실패했습니다."); setBusy(false); return; }
      setBusy(false); await reload();
    } catch { alert("통신 오류가 발생했습니다."); setBusy(false); }
  }

  async function makeDefault(a: SavedAddress) {
    if (busy || a.is_default) return;
    setBusy(true);
    try {
      const r = await fetch("/account/address/save", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id, name: a.name, hp: a.hp, tel: a.tel, zipcode: a.zipcode, addr1: a.addr1, addr2: a.addr2, admcode: a.admcode, place: a.place, is_default: true }),
      });
      const d = await r.json();
      if (!d.ok) { alert(d.error || "기본 배송지 설정에 실패했습니다."); setBusy(false); return; }
      setBusy(false); await reload();
    } catch { alert("통신 오류가 발생했습니다."); setBusy(false); }
  }

  // ── 해외 배송지 폼(회원당 1개) ──
  if (cform) {
    const set = (k: keyof CountryForm, v: string) => setCform({ ...cform, [k]: v });
    return (
      <div className={cardCls}>
        <h1 className="text-xl">{country ? "해외 배송지 수정" : "해외 배송지 추가"}</h1>
        <p className="mt-1 text-[13px] text-sub">해외 배송지는 1개만 등록할 수 있습니다.</p>

        <label className={labelCls}>받는분 (Name) *</label>
        <input value={cform.name} onChange={(e) => set("name", e.target.value)} maxLength={20} className={fieldCls} />

        <label className={labelCls}>국가 (Country) *</label>
        <select value={cform.country} onChange={(e) => set("country", e.target.value)}
          className={`select-arrow ${fieldCls} cursor-pointer pr-9`}>
          <option value="">국가를 선택해 주세요</option>
          {countries.map((c) => <option key={c.code} value={c.code}>{c.name_kr} ({c.name_us})</option>)}
        </select>

        <label className={labelCls}>우편번호 (Zip code) *</label>
        <input value={cform.postcode} onChange={(e) => set("postcode", e.target.value)} maxLength={10} className={fieldCls} />

        <label className={labelCls}>주 (State/Province)</label>
        <input value={cform.state} onChange={(e) => set("state", e.target.value)} maxLength={50} className={fieldCls} />

        <label className={labelCls}>도시 (City) *</label>
        <input value={cform.city} onChange={(e) => set("city", e.target.value)} maxLength={50} className={fieldCls} />

        <label className={labelCls}>주소 (Address) *</label>
        <input value={cform.detail} onChange={(e) => set("detail", e.target.value)} maxLength={50} placeholder="Street, building, etc." className={fieldCls} />

        <label className={labelCls}>연락처 (Phone) *</label>
        <input value={cform.hp} onChange={(e) => set("hp", e.target.value)} maxLength={20} placeholder="숫자만 입력" className={fieldCls} />

        {msg && <p className="mt-3 text-[13px] text-sale">{msg}</p>}

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={() => { setCform(null); setMsg(""); }} className={`${bigBtnCls(true)} mt-0 flex-[0_0_35%] !bg-line !text-text`}>취소</button>
          <button type="button" onClick={saveCountry} disabled={busy} className={`${bigBtnCls(!busy)} mt-0 flex-1`}>{busy ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    );
  }

  // ── 추가/수정 폼 ──
  if (form) {
    const set = (k: keyof FormState, v: string | boolean) => setForm({ ...form, [k]: v });
    return (
      <div className={cardCls}>
        <h1 className="text-xl">{form.id ? "배송지 수정" : "배송지 추가"}</h1>

        <label className={labelCls}>주소 명칭 *</label>
        <input value={form.place} onChange={(e) => set("place", e.target.value)} maxLength={15} placeholder="예: 우리집, 회사" className={fieldCls} />

        <label className={labelCls}>받는분 *</label>
        <input value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={50} className={fieldCls} />

        <label className={labelCls}>연락처 *</label>
        <input value={form.hp} onChange={(e) => set("hp", e.target.value)} placeholder="010-0000-0000" className={fieldCls} />

        <label className={labelCls}>추가 연락처</label>
        <input value={form.tel} onChange={(e) => set("tel", e.target.value)} placeholder="02-000-0000" className={fieldCls} />

        <label className={labelCls}>우편번호 *</label>
        <div className="mt-2 flex items-center gap-2">
          <input value={form.zipcode} readOnly placeholder="주소 검색을 눌러주세요" className={`${fieldCls} !mt-0`} />
          <button type="button" onClick={() => setZipOpen(true)} className={inlineBtnCls}>주소 검색</button>
        </div>
        <label className={labelCls}>기본주소 *</label>
        <input value={form.addr1} readOnly placeholder="주소 검색으로 자동 입력" className={fieldCls} />
        <label className={labelCls}>상세주소</label>
        <input value={form.addr2} onChange={(e) => set("addr2", e.target.value)} maxLength={100} placeholder="동/호수 등" className={fieldCls} />

        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-text">
          <input type="checkbox" checked={form.is_default} onChange={(e) => set("is_default", e.target.checked)} />
          기본 배송지로 설정
        </label>

        {msg && <p className="mt-3 text-[13px] text-sale">{msg}</p>}

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={() => { setForm(null); setMsg(""); }} className={`${bigBtnCls(true)} mt-0 flex-[0_0_35%] !bg-line !text-text`}>취소</button>
          <button type="button" onClick={save} disabled={busy} className={`${bigBtnCls(!busy)} mt-0 flex-1`}>{busy ? "저장 중…" : "저장"}</button>
        </div>

        {zipOpen && (
          <Zipcode onClose={(val) => {
            setZipOpen(false);
            // place 는 "주소 명칭"(사용자 라벨). 이미 입력했으면 유지하고, 비어 있을 때만 검색 건물명으로 자동채움.
            if (val) setForm((f) => f && ({ ...f, zipcode: val.zipcode, addr1: val.address, admcode: val.admcode, place: f.place || val.place }));
          }} />
        )}
      </div>
    );
  }

  // ── 목록 ──
  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between">
        <h1 className="text-xl">배송지 관리</h1>
        <button type="button" onClick={() => { setForm(empty()); setMsg(""); }} className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:opacity-90">배송지 추가</button>
      </div>

      {list.length === 0 ? (
        <p className="mt-8 text-center text-sm text-sub">저장된 배송지가 없습니다. “배송지 추가”로 등록해 주세요.</p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-line">
          {list.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-3 py-4 first:pt-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {a.place && <span className="font-semibold text-text">{a.place}</span>}
                  {a.is_default && <span className="rounded-sm bg-accent/10 px-1.5 py-0.5 text-[11px] font-semibold text-accent">기본 배송지</span>}
                </div>
                <p className="mt-0.5 text-[13px] text-text">{a.name}</p>
                <p className="mt-0.5 text-[13px] text-sub">{a.hp}{a.tel ? ` · ${a.tel}` : ""}</p>
                <p className="mt-1 text-[13px] text-text">({a.zipcode}) {a.addr1} {a.addr2}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {!a.is_default && <button type="button" onClick={() => makeDefault(a)} disabled={busy} className="h-7 rounded-md border border-line px-2.5 text-[12px] text-text hover:bg-surface">기본으로 설정</button>}
                  <button type="button" onClick={() => { setForm(fromAddr(a)); setMsg(""); }} className="h-7 rounded-md border border-line px-2.5 text-[12px] text-text hover:bg-surface">수정</button>
                  {!a.is_default && <button type="button" onClick={() => remove(a)} disabled={busy} className="h-7 rounded-md border border-line px-2.5 text-[12px] text-sub hover:border-sale hover:text-sale">삭제</button>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* 해외 배송지 — 쇼핑몰이 해외배송을 사용할 때만. 1개만 등록 가능(있으면 수정/삭제). */}
      {countryOnoff && (
        <div className="mt-8 border-t border-line pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-text">해외 배송지</h2>
              <p className="mt-0.5 text-[12px] text-sub">해외 배송지는 1개만 등록할 수 있습니다.</p>
            </div>
            {!country && (
              <button type="button" onClick={() => { setCform(emptyCountry()); setMsg(""); }} className="h-9 shrink-0 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:opacity-90">해외 배송지 추가</button>
            )}
          </div>

          {country ? (
            <div className="mt-4 rounded-lg border border-line bg-surface/40 p-4">
              <p className="text-[13px] font-semibold text-text">{country.name}</p>
              <p className="mt-0.5 text-[13px] text-sub">{country.hp}</p>
              <p className="mt-1 text-[13px] text-text">
                {countryName(country.country)} · {country.detail}{country.city ? `, ${country.city}` : ""}{country.state ? `, ${country.state}` : ""} {country.postcode}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" onClick={() => { setCform(fromCountry(country)); setMsg(""); }} className="h-7 rounded-md border border-line px-2.5 text-[12px] text-text hover:bg-surface">수정</button>
                <button type="button" onClick={removeCountry} disabled={busy} className="h-7 rounded-md border border-line px-2.5 text-[12px] text-sub hover:border-sale hover:text-sale">삭제</button>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-center text-sm text-sub">등록된 해외 배송지가 없습니다.</p>
          )}
        </div>
      )}
    </div>
  );
}
