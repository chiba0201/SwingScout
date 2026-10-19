/**
 * ローカル補助API（npm run local:api）の起動状態。
 *   checking … 確認中
 *   online   … 起動中
 *   offline  … 応答なし（手元で開いている場合は数秒ごとに再確認し、起動したら自動で切り替わる）
 *   remote   … 公開サイトで開いている（自動では確認しない。ボタンで確認はできる）
 */
import { useCallback, useEffect, useState } from 'react';
import { checkLocalApi, isLocalDevHost } from '../lib/localApi';

export type LocalApiState = 'checking' | 'online' | 'offline' | 'remote';

const POLL_MS = 4000;

export function useLocalApi(): { state: LocalApiState; recheck: () => void } {
  const local = isLocalDevHost();
  const [state, setState] = useState<LocalApiState>(local ? 'checking' : 'remote');
  const [tick, setTick] = useState(0);
  const [manual, setManual] = useState(false);

  useEffect(() => {
    if (!local && !manual) return;
    let cancelled = false;
    checkLocalApi().then((ok) => !cancelled && setState(ok ? 'online' : local ? 'offline' : 'remote'));
    return () => {
      cancelled = true;
    };
  }, [local, manual, tick]);

  // 未起動の間は定期的に確認（手元で開いているときだけ）
  useEffect(() => {
    if (!local || state !== 'offline') return;
    const timer = setInterval(() => setTick((t) => t + 1), POLL_MS);
    return () => clearInterval(timer);
  }, [local, state]);

  const recheck = useCallback(() => {
    setManual(true);
    setState('checking');
    setTick((t) => t + 1);
  }, []);

  return { state, recheck };
}
