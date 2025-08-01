// /src/components/merchant/MerchantLayout.js
import MerchantNavigation from "./MerchantNavigation";

export default function MerchantLayout({ children }) {
  return (
    <div className="min-h-screen flex flex-col bg-[#101010] text-white font-sans">
      <MerchantNavigation />
      <main className="max-w-6xl w-full mx-auto px-4 py-8 flex-grow">
        {children}
      </main>
      <footer className="text-center py-4 text-gray-500 text-xs border-t border-[#1f1f1f] bg-[#111] mt-auto">
        &copy; 2025 Cabo Affiliate | Built by Arda Cabaroğlu
      </footer>
    </div>
  );
}
