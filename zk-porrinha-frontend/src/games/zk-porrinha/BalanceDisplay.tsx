import { useEffect, useState } from 'react';

const XLM_TOKEN_ADDRESS = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const RPC_URL = 'https://soroban-testnet.stellar.org';

interface BalanceDisplayProps {
  address: string;
  label?: string;
  highlight?: boolean;
}

export function BalanceDisplay({ address, label, highlight }: BalanceDisplayProps) {
  const [balance, setBalance] = useState<string>('...');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBalance();
    // Atualiza a cada 5 segundos
    const interval = setInterval(fetchBalance, 5000);
    return () => clearInterval(interval);
  }, [address]);

  async function fetchBalance() {
    if (!address) {
      setBalance('0');
      setLoading(false);
      return;
    }

    try {
      // Usa o JSON-RPC da Horizon/Soroban para buscar saldo
      const response = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'getBalance',
          params: {
            address,
          },
        }),
      });

      const data = await response.json();
      
      if (data.result) {
        const balanceInStroops = BigInt(data.result.balance || '0');
        // XLM tem 7 casas decimais (stroops)
        const balanceInXLM = Number(balanceInStroops) / 10_000_000;
        setBalance(balanceInXLM.toFixed(2));
      } else {
        // Fallback: tenta buscar do contrato de token diretamente
        setBalance('?.??');
      }
    } catch (error) {
      console.error('[BalanceDisplay] Failed to fetch balance:', error);
      setBalance('???');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        borderRadius: '8px',
        backgroundColor: highlight ? '#fef3c7' : '#f3f4f6',
        border: highlight ? '2px solid #f59e0b' : '1px solid #e5e7eb',
        fontSize: '14px',
        fontWeight: '500',
        transition: 'all 0.3s ease',
      }}
    >
      {label && <span style={{ color: '#6b7280' }}>{label}:</span>}
      <span style={{ color: loading ? '#9ca3af' : highlight ? '#d97706' : '#1f2937' }}>
        {loading ? '...' : `${balance} XLM`}
      </span>
      {!loading && (
        <button
          onClick={fetchBalance}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '12px',
            color: '#6b7280',
            padding: '2px',
          }}
          title="Atualizar saldo"
        >
          🔄
        </button>
      )}
    </div>
  );
}
