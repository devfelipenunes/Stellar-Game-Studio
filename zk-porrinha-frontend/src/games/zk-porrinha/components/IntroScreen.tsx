import React, { useState, useEffect } from 'react';

interface IntroScreenProps {
  onEnter: () => void;
}

const TYPEWRITER_TEXT = [
  '> You step into a dimly lit bar in Rio...',
  '> A flickering sign reads: BAR DO ADRIANO',
  '> Men clench their fists under a bare bulb.',
  '> This is PORRINHA — the finger game of Rio.',
  '> Put your XLM on the table. Prove your hand with ZK.',
  '> Nobody cheats here. The math is the witness.',
];

export default function IntroScreen({ onEnter }: IntroScreenProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [lineIndex, setLineIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [showButton, setShowButton] = useState(false);
  const [blink, setBlink] = useState(true);

  // Typewriter effect
  useEffect(() => {
    if (lineIndex >= TYPEWRITER_TEXT.length) {
      setTimeout(() => setShowButton(true), 400);
      return;
    }
    const currentLine = TYPEWRITER_TEXT[lineIndex];
    if (charIndex < currentLine.length) {
      const t = setTimeout(() => {
        setLines(prev => {
          const next = [...prev];
          next[lineIndex] = (next[lineIndex] || '') + currentLine[charIndex];
          return next;
        });
        setCharIndex(c => c + 1);
      }, 28);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(() => {
        setLineIndex(l => l + 1);
        setCharIndex(0);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [lineIndex, charIndex]);

  // Blink cursor
  useEffect(() => {
    const t = setInterval(() => setBlink(b => !b), 500);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      className="font-pixel flex flex-col items-center justify-center min-h-screen bg-[#1a0a00] px-4 py-8"
      style={{ fontFamily: "'Press Start 2P', monospace" }}
    >
      {/* Pixel art bar sign */}
      <div className="mb-6 text-center">
        <div
          className="text-[#fbbf24] text-xl md:text-2xl mb-1 tracking-widest"
          style={{ textShadow: '3px 3px 0 #92400e, 0 0 20px #f59e0b' }}
        >
          🍺 BAR DO ADRIANO 🍺
        </div>
        <div
          className="text-[#ef4444] text-xs tracking-widest uppercase"
          style={{ textShadow: '2px 2px 0 #7f1d1d' }}
        >
          — Est. 1987 · Rio de Janeiro —
        </div>      </div>

      {/* ASCII bar divider */}
      <div className="text-[#78350f] text-xs mb-6 tracking-widest select-none">
        ══════════════════════════════
      </div>

      {/* Terminal window */}
      <div className="w-full max-w-lg bg-[#0d0d0d] border-4 border-[#fbbf24] rounded-sm shadow-[6px_6px_0_#92400e] p-4 mb-8 min-h-55">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-3 h-3 rounded-full bg-[#ef4444] border border-black" />
          <div className="w-3 h-3 rounded-full bg-[#fbbf24] border border-black" />
          <div className="w-3 h-3 rounded-full bg-[#22c55e] border border-black" />
          <span className="text-[#6b7280] text-[9px] ml-2">terminal — bar_do_adriano_v1</span>
        </div>
        <div className="space-y-1">
          {lines.map((line, i) => (
            <div key={i} className="text-[#22c55e] text-[10px] md:text-xs leading-relaxed">
              {line}
            </div>
          ))}
          {/* Blinking cursor on current line */}
          {!showButton && (
            <span
              className="inline-block w-2 h-3 bg-[#22c55e]"
              style={{ opacity: blink ? 1 : 0 }}
            />
          )}
        </div>
      </div>

      {/* How to play */}
      <div className="w-full max-w-lg bg-[#1c0f00] border-4 border-[#92400e] rounded-sm p-4 mb-8">
        <div className="text-[#fbbf24] text-[10px] mb-3 tracking-wider">
          HOW TO PLAY PORRINHA:
        </div>
        <div className="space-y-2 text-[9px] text-[#d97706] leading-relaxed">
          <div>› Each player hides <span className="text-white">0 to 3 fingers</span> in their fist.</div>
          <div>› Bet XLM. Guess if the total is <span className="text-white">ODD or EVEN</span>.</div>
          <div>› Optionally guess the <span className="text-white">exact sum</span> for the jackpot.</div>
          <div>› <span className="text-white">ZK Proof</span> ensures nobody lies about their hand.</div>
          <div>› 80% pot goes to parity winner. 20% feeds the jackpot.</div>
          <div>› Jackpot pays out if someone nails the exact sum.</div>
        </div>
      </div>

      {/* Enter button */}
      {showButton && (
        <button
          onClick={onEnter}
          className="px-8 py-4 bg-[#fbbf24] border-4 border-black text-black font-bold text-sm tracking-widest uppercase shadow-[6px_6px_0_#000] hover:shadow-[3px_3px_0_#000] hover:translate-x-1 hover:translate-y-1 transition-all"
          style={{ animation: 'pulse 1.5s infinite' }}
        >
          🍺 ENTER THE BAR
        </button>
      )}

      <div className="mt-8 text-[#3d1c00] text-[8px] tracking-widest text-center">
        POWERED BY STELLAR · ZK PROOFS ON-CHAIN · STELLAR GAME STUDIO
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 6px 6px 0 #000, 0 0 10px #f59e0b; }
          50% { box-shadow: 6px 6px 0 #000, 0 0 25px #f59e0b; }
        }
      `}</style>
    </div>
  );
}
