import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ScriptTheme } from '@/components/ui/theme';
import { FournisseurToasts } from '@/components/ui/toast';
import { CadreApplication } from '@/components/cadre-application';

export const metadata: Metadata = {
  title: 'Leads entrants — Growth',
  description:
    'Suivi centralisé des leads entrants : comptage en points, objectifs trimestriels, primes et synchronisation Notion.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f9f9f7' },
    { media: '(prefers-color-scheme: dark)', color: '#0d0d0d' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <ScriptTheme />
      </head>
      <body className="min-h-screen antialiased">
        <FournisseurToasts><CadreApplication>{children}</CadreApplication></FournisseurToasts>
      </body>
    </html>
  );
}
