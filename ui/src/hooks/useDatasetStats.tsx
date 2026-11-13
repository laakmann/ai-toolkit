'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/utils/api';

export type DatasetStats = {
  name: string;
  image_count: number;
  video_count: number;
  audio_count: number;
  caption_counts: {
    txt: number;
    json: number;
    caption: number;
  };
  file_count: number;
  media_size_bytes: number;
  caption_size_bytes: number;
  total_size_bytes: number;
};

export interface UseDatasetStatsOptions {
  /** Also stat every file and return byte totals. This is the slower path. */
  includeSizes?: boolean;
}

export default function useDatasetStats({ includeSizes = false }: UseDatasetStatsOptions = {}) {
  const [datasetStats, setDatasetStats] = useState<DatasetStats[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const refreshDatasetStats = useCallback(
    (options: { refresh?: boolean } = {}) => {
      setStatus('loading');
      const params: Record<string, string> = {};
      if (includeSizes) params.sizes = '1';
      if (options.refresh) params.refresh = '1';

      return apiClient
        .get('/api/datasets/listWithStats', { params })
        .then(res => res.data)
        .then(data => {
          setDatasetStats(data);
          setStatus('success');
        })
        .catch(error => {
          console.error('Error fetching dataset stats:', error);
          setStatus('error');
        });
    },
    [includeSizes],
  );

  useEffect(() => {
    refreshDatasetStats();
  }, [refreshDatasetStats]);

  return { datasetStats, status, refreshDatasetStats };
}
