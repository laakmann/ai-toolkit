import { Job } from '@prisma/client';
import useGPUInfo from '@/hooks/useGPUInfo';
import useCPUInfo from '@/hooks/useCPUInfo';
import GPUWidget from '@/components/GPUWidget';
import CPUWidget from '@/components/CPUWidget';
import FilesWidget from '@/components/FilesWidget';
import { getTotalSteps } from '@/utils/jobs';
import { Cpu, HardDrive, Info, Gauge, Download, Maximize2, Minimize2, Search, ArrowDownToLine, WrapText } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import useJobLog from '@/hooks/useJobLog';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import classNames from 'classnames';

interface JobOverviewProps {
  job: Job;
}

export default function JobOverview({ job }: JobOverviewProps) {
  const gpuIds = useMemo(() => {
    if (job.gpu_ids === 'mps') {
      return [0]; // For MPS, we can just return a single GPU ID since it's virtualized
    }
    return job.gpu_ids.split(',').map(id => parseInt(id));
  }, [job.gpu_ids]);
  const { log, status: statusLog, loadFull } = useJobLog(job.id, 2000);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [followLog, setFollowLog] = useState(true);
  const [logSearch, setLogSearch] = useState('');
  const [logWrap, setLogWrap] = useState(false);
  const [logMaximized, setLogMaximized] = useState(false);
  const [loadingFullLog, setLoadingFullLog] = useState(false);
  const { gpuList, isGPUInfoLoaded } = useGPUInfo(gpuIds, 5000);
  const { cpuInfo, isCPUInfoLoaded } = useCPUInfo(5000);
  const totalSteps = getTotalSteps(job);
  const progress = (job.step / totalSteps) * 100;
  const isStopping = job.stop && job.status === 'running';

  const logLines: string[] = useMemo(() => {
    // Log is already terminal-rendered by useJobLog — one entry per line.
    if (log === '') return [];
    return log.split('\n');
  }, [log]);

  const filteredLogLines = useMemo(() => {
    const query = logSearch.trim().toLowerCase();
    if (!query) return logLines;
    return logLines.filter(line => line.toLowerCase().includes(query));
  }, [logLines, logSearch]);

  const jumpToLogBottom = () => {
    if (filteredLogLines.length === 0) return;
    setFollowLog(true);
    virtuosoRef.current?.scrollToIndex({ index: filteredLogLines.length - 1, behavior: 'smooth' });
  };

  // Start every job pinned to the newest line.
  useEffect(() => {
    setFollowLog(true);
  }, [job.id]);

  // Filter changes replace the rendered list. If we were following, snap to the
  // newest matching line instead of leaving the viewport at the old index.
  const lastSearchRef = useRef(logSearch);
  useEffect(() => {
    if (lastSearchRef.current === logSearch) return;
    lastSearchRef.current = logSearch;
    if (!followLog || filteredLogLines.length === 0) return;
    virtuosoRef.current?.scrollToIndex({ index: filteredLogLines.length - 1, behavior: 'auto' });
  }, [logSearch, followLog, filteredLogLines.length]);

  // Loading the full log replaces the bounded tail with the whole file. Snap
  // back to the newest line once that replacement has rendered.
  const wasLoadingFullLogRef = useRef(false);
  useEffect(() => {
    if (wasLoadingFullLogRef.current && !loadingFullLog && followLog) {
      const index = filteredLogLines.length - 1;
      if (index >= 0) {
        virtuosoRef.current?.scrollToIndex({ index, behavior: 'auto' });
      }
    }
    wasLoadingFullLogRef.current = loadingFullLog;
  }, [loadingFullLog, followLog, filteredLogLines.length]);

  const handleLoadFullLog = async () => {
    if (loadingFullLog) return;
    setLoadingFullLog(true);
    try {
      await loadFull();
      setFollowLog(true);
    } finally {
      setLoadingFullLog(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'running':
        return 'bg-emerald-500/10 text-emerald-500';
      case 'stopping':
        return 'bg-amber-500/10 text-amber-500';
      case 'stopped':
        return 'bg-gray-500/10 text-gray-400';
      case 'completed':
        return 'bg-blue-500/10 text-blue-500';
      case 'error':
        return 'bg-rose-500/10 text-rose-500';
      default:
        return 'bg-gray-500/10 text-gray-400';
    }
  };

  const jobType = job?.job_type || 'unknown';

  let status = job.status;
  if (isStopping) {
    status = 'stopping';
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:gap-6 md:grid-cols-3 md:h-full md:min-h-0 md:pb-4">
      {/* Job Information Panel */}
      <div className="md:col-span-2 bg-gray-900 rounded-xl shadow-lg overflow-hidden border border-gray-800 flex flex-col md:h-full md:min-h-0">
        <div className="bg-gray-800 px-4 py-3 flex items-center justify-between shrink-0">
          <h2 className="text-gray-100">
            <Info className="w-5 h-5 mr-2 -mt-1 text-amber-600 dark:text-amber-400 inline-block" /> {job.info}
          </h2>
          <span className={`px-3 py-1 rounded-full text-sm ${getStatusColor(job.status)}`}>{job.status}</span>
        </div>

        <div className="p-4 space-y-6 flex flex-col flex-grow min-h-0">
          {/* Progress Bar */}
          {totalSteps > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Progress</span>
                <span className="text-gray-200">
                  Step {job.step} of {totalSteps}
                </span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div className="h-2 rounded-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* Job Info Grid */}
          <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
            <div className="flex items-center space-x-4">
              <HardDrive className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="text-xs text-gray-400">Job Name</p>
                <p className="text-sm font-medium text-gray-200">{job.name}</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <Cpu className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <div>
                <p className="text-xs text-gray-400">Assigned GPUs</p>
                <p className="text-sm font-medium text-gray-200">GPUs: {job.gpu_ids}</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <Gauge className="w-5 h-5 text-green-600 dark:text-green-400" />
              <div>
                <p className="text-xs text-gray-400">Speed</p>
                <p className="text-sm font-medium text-gray-200">{job.speed_string == '' ? '?' : job.speed_string}</p>
              </div>
            </div>
          </div>

          {/* Log viewer */}
          <div
            className={classNames(
              'bg-gray-950 rounded-lg flex flex-col',
              logMaximized
                ? 'fixed inset-0 z-40 p-3 sm:p-5'
                : 'relative flex-grow min-h-[420px] h-[65vh] p-2 md:h-auto md:min-h-[200px] md:flex-1',
            )}
          >
            <div className="flex flex-wrap items-center gap-1.5 pb-2 shrink-0">
              <div className="relative min-w-[140px] flex-1">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
                <input
                  value={logSearch}
                  onChange={event => setLogSearch(event.target.value)}
                  placeholder="Filter log..."
                  className="w-full rounded border border-gray-700 bg-gray-900 py-1 pl-7 pr-2 text-xs text-gray-200 placeholder:text-gray-500 focus:border-transparent focus:ring-2 focus:ring-gray-600"
                />
              </div>
              <span className="whitespace-nowrap text-[10px] text-gray-500">
                {filteredLogLines.length.toLocaleString()} / {logLines.length.toLocaleString()} lines
              </span>
              <button
                type="button"
                onClick={handleLoadFullLog}
                disabled={loadingFullLog}
                className="flex items-center gap-1 rounded border border-gray-700 px-2 py-1 text-[10px] text-gray-300 hover:bg-gray-800 disabled:opacity-50"
                title="Load the entire log file"
              >
                <ArrowDownToLine className="h-3.5 w-3.5" />
                {loadingFullLog ? 'Loading...' : 'Load full log'}
              </button>
              <a
                href={`/api/jobs/${job.id}/log?download=1`}
                className="flex items-center gap-1 rounded border border-gray-700 px-2 py-1 text-[10px] text-gray-300 hover:bg-gray-800"
                title="Download the full log file"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </a>
              <button
                type="button"
                onClick={() => setLogWrap(value => !value)}
                className={classNames(
                  'flex items-center gap-1 rounded border px-2 py-1 text-[10px]',
                  logWrap
                    ? 'border-sky-500/50 bg-sky-500/10 text-sky-300'
                    : 'border-gray-700 text-gray-300 hover:bg-gray-800',
                )}
                title="Toggle line wrapping"
              >
                <WrapText className="h-3.5 w-3.5" />
                Wrap
              </button>
              <button
                type="button"
                onClick={jumpToLogBottom}
                className="flex items-center gap-1 rounded border border-gray-700 px-2 py-1 text-[10px] text-gray-300 hover:bg-gray-800"
                title="Jump to the newest line"
              >
                <ArrowDownToLine className="h-3.5 w-3.5" />
                Bottom
              </button>
              <button
                type="button"
                onClick={() => setLogMaximized(value => !value)}
                className="flex items-center gap-1 rounded border border-gray-700 px-2 py-1 text-[10px] text-gray-300 hover:bg-gray-800"
                title={logMaximized ? 'Restore log panel' : 'Maximize log panel'}
              >
                {logMaximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden rounded border border-gray-800">
              {statusLog === 'loading' && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">Loading log...</div>
              )}
              {statusLog === 'error' && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-rose-400">
                  Error loading log
                </div>
              )}
              {['success', 'refreshing'].includes(statusLog) && filteredLogLines.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">
                  {logSearch ? 'No lines match the filter.' : 'No log output yet.'}
                </div>
              ) : null}
              {['success', 'refreshing'].includes(statusLog) && filteredLogLines.length > 0 ? (
                <Virtuoso
                  ref={virtuosoRef}
                  style={{ height: '100%' }}
                  data={filteredLogLines}
                  alignToBottom
                  initialTopMostItemIndex={filteredLogLines.length - 1}
                  followOutput={followLog ? 'auto' : false}
                  atBottomStateChange={atBottom => setFollowLog(atBottom)}
                  atBottomThreshold={80}
                  increaseViewportBy={500}
                  itemContent={(index, line) => (
                    <pre
                      className={classNames(
                        'px-2 text-xs text-gray-300',
                        logWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre',
                      )}
                    >
                      {line || ' '}
                    </pre>
                  )}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* GPU Widget Panel */}
      <div className="md:col-span-1 md:flex md:flex-col md:h-full md:min-h-0">
        <div className="shrink-0">{isCPUInfoLoaded && cpuInfo && <CPUWidget cpu={cpuInfo} />}</div>
        <div className="mt-4 shrink-0">
          {isGPUInfoLoaded && gpuList.length > 0 && <GPUWidget gpu={gpuList[0]} />}
        </div>
        {jobType === 'train' && (
          <div className="mt-4 md:flex-1 md:min-h-0">
            <FilesWidget jobID={job.id} jobName={job.name} />
          </div>
        )}
      </div>
    </div>
  );
}
