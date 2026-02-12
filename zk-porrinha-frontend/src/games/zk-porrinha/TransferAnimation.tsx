import { useEffect, useState } from 'react';

interface TransferAnimationProps {
  from: string; // endereço do perdedor ou "contract"
  to: string; // endereço do ganhador
  amount: string; // em XLM
  type: 'bet' | 'jackpot'; // tipo de transferência
  onComplete?: () => void;
}

export function TransferAnimation({ from, to, amount, type, onComplete }: TransferAnimationProps) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const duration = 2000; // 2 segundos
    const interval = 50; // atualiza a cada 50ms
    const steps = duration / interval;
    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep++;
      setProgress((currentStep / steps) * 100);

      if (currentStep >= steps) {
        clearInterval(timer);
        setTimeout(() => {
          setVisible(false);
          onComplete?.();
        }, 500);
      }
    }, interval);

    return () => clearInterval(timer);
  }, [onComplete]);

  if (!visible) return null;

  const formatAddress = (addr: string) => {
    if (addr === 'contract') return '📋 Contrato';
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  const emoji = type === 'jackpot' ? '🎰' : '💰';
  const color = type === 'jackpot' ? '#8b5cf6' : '#3b82f6';

  return (
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 1000,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        borderRadius: '16px',
        padding: '32px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        minWidth: '400px',
        animation: 'fadeIn 0.3s ease-out',
      }}
    >
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translate(-50%, -40%); }
          to { opacity: 1; transform: translate(-50%, -50%); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
      `}</style>

      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div
          style={{
            fontSize: '48px',
            animation: 'pulse 1.5s infinite',
          }}
        >
          {emoji}
        </div>
        <h3 style={{ color: 'white', fontSize: '20px', margin: '8px 0' }}>
          {type === 'jackpot' ? '🎉 JACKPOT!' : '💸 Transferência'}
        </h3>
        <div style={{ color: color, fontSize: '24px', fontWeight: 'bold' }}>
          {amount} XLM
        </div>
      </div>

      <div style={{ position: 'relative', marginBottom: '16px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
          }}
        >
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: 'rgba(239, 68, 68, 0.2)',
              borderRadius: '8px',
              color: '#fca5a5',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            {formatAddress(from)}
          </div>
          
          <div
            style={{
              flex: 1,
              height: '2px',
              backgroundColor: '#374151',
              margin: '0 12px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                height: '100%',
                width: `${progress}%`,
                backgroundColor: color,
                transition: 'width 0.05s linear',
                boxShadow: `0 0 10px ${color}`,
              }}
            />
          </div>

          <div
            style={{
              padding: '8px 12px',
              backgroundColor: 'rgba(34, 197, 94, 0.2)',
              borderRadius: '8px',
              color: '#86efac',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            {formatAddress(to)}
          </div>
        </div>

        <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: '12px' }}>
          {Math.round(progress)}% completo
        </div>
      </div>

      <div
        style={{
          textAlign: 'center',
          color: '#6b7280',
          fontSize: '12px',
          fontStyle: 'italic',
        }}
      >
        ⛓️ Transação processada na blockchain Stellar
      </div>
    </div>
  );
}

interface TransferQueueItem {
  id: string;
  from: string;
  to: string;
  amount: string;
  type: 'bet' | 'jackpot';
}

interface TransferQueueProps {
  transfers: TransferQueueItem[];
  onAllComplete?: () => void;
}

export function TransferQueue({ transfers, onAllComplete }: TransferQueueProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (transfers.length === 0 || currentIndex >= transfers.length) {
    return null;
  }

  const current = transfers[currentIndex];

  return (
    <TransferAnimation
      {...current}
      onComplete={() => {
        if (currentIndex === transfers.length - 1) {
          onAllComplete?.();
        } else {
          setCurrentIndex(currentIndex + 1);
        }
      }}
    />
  );
}
