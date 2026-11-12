'use client';

import { useEffect, useState } from 'react';
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
};

export default function useDatasetStats() {
  const [datasetStats, setDatasetStats] = useState<DatasetStats[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const refreshDatasetStats = () => {
    setStatus('loading');
    apiClient
      .get('/api/datasets/listWithStats')
      .then(res => res.data)
      .then(data => {
        setDatasetStats(data);
        setStatus('success');
      })
      .catch(error => {
        console.error('Error fetching dataset stats:', error);
        setStatus('error');
      });
  };

  useEffect(() => {
    refreshDatasetStats();
  }, []);

  return { datasetStats, status, refreshDatasetStats };
}
