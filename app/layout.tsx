import type { Metadata } from 'next';
import '@fontsource-variable/inter';
import './globals.css';

export const metadata: Metadata = {
  title: 'PokéPulse AIO',
  description: 'Pokémon TCG restock monitor & shopping assistant for Canadian retailers',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA" className="dark">
      <body className="app-backdrop min-h-screen font-sans">{children}</body>
    </html>
  );
}
