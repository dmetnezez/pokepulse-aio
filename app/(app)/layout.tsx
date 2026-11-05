import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { getSessionUser } from '@/lib/auth';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return (
    <AppShell user={user} mode={getStore().kind}>
      {children}
    </AppShell>
  );
}
