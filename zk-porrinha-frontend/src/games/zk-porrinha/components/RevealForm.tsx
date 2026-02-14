import React, { useState } from 'react';

interface Props {
  roomId: bigint | null;
  myAddress: string | null;
  onResolve: (otherHand: number, otherSaltHex: string) => Promise<void>;
  mySecretAvailable: boolean;
}

export default function RevealForm({ roomId, myAddress, onResolve, mySecretAvailable }: Props) {
  const [otherHand, setOtherHand] = useState<number | null>(null);
  const [otherSalt, setOtherSalt] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (otherHand == null) { setError('Informe a mão do adversário'); return; }
    if (!otherSalt) { setError('Informe o salt (hex) do adversário'); return; }
    setError(null);
    setLoading(true);
    try {
      await onResolve(otherHand, otherSalt);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 bg-[#111827] border-4 border-black rounded-sm p-3 text-white text-sm">
      <div className="font-bold mb-2">Reveal & Resolve</div>
      <div className="text-xs opacity-80 mb-2">Cole a mão e o salt do adversário (apenas em modos de teste/Quickstart). Depois gere a prova e finalize a rodada.</div>
      <div className="mb-2">
        <label className="label">Adversário: Mão (0-3)</label>
        <input type="number" min={0} max={3} value={otherHand ?? ''} onChange={(e) => setOtherHand(Number(e.target.value))} className="input mt-1" />
      </div>
      <div className="mb-3">
        <label className="label">Adversário: Salt (hex)</label>
        <input value={otherSalt} onChange={(e) => setOtherSalt(e.target.value)} className="input mt-1" />
      </div>
      <div className="flex justify-end">
        <button disabled={!mySecretAvailable || loading} onClick={submit} className="px-3 py-1 bg-[#fde68a] border-2 border-black rounded-sm font-bold text-black">
          {loading ? 'Gerando prova...' : 'Gerar prova e Resolver'}
        </button>
      </div>
      {error && <div className="text-red-400 mt-2 text-sm">{error}</div>}
    </div>
  );
}
