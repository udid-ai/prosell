"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 상품평 작성 모달 — 레거시 member/review/write 재현. 별점(1~5)·내용·사진(최대5). prno 기준.
export type ReviewTarget = { prno: number; productTitle: string; optionTitle?: string; thumb?: string };
type UpFile = { id: number; preview: string };
const MAX_PHOTOS = 5;

export default function ReviewWriteModal({ target, onClose, titleEnabled = false }: { target: ReviewTarget; onClose: () => void; titleEnabled?: boolean }) {
  const router = useRouter();
  const [score, setScore] = useState(5);
  const [hover, setHover] = useState(0);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [photos, setPhotos] = useState<UpFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!list.length) return;
    if (photos.length + list.length > MAX_PHOTOS) { setErr(`사진은 최대 ${MAX_PHOTOS}장까지 첨부할 수 있습니다.`); return; }
    setErr("");
    setUploading(true);
    try {
      const fd = new FormData();
      list.forEach((f, i) => fd.append(`file${i}`, f, f.name));
      const res = await fetch("/api/review/upload", { method: "POST", body: fd });
      const j = await res.json().catch(() => null);
      if (!j?.ok) { setErr(j?.error || "사진 업로드에 실패했습니다."); setUploading(false); return; }
      const items = (j.items as { id: number; thumb?: string; src?: string }[]) ?? [];
      setPhotos((prev) => [...prev, ...items.map((it) => ({ id: it.id, preview: it.thumb || it.src || "" }))]);
    } catch { setErr("사진 업로드 중 오류가 발생했습니다."); }
    setUploading(false);
  }

  function removePhoto(id: number) {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  }

  // 임베드 지원 도메인: youtube/vimeo/naver/kakao(getView) + instagram(게시물/릴스/IGTV, /embed iframe). naver.me 단축링크 포함.
  const VIDEO_RE = /^(https?:\/\/)?([\w-]+\.)*(youtube\.com|youtu\.be|vimeo\.com|naver\.com|naver\.me|kakao\.com|instagram\.com)\//i;

  async function submit() {
    setErr("");
    // 통합 게시판: 제목 필수
    if (titleEnabled && !title.trim()) return setErr("제목을 입력해 주세요.");
    if (!content.trim()) return setErr("상품평 내용을 입력해 주세요.");
    if (titleEnabled && videoUrl.trim() && !VIDEO_RE.test(videoUrl.trim())) {
      return setErr("동영상 링크는 YouTube, Vimeo, Naver, Kakao, Instagram 만 추가할 수 있습니다.");
    }
    setBusy(true);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prno: target.prno, score, content: content.trim(), files: photos.map((p) => p.id),
          ...(titleEnabled ? { title: title.trim(), url: url.trim(), video_url: videoUrl.trim() } : {}),
        }),
      });
      const j = await res.json().catch(() => null);
      if (!j?.ok) { setErr(j?.error || "상품평 등록에 실패했습니다."); setBusy(false); return; }
      onClose();
      router.refresh();
    } catch { setErr("요청 중 오류가 발생했습니다."); setBusy(false); }
  }

  const shownScore = hover || score;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-line bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-lg font-bold text-text">리뷰 작성</h2>
          <button type="button" onClick={onClose} className="text-sub hover:text-text" aria-label="닫기">✕</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {/* 상품 */}
          <div className="mb-4 flex items-center gap-3">
            {target.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={target.thumb} alt="" className="h-14 w-14 shrink-0 rounded-md border border-line object-cover" />
            ) : <div className="h-14 w-14 shrink-0 rounded-md border border-line bg-surface" />}
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-semibold text-text">{target.productTitle}</p>
              {target.optionTitle && <p className="mt-0.5 text-[12px] text-sub">{target.optionTitle}</p>}
            </div>
          </div>

          {/* 별점 */}
          <div className="mb-4 flex items-center gap-1" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setScore(n)}
                onMouseEnter={() => setHover(n)}
                aria-label={`${n}점`}
                className={`text-2xl leading-none ${n <= shownScore ? "text-amber-400" : "text-line"}`}
              >
                ★
              </button>
            ))}
            <span className="relative top-[3px] ml-2 text-[13px] text-sub">{shownScore}점</span>
          </div>

          {/* 제목 — 통합 게시판 설정(board_type=1)일 때만 사용(필수) */}
          {titleEnabled && (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={255}
              placeholder="제목 *"
              className="mb-2 w-full rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
            />
          )}

          {/* 내용 */}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={2000}
            rows={5}
            placeholder="상품에 대한 솔직한 평가를 남겨주세요. (최대 2000자)"
            className="w-full resize-none rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <p className="mt-1 text-right text-[11px] text-sub">{content.length} / 2000</p>

          {/* 사진 */}
          <div className="mt-2">
            <p className="mb-1.5 text-[13px] font-medium text-sub">사진 첨부 (선택, 최대 {MAX_PHOTOS}장)</p>
            <div className="flex flex-wrap gap-2">
              {photos.map((p) => (
                <div key={p.id} className="relative h-16 w-16 overflow-hidden rounded-md border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.preview ? <img src={p.preview} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full bg-surface" />}
                  <button type="button" onClick={() => removePhoto(p.id)} className="absolute right-0 top-0 grid h-5 w-5 place-items-center bg-black/50 text-[11px] text-white" aria-label="삭제">✕</button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <label className="grid h-16 w-16 cursor-pointer place-items-center rounded-md border border-dashed border-line text-sub hover:bg-surface">
                  {uploading ? <span className="text-[11px]">업로드…</span> : <span className="text-xl">＋</span>}
                  <input type="file" accept="image/*" multiple className="hidden" onChange={onPickFiles} disabled={uploading} />
                </label>
              )}
            </div>
          </div>

          {/* URL·동영상 링크 — 통합 게시판 설정(board_type=1)일 때만 사용 */}
          {titleEnabled && (
            <div className="mt-6 space-y-2">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                maxLength={255}
                placeholder="참고 URL (선택)"
                className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <div>
                <input
                  type="url"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  maxLength={255}
                  placeholder="동영상 링크 (선택)"
                  className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
                />
                <p className="mt-1 text-[11px] text-sub">YouTube, Vimeo, Naver, Kakao, Instagram(릴스) 링크만 추가하실 수 있습니다.</p>
              </div>
            </div>
          )}

          {err && <p className="mt-3 text-[13px] text-sale">{err}</p>}
        </div>

        <div className="flex gap-2 border-t border-line px-6 py-4">
          <button type="button" onClick={onClose} className="flex-1 rounded-md border border-line py-2.5 text-sm font-medium text-text hover:bg-surface">취소</button>
          <button type="button" onClick={submit} disabled={busy || uploading} className="flex-1 rounded-md bg-accent py-2.5 text-sm font-bold text-accent-foreground hover:opacity-90 disabled:opacity-50">
            {busy ? "등록 중…" : "등록"}
          </button>
        </div>
      </div>
    </>
  );
}
