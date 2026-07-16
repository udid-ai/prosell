"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProductInquiry, InquiryPermission } from "@/lib/prosell";
import { formatDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import InquiryFormModal, { type InquiryOption } from "./InquiryFormModal";
import InquiryPasswordModal from "./InquiryPasswordModal";

// 상품 상세 «상품문의» 뷰.
//  · 목록은 공개(읽기 전용). 비밀글(secret)은 내용/답변을 숨기고 «비밀글» 로만 표기.
//  · 작성/수정은 로그인 회원만 → 모달(InquiryFormModal). 본인 문의(is_mine)만 «수정» 노출.
//  · 초기 목록은 서버(ISR 캐시)에서 주입, 추가 페이지는 /api/inquiries 프록시 사용.

function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function InquiryCard({ q, unlockedItem, onEdit, onDelete, onUnlock }: {
  q: ProductInquiry;
  unlockedItem?: ProductInquiry;                 // 비밀번호 검증으로 잠금해제된 전체 내용(있으면 우선 사용)
  onEdit: (q: ProductInquiry) => void;
  onDelete: (q: ProductInquiry) => void;
  onUnlock: (q: ProductInquiry) => void;         // 잠긴 비회원 비밀글 클릭 → 비밀번호 모달
}) {
  const [open, setOpen] = useState(false);
  const item = unlockedItem ?? q;                // 잠금해제되면 그 내용으로 표시
  const secret = q.secret === 1;
  // 실제로 내용이 가려졌는지(백엔드가 권한대로 채우거나 가림). 잠금해제되면 내용이 채워져 hidden=false.
  const hidden = secret && item.title == null && item.content == null;
  // 잠긴 «비회원 비밀글» — 클릭 시 토글 대신 비밀번호 모달로 잠금해제.
  const guestLocked = q.is_guest === 1 && secret && !unlockedItem && q.title == null;

  // 잠금해제되면 자동으로 펼친다.
  useEffect(() => { if (unlockedItem) setOpen(true); }, [unlockedItem]);

  const onToggle = () => { if (guestLocked) { onUnlock(q); return; } setOpen((v) => !v); };

  return (
    <li className="border-b border-line">
      <button type="button" onClick={onToggle}
        className="flex w-full items-center gap-3 py-4 text-left">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-surface text-[13px] font-bold text-accent">Q</span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          {item.category && <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-sub">{item.category}</span>}
          {secret && <LockIcon className="h-3.5 w-3.5 shrink-0 text-sub" />}
          <span className="truncate text-sm font-medium text-text">{hidden ? "비밀글입니다." : (item.title || "상품문의")}</span>
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${q.answered ? "bg-accent/10 text-accent" : "bg-surface text-sub"}`}>
          {q.answered ? "답변완료" : "답변대기"}
        </span>
        <span className="hidden shrink-0 text-[12px] text-sub sm:inline">{q.name || "작성자"}</span>
        <span className="hidden shrink-0 text-[12px] text-sub sm:inline">{q.dt ? formatDateTime(q.dt, false) : ""}</span>
        <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 text-sub transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          {guestLocked ? <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></> : <path d="m6 9 6 6 6-6" />}
        </svg>
      </button>

      {open && !guestLocked && (
        <div className="pb-5 pl-9 pr-1">
          {hidden ? (
            <p className="rounded-lg bg-surface p-3 text-[13px] text-sub">비밀글로 작성된 문의입니다. 작성자와 판매자만 볼 수 있습니다.</p>
          ) : (
            <>
              {item.content && <p className="whitespace-pre-line text-sm leading-relaxed text-text">{item.content}</p>}
              {item.files && item.files.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.files.filter((f) => f.src || f.thumb).map((f) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <a key={f.id} href={f.src || f.thumb || "#"} target="_blank" rel="noopener noreferrer" className="h-20 w-20 overflow-hidden rounded-lg border border-line bg-surface">
                      <img src={f.thumb || f.src || ""} alt="" className="h-full w-full object-cover" loading="lazy" />
                    </a>
                  ))}
                </div>
              )}
              {item.video_src && (
                <div className={`mt-3 overflow-hidden rounded-lg border border-line bg-black ${item.video_src.includes("instagram.com") ? "aspect-[4/5] max-w-sm" : "aspect-video max-w-md"} w-full`}>
                  <iframe src={item.video_src} className="h-full w-full" allow="autoplay; encrypted-media" allowFullScreen scrolling="no" title="문의 동영상" />
                </div>
              )}
              {item.url && (
                <a href={item.url} target="_blank" rel="noopener noreferrer nofollow"
                  className="mt-3 inline-flex max-w-full items-center gap-1 truncate text-[13px] text-accent underline underline-offset-2 hover:opacity-80">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                  <span className="truncate">{item.url}</span>
                </a>
              )}
              {/* 답변 — 잠금해제된 item 을 본다. 목록(q)은 비밀글이라 답변을 숨긴 채 내려오므로 q 를 쓰면 답변이 안 보인다. */}
              {item.reply_content && (
                <div className="mt-3 rounded-lg bg-surface p-3">
                  <div className="flex items-center gap-2 text-[12px] font-semibold text-text">
                    <span className="rounded bg-accent px-1.5 py-0.5 text-[11px] text-accent-foreground">답변</span>
                    {item.reply_name || "판매자"}
                    {item.reply_dt ? <span className="font-normal text-sub">· {formatDateTime(item.reply_dt, false)}</span> : null}
                  </div>
                  <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-sub">{item.reply_content}</p>
                </div>
              )}
            </>
          )}
          {/* 수정/삭제 — 회원 본인(is_mine) 또는 비회원 작성글(is_guest, 비밀번호 확인). 답변 전만. */}
          {(q.is_mine === 1 || q.is_guest === 1) && !q.answered && (
            <div className="mt-3 flex justify-end gap-1.5">
              <button type="button" onClick={() => onEdit(q)}
                className="rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-text hover:bg-surface">수정</button>
              <button type="button" onClick={() => onDelete(q)}
                className="rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-text hover:border-sale hover:text-sale">삭제</button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

const grayBtn = "shrink-0 rounded-lg border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-sub hover:text-text";

export default function ProductInquiries({
  productsId,
  productId,
  options = [],
  productTitle,
  initialItems,
  total,
  loggedIn,
  permission,
  categories = [],
  recaptchaSitekey = "",
  unified = true,
  boardSecret = 1,
  onCountChange,
}: {
  productsId: number | string;
  productId: number | string; // 문의 작성 대상 «옵션» id(단일/폴백)
  options?: InquiryOption[];   // 옵션 2개 이상이면 작성 모달에서 선택
  productTitle?: string;       // 단일 옵션일 때 문의 대상 상품명
  initialItems: ProductInquiry[];
  total: number;
  loggedIn: boolean;
  permission: InquiryPermission; // 작성 권한(level_write/can_write/guest_writable)
  categories?: string[];         // 통합 게시판 카테고리(작성/수정 모달 분류 선택)
  recaptchaSitekey?: string;     // 비회원 등록 reCAPTCHA v3 사이트키
  unified?: boolean;             // 통합 게시판 여부(URL/동영상/첨부 입력 노출)
  boardSecret?: number;          // 게시판 설정 — 0=비밀글 미사용 / 1=작성자 선택 / 2=전체 적용
  onCountChange?: (n: number) => void; // 카운트 변화를 부모(탭 라벨)에 올린다
}) {
  const [items, setItems] = useState<ProductInquiry[]>(initialItems);
  const [count, setCount] = useState(total);
  // 등록·삭제로 count 가 바뀌면 부모 탭 라벨도 갱신되도록 올린다.
  useEffect(() => { onCountChange?.(count); }, [count, onCountChange]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(initialItems.length >= total);

  const [writeOpen, setWriteOpen] = useState(false);
  const [editItem, setEditItem] = useState<ProductInquiry | null>(null);
  const [editPassword, setEditPassword] = useState(""); // 비회원 수정 시 검증된 비밀번호(저장에 재사용)
  const [pwModal, setPwModal] = useState<{ action: "view" | "edit" | "delete"; q: ProductInquiry } | null>(null);
  const [unlocked, setUnlocked] = useState<Record<number, ProductInquiry>>({}); // 비밀번호 검증으로 열람 허용된 비회원 비밀글(=읽기 토큰)

  const isGuestItem = (q: ProductInquiry) => q.is_guest === 1 && q.is_mine !== 1;

  // 잠긴 비회원 비밀글 클릭 → 비밀번호 확인 모달(읽기).
  const handleUnlock = (q: ProductInquiry) => setPwModal({ action: "view", q });
  // 수정 클릭 — 회원 본인=바로 수정 모달 / 비회원=비밀번호 확인 후 본문 로드해서 수정 모달.
  const handleEdit = (q: ProductInquiry) => {
    if (isGuestItem(q)) setPwModal({ action: "edit", q });
    else { setEditPassword(""); setEditItem(q); }
  };
  // 삭제 클릭 — 회원 본인=확인 후 삭제 / 비회원=비밀번호 확인 모달.
  const handleDelete = async (q: ProductInquiry) => {
    if (isGuestItem(q)) { setPwModal({ action: "delete", q }); return; }
    if (!window.confirm("이 문의를 삭제할까요?")) return;
    const res = await fetch("/api/inquiry", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: q.id }) });
    const j = await res.json().catch(() => null);
    if (!j?.ok) { toast(j?.error || "문의 삭제에 실패했습니다.", "error"); return; }
    toast("문의를 삭제했습니다.", "success");
    load(1);
  };
  // 저장 완료 — 목록 갱신 + 비회원(비밀번호 보유) 글이면 잠금해제 캐시를 최신 내용으로 갱신(수정 반영/작성 자동열람).
  const handleSaved = async (created?: { id?: number; upw?: string; secret?: boolean }) => {
    load(1);
    if (created?.id && created.upw) {
      const r = await fetch("/api/inquiry/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: created.id, upw: created.upw }) });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; item?: ProductInquiry } | null;
      if (j?.ok && j.item) setUnlocked((p) => ({ ...p, [created.id!]: { ...j.item!, is_guest: 1, is_mine: 0 } }));
      else setUnlocked((p) => { const n = { ...p }; delete n[created.id!]; return n; }); // 비밀글 아님 등 → 캐시 제거해 목록 최신값 사용
    }
  };
  // 비밀번호 모달 확인 — 성공 시 null, 실패 시 에러 메시지.
  const onPwSubmit = async (upw: string): Promise<string | null> => {
    if (!pwModal) return "잘못된 요청입니다.";
    const q = pwModal.q;
    if (pwModal.action === "delete") {
      const res = await fetch("/api/inquiry", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: q.id, upw }) });
      const j = await res.json().catch(() => null);
      if (!j?.ok) return j?.error || "삭제에 실패했습니다.";
      toast("문의를 삭제했습니다.", "success");
      setPwModal(null); load(1); return null;
    }
    // view/edit — 검증 + 본문 로드
    const res = await fetch("/api/inquiry/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: q.id, upw }) });
    const j = (await res.json().catch(() => null)) as { ok?: boolean; item?: ProductInquiry; error?: string } | null;
    if (!j?.ok || !j.item) return j?.error || "비밀번호 확인에 실패했습니다.";
    const full = { ...j.item, is_guest: 1, is_mine: 0 };
    setUnlocked((p) => ({ ...p, [q.id]: full })); // 읽기 토큰 저장
    if (pwModal.action === "edit") { setEditPassword(upw); setEditItem(full); }
    setPwModal(null);
    return null;
  };

  const load = useCallback(async (nextPage: number) => {
    setLoading(true);
    try {
      const u = new URL("/api/inquiries", window.location.origin);
      u.searchParams.set("products_id", String(productsId));
      u.searchParams.set("page", String(nextPage));
      const res = await fetch(u.toString());
      const j = (await res.json().catch(() => null)) as { items?: ProductInquiry[]; total_count?: number } | null;
      const rows = j?.items ?? [];
      setItems((prev) => (nextPage === 1 ? rows : [...prev, ...rows]));
      setCount(Number(j?.total_count ?? 0));
      const loaded = (nextPage === 1 ? 0 : items.length) + rows.length;
      setDone(rows.length < 10 || loaded >= Number(j?.total_count ?? 0));
      setPage(nextPage);
    } finally {
      setLoading(false);
    }
  }, [productsId, items.length]);

  return (
    <div>
      {/* 헤더: 타이틀 + 우측 액션(자주묻는질문 · 1:1문의 · 문의하기) */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-text">상품문의 {count > 0 ? `(${count.toLocaleString()})` : ""}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <a href="/faq" className={grayBtn}>자주묻는질문</a>
          <a href="/account/qna" className={grayBtn}>1:1 문의</a>
          {/* 작성 권한(level_write) 게이트:
              · 로그인 회원 + can_write → 문의하기
              · 비회원 + guest_writable → 비회원 문의하기(이름/비번 모달)
              · 비회원 + 회원전용(level_write>0) → 로그인 유도 */}
          {loggedIn ? (
            permission.can_write ? (
              <button type="button" onClick={() => setWriteOpen(true)}
                className="shrink-0 rounded-lg border border-accent bg-accent px-4 py-2 text-[13px] font-semibold text-accent-foreground hover:opacity-90">
                문의하기
              </button>
            ) : (
              <span className="shrink-0 rounded-lg border border-line bg-surface px-4 py-2 text-[13px] font-semibold text-sub">문의 작성 권한이 없습니다</span>
            )
          ) : permission.guest_writable ? (
            <button type="button" onClick={() => setWriteOpen(true)}
              className="shrink-0 rounded-lg border border-accent bg-accent px-4 py-2 text-[13px] font-semibold text-accent-foreground hover:opacity-90">
              문의하기
            </button>
          ) : permission.level_write > 0 ? (
            <a href="/auth/login" className="shrink-0 rounded-lg border border-line px-4 py-2 text-[13px] font-semibold text-text hover:bg-surface">
              로그인하고 문의하기
            </a>
          ) : null}
        </div>
      </div>

      {/* 목록 */}
      {items.length === 0 ? (
        <p className="py-10 text-center text-sub">등록된 상품 문의가 없습니다.</p>
      ) : (
        <ul className="border-t border-line">
          {items.map((q) => <InquiryCard key={q.id} q={q} unlockedItem={unlocked[q.id]} onEdit={handleEdit} onDelete={handleDelete} onUnlock={handleUnlock} />)}
        </ul>
      )}

      {!done && (
        <div className="mt-6 text-center">
          <button type="button" disabled={loading} onClick={() => load(page + 1)}
            className="rounded-lg border border-line bg-surface px-6 py-2.5 text-sm font-semibold text-text hover:bg-line disabled:opacity-60">
            {loading ? "불러오는 중…" : "문의 더보기"}
          </button>
        </div>
      )}

      {/* 작성 모달 (회원/비회원 공용) */}
      {writeOpen && (
        <InquiryFormModal productId={productId} options={options} productTitle={productTitle} categories={categories} loggedIn={loggedIn} recaptchaSitekey={recaptchaSitekey} unified={unified}
          boardSecret={boardSecret} notifyHp={permission.notify_hp} notifyEmail={permission.notify_email} onClose={() => setWriteOpen(false)} onSaved={handleSaved} />
      )}
      {/* 수정 모달 — 비회원 작성글은 이미 비밀번호 검증됨(editPassword) → 폼에선 비밀번호 재입력 없이 저장에 재사용 */}
      {editItem && (
        <InquiryFormModal productId={productId} options={options} productTitle={productTitle} categories={categories} editing={editItem}
          passwordRequired={editItem.is_guest === 1 && editItem.is_mine !== 1}
          initialPassword={editPassword} unified={unified}
          boardSecret={boardSecret} notifyHp={permission.notify_hp} notifyEmail={permission.notify_email}
          onClose={() => { setEditItem(null); setEditPassword(""); }} onSaved={handleSaved} />
      )}
      {/* 비회원 수정/삭제 비밀번호 확인 모달 */}
      {pwModal && (
        <InquiryPasswordModal action={pwModal.action} onSubmit={onPwSubmit} onClose={() => setPwModal(null)} />
      )}
    </div>
  );
}
