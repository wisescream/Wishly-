import React, { ReactNode } from 'react';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const isDesktop = useIsDesktop();

  return (
    <div className="flex min-h-screen bg-background text-foreground overflow-hidden">
      {isDesktop && <Sidebar />}
      <main className="flex-1 flex flex-col min-w-0 relative">
        <div className="flex-1 overflow-y-auto pb-16 md:pb-0">
          {children}
        </div>
        {!isDesktop && <BottomNav />}
      </main>
    </div>
  );
}
