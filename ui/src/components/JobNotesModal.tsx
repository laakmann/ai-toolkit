'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Modal } from '@/components/Modal';
import Loading from '@/components/Loading';
import { apiClient } from '@/utils/api';

const MarkdownContent = dynamic(() => import('@/components/MarkdownContent'), {
  ssr: false,
  loading: () => <Loading />,
});

type Props = {
  job: { id: string; name: string } | null;
  onClose: () => void;
};

export default function JobNotesModal({ job, onClose }: Props) {
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!job) return;

    let cancelled = false;
    setContent('');
    setError(null);
    setIsLoading(true);
    apiClient
      .get(`/api/jobs/${job.id}/notes`)
      .then(res => {
        if (cancelled) return;
        setContent(res.data?.content ?? '');
      })
      .catch(err => {
        if (cancelled) return;
        console.error('Error loading job notes:', err);
        setError('Could not load notes for this job.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [job]);

  return (
    <Modal isOpen={!!job} onClose={onClose} title={job ? `Notes \u2014 ${job.name}` : 'Notes'} size="xl">
      <div className="max-h-[70vh] overflow-y-auto pr-1">
        {isLoading ? (
          <Loading />
        ) : error ? (
          <div className="text-sm text-rose-400">{error}</div>
        ) : content.trim() ? (
          <MarkdownContent markdown={content} />
        ) : (
          <div className="text-sm text-gray-500">This job has no notes yet.</div>
        )}
      </div>
    </Modal>
  );
}
