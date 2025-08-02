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
      <head>
        {/* Viewport tag ekle! */}
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
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
