'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '@/utils/api';
import usePollLoop from '@/hooks/usePollLoop';
import type { JobNotesSummary } from '@/types';

export default function useJobNotesSummaries(jobIDs: string[], reloadInterval: number | null = 15000) {
  const [summaries, setSummaries] = useState<Record<string, JobNotesSummary>>({});
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const isFetchingRef = useRef(false);

  const idsKey = useMemo(
    () =>
      Array.from(new Set(jobIDs.filter(Boolean)))
        .sort()
        .join(','),
    [jobIDs],
  );

  const refresh = useCallback(() => {
    if (!idsKey) {
      setSummaries({});
      setStatus('success');
      return Promise.resolve();
    }
    if (isFetchingRef.current) return Promise.resolve();

    isFetchingRef.current = true;
    setStatus('loading');
    return apiClient
      .post('/api/jobs/notes-summaries', { ids: idsKey.split(',') })
      .then(res => {
        setSummaries(res.data ?? {});
        setStatus('success');
      })
      .catch(error => {
        console.error('Error fetching job notes summaries:', error);
        setStatus('error');
      })
      .finally(() => {
        isFetchingRef.current = false;
      });
  }, [idsKey]);

  usePollLoop(refresh, reloadInterval, [idsKey]);

  // Notes are edited in the separate Notes tab. Refresh when the user comes
  // back to this window/tab so the queue summary catches up immediately.
  useEffect(() => {
    const onFocus = () => {
      refresh();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refresh]);

  return { summaries, status, refresh };
}
