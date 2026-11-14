'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { ArrowDown, ArrowUp, ChevronDown, CircleHelp, Code2, Plus, Trash2 } from 'lucide-react';
import { Checkbox, NumberInput, SelectInput, TextAreaInput } from '@/components/formInputs';
import { getDoc } from '@/docs';
import { openDoc } from '@/components/DocModal';
import type { GroupedSelectOption } from '@/types';
import {
  AUGMENTATION_METHODS,
  AUGMENTATION_METHOD_NAMES,
  AUGMENTATION_PRESETS,
  cloneAugmentationEntries,
  formatAugmentations,
  mergeAugmentationParams,
  parseAugmentationParamsText,
  parseAugmentationsText,
  splitAugmentationParams,
  validateAugmentations,
  type AugmentationEntry,
  type AugmentationPreset,
} from '@/utils/augmentations';

const DEFAULT_METHOD = 'RandomBrightnessContrast';
const DEFAULT_PROBABILITY = 0.5;
const AUGMENTATION_DOC_KEY = 'datasets.augmentations';

type Props = {
  value?: AugmentationEntry[] | null;
  onChange: (value: AugmentationEntry[] | undefined) => void;
  shuffle?: boolean;
  onShuffleChange?: (value: boolean) => void;
  cachingEnabled?: boolean;
  disabled?: boolean;
};

function methodOptionsFor(currentMethod: string): GroupedSelectOption[] {
  const groups = new Map<string, { value: string; label: string }[]>();
  for (const method of AUGMENTATION_METHODS) {
    const group = groups.get(method.group) ?? [];
    group.push({ value: method.name, label: method.name });
    groups.set(method.group, group);
  }

  const options: GroupedSelectOption[] = Array.from(groups, ([label, groupOptions]) => ({
    label,
    options: groupOptions,
  }));

  // Keep imported methods selectable even when they are not in the curated list.
  if (currentMethod && !AUGMENTATION_METHOD_NAMES.has(currentMethod)) {
    options.unshift({
      label: 'Imported / custom',
      options: [{ value: currentMethod, label: currentMethod }],
    });
  }

  return options;
}

