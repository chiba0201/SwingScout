import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <div className="panel mx-auto mt-6 max-w-lg px-5 py-4">
      <p className="font-bold">ページが見つかりません</p>
      <Link to="/" className="mt-2 inline-block text-[13px] font-semibold text-accent hover:underline">
        ダッシュボードへ
      </Link>
    </div>
  );
}
