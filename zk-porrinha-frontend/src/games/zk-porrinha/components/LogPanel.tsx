import React from 'react';

interface Props {
  uiLog: string[];
  onClear: () => void;
  onToggleTransfers: () => void;
  showTransfers: boolean;
}

export default function LogPanel({ uiLog, onClear, onToggleTransfers, showTransfers }: Props) {
  return (
    <div className="mt-3">
      <div className="bg-[#111827] border-4 border-black rounded-sm p-2 text-white text-xs">
        <div className="flex justify-between items-center mb-2">
          <div className="font-bold">Log</div>
          <div className="flex items-center gap-2">
            <button onClick={onClear} className="text-[#fef3c7] text-xs px-2 py-1 border-2 border-[#fef3c7] rounded-sm">Clear</button>
            <button onClick={onToggleTransfers} className="text-[#fef3c7] text-xs px-2 py-1 border-2 border-[#fef3c7] rounded-sm">{showTransfers ? 'Hide Transfers' : 'Toggle Transfers'}</button>
          </div>
        </div>
        <div className="max-h-28 overflow-y-auto space-y-1">
          {uiLog.length === 0 ? (
            <div className="opacity-60">Nenhum evento recente</div>
          ) : (
            uiLog.map((l, i) => (
              <div key={i} className="text-[11px] opacity-90">{l}</div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
