import { ExternalLink } from 'lucide-react';

interface TransactionInfoProps {
  txHash?: string;
  winner?: string;
  winAmount?: bigint;
  betAmount?: bigint;
  userAddress?: string;
  network?: 'testnet' | 'mainnet';
}

export function TransactionInfo({
  txHash,
  winner,
  winAmount,
  betAmount,
  userAddress,
  network = 'testnet'
}: TransactionInfoProps) {
  if (!txHash && !winner) return null;

  const explorerUrl = txHash 
    ? `https://stellar.expert/explorer/${network}/tx/${txHash}`
    : undefined;

  const isWinner = winner && userAddress && winner === userAddress;

  return (
    <div className="mt-4 p-4 rounded-lg border bg-linear-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 dark:border-gray-700">
      <div className="space-y-2">
        {/* Transaction Hash */}
        {txHash && explorerUrl && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Transaction:</span>
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm font-mono text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              {txHash.slice(0, 8)}...{txHash.slice(-6)}
              <ExternalLink size={14} />
            </a>
          </div>
        )}

        {/* Bet Amount */}
        {betAmount && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Bet Amount:</span>
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {(Number(betAmount) / 10_000_000).toFixed(1)} XLM
            </span>
          </div>
        )}

        {/* Prize Pool */}
        {betAmount && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Prize Pool:</span>
            <span className="text-sm font-semibold text-purple-600 dark:text-purple-400">
              {(Number(betAmount) * 2 / 10_000_000).toFixed(1)} XLM
            </span>
          </div>
        )}

        {/* Winner Info */}
        {winner && (
          <>
            <div className="border-t dark:border-gray-700 my-2" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Winner:</span>
              <span className={`text-sm font-mono ${isWinner ? 'text-green-600 dark:text-green-400 font-bold' : 'text-gray-600 dark:text-gray-400'}`}>
                {isWinner ? '🏆 YOU' : `${winner.slice(0, 8)}...${winner.slice(-6)}`}
              </span>
            </div>
          </>
        )}

        {/* Win Amount */}
        {winAmount && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Prize Won:</span>
            <span className="text-lg font-bold text-green-600 dark:text-green-400">
              💰 {(Number(winAmount) / 10_000_000).toFixed(1)} XLM
            </span>
          </div>
        )}

        {/* Winner Badge */}
        {isWinner && (
          <div className="mt-2 p-2 bg-green-100 dark:bg-green-900/30 rounded text-center">
            <span className="text-green-800 dark:text-green-300 font-bold">
              🎉 CONGRATULATIONS! YOU WON! 🎉
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
