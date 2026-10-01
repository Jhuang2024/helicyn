import { useCallback, useEffect, useState } from 'react';
/** A cancellable read with an explicit error state and retry, never a fake empty result. */
export function useAsyncData<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    load().then((value) => { if (!cancelled) setData(value); })
      .catch(() => { if (!cancelled) setError('Could not load your applications. Please try again.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [load, attempt]);
  return { data, loading, error, retry };
}
