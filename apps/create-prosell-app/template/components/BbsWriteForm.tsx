"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { BbsBoard, BbsUploadItem } from "@/lib/prosell";
import RichEditor from "./RichEditor";
import Recaptcha from "./Recaptcha";

const MAX_CONTENT = 5000;   // 본문 텍스트(태그 제외) 상한

type Initial = {
  id: number; category: string | null; title: string; content: string;
  secret: number; adult: number; notice: number; url: string | null;
  hashtag: string; videos: string[];
  attachments: { id: number; mode: string; name: string; is_image: number }[];
} | null;
type Attach = { id: number; name: string; mode: string };

// 자유게시판 글쓰기/수정 폼 — 레거시 «등록옵션»(공지·비밀글·성인·링크·동영상·파일첨부·대표이미지) 구성.
// 링크/동영상/파일 입력란은 해당 옵션을 켤 때만 노출된다(레거시 data-display 동작).
export default function BbsWriteForm({
  bbsId, board, listHref, initial, loggedIn,
}: {
  bbsId: string; board: BbsBoard; listHref: string; initial: Initial; loggedIn: boolean;
}) {
  const router = useRouter();
  const isEdit = !!initial;
  const fileRef = useRef<HTMLInputElement>(null);
  const maxFiles = board.file || 0;
  const maxVideos = board.video || 0;
  const isAdmin = board.is_admin === 1;

  // 콘텐츠 필드
  const [category, setCategory] = useState(initial?.category ?? (board.use_category ? board.categories[0] ?? "" : ""));
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [contentLen, setContentLen] = useState((initial?.content ?? "").replace(/<[^>]*>/g, "").trim().length);
  const [hashtag, setHashtag] = useState(initial?.hashtag ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [videos, setVideos] = useState<string[]>(() => {
    const v = initial?.videos ?? [];
    return Array.from({ length: Math.max(1, maxVideos) }, (_, i) => v[i] ?? "");
  });
  // 기존 첨부를 slot(mode) 그대로 유지(수정 시 재전송하지 않으면 백엔드가 삭제).
  const [attachments, setAttachments] = useState<Attach[]>(
    () => (initial?.attachments ?? []).map((a) => ({ id: a.id, name: a.name, mode: a.mode })),
  );

  // 등록옵션 플래그
  const [optNotice, setOptNotice] = useState(initial?.notice === 1);
  const [optSecret, setOptSecret] = useState(initial?.secret === 1 || board.secret === 2);
  const [optAdult, setOptAdult] = useState(initial?.adult === 1 || board.adult === 2);
  const [optUrl, setOptUrl] = useState(!!initial?.url);
  const [optVideo, setOptVideo] = useState((initial?.videos?.length ?? 0) > 0);
  const [optFile, setOptFile] = useState((initial?.attachments?.length ?? 0) > 0);
  const [thumb, setThumb] = useState(false);

  // 비회원 작성자 정보(이름 + 비밀번호). 회원이면 미사용.
  const [guestName, setGuestName] = useState("");
  const [guestPw, setGuestPw] = useState("");
  const [recaptcha, setRecaptcha] = useState("");
  // 비회원 신규 글쓰기에 리캡차 필요(게시판 설정에 사이트키가 있을 때만).
  const needRecaptcha = !loggedIn && !isEdit && !!board.recaptcha;

  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  // 노출할 옵션 목록(게시판 설정/권한 기준). 비밀글 강제(2)·성인 강제(2)는 토글 숨김(항상 적용).
  const showNotice = isAdmin;
  const showSecret = board.secret === 1;                 // 1=선택. 2=강제(숨김)
  const showAdult = board.adult === 1 && board.adult_ok === 1;   // 성인인증 회원 또는 관리자(레거시 일치)
  const showUrl = board.url === 1;
  const showVideo = maxVideos > 0;
  const showFile = maxFiles > 0;
  const hasOptions = showNotice || showSecret || showAdult || showUrl || showVideo || showFile;

  const slotOf = (mode: string) => parseInt(mode.replace(/\D/g, ""), 10) || 0;

  const onPick = async (files: FileList | null) => {
    if (!files || !files.length || uploading) return;
    // 비어 있는 슬롯(1..maxFiles) 만 채운다(기존 첨부 슬롯 보존).
    const used = new Set(attachments.map((a) => slotOf(a.mode)));
    const free: number[] = [];
    for (let s = 1; s <= maxFiles; s++) if (!used.has(s)) free.push(s);
    if (!free.length) { setErr(`첨부는 최대 ${maxFiles}개까지 가능합니다.`); return; }
    const pick = Array.from(files).slice(0, free.length);
    setUploading(true); setErr("");
    try {
      for (let i = 0; i < pick.length; i++) {
        const slot = free[i];
        const fd = new FormData();
        fd.append("bbs_id", bbsId);
        fd.append("mode", `file${slot}`);
        fd.append("files", pick[i], pick[i].name);
        const res = await fetch("/api/bbs", { method: "POST", body: fd });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.ok) { setErr(j.error || "업로드에 실패했습니다."); break; }
        const it = (j.items as BbsUploadItem[])[0];
        if (it) setAttachments((prev) => [...prev, { id: it.id, name: it.name, mode: it.mode }]);
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const removeAttach = (id: number) => setAttachments((prev) => prev.filter((a) => a.id !== id));
  const setVideoAt = (i: number, v: string) => setVideos((prev) => prev.map((x, idx) => (idx === i ? v : x)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (board.use_category && !category) { setErr("카테고리를 선택해 주세요."); return; }
    if (!title.trim()) { setErr("제목을 입력해 주세요."); return; }
    if (!contentLen) { setErr("내용을 입력해 주세요."); return; }
    if (contentLen > MAX_CONTENT) { setErr(`내용은 ${MAX_CONTENT}자까지 입력할 수 있습니다.`); return; }
    // 비회원: 신규는 이름+비밀번호 필수, 수정은 비밀번호(본인확인) 필수.
    if (!loggedIn) {
      if (!isEdit && !guestName.trim()) { setErr("이름을 입력해 주세요."); return; }
      if (!guestPw.trim()) { setErr("비밀번호를 입력해 주세요."); return; }
      if (needRecaptcha && !recaptcha) { setErr("자동등록방지 인증을 완료해 주세요."); return; }
    }
    setBusy(true); setErr("");

    const body: Record<string, unknown> = {
      bbs_id: bbsId,
      ar_ct: board.use_category ? category : undefined,
      ar_title: title,
      ar_content: content,
      ar_secret: optSecret ? 1 : 0,
      ar_adult: optAdult ? 1 : 0,
      ar_notice: showNotice && optNotice ? 1 : 0,
      ar_hashtag: board.hashtag === 1 ? hashtag : "",
      ar_url: optUrl ? url : "",
      ar_thumb: optFile && thumb ? 1 : 0,
    };
    // 동영상 — 옵션 켤 때만, 슬롯별로.
    for (let i = 0; i < 3; i++) body[`ar_video${i + 1}`] = optVideo ? (videos[i] ?? "") : "";
    // 첨부 — 각 첨부를 원래 슬롯(mode) 그대로 재전송(기존 첨부 보존 + 신규 추가).
    attachments.forEach((a) => { const s = slotOf(a.mode); if (s >= 1 && s <= 3) body[`upload_file${s}`] = a.id; });
    // 비회원 작성자 정보
    if (!loggedIn) { body.name = guestName; body.upw = guestPw; if (needRecaptcha) body.recaptcha = recaptcha; }
    if (isEdit) body.article_id = initial!.id;

    try {
      const res = await fetch("/api/bbs", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setErr(j.error || "저장에 실패했습니다."); setBusy(false); return; }
      const aid = j.article_id ?? initial?.id;
      router.push(aid ? `/board/${bbsId}/${aid}` : listHref);
      router.refresh();
    } catch { setErr("통신 오류가 발생했습니다."); setBusy(false); }
  };

  const field = "w-full rounded-md border border-line bg-card px-3 py-2.5 text-sm text-text outline-none focus:border-accent";
  const Opt = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
    <label className="inline-flex items-center gap-1.5 text-[13px] text-text">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-accent" />
      {label}
    </label>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* 비회원 작성자 정보 */}
      {!loggedIn && (
        <div className="grid gap-3 rounded-md border border-line bg-surface/40 p-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[13px] font-medium text-text">이름</label>
            <input value={guestName} onChange={(e) => setGuestName(e.target.value)} maxLength={8} disabled={isEdit}
              placeholder="이름" className={`${field} disabled:opacity-60`} />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium text-text">비밀번호</label>
            <input type="password" value={guestPw} onChange={(e) => setGuestPw(e.target.value)} maxLength={20}
              placeholder={isEdit ? "작성 시 입력한 비밀번호" : "수정·삭제 시 사용"} className={field} />
          </div>
          {/* 자동등록방지 — 비회원 신규 글쓰기 */}
          {needRecaptcha && (
            <div className="sm:col-span-2">
              <Recaptcha sitekey={board.recaptcha} onToken={setRecaptcha} />
            </div>
          )}
        </div>
      )}

      {/* 등록옵션 */}
      {hasOptions && (
        <div className="rounded-md border border-line bg-surface/40 p-4">
          <p className="mb-2 text-[13px] font-semibold text-text">등록옵션</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {showNotice && <Opt checked={optNotice} onChange={setOptNotice} label="공지등록" />}
            {showSecret && <Opt checked={optSecret} onChange={setOptSecret} label="비밀글" />}
            {showAdult && <Opt checked={optAdult} onChange={setOptAdult} label="성인글" />}
            {showUrl && <Opt checked={optUrl} onChange={setOptUrl} label="링크" />}
            {showVideo && <Opt checked={optVideo} onChange={setOptVideo} label="동영상" />}
            {showFile && <Opt checked={optFile} onChange={setOptFile} label="파일첨부" />}
            {showFile && optFile && <Opt checked={thumb} onChange={setThumb} label="첫 이미지를 대표이미지로" />}
          </div>
        </div>
      )}

      {board.use_category && board.categories.length > 0 && (
        <div>
          <label className="mb-1 block text-[13px] font-medium text-text">카테고리</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={`select-arrow cursor-pointer pr-8 ${field}`}>
            {board.categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}

      <div>
        <label className="mb-1 block text-[13px] font-medium text-text">제목</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="제목을 입력하세요" className={field} />
      </div>

      <div>
        <label className="mb-1 block text-[13px] font-medium text-text">내용</label>
        <RichEditor
          value={content}
          onChange={(html, len) => { setContent(html); setContentLen(len); }}
          placeholder="내용을 입력하세요"
          maxLength={MAX_CONTENT}
          uploadUrl={`/api/bbs/image?bbs_id=${encodeURIComponent(bbsId)}`}
        />
      </div>

      {board.hashtag === 1 && (
        <div>
          <label className="mb-1 block text-[13px] font-medium text-text">해시태그</label>
          <input value={hashtag} onChange={(e) => setHashtag(e.target.value)} maxLength={100} placeholder="예) #쇼핑몰 #솔루션 #프로셀" className={field} />
        </div>
      )}

      {/* 링크 — 옵션 ON 시 */}
      {showUrl && optUrl && (
        <div>
          <label className="mb-1 block text-[13px] font-medium text-text">링크</label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" className={field} />
        </div>
      )}

      {/* 동영상 — 옵션 ON 시(허용 호스트: YouTube/Vimeo) */}
      {showVideo && optVideo && (
        <div className="space-y-2">
          <label className="block text-[13px] font-medium text-text">동영상</label>
          {Array.from({ length: maxVideos }, (_, i) => (
            <input key={i} value={videos[i] ?? ""} onChange={(e) => setVideoAt(i, e.target.value)}
              placeholder="YouTube / Vimeo 주소" className={field} />
          ))}
          <p className="text-[12px] text-sub">YouTube·Vimeo 주소만 등록됩니다.</p>
        </div>
      )}

      {/* 파일첨부 — 옵션 ON 시 */}
      {showFile && optFile && (
        <div>
          <label className="mb-1 block text-[13px] font-medium text-text">첨부파일 (최대 {maxFiles}개)</label>
          <input ref={fileRef} type="file" multiple onChange={(e) => onPick(e.target.files)} disabled={uploading || attachments.length >= maxFiles}
            className="block w-full text-[13px] text-sub file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-[13px] file:text-text" />
          {uploading && <p className="mt-1 text-[12px] text-sub">업로드 중…</p>}
          {attachments.length > 0 && (
            <ul className="mt-2 space-y-1">
              {attachments.map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-md border border-line px-3 py-1.5 text-[13px]">
                  <span className="min-w-0 truncate text-text">{a.name}</span>
                  <button type="button" onClick={() => removeAttach(a.id)} className="ml-2 shrink-0 text-sub hover:text-red-500">삭제</button>
                </li>
              ))}
            </ul>
          )}
          {isEdit && <p className="mt-1 text-[12px] text-sub">※ 새 파일을 첨부하면 기존 첨부가 교체됩니다.</p>}
        </div>
      )}

      {err && <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-600">{err}</p>}

      <div className="flex items-center justify-center gap-3 pt-4">
        <a href={listHref}
          className="w-full max-w-[10rem] rounded-lg border border-line px-8 py-4 text-center text-base font-bold text-text transition-colors hover:border-accent hover:text-accent">
          취소하기
        </a>
        <button type="submit" disabled={busy || uploading}
          className="w-full max-w-[10rem] rounded-lg bg-accent px-8 py-4 text-base font-bold text-accent-foreground shadow-sm transition-colors hover:bg-accent/90 disabled:opacity-50">
          {busy ? "저장 중…" : isEdit ? "수정하기" : "등록하기"}
        </button>
      </div>
    </form>
  );
}
