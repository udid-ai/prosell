import { formatDateTimeSec } from "@/lib/format";
import PopupCloseButton from "@/components/PopupCloseButton";
import type { TrackingData } from "@/lib/prosell";

// 배송조회 팝업 본문 — 주문/반품(회수) 공통. 자체 배송추적 단계를 타임라인으로 표시.
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
function stepDate(v: string) {
  const m = String(v).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return v;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const w = Number.isNaN(d.getTime()) ? "" : WEEK[d.getDay()];
  return `${m[2]}.${m[3]}${w ? ` (${w})` : ""} ${m[4]}:${m[5]}`;
}

export function TrackingUnavailable({ message }: { message?: string }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-8 text-center">
      <div className="w-full rounded-2xl border border-line bg-card p-8">
        <h1 className="text-lg font-bold text-text">배송조회</h1>
        <p className="mt-3 text-[13px] text-sub">{message || "배송 정보를 불러올 수 없습니다. (로그인/권한 또는 송장 등록 여부를 확인해 주세요.)"}</p>
        <div className="mt-5 flex justify-center"><PopupCloseButton /></div>
      </div>
    </div>
  );
}

export default function TrackingView({ data }: { data: TrackingData }) {
  const hasSteps = data.steps.length > 0;
  return (
    <div className="mx-auto min-h-screen max-w-md p-5">
      {/* 헤더 */}
      <div className="rounded-2xl border border-line bg-card p-5">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-extrabold text-text">배송조회</h1>
          {data.tracking_dt && <span className="text-[11px] text-sub">{formatDateTimeSec(data.tracking_dt)} 기준</span>}
        </div>
        <div className="mt-3 space-y-1 text-[13px]">
          {data.current_state && <p className="text-base font-bold text-accent">{data.current_state}</p>}
          <p className="text-sub">택배사 <span className="text-text">{data.parcel_title || "-"}</span></p>
          <p className="text-sub">송장번호 <span className="font-medium text-text">{data.parcel_num || "-"}</span></p>
        </div>
      </div>

      {/* 타임라인 */}
      {hasSteps ? (
        <ol className="mt-4 space-y-0">
          {data.steps.map((s, i) => (
            <li key={i} className="relative flex gap-3 pb-5 pl-1 last:pb-0">
              {/* 점·세로선 */}
              <div className="relative flex flex-col items-center">
                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${i === 0 ? "bg-accent" : "bg-line"}`} />
                {i < data.steps.length - 1 && <span className="w-px flex-1 bg-line" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-sub">{stepDate(s.dt)}</p>
                <p className="text-sm font-medium text-text">{s.state}</p>
                {s.place && <p className="text-[12px] text-sub">{s.place}</p>}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-4 rounded-2xl border border-line bg-card p-6 text-center">
          <p className="text-[13px] text-sub">아직 등록된 배송 단계가 없습니다.</p>
          {data.external_url && (
            <a href={data.external_url} target="_blank" rel="noopener noreferrer"
              className="mt-3 inline-block rounded-md border border-accent bg-accent/5 px-4 py-2 text-[13px] font-medium text-accent hover:bg-accent/10">
              택배사 사이트에서 조회
            </a>
          )}
        </div>
      )}

      <div className="mt-5 flex justify-center gap-2">
        {data.external_url && hasSteps && (
          <a href={data.external_url} target="_blank" rel="noopener noreferrer"
            className="rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-text hover:bg-surface">택배사 사이트</a>
        )}
        <PopupCloseButton />
      </div>
    </div>
  );
}
