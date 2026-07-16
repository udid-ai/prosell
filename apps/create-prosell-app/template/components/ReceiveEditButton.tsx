"use client";

import { useState } from "react";
import ReceiveEditModal from "@/components/ReceiveEditModal";

type Delivery = React.ComponentProps<typeof ReceiveEditModal>["delivery"];

// 배송지 변경 버튼 + 모달 트리거. 노출 조건 판정은 서버(부모)에서 하고, 여기선 열기/닫기만.
export default function ReceiveEditButton({ delivery }: { delivery: Delivery }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-accent bg-accent/5 px-3 py-1.5 text-[12px] font-medium text-accent hover:bg-accent/10"
      >
        배송지 변경
      </button>
      {open && <ReceiveEditModal delivery={delivery} onClose={() => setOpen(false)} />}
    </>
  );
}
