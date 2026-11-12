'use client';

import { useEffect, useRef, useState } from 'react';
import { TextInput } from '@/components/formInputs';

type Props = {
  value?: number[] | null;
  onChange: (value: number[] | undefined) => void;
  className?: string;
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

/**
 * Comma/space separated list of relative timestep sampling weights, e.g.
 * "10, 4, 4, 1, 0". Keeps the raw text while the user is typing so partial
 * input like "10," does not get reformatted on every keystroke.
 */
export default function TimestepWeightsInput({ value, onChange, className }: Props) {
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
      />
      {error ? <div className="text-xs text-red-400 mt-1">{error}</div> : null}
    </div>
  );
}
