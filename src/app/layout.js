import './globals.css';
import { UserProvider } from '@/context/UserContext';
import { LocaleProvider } from '@/context/LocaleContext';

export const metadata = {
  title: 'Cabo',
  description: 'Affiliate platform for monetization',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <LocaleProvider>
          <UserProvider>
            {children}
          </UserProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
