'use client';

import { useEffect, useRef, useState } from 'react';
import { TextInput } from '@/components/formInputs';

type Props = {
  value?: number[] | null;
  onChange: (value: number[] | undefined) => void;
  className?: string;
  disabled?: boolean;
};

function formatWeights(value?: number[] | null): string {
  if (!value || value.length === 0) {
    return '';
  }
  return value.join(', ');
}

function parseWeights(text: string): { weights?: number[]; error?: string } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { weights: undefined };
  }

  const parts = trimmed.split(/[\s,]+/).filter(Boolean);
  const weights: number[] = [];
  for (const part of parts) {
    const value = Number(part);
    if (!Number.isFinite(value)) {
      return { error: `Invalid number: ${part}` };
    }
    if (value < 0) {
      return { error: 'Weights must be zero or greater' };
    }
    weights.push(value);
  }

  if (!weights.some(value => value > 0)) {
    return { error: 'At least one weight must be greater than zero' };
  }
  return { weights };
}

function WeightPreview({ value }: { value?: number[] | null }) {
  if (!value || value.length === 0) {
    return null;
  }
  const parsed = parseWeights(value.join(','));
  if (parsed.error || !parsed.weights) {
    return <div className="mt-1 text-[10px] text-rose-400">{parsed.error}</div>;
  }

  const total = parsed.weights.reduce((sum, weight) => sum + weight, 0);
  return (
    <div className="mt-1.5">
      <div className="flex h-8 items-end gap-1" title="Normalized sampling probability per bucket">
        {parsed.weights.map((weight, index) => {
          const percent = (weight / total) * 100;
          return (
            <div
              key={index}
              className="flex h-full flex-1 items-end"
              title={`Bucket ${index + 1}: ${percent.toFixed(1)}%`}
            >
              <div
                className={weight > 0 ? 'w-full rounded-t bg-sky-500/70' : 'w-full rounded-t bg-gray-700'}
                style={{ height: `${Math.max(weight > 0 ? 6 : 2, percent)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-gray-500">
        <span>noisiest</span>
        <span>{parsed.weights.map(weight => `${((weight / total) * 100).toFixed(0)}%`).join(' · ')}</span>
        <span>cleanest</span>
      </div>
    </div>
  );
}

/**
 * Comma/space separated list of relative timestep sampling weights, e.g.
 * "10, 4, 4, 1, 0". Keeps the raw text while the user is typing so partial
 * input like "10," does not get reformatted on every keystroke.
 */
export default function TimestepWeightsInput({ value, onChange, className, disabled }: Props) {
  const [text, setText] = useState(() => formatWeights(value));
  const [error, setError] = useState<string | null>(null);
  const lastEmitted = useRef<number[] | undefined>(undefined);

  useEffect(() => {
    const nextText = formatWeights(value);
    // Ignore the echo of our own onChange; otherwise typing "10," would be
    // rewritten to "10" when the parent stores the parsed [10].
    if (formatWeights(lastEmitted.current) === nextText) {
      return;
    }
    setText(nextText);
    setError(null);
  }, [value]);

  const handleChange = (nextText: string) => {
    setText(nextText);
    const parsed = parseWeights(nextText);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    setError(null);
    lastEmitted.current = parsed.weights;
    onChange(parsed.weights);
  };

  return (
    <div className={className}>
      <TextInput
        label="Timestep Weights"
        docKey="datasets.timestep_weights"
        value={text}
        onChange={handleChange}
        placeholder="eg. 10, 4, 4, 1, 0"
        disabled={disabled}
      />
      {error ? <div className="text-xs text-red-400 mt-1">{error}</div> : null}
      {!disabled ? <WeightPreview value={text ? parseWeights(text).weights : undefined} /> : null}
    </div>
  );
}