function AugmentationRow({
  entry,
  index,
  count,
  disabled,
  onChange,
  onRemove,
  onMove,
}: {
  entry: AugmentationEntry;
  index: number;
  count: number;
  disabled?: boolean;
  onChange: (entry: AugmentationEntry) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const [paramsOpen, setParamsOpen] = useState(false);
  const [paramsText, setParamsText] = useState('');
  const [paramsError, setParamsError] = useState<string | null>(null);
  const { p, rest } = splitAugmentationParams(entry.params);
  const restKeys = Object.keys(rest);
  const preview = restKeys.length > 0 ? JSON.stringify(rest) : 'No extra parameters';

  const methodOptions = useMemo(() => methodOptionsFor(entry.method), [entry.method]);

  const toggleParams = () => {
    if (!paramsOpen) {
      setParamsText(JSON.stringify(rest, null, 2));
      setParamsError(null);
    }
    setParamsOpen(open => !open);
  };

  const applyParams = () => {
    const parsed = parseAugmentationParamsText(paramsText);
    if (parsed.error !== undefined) {
      setParamsError(parsed.error);
      return;
    }

    const parsedParams = parsed.params ?? {};
    const parsedSplit = splitAugmentationParams(parsedParams);
    onChange({
      ...entry,
      params: mergeAugmentationParams(parsedSplit.rest, parsedSplit.p ?? p),
    });
    setParamsError(null);
    setParamsOpen(false);
  };

  const iconButton =
    'rounded-full p-1.5 text-gray-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed';

  return (
    <div className="rounded border border-gray-800 bg-gray-900/40 p-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[180px] flex-1">
          <SelectInput
            value={entry.method}
            disabled={disabled}
            onChange={method => onChange({ ...entry, method })}
            options={methodOptions}
          />
        </div>
        <div className="w-20 shrink-0">
          <NumberInput
            label="p"
            value={p}
            allowEmpty
            min={0}
            max={1}
            disabled={disabled}
            placeholder="default"
            onChange={value => onChange({ ...entry, params: mergeAugmentationParams(rest, value) })}
          />
        </div>
        <button
          type="button"
          onClick={toggleParams}
          disabled={disabled}
          className={classNames(
            'flex items-center gap-1 rounded border border-gray-700 px-2 py-1 text-[11px] text-gray-300 hover:bg-gray-800 disabled:opacity-40',
            paramsOpen && 'bg-gray-800',
          )}
          title="Edit method-specific parameters"
        >
          <Code2 className="h-3.5 w-3.5" />
          Params{restKeys.length > 0 ? ` (${restKeys.length})` : ''}
        </button>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={disabled || index === 0}
            className={classNames(iconButton, 'bg-gray-700 hover:bg-gray-600')}
            title="Move earlier"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={disabled || index === count - 1}
            className={classNames(iconButton, 'bg-gray-700 hover:bg-gray-600')}
            title="Move later"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className={classNames(iconButton, 'bg-red-600 hover:bg-red-700')}
            title="Remove transform"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-1 truncate font-mono text-[10px] text-gray-500" title={JSON.stringify(rest, null, 2)}>
        {preview}
      </div>

      {paramsOpen && (
        <div className="mt-2 border-t border-gray-800 pt-2">
          <div className="font-mono">
            <TextAreaInput
              label="Method parameters (YAML or JSON) — p is edited above"
              rows={4}
              value={paramsText}
              disabled={disabled}
              onChange={value => {
                setParamsText(value);
                if (paramsError) setParamsError(null);
              }}
            />
          </div>
          {paramsError && <div className="mt-1 text-[11px] text-rose-400">{paramsError}</div>}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={applyParams}
              disabled={disabled}
              className="rounded bg-sky-600 px-2 py-1 text-[11px] text-white hover:bg-sky-500 disabled:opacity-40"
            >
              Apply params
            </button>
            <button
              type="button"
              onClick={() => {
                setParamsOpen(false);
                setParamsError(null);
              }}
              disabled={disabled}
              className="rounded border border-gray-700 px-2 py-1 text-[11px] text-gray-400 hover:bg-gray-800 disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DatasetAugmentationsSection({
  value,
  onChange,
  shuffle,
  onShuffleChange,
  cachingEnabled,
  disabled,
}: Props) {
  const entries = useMemo(() => (Array.isArray(value) ? value : []) as AugmentationEntry[], [value]);
  const [open, setOpen] = useState(entries.length > 0);
  const [rawMode, setRawMode] = useState(false);
  const [rawText, setRawText] = useState('');
  const [rawError, setRawError] = useState<string | null>(null);
  const previousCount = useRef(entries.length);
  const doc = getDoc(AUGMENTATION_DOC_KEY);

  // Open automatically when a config with augmentations is imported or loaded
  // after mount, but never reopen a section the user deliberately collapsed.
  useEffect(() => {
    if (previousCount.current === 0 && entries.length > 0) {
      setOpen(true);
    }
    previousCount.current = entries.length;
  }, [entries.length]);

  const validation = useMemo(() => validateAugmentations(entries), [entries]);

  const commit = (next: AugmentationEntry[]) => {
    onChange(next.length > 0 ? next : undefined);
    setOpen(true);
  };

  const addTransform = () => {
    commit([...entries, { method: DEFAULT_METHOD, params: { p: DEFAULT_PROBABILITY } }]);
  };

  const addPreset = (preset: AugmentationPreset) => {
    commit([...entries, ...cloneAugmentationEntries(preset.entries)]);
  };

  const updateEntry = (index: number, entry: AugmentationEntry) => {
    commit(entries.map((current, currentIndex) => (currentIndex === index ? entry : current)));
  };

  const removeEntry = (index: number) => {
    commit(entries.filter((_, currentIndex) => currentIndex !== index));
  };

  const moveEntry = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= entries.length) return;
    const next = [...entries];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  };

  const openRawEditor = () => {
    setRawText(formatAugmentations(entries));
    setRawError(null);
    setRawMode(true);
  };

  const applyRawEditor = () => {
    const parsed = parseAugmentationsText(rawText);
    if (parsed.error !== undefined) {
      setRawError(parsed.error);
      return;
    }
    commit(parsed.entries);
    setRawMode(false);
    setRawError(null);
  };

  return (
    <div className="rounded border border-gray-800 bg-gray-950/40">
      <div className="flex items-center justify-between gap-2 pr-2">
        <button
          type="button"
          onClick={() => setOpen(current => !current)}
          className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
        >
          <ChevronDown
            className={classNames('h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform', {
              '-rotate-90': !open,
            })}
          />
          <span className="truncate text-xs text-gray-300">Augmentations</span>
        </button>
        {doc && (
          <button
            type="button"
            onClick={() => openDoc(doc)}
            className="shrink-0 text-gray-500 hover:text-gray-300"
            title="About dataset augmentations"
          >
            <CircleHelp className="h-3.5 w-3.5" />
          </button>
        )}
        <span className={classNames('shrink-0 text-[10px]', entries.length > 0 ? 'text-emerald-400' : 'text-gray-600')}>
          {entries.length > 0 ? `${entries.length} transform${entries.length === 1 ? '' : 's'}` : 'off'}
        </span>
      </div>

      {open && (
        <div className="border-t border-gray-800 px-2 pb-2 pt-2">
          {rawMode ? (
            <div>
              <div className="font-mono">
                <TextAreaInput
                  label="Augmentations (YAML or JSON)"
                  rows={10}
                  value={rawText}
                  disabled={disabled}
                  onChange={value => {
                    setRawText(value);
                    if (rawError) setRawError(null);
                  }}
                />
              </div>
              {rawError && <div className="mt-1 text-[11px] text-rose-400">{rawError}</div>}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={applyRawEditor}
                  disabled={disabled}
                  className="rounded bg-sky-600 px-2 py-1 text-[11px] text-white hover:bg-sky-500 disabled:opacity-40"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRawMode(false);
                    setRawError(null);
                  }}
                  disabled={disabled}
                  className="rounded border border-gray-700 px-2 py-1 text-[11px] text-gray-400 hover:bg-gray-800 disabled:opacity-40"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={addTransform}
                  disabled={disabled}
                  className="flex items-center gap-1 rounded border border-gray-700 px-2 py-1 text-[11px] text-gray-300 hover:bg-gray-800 disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add transform
                </button>
                <span className="text-[10px] text-gray-500">Presets:</span>
                {AUGMENTATION_PRESETS.map(preset => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => addPreset(preset)}
                    disabled={disabled}
                    className="rounded border border-gray-700 px-2 py-1 text-[11px] text-gray-300 hover:bg-gray-800 disabled:opacity-40"
                    title={preset.description}
                  >
                    + {preset.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={openRawEditor}
                  disabled={disabled}
                  className="ml-auto flex items-center gap-1 rounded border border-gray-700 px-2 py-1 text-[11px] text-gray-300 hover:bg-gray-800 disabled:opacity-40"
                >
                  <Code2 className="h-3.5 w-3.5" />
                  Edit YAML / JSON
                </button>
              </div>

              <div className="mt-2 space-y-2">
                {entries.map((entry, index) => (
                  <AugmentationRow
                    key={`${index}-${entry.method}`}
                    entry={entry}
                    index={index}
                    count={entries.length}
                    disabled={disabled}
                    onChange={updated => updateEntry(index, updated)}
                    onRemove={() => removeEntry(index)}
                    onMove={direction => moveEntry(index, direction)}
                  />
                ))}
              </div>

              {entries.length === 0 && (
                <div className="mt-2 text-[11px] text-gray-500">
                  No augmentations. Add a transform, apply a preset, or paste an existing list in the raw editor.
                </div>
              )}

              {onShuffleChange && entries.length > 0 && (
                <div className="mt-2">
                  <Checkbox
                    label="Shuffle transform order each batch"
                    checked={!!shuffle}
                    disabled={disabled}
                    onChange={onShuffleChange}
                  />
                </div>
              )}

              {cachingEnabled && entries.length > 0 && (
                <div className="mt-2 text-[11px] text-amber-400">
                  Latent caching is disabled while augmentations are enabled.
                </div>
              )}

              {validation.errors.length > 0 && (
                <div className="mt-2 space-y-1 rounded border border-rose-900/60 bg-rose-950/30 px-2 py-1.5 text-[11px] text-rose-300">
                  {validation.errors.map((error, index) => (
                    <div key={index}>{error}</div>
                  ))}
                </div>
              )}
              {validation.warnings.length > 0 && (
                <div className="mt-2 space-y-1 rounded border border-amber-900/60 bg-amber-950/30 px-2 py-1.5 text-[11px] text-amber-300">
                  {validation.warnings.map((warning, index) => (
                    <div key={index}>{warning}</div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
