import { Suspense } from 'react';
import { AuthForm } from '@/components/AuthForm';
import { DEMO_ACCOUNT } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <Suspense>
      <AuthForm mode="login" demo={isSupabaseConfigured() ? null : DEMO_ACCOUNT} />
    </Suspense>
  );
}
