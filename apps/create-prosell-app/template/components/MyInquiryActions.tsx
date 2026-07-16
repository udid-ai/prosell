"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import type { MyInquiry, ProductInquiry } from "@/lib/prosell";
import InquiryFormModal, { type InquiryOption } from "./InquiryFormModal";

// 내 계정 «상품 문의» 수정/삭제 액션 — 회원 본인글. 답변 전에만 노출(부모에서 gating).
//  · options(해당 상품 옵션)·categories(통합 게시판 분류)를 넘기면 수정 모달에서 옵션·분류도 변경 가능.
export default function MyInquiryActions({ inquiry, options = [], productTitle, categories = [], unified = true, notifyHp = 0, notifyEmail = 0 }: {
  inquiry: MyInquiry; options?: InquiryOption[]; productTitle?: string; categories?: string[]; unified?: boolean;
  notifyHp?: number; notifyEmail?: number; // 답변 알림 체크박스 노출(환경설정 inquiry_answer + 회원 연락처/이메일)
}) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);

  // 편집 모달용 ProductInquiry 형태(회원 본인글 → is_mine=1).
  const editing: ProductInquiry = {
    id: inquiry.id, product_id: inquiry.product_id, secret: inquiry.secret,
    title: inquiry.title, content: inquiry.content, name: null, dt: inquiry.dt, answered: inquiry.answered,
    reply_name: inquiry.reply_name, reply_content: inquiry.reply_content, reply_dt: inquiry.reply_dt,
    is_mine: 1, url: inquiry.url ?? null, video_src: inquiry.video_src ?? null, category: inquiry.category, files: inquiry.files ?? [],
    send_phone: inquiry.send_phone, send_email: inquiry.send_email,
  };

  const onDelete = async () => {
    if (busy) return;
    if (!window.confirm("이 문의를 삭제할까요?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/inquiry", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: inquiry.id }) });
      const j = await res.json().catch(() => null);
      if (!j?.ok) { toast(j?.error || "문의 삭제에 실패했습니다.", "error"); setBusy(false); return; }
      toast("문의를 삭제했습니다.", "success");
      router.refresh();
    } catch { toast("요청 중 오류가 발생했습니다.", "error"); setBusy(false); }
  };

  const btn = "rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-text hover:bg-surface disabled:opacity-50";

  return (
    <div className="mt-3 flex justify-end gap-1.5">
      <button type="button" onClick={() => setEdit(true)} className={btn}>수정</button>
      <button type="button" onClick={onDelete} disabled={busy} className={`${btn} hover:border-sale hover:text-sale`}>삭제</button>
      {edit && (
        <InquiryFormModal
          productId={inquiry.product_id}
          options={options}
          productTitle={productTitle}
          categories={categories}
          unified={unified}
          notifyHp={notifyHp}
          notifyEmail={notifyEmail}
          editing={editing}
          onClose={() => setEdit(false)}
          onSaved={() => { setEdit(false); router.refresh(); }}
        />
      )}
    </div>
  );
}
