export function EmptyCrfState({ language }: { language: "vi" | "en" }) {
  return (
    <main id="main-content" tabIndex={-1} className="flex flex-1 items-center justify-center bg-slate-50 px-6 py-16">
      <p className="max-w-lg rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700" role="status">
        {language === "vi"
          ? "Chưa có hồ sơ nào. Hồ sơ xuất hiện khi bệnh nhân gửi tài liệu."
          : "No records yet. Records appear when patients submit documents."}
      </p>
    </main>
  );
}
