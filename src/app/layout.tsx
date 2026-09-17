import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Navigation } from '@/components/navigation';
import { BasculeTheme, ScriptTheme } from '@/components/ui/theme';
import { FournisseurToasts } from '@/components/ui/toast';

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
        <FournisseurToasts>
          <div className="flex min-h-screen">
            <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col justify-between border-r border-hair bg-surface px-3 py-4 lg:flex">
              <div>
                <div className="mb-6 px-2.5">
                  <p className="text-[13px] font-semibold tracking-tight text-ink">Leads entrants</p>
                  <p className="text-[11px] text-ink-muted">Pôle Growth</p>
                </div>
                <Navigation />
              </div>
              <div className="px-2.5">
                <BasculeTheme />
              </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
              <header className="sticky top-0 z-20 border-b border-hair bg-surface/85 px-4 py-2 backdrop-blur lg:hidden">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-semibold text-ink">Leads entrants</p>
                  <BasculeTheme />
                </div>
                <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
                  <Navigation orientation="horizontale" />
                </div>
              </header>
              <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">{children}</main>
            </div>
          </div>
        </FournisseurToasts>
      </body>
    </html>
  );
}
