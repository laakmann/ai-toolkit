'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2 } from 'lucide-react';
import { TextInput } from '@/components/formInputs';
import { openSafetensorsInfoModal } from '@/components/SafetensorsInfoModal';
import { apiClient } from '@/utils/api';
import { formatBytes } from '@/utils/basic';

interface LoraInfoResponse {
  path: string;
  exists: boolean;
  isFile: boolean;
  isSafetensors: boolean;
  fileSize: number;
  rank: number | null;
  ranks: number[];
  networkType: 'LoRA' | 'LoKr' | 'Other' | null;
  tensorCount: number;
  baseModel: string | null;
}

type CheckState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'valid'; info: LoraInfoResponse }
  | { status: 'invalid' | 'error'; message: string };

type Props = {
  value: string;
  onChange: (value: string | null) => void;
  disabled?: boolean;
};

const CHECK_DELAY_MS = 450;

function errorMessage(error: any): string {
  const data = error?.response?.data;
  if (typeof data === 'string' && data.trim()) return data;
  if (data && typeof data === 'object' && 'error' in data) return String(data.error);
  return error?.message || 'Could not validate this path';
}

function tooltipFor(info: LoraInfoResponse): string {
  const lines = [
    info.networkType ? `Type: ${info.networkType}` : null,
    info.rank !== null ? `Rank: ${info.rank}` : null,
    info.ranks.length > 1 ? `Ranks: ${info.ranks.join(', ')}` : null,
    `Size: ${formatBytes(info.fileSize)}`,
    info.tensorCount > 0 ? `Tensors: ${info.tensorCount.toLocaleString()}` : null,
    info.baseModel ? `Base model: ${info.baseModel}` : null,
    !info.isSafetensors ? 'Detailed stats are only available for .safetensors files.' : null,
  ];
  return lines.filter(Boolean).join('\n');
}

function summaryFor(info: LoraInfoResponse): string {
  const type = info.networkType ?? (info.isSafetensors ? 'Safetensors' : 'File');
  const rank = info.rank !== null ? `Rank ${info.rank}` : null;
  return [type, rank, formatBytes(info.fileSize)].filter(Boolean).join(' · ');
}

export default function PretrainedLoraInput({ value, onChange, disabled }: Props) {
  const [check, setCheck] = useState<CheckState>({ status: 'idle' });
  const requestRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runCheck = useCallback((rawPath: string) => {
    const trimmed = rawPath.trim();
    if (!trimmed) {
      requestRef.current += 1;
      setCheck({ status: 'idle' });
      return;
    }

    const requestID = ++requestRef.current;
    setCheck({ status: 'checking' });
    apiClient
      .post('/api/files/lora-info', { filePath: trimmed })
      .then(res => {
        if (requestRef.current !== requestID) return;
        setCheck({ status: 'valid', info: res.data as LoraInfoResponse });
      })
      .catch(error => {
        if (requestRef.current !== requestID) return;
        setCheck({ status: 'error', message: errorMessage(error) });
      });
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    // Ignore any response that belongs to the previous value.
    requestRef.current += 1;

    const trimmed = value.trim();
    if (!trimmed) {
      setCheck({ status: 'idle' });
      return;
    }

    // Clear a previous green result as soon as the path changes; the debounce
    // then decides whether the new value is valid.
    setCheck(current => (current.status === 'checking' ? current : { status: 'checking' }));
    timerRef.current = setTimeout(() => runCheck(trimmed), CHECK_DELAY_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, runCheck]);

  useEffect(
    () => () => {
      requestRef.current += 1;
    },
    [],
  );

  const checkNow = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const trimmed = value.trim();
    if (trimmed !== value) onChange(trimmed || null);
    runCheck(trimmed);
  };

  const info = check.status === 'valid' ? check.info : null;

  const suffix = (
    <span className="flex items-center gap-1">
      {check.status === 'checking' && <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" />}
      {check.status === 'valid' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
      {(check.status === 'invalid' || check.status === 'error') && (
        <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
      )}
      {info?.isSafetensors && (
        <button
          type="button"
          onClick={() => openSafetensorsInfoModal(info.path)}
          className="rounded-full p-0.5 text-sky-400 hover:bg-sky-500/20 hover:text-sky-300"
          title="View safetensors details"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );

  return (
    <div>
      <TextInput
        label="Pretrained LoRA"
        docKey="config.process[0].network.pretrained_lora_path"
        value={value ?? ''}
        onChange={next => onChange(next.trim() === '' ? null : next)}
        onBlur={checkNow}
        placeholder="Optional path to a checkpoint .safetensors file"
        suffix={suffix}
        disabled={disabled}
      />
      <div aria-live="polite" className="min-h-[1rem]">
        {check.status === 'valid' && info && (
          <div className="mt-1 truncate text-[11px] text-emerald-400" title={tooltipFor(info)}>
            {summaryFor(info)}
          </div>
        )}
        {(check.status === 'invalid' || check.status === 'error') && (
          <div className="mt-1 truncate text-[11px] text-rose-400" title={check.message}>
            {check.message}
          </div>
        )}
      </div>
    </div>
  );
}
