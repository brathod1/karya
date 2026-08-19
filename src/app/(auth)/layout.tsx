export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh grid lg:grid-cols-2">
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </div>
      <div className="hidden lg:flex flex-col justify-between bg-brand text-white p-12">
        <div className="text-lg font-semibold tracking-tight">Karya</div>
        <div className="max-w-md">
          <p className="text-[26px] font-semibold leading-snug">
            Everything you track in a spreadsheet — orders, payments, production and expenses — in one place that adds up correctly.
          </p>
          <p className="mt-5 text-teal-100 text-[15px] leading-relaxed">
            Configure it for how your business actually works: your own statuses, your own words, your own fields.
            No two businesses are the same, and you shouldn&apos;t have to pretend otherwise.
          </p>
        </div>
        <p className="text-teal-200 text-[13px]">Built for small businesses that outgrew the sheet.</p>
      </div>
    </div>
  );
}
