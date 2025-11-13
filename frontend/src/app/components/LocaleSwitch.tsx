
'use client';
import React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type Props = {
    className?: string;
    variant?: 'desktop' | 'mobile';
};

// შეცვალე საჭიროების მიხედვით: რომელ ენებს უჭერ მხარს
const LOCALES = ['ka', 'ru', 'en'] as const;
const DEFAULT_LOCALE = 'ka';

function buildPathWithLocale(nextLocale: string, pathname: string, search: string | null) {
    const parts = pathname.split('/').filter(Boolean);
    const hasLocale = parts.length > 0 && LOCALES.includes(parts[0] as any);
    const rest = hasLocale ? '/' + parts.slice(1).join('/') : pathname;
    const normalizedRest = rest.startsWith('/') ? rest : '/' + rest;
    const newPath = `/${nextLocale}${normalizedRest}`;
    return search ? `${newPath}?${search}` : newPath;
}

export default function LocaleSwitch({ className, variant = 'desktop' }: Props) {
    const pathname = usePathname() || '/';
    const search = useSearchParams();
    const router = useRouter();
    const searchStr = search?.toString() ?? null;

    const first = pathname.split('/').filter(Boolean)[0];
    const current = (LOCALES as readonly string[]).includes(first || '')
        ? (first as (typeof LOCALES)[number])
        : DEFAULT_LOCALE;

    const size =
        variant === 'mobile'
            ? 'text-base px-3 py-2 rounded-xl'
            : 'text-sm px-2 py-1 rounded-lg';

    return (
        <div className={`inline-flex items-center gap-1 bg-white/5 border border-white/10 ${variant === 'mobile' ? 'p-1.5' : 'p-1'} rounded-2xl ${className || ''}`}>
            {LOCALES.map(loc => (
                <button
                    key={loc}
                    aria-label={`Change language to ${loc.toUpperCase()}`}
                    onClick={() => {
                        if (loc === current) return;
                        const url = buildPathWithLocale(loc, pathname, searchStr);
                        router.push(url);
                    }}
                    className={`${size} uppercase transition
             ${loc === current
                            ? 'bg-white/20 font-semibold'
                            : 'hover:bg-white/10'
                        }`}
                >
                    {loc}
                </button>
            ))}
        </div>
    );
}
