'use client';

import { Modal } from '@/components/Modal';

type Props = {
  title: string;
  text: string | null;
  onClose: () => void;
};

export default function TextPreviewModal({ title, text, onClose }: Props) {
  return (
    <Modal isOpen={text !== null} onClose={onClose} title={title} size="lg">
      <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-gray-200">
        {text}
      </div>
    </Modal>
  );
}
