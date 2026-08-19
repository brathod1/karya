import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="text-[13px] font-medium text-brand">404</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">We couldn&apos;t find that</h1>
        <p className="mt-2 max-w-sm text-sm text-ink-muted">
          It may have been archived, or it belongs to a different workspace.
        </p>
        <Link href="/dashboard" className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-white">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
