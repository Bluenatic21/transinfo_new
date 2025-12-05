'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// ВАЖНО: компоненты лежат рядом с этой страницей в папке ./components
// формы находятся на уровень выше: src/app/components/*
import LoginForm from '../components/LoginForm';
import RegisterForm from '../components/RegisterForm';

export default function AuthPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const [showLogin, setShowLogin] = useState(true);

  // если открыли /auth с токеном (?token=... или #access_token=...),
  // а также форматом (#access_token=...&type=recovery) — уводим на /auth/reset
  useEffect(() => {
    const q = sp;
    const h =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.hash.replace(/^#/, ''))
        : null;

    const token =
      q?.get('token') ||
      q?.get('access_token') ||
      h?.get('token') ||
      h?.get('access_token') ||
      '';

    const isRecovery =
      q?.get('type') === 'recovery' || h?.get('type') === 'recovery';

    if (token || isRecovery) {
      if (typeof window !== 'undefined' && window.location.hash) {
        const url = new URL(window.location.href);
        if (!q?.get('token') && token) {
          url.searchParams.set('token', token);
        }
        url.hash = '';
        window.history.replaceState(null, '', url.toString());
      }
      router.replace(
        token ? `/auth/reset?token=${encodeURIComponent(token)}` : '/auth/reset',
      );
    }
  }, [sp, router]);

  return (
    <div className="auth-container">
      <div className="auth-form-wrapper">
        {showLogin ? (
          <LoginForm
            onLogin={() => router.push('/profile')}
            onShowRegister={() => setShowLogin(false)}
            onClose={() => {
              /* no-op */
            }}
          />
        ) : (
          <RegisterForm onSuccess={() => setShowLogin(true)} />
        )}
      </div>
    </div>
  );
}
