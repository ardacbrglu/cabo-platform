import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ProfileDropdown from './ProfileDropdown';
import {
  BarChart2, Link2, ShoppingCart, Wallet2, Home as HomeIcon
} from 'lucide-react';
import { useIsMobile } from '../hooks/useIsMobile';
import HamburgerMenu from './HamburgerMenu';

import { useUser } from '@/context/UserContext';
import { useTranslation } from '@/hooks/useTranslation';

const COLOR_CABO = '#d1ffd0';

export default function Layout({ children }) {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const { user } = useUser();
  const t = useTranslation(user?.language_preference || "en");

  const navItemClass = (path) => `
    inline-flex flex-row items-center gap-2
    transition hover:text-[#81d742] hover:scale-[1.015]
    ${pathname === path ? 'text-[#81d742] font-semibold' : 'text-gray-200'}
  `;

  const navItemStyle = {
    display: 'inline-flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '0.5rem',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
    textAlign: 'left',
    padding: '12px 10px'
  };

  return (
    <div className="min-h-screen flex flex-col bg-transparent">
      <header className="flex justify-between items-center px-5 py-4 md:px-10 md:py-6 bg-[#111] border-b border-[#1f1f1f] shadow-sm">
        <h1
          className="text-3xl md:text-5xl font-extrabold tracking-tight select-none"
          style={{
            color: COLOR_CABO,
            letterSpacing: "-0.02em",
            textShadow: "0 2px 12px rgba(129,215,66,0.09)"
          }}
        >
          Cabo
        </h1>
        {isMobile ? (
          <HamburgerMenu navItemClass={navItemClass} navItemStyle={navItemStyle} />
        ) : (
          <nav>
            <ul className="flex gap-8 text-sm font-medium items-center">
              <li>
                <Link href="/dashboard" className={navItemClass('/dashboard')} style={navItemStyle}>
                  <HomeIcon size={22} />
                  <span>{t("home")}</span>
                </Link>
              </li>
              <li>
                <Link href="/products" className={navItemClass('/products')} style={navItemStyle}>
                  <ShoppingCart size={22} />
                  <span>{t("productMarket")}</span>
                </Link>
              </li>
              <li>
                <Link href="/mylinks" className={navItemClass('/mylinks')} style={navItemStyle}>
                  <Link2 size={22} />
                  <span>{t("myLinks")}</span>
                </Link>
              </li>
              <li>
                <Link href="/performance" className={navItemClass('/performance')} style={navItemStyle}>
                  <BarChart2 size={22} />
                  <span>{t("performance.title")}</span>
                </Link>
              </li>
              <li>
                <Link href="/wallet" className={navItemClass('/wallet')} style={navItemStyle}>
                  <Wallet2 size={22} />
                  <span>{t("wallet")}</span>
                </Link>
              </li>
              <li>
                <ProfileDropdown />
              </li>
            </ul>
          </nav>
        )}
      </header>

      <main className="flex-1 flex flex-col">{children}</main>

      <footer className="w-full text-center py-5 bg-[#111] text-gray-500 text-xs border-t border-[#1f1f1f] font-mono mt-auto">
        &copy; 2025 Cabo Affiliate | Built by Arda Cabaroğlu
      </footer>
    </div>
  );
}
