import React from 'react';

interface Props {
  quickstartAvailable: boolean;
  isQuickstarting: boolean;
  onQuickstart: () => Promise<void> | void;
  quickstartButtonRef?: React.RefObject<HTMLButtonElement | null>;
}

export default function QuickstartCard({ quickstartAvailable, isQuickstarting, onQuickstart, quickstartButtonRef }: Props) {
  return (
    <div className="mb-2">
      <div className="bg-[#111827] border-4 border-black rounded-sm p-3 text-white text-sm">
        <div className="flex items-center justify-between">
          <div className="font-bold">Quickstart</div>
          <div className="text-xs opacity-80">Partida rápida</div>
        </div>
        <div className="mt-2 text-[13px] opacity-80">Crie uma sala local e entre automaticamente como jogadora(o). Útil para testes.</div>
        <div className="mt-3 flex justify-end">
          <button
            ref={quickstartButtonRef}
            disabled={!quickstartAvailable || isQuickstarting}
            onClick={() => onQuickstart()}
            className="px-3 py-1 bg-[#fde68a] border-2 border-black rounded-sm font-bold text-black"
          >
            {isQuickstarting ? 'Carregando...' : 'Quickstart'}
          </button>
        </div>
      </div>
    </div>
  );
}
