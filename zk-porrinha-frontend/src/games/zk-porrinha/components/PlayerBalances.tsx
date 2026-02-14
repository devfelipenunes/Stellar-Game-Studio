import React from 'react';
import type { Room } from '../bindings';

interface Props {
  currentRoom: Room | null;
  myAddress: string | null;
}

export default function PlayerBalances({ currentRoom, myAddress }: Props) {
  if (!currentRoom) return null;

  const p1 = currentRoom.player1?.address;
  const p2 = currentRoom.player2?.address;

  return (
    <div className="bg-[#111827] border-4 border-black rounded-sm p-3 text-white text-sm">
      <div className="font-bold">Players</div>
      <div className="mt-2 text-xs opacity-80">Saldo estimado e endereços</div>
      <div className="mt-3 text-[13px] space-y-1">
        <div className="flex justify-between">
          <div className="opacity-90">Jogador 1</div>
          <div className="opacity-70 text-right">
            <div className="text-[12px]">{p1}</div>
          </div>
        </div>
        <div className="flex justify-between">
          <div className="opacity-90">Jogador 2</div>
          <div className="opacity-70 text-right">
            <div className="text-[12px]">{p2 ?? 'aguardando'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
