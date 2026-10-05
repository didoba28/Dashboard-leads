'use client';

import { usePathname } from 'next/navigation';
import { Navigation } from '@/components/navigation';
import { BasculeTheme } from '@/components/ui/theme';

export function CadreApplication({ children }: { children: React.ReactNode }) {
  const chemin = usePathname();
  if (chemin === '/connexion') {
    return <main className="min-h-screen bg-plan px-4 py-8">{children}</main>;
  }
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col justify-between border-r border-hair bg-surface px-3 py-4 lg:flex">
        <div>
          <div className="mb-6 px-2.5">
            <p className="text-[13px] font-semibold tracking-tight text-ink">Leads entrants</p>
            <p className="text-[11px] text-ink-muted">Pôle Growth</p>
          </div>
          <Navigation />
        </div>
        <div className="px-2.5"><BasculeTheme /></div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-hair bg-surface/85 px-4 py-2 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-semibold text-ink">Leads entrants</p>
            <BasculeTheme />
          </div>
          <div className="mt-2 flex gap-1 overflow-x-auto pb-1"><Navigation orientation="horizontale" /></div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">{children}</main>
      </div>
    </div>
  );
}
