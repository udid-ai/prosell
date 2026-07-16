"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";
import type { MyQna } from "@/lib/prosell";
import RichEditor from "./RichEditor";
import FileAttach, { type AttachedFile } from "./FileAttach";
import QnaItemPicker, { type QnaTarget } from "./QnaItemPicker";

const MAX_FILES = 3;      // 백엔드(Parameters) 하드 상한 — 운영자 설정이 이보다 크면 이 값으로 자른다
const MAX_PHOTOS = 5;     // 통합 게시판 이미지 첨부 상한(상품문의와 동일)
const MAX_CONTENT = 2000; // 본문 상한 — 태그 제외 «텍스트» 기준(서버도 동일 기준으로 검사)

// 1:1 문의(qna) 작성/수정 모달 — 레거시 작성폼(qna/write.php, board/js/write.js) 항목 반영.
//  · 분류 + 제목 + 내용(Tiptap 위지윅, HTML 저장) + 비밀글
//  · 통합 게시판: 참고 URL · 동영상 링크 · «이미지 첨부»(상품문의와 동일한 이미지 전용 UI)
//  · 개별 게시판: 일반 파일 첨부(이미지 외 파일도)
//  · 답변 알림(문자/이메일): 환경설정(setup_hp/setup_email 의 qna_answer onoff) + 회원 연락처 보유 시 노출
export default function QnaFormModal({
  categories = [],
  unified = true,
  boardSecret = 0,
  notifyHp = 0,
  notifyEmail = 0,
  fileCount = 0,
  fileSizeMb = 0,
  editing,
  onClose,
  onSaved,
}: {
  categories?: string[];
  unified?: boolean;
  boardSecret?: number; // 게시판 설정 — 0=비밀글 미사용 / 1=작성자 선택 / 2=전체 적용
  notifyHp?: number;
  notifyEmail?: number;
  fileCount?: number;   // 첨부 가능 개수(운영자 CS 설정)
  fileSizeMb?: number;  // 개당 용량 상한 MB(〃)
  editing?: MyQna | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!editing;
  // 문의대상 — 등록에서만(수정 PUT 은 백엔드가 item_type 을 거부). 수정 모달에선 숨긴다.
  const [target, setTarget] = useState<QnaTarget>({ itemType: 0, itemIds: [] });
  const [category, setCategory] = useState(editing?.category ?? "");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [content, setContent] = useState(editing?.content ?? "");        // HTML
  const [contentLen, setContentLen] = useState(0);                        // 태그 제외 본문 길이
  const [url, setUrl] = useState(editing?.url ?? "");
  const [videoUrl, setVideoUrl] = useState(editing?.video_src ?? "");
  const [secret, setSecret] = useState(boardSecret === 2 ? true : editing?.secret === 1);
  const [sendPhone, setSendPhone] = useState(editing?.send_phone === 1);
  const [sendEmail, setSendEmail] = useState(editing?.send_email === 1);
  const [files, setFiles] = useState<AttachedFile[]>((editing?.files ?? []).map((f) => ({
    id: f.id, name: f.name ?? "파일", size: f.size ?? 0, filesize: f.filesize, thumb: f.thumb,
  })));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false); // 통합 게시판 이미지 첨부 업로드 중

  const notify = notifyHp === 1 || notifyEmail === 1;
  const useSecret = boardSecret === 1; // «선택»일 때만 체크박스 노출(0=미사용, 2=전체적용은 서버가 강제)

  // 통합 게시판 이미지 첨부 — 상품문의와 동일한 이미지 전용 업로드(accept=image/*, 썸네일 그리드).
  async function onPickImages(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!list.length) return;
    if (files.length + list.length > maxPhotos) { toast(`사진은 최대 ${maxPhotos}장까지 첨부할 수 있습니다.`, "error"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      list.forEach((f) => fd.append("files", f, f.name));
      const res = await fetch("/api/qna", { method: "POST", body: fd });
      const j = await res.json().catch(() => null);
      if (!j?.ok) { toast(j?.error || "사진 업로드에 실패했습니다.", "error"); return; }
      const added: AttachedFile[] = ((j.items ?? []) as { id: number; thumb?: string | null; src?: string | null; name?: string; size?: number; filesize?: string }[])
        .map((it) => ({ id: it.id, name: it.name ?? "이미지", size: it.size ?? 0, filesize: it.filesize, thumb: it.thumb ?? it.src ?? null }));
      setFiles((prev) => [...prev, ...added].slice(0, maxPhotos));
    } catch { toast("사진 업로드 중 오류가 발생했습니다.", "error"); }
    finally { setUploading(false); }
  }
  const removeFile = (id: number) => setFiles((prev) => prev.filter((f) => f.id !== id));
  // 첨부 제한 — 서버(CS 설정)를 따르되 백엔드 하드 상한(3)을 넘지 않게.
  const maxFiles = Math.min(fileCount || 0, MAX_FILES);
  const maxSizeMb = fileSizeMb || 2;
  // 통합 게시판 이미지 상한 — 운영자 설정(cs.cs_file)을 따르되 하드 상한(5)을 넘지 않게. 미설정 시 5.
  const maxPhotos = fileCount ? Math.min(fileCount, MAX_PHOTOS) : MAX_PHOTOS;

  // 동영상 링크 임베드 지원 도메인(상품문의·리뷰와 동일)
  const VIDEO_RE = /^(https?:\/\/)?([\w-]+\.)*(youtube\.com|youtu\.be|vimeo\.com|naver\.com|naver\.me|kakao\.com|instagram\.com)\//i;


  const submit = async () => {
    if (busy) return;
    const t = title.trim(), c = content.trim(), u = url.trim(), v = videoUrl.trim();
    if (categories.length > 0 && !category) { toast("문의 분류를 선택해 주세요.", "error"); return; }
    if (!t) { toast("제목을 입력해 주세요.", "error"); return; }
    // 본문은 HTML — 빈 문단(<p></p>)만 있는 경우를 걸러내려 «텍스트 길이»로 판단.
    if (contentLen === 0) { toast("문의 내용을 입력해 주세요.", "error"); return; }
    if (contentLen > MAX_CONTENT) { toast(`문의 내용은 ${MAX_CONTENT}자까지 입력할 수 있습니다.`, "error"); return; }
    if (v && !VIDEO_RE.test(v)) { toast("동영상 링크는 YouTube, Vimeo, Naver, Kakao, Instagram 만 추가할 수 있습니다.", "error"); return; }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { category, title: t, content: c };
      if (useSecret) body.secret = secret ? 1 : 0;
      if (isEdit) body.id = editing!.id;
      // 문의대상 — 등록 + 개별 게시판에서만(통합은 저장 컬럼 없음). 대상 상품이 있을 때만 item_ids.
      if (!isEdit && !unified) {
        body.item_type = target.itemType;
        if (target.itemType > 0 && target.itemIds.length > 0) body.item_ids = target.itemIds.join(",");
      }
      // 통합 게시판 전용 필드 — 개별 게시판은 저장 컬럼이 없어 전송하지 않는다.
      // URL/동영상은 통합 전용, 파일은 통합·개별 공통.
      if (unified) { body.url = u; body.video_url = v; }
      body.files = files.map((f) => f.id);
      if (notify) { body.send_phone = sendPhone ? 1 : 0; body.send_email = sendEmail ? 1 : 0; }

      const res = await fetch("/api/qna", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => null);
      if (!j?.ok) { toast(j?.error || (isEdit ? "문의 수정에 실패했습니다." : "문의 등록에 실패했습니다."), "error"); setBusy(false); return; }
      toast(isEdit ? "문의를 수정했습니다." : "1:1 문의를 등록했습니다.", "success");
      onSaved();
      onClose();
    } catch { toast("요청 중 오류가 발생했습니다.", "error"); setBusy(false); }
  };

  const rowLabel = "mb-1 text-[13px] font-semibold text-text";
  const fieldCls = "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-text outline-none focus:border-accent";

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={isEdit ? "문의 수정" : "1:1 문의"}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-lg font-bold text-text">{isEdit ? "1:1 문의 수정" : "1:1 문의 작성"}</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="grid h-8 w-8 place-items-center rounded-full text-text hover:bg-line">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* 문의대상 — 분류 위. 등록에서만(수정은 백엔드가 item_type 을 거부).
              개별 게시판(cs_article_qna) 전용 — 통합(cs_article_board)엔 저장 컬럼이 없어 노출하지 않는다. */}
          {!isEdit && !unified && (
            <div className="mb-4">
              <p className={rowLabel}>문의 대상 <span className="font-normal text-sub">(선택)</span></p>
              <QnaItemPicker value={target} onChange={setTarget} />
            </div>
          )}

          {categories.length > 0 && (
            <div className="mb-4">
              <p className={rowLabel}>문의 분류 <span className="text-sale">*</span></p>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={`select-arrow cursor-pointer pr-8 ${fieldCls}`}>
                <option value="">분류를 선택해 주세요</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          <div className="mb-4">
            <p className={rowLabel}>제목 <span className="text-sale">*</span></p>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="제목을 입력해 주세요." className={fieldCls} />
          </div>

          <div className="mb-4">
            <p className={rowLabel}>내용 <span className="text-sale">*</span></p>
            <RichEditor value={content} onChange={(html, len) => { setContent(html); setContentLen(len); }}
              placeholder="문의 내용을 입력해 주세요." maxLength={MAX_CONTENT} uploadUrl="/api/qna" />
          </div>

          {/* 참고 URL·동영상 링크 — 통합 게시판에서만 지원(개별 cs_article_qna 는 저장 컬럼이 없다). */}
          {unified && (
            <>
              <div className="mb-4">
                <p className={rowLabel}>참고 URL <span className="font-normal text-sub">(선택)</span></p>
                <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={255} placeholder="https://" className={fieldCls} />
              </div>

              <div className="mb-4">
                <p className={rowLabel}>동영상 링크 <span className="font-normal text-sub">(YouTube · Vimeo · Naver · Kakao · Instagram)</span></p>
                <input type="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} maxLength={255} placeholder="동영상 공유 링크를 붙여넣어 주세요." className={fieldCls} />
              </div>
            </>
          )}

          {/* 첨부 — 통합 게시판은 «이미지 전용»(상품문의와 동일 UI), 개별 게시판은 일반 파일 첨부. */}
          {unified ? (
            <div className="mb-4">
              <p className={rowLabel}>사진 첨부 <span className="font-normal text-sub">(선택, 최대 {maxPhotos}장)</span></p>
              <div className="mt-1 flex flex-wrap gap-2">
                {files.map((f) => (
                  <span key={f.id} className="relative h-16 w-16 overflow-hidden rounded-md border border-line bg-surface">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.thumb || ""} alt="" className="h-full w-full object-cover" />
                    <button type="button" onClick={() => removeFile(f.id)} className="absolute right-0 top-0 grid h-5 w-5 place-items-center bg-black/50 text-[11px] text-white" aria-label="삭제">✕</button>
                  </span>
                ))}
                {files.length < maxPhotos && (
                  <label className={`grid h-16 w-16 cursor-pointer place-items-center rounded-md border border-dashed border-input text-sub hover:border-accent ${uploading ? "opacity-50" : ""}`}>
                    <input type="file" accept="image/*" multiple className="hidden" onChange={onPickImages} disabled={uploading} />
                    {uploading ? <span className="text-[11px]">업로드중</span> : <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>}
                  </label>
                )}
              </div>
            </div>
          ) : maxFiles > 0 && (
            <div className="mb-4">
              <p className={rowLabel}>파일 첨부 <span className="font-normal text-sub">(선택)</span></p>
              <FileAttach files={files} onChange={setFiles} uploadUrl="/api/qna" max={maxFiles} maxSizeMB={maxSizeMb} />
            </div>
          )}

          {/* 옵션: 비밀글 + 답변 알림 수신(회원 전용, 환경설정 qna_answer onoff 기준) */}
          <div className="flex flex-col gap-2">
            {useSecret && (
              <label className="flex items-center gap-2 text-[13px] text-text">
                <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} className="h-4 w-4 shrink-0 accent-accent" />
                {/* 텍스트는 하나의 span 으로 — flex 라벨에서 텍스트 조각이 각각 flex item 이 되면 좁을 때 줄바꿈된다. */}
                <span>비밀글로 문의 <span className="text-sub">(작성자·판매자만 열람)</span></span>
              </label>
            )}
            {notifyHp === 1 && (
              <label className="flex items-center gap-2 text-[13px] text-text">
                <input type="checkbox" checked={sendPhone} onChange={(e) => setSendPhone(e.target.checked)} className="h-4 w-4 shrink-0 accent-accent" />
                <span>답변 등록 시 <span className="font-medium">문자(SMS)</span>로 알림받기</span>
              </label>
            )}
            {notifyEmail === 1 && (
              <label className="flex items-center gap-2 text-[13px] text-text">
                <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="h-4 w-4 shrink-0 accent-accent" />
                <span>답변 등록 시 <span className="font-medium">이메일</span>로 알림받기</span>
              </label>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-[13px] font-semibold text-text hover:bg-surface">취소</button>
          <button type="button" onClick={submit} disabled={busy} className="rounded-lg border border-accent bg-accent px-5 py-2 text-[13px] font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-60">
            {busy ? (isEdit ? "수정 중…" : "등록 중…") : (isEdit ? "수정" : "등록")}
          </button>
        </div>
      </div>
    </div>
  );
}
