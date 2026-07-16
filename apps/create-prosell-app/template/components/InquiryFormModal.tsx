"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";
import { getRecaptchaToken } from "@/lib/recaptcha";
import type { ProductInquiry } from "@/lib/prosell";

export type InquiryOption = { id: number; label: string }; // 문의 대상 상품옵션(item)

type UpFile = { id: number; preview: string };
const MAX_PHOTOS = 5;

// 상품문의 작성/수정 모달 — 레거시 상품문의 작성폼(view.js) 항목 반영.
//  · 작성: 상품(옵션) 선택 + 제목 + 내용(글자수) + 비밀글 + 답변 알림(문자/이메일). POST /api/inquiry
//  · 수정: 제목/내용/비밀글(레거시도 수정은 본문 위주). PUT /api/inquiry
export default function InquiryFormModal({
  productId,
  options = [],
  productTitle,
  categories = [],
  editing,
  loggedIn = true,
  passwordRequired = false,
  initialPassword = "",
  recaptchaSitekey = "",
  unified = true,
  boardSecret = 1,
  notifyHp = 0,
  notifyEmail = 0,
  onClose,
  onSaved,
}: {
  productId: number | string;        // 기본 작성 대상 «옵션» id (단일 옵션이거나 미선택 폴백)
  options?: InquiryOption[];          // 옵션이 2개 이상이면 선택 셀렉트 노출
  productTitle?: string;              // 단일 옵션일 때 문의 대상 상품명 표시
  categories?: string[];              // 통합 게시판 카테고리(use_category=1) — 있으면 분류 선택 노출
  editing?: ProductInquiry | null;    // 수정 모드일 때 대상 문의
  loggedIn?: boolean;                 // 비로그인(비회원)이면 이름/비밀번호 입력 노출
  passwordRequired?: boolean;         // 비회원 작성글 «수정» 시 비밀번호 확인 필요
  initialPassword?: string;           // 사전 검증된 비밀번호(있으면 폼에서 비번 필드 숨기고 저장에 재사용)
  recaptchaSitekey?: string;          // 설정 시 비회원 «등록»에서 reCAPTCHA v3 토큰 발급(수정 미적용)
  unified?: boolean;                  // 통합 게시판일 때만 URL/동영상/첨부 입력 노출(개별 게시판은 미지원)
  boardSecret?: number;               // 게시판 설정 — 0=비밀글 미사용 / 1=작성자 선택 / 2=전체 적용
  notifyHp?: number;                  // 문자 답변 알림 체크박스 노출(환경설정 inquiry_answer + 회원 연락처 보유)
  notifyEmail?: number;               // 이메일 답변 알림 체크박스 노출(〃 + 회원 이메일 보유)
  onClose: () => void;
  // 저장 완료. 작성이면 생성정보(비회원 비밀글 자동 잠금해제용)를 넘긴다.
  onSaved: (created?: { id?: number; upw?: string; secret?: boolean }) => void;
}) {
  const isEdit = !!editing;
  const isGuest = !isEdit && !loggedIn;
  const verified = passwordRequired && initialPassword !== ""; // 이미 검증됨 → 비번 필드 숨김
  const multi = options.length > 1; // 옵션 2개 이상이면 작성·수정 모두 선택 가능
  const [optionId, setOptionId] = useState<number | string>(
    isEdit ? (editing?.product_id || options[0]?.id || productId) : (multi ? "" : (options[0]?.id ?? productId)),
  );
  const [category, setCategory] = useState(editing?.category ?? "");
  const [name, setName] = useState("");
  const [upw, setUpw] = useState(initialPassword);
  const [title, setTitle] = useState(editing?.title ?? "");
  const [content, setContent] = useState(editing?.content ?? "");
  const [url, setUrl] = useState(editing?.url ?? "");
  const [videoUrl, setVideoUrl] = useState(editing?.video_src ?? "");
  const [secret, setSecret] = useState(boardSecret === 2 ? true : editing?.secret === 1);
  const [sendPhone, setSendPhone] = useState(editing?.send_phone === 1);
  const [sendEmail, setSendEmail] = useState(editing?.send_email === 1);
  const [photos, setPhotos] = useState<UpFile[]>((editing?.files ?? []).map((f) => ({ id: f.id, preview: f.thumb || f.src || "" })));
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const notify = notifyHp === 1 || notifyEmail === 1; // 답변 알림 체크박스 노출 여부(환경설정 기반)
  const useSecret = boardSecret === 1; // «선택»일 때만 체크박스 노출(0=미사용, 2=전체적용은 서버가 강제)

  // 동영상 링크 임베드 지원 도메인(리뷰와 동일)
  const VIDEO_RE = /^(https?:\/\/)?([\w-]+\.)*(youtube\.com|youtu\.be|vimeo\.com|naver\.com|naver\.me|kakao\.com|instagram\.com)\//i;

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!list.length) return;
    if (photos.length + list.length > MAX_PHOTOS) { toast(`사진은 최대 ${MAX_PHOTOS}장까지 첨부할 수 있습니다.`, "error"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      list.forEach((f, i) => fd.append(`file${i}`, f, f.name));
      const res = await fetch("/api/inquiry/upload", { method: "POST", body: fd });
      const j = await res.json().catch(() => null);
      if (!j?.ok) { toast(j?.error || "사진 업로드에 실패했습니다.", "error"); setUploading(false); return; }
      const items = (j.items as { id: number; thumb?: string; src?: string }[]) ?? [];
      setPhotos((prev) => [...prev, ...items.map((it) => ({ id: it.id, preview: it.thumb || it.src || "" }))]);
    } catch { toast("사진 업로드 중 오류가 발생했습니다.", "error"); }
    setUploading(false);
  }
  const removePhoto = (id: number) => setPhotos((prev) => prev.filter((p) => p.id !== id));

  const submit = async () => {
    if (busy) return;
    const t = title.trim(), c = content.trim(), u = url.trim(), v = videoUrl.trim(), nm = name.trim();
    if (multi && !optionId) { toast("문의할 상품을 선택해 주세요.", "error"); return; }
    if (isGuest && !nm) { toast("작성자명을 입력해 주세요.", "error"); return; }
    if ((isGuest || passwordRequired) && !upw) { toast("비밀번호를 입력해 주세요.", "error"); return; }
    if (!t) { toast("제목을 입력해 주세요.", "error"); return; }
    if (!c) { toast("문의 내용을 입력해 주세요.", "error"); return; }
    if (v && !VIDEO_RE.test(v)) { toast("동영상 링크는 YouTube, Vimeo, Naver, Kakao, Instagram 만 추가할 수 있습니다.", "error"); return; }
    setBusy(true);
    try {
      // 비회원 «등록»이고 사이트키가 있으면 reCAPTCHA v3 토큰 발급(수정엔 미적용).
      let recaptcha = "";
      if (isGuest && recaptchaSitekey) {
        recaptcha = await getRecaptchaToken(recaptchaSitekey, "inquiry");
        if (!recaptcha) { toast("reCAPTCHA 인증에 실패했습니다. 다시 시도해 주세요.", "error"); setBusy(false); return; }
      }
      const res = await fetch("/api/inquiry", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isEdit
            ? { id: editing!.id, product_id: optionId, title: t, content: c, secret: secret ? 1 : 0, url: u, video_url: v, category, files: photos.map((p) => p.id),
                ...(passwordRequired ? { upw } : {}),
                // 답변 수신은 회원만 — 체크박스가 노출된 경우에만 전송.
                ...(!isGuest && notify ? { send_phone: sendPhone ? 1 : 0, send_email: sendEmail ? 1 : 0 } : {}) }
            : { product_id: optionId, title: t, content: c, secret: secret ? 1 : 0, url: u, video_url: v, category, files: photos.map((p) => p.id),
                ...(isGuest ? { name: nm, upw, recaptcha } : (notify ? { send_phone: sendPhone ? 1 : 0, send_email: sendEmail ? 1 : 0 } : {})) },
        ),
      });
      const j = await res.json().catch(() => null);
      if (!j?.ok) { toast(j?.error || (isEdit ? "문의 수정에 실패했습니다." : "문의 등록에 실패했습니다."), "error"); setBusy(false); return; }
      toast(isEdit ? "문의를 수정했습니다." : "상품문의를 등록했습니다.", "success");
      // 저장 정보 전달 — 비회원(비밀번호)일 때 부모가 잠금해제 캐시를 최신 내용으로 갱신하도록.
      onSaved(
        isEdit
          ? { id: editing!.id, upw: passwordRequired ? upw : undefined, secret }
          : { id: Number(j?.id) || undefined, upw: isGuest ? upw : undefined, secret },
      );
      onClose();
    } catch { toast("요청 중 오류가 발생했습니다.", "error"); setBusy(false); }
  };

  const rowLabel = "mb-1 text-[13px] font-semibold text-text";
  const fieldCls = "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-text outline-none focus:border-accent";

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={isEdit ? "문의 수정" : "문의하기"}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-md flex-col rounded-xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-lg font-bold text-text">{isEdit ? "문의 수정" : "상품문의 작성"}</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="grid h-8 w-8 place-items-center rounded-full text-text hover:bg-line">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* 비회원 작성글 수정 — 비밀번호 확인(사전 검증(verified)됐으면 숨김) */}
          {passwordRequired && !verified && (
            <div className="mb-4">
              <p className={rowLabel}>비밀번호 <span className="text-sale">*</span></p>
              <input type="password" value={upw} onChange={(e) => setUpw(e.target.value)} maxLength={100}
                placeholder="작성 시 입력한 비밀번호" className={fieldCls} />
            </div>
          )}

          {/* 문의 분류 — 통합 게시판 카테고리(use_category=1) */}
          {categories.length > 0 && (
            <div className="mb-4">
              <p className={rowLabel}>문의 분류</p>
              <select value={category} onChange={(e) => setCategory(e.target.value)}
                className={`select-arrow cursor-pointer pr-8 ${fieldCls}`}>
                <option value="">분류를 선택해 주세요</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {/* 문의 상품(옵션) — 작성·다옵션이면 선택, 수정·단일이면 상품명 표시(수정 시 대상 변경 없음) */}
          <div className="mb-4">
            <p className={rowLabel}>문의 상품 {multi && <span className="text-sale">*</span>}</p>
            {multi ? (
              <select value={optionId} onChange={(e) => setOptionId(e.target.value)}
                className={`select-arrow cursor-pointer pr-8 ${fieldCls}`}>
                <option value="">상품(옵션)을 선택해 주세요</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            ) : (
              <div className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-sub">{productTitle || options[0]?.label || "이 상품"}</div>
            )}
          </div>

          {/* 비회원: 작성자명 + 비밀번호(조회·삭제용) */}
          {isGuest && (
            <div className="mb-4 grid grid-cols-2 gap-2">
              <div>
                <p className={rowLabel}>이름 <span className="text-sale">*</span></p>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={20}
                  placeholder="작성자명" className={fieldCls} />
              </div>
              <div>
                <p className={rowLabel}>비밀번호 <span className="text-sale">*</span></p>
                <input type="password" value={upw} onChange={(e) => setUpw(e.target.value)} maxLength={100}
                  placeholder="조회·삭제용" className={fieldCls} />
              </div>
            </div>
          )}

          {/* 제목 */}
          <div className="mb-4">
            <p className={rowLabel}>제목 <span className="text-sale">*</span></p>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100}
              placeholder="제목을 입력해 주세요." className={fieldCls} />
          </div>

          {/* 내용 + 글자수 */}
          <div className="mb-4">
            <p className={rowLabel}>내용 <span className="text-sale">*</span> <span className="font-normal text-sub">({content.length} / 2000)</span></p>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} maxLength={2000} rows={6}
              placeholder="상품에 대해 궁금한 점을 입력해 주세요." className={`resize-none leading-relaxed ${fieldCls}`} />
          </div>

          {/* 참고 URL·동영상 링크·사진 첨부 — 통합 게시판에서만 지원(개별 게시판은 미지원). */}
          {unified && (
            <>
              {/* 첨부: 참고 URL */}
              <div className="mb-4">
                <p className={rowLabel}>참고 URL <span className="font-normal text-sub">(선택)</span></p>
                <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={255}
                  placeholder="https://" className={fieldCls} />
              </div>

              {/* 첨부: 동영상 링크 */}
              <div className="mb-4">
                <p className={rowLabel}>동영상 링크 <span className="font-normal text-sub">(YouTube · Vimeo · Naver · Kakao · Instagram)</span></p>
                <input type="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} maxLength={255}
                  placeholder="동영상 공유 링크를 붙여넣어 주세요." className={fieldCls} />
              </div>

              {/* 첨부: 이미지 */}
              <div className="mb-4">
                <p className={rowLabel}>사진 첨부 <span className="font-normal text-sub">(선택, 최대 {MAX_PHOTOS}장)</span></p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {photos.map((p) => (
                    <span key={p.id} className="relative h-16 w-16 overflow-hidden rounded-md border border-line bg-surface">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.preview} alt="" className="h-full w-full object-cover" />
                      <button type="button" onClick={() => removePhoto(p.id)} className="absolute right-0 top-0 grid h-5 w-5 place-items-center bg-black/50 text-[11px] text-white" aria-label="삭제">✕</button>
                    </span>
                  ))}
                  {photos.length < MAX_PHOTOS && (
                    <label className={`grid h-16 w-16 cursor-pointer place-items-center rounded-md border border-dashed border-input text-sub hover:border-accent ${uploading ? "opacity-50" : ""}`}>
                      <input type="file" accept="image/*" multiple className="hidden" onChange={onPickFiles} disabled={uploading} />
                      {uploading ? <span className="text-[11px]">업로드중</span> : <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>}
                    </label>
                  )}
                </div>
              </div>
            </>
          )}

          {/* 옵션: 비밀글 + 답변 알림 수신 */}
          <div className="flex flex-col gap-2">
            {useSecret && (
              <label className="flex items-center gap-2 text-[13px] text-text">
                <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} className="h-4 w-4 shrink-0 accent-accent" />
                {/* 텍스트를 하나의 span 으로 묶는다 — flex 라벨에서 텍스트 조각이 각각 flex item 이 되면 좁을 때 줄바꿈된다. */}
                <span>비밀글로 문의 <span className="text-sub">(작성자·판매자만 열람)</span></span>
              </label>
            )}
            {/* 답변 알림(문자/이메일) — 통합·개별 모두 지원. 노출 조건은 환경설정(setup_hp/setup_email 의 inquiry_answer onoff)
                + 회원이 연락처/이메일을 보유할 때. 답변 수신은 «회원»만 가능해 비회원에겐 미노출. */}
            {!isGuest && notifyHp === 1 && (
              <label className="flex items-center gap-2 text-[13px] text-text">
                <input type="checkbox" checked={sendPhone} onChange={(e) => setSendPhone(e.target.checked)} className="h-4 w-4 shrink-0 accent-accent" />
                <span>답변 등록 시 <span className="font-medium">문자(SMS)</span>로 알림받기</span>
              </label>
            )}
            {!isGuest && notifyEmail === 1 && (
              <label className="flex items-center gap-2 text-[13px] text-text">
                <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="h-4 w-4 shrink-0 accent-accent" />
                <span>답변 등록 시 <span className="font-medium">이메일</span>로 알림받기</span>
              </label>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-[13px] font-semibold text-text hover:bg-surface">취소</button>
          <button type="button" onClick={submit} disabled={busy}
            className="rounded-lg border border-accent bg-accent px-5 py-2 text-[13px] font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-60">
            {busy ? (isEdit ? "수정 중…" : "등록 중…") : (isEdit ? "수정" : "등록")}
          </button>
        </div>
      </div>
    </div>
  );
}
