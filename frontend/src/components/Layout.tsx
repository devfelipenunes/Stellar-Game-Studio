import { WalletSwitcher } from './WalletSwitcher';
import './Layout.css';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="studio">
      <div className="studio-background" aria-hidden="true">
        <div className="studio-orb orb-1" />
        <div className="studio-orb orb-2" />
        <div className="studio-orb orb-3" />
        <div className="studio-grid" />
      </div>

      <header className="studio-header">
        <div className="brand">
          <div className="brand-title">Stellar Game Studio</div>
        </div>
        <div className="header-actions">
          <div className="network-pill">Testnet</div>
          <WalletSwitcher />
        </div>
      </header>

      <main className="studio-main">{children}</main>

      <footer className="studio-footer">
        <span>Built with ♥️for Stellar Developers</span>
      </footer>
    </div>
  );
}
