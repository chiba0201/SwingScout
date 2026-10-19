/**
 * お気に入りの付け外し（★）。中身はチェックボックスで、銘柄リストの favorite 列を書き換える。
 */
import { useData } from '../state/DataContext';
import { cx } from './ui';

export function FavoriteToggle({ code, name, className }: { code: string; name: string; className?: string }) {
  const { favorites, toggleFavorite } = useData();
  const on = favorites.has(code);
  return (
    <label
      className={cx(
        'inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-[17px] leading-none',
        'focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-accent hover:bg-panel-2',
        on ? 'text-accent' : 'text-rule-strong hover:text-muted',
        className,
      )}
      title={on ? 'お気に入りから外す' : 'お気に入りにする'}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={on}
        onChange={(e) => toggleFavorite(code, e.target.checked)}
        aria-label={`${name}をお気に入りにする`}
      />
      <span aria-hidden>{on ? '★' : '☆'}</span>
    </label>
  );
}

/** お気に入りの付け外しボタン（銘柄詳細の見出し横） */
export function FavoriteButton({ code, name }: { code: string; name: string }) {
  const { favorites, toggleFavorite } = useData();
  const on = favorites.has(code);
  return (
    <button
      type="button"
      className={cx('btn px-2.5 py-1 text-[12px]', on && 'border-accent/40 bg-accent-soft font-semibold text-accent')}
      aria-pressed={on}
      onClick={() => toggleFavorite(code, !on)}
      title={`${name}を${on ? 'お気に入りから外す' : 'お気に入りにする'}`}
    >
      <span aria-hidden className="text-[14px] leading-none">
        {on ? '★' : '☆'}
      </span>
      {on ? 'お気に入り' : 'お気に入りにする'}
    </button>
  );
}
