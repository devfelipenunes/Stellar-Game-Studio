import React from 'react';

interface PixelLayoutProps {
  children: React.ReactNode;
  statusLeft?: React.ReactNode;
  statusRight?: React.ReactNode;
}

export default function PixelLayout({ children, statusLeft, statusRight }: PixelLayoutProps) {
  return (
    <div className="font-pixel flex justify-center items-start p-6 bg-transparent">
      <div className="w-full max-w-md md:max-w-2xl lg:max-w-3xl bg-[#A0522D] border-4 border-black rounded-4xl overflow-hidden relative shadow-[8px_8px_0px_rgba(0,0,0,1)]">
        {/* Top compact status bar - in normal flow to avoid overlap */}
        <div className="flex items-center justify-between bg-[#0f172a] border-b-4 border-black text-white text-sm px-4 py-2">
          <div className="text-sm">{statusLeft || <span>&gt; Pronto</span>}</div>
          <div className="text-xs opacity-80">{statusRight || 'Studio • ZK Porrinha'}</div>
        </div>

        {/* Main content area padding - add bottom padding to avoid footer overlap */}
        <div className="p-4 pb-16 md:pb-20">{children}</div>

        {/* Small bottom spacer to keep layout balanced */}
        <div className="absolute bottom-0 left-0 right-0 h-4" />
      </div>
    </div>
  );
}
