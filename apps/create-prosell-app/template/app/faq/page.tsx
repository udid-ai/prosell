export const dynamic = "force-dynamic";

// 자주묻는 질문(FAQ) — 추후 prosell faq API 연결 예정. 현재는 빈 페이지.
export default function FaqPage() {
  return (
    <main className="mx-auto my-6 max-w-content px-4">
      <h1 className="text-2xl font-bold text-text">자주묻는 질문</h1>
      <p className="mt-6 rounded-md border border-line bg-card p-8 text-center text-sub">
        등록된 질문이 없습니다.
      </p>
    </main>
  );
}
