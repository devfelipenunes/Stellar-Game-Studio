import React from 'react';

interface Props {
  isCommitting: boolean;
  hasCommitted: boolean;
  selectedHand: number | null;
  setSelectedHand: (h: number | null) => void;
  onCommit: () => Promise<void> | void;
}

const HANDS = [1, 2, 3];

export default function CommitForm({ isCommitting, hasCommitted, selectedHand, setSelectedHand, onCommit }: Props) {
  return (
    <div className="bg-[#111827] border-4 border-black rounded-sm p-3 text-white text-sm">
      <div className="font-bold mb-2">Commit</div>
      <div className="text-xs opacity-80 mb-2">Selecione sua mão e faça commit da prova ZK (privado). Apenas par/impar e ganho por soma serão revelados.</div>

      <div className="flex gap-2 mb-3">
        {HANDS.map((h) => (
          <button
            key={h}
            onClick={() => setSelectedHand(h)}
            className={`px-3 py-1 border-2 rounded-sm font-bold ${selectedHand === h ? 'bg-[#fde68a] text-black border-black' : 'bg-transparent border-[#fef3c7] text-[#fef3c7]'}`}>
            {h}
          </button>
        ))}
      </div>

      <div className="flex justify-end">
        <button
          disabled={hasCommitted || selectedHand == null || isCommitting}
          onClick={() => onCommit()}
          className="px-3 py-1 bg-[#fde68a] border-2 border-black rounded-sm font-bold text-black"
        >
          {hasCommitted ? 'Comitado' : isCommitting ? 'Gerando prova...' : 'Commit'}
        </button>
      </div>
    </div>
  );
}
