'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

type Props = {
  placeholder?: string;
  /** название query-параметра, который уже использует ваш список (по умолчанию "q") */
  param?: string;
};

export default function SearchToolbar({
  placeholder = 'Поиск…',
  param = 'q',
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  // защита от возможных null/undefined
  const basePath = pathname ?? '/';
  const current = sp?.get(param) ?? '';

  const onChange = useCallback(
    (value: string) => {
      const next = new URLSearchParams(sp?.toString() ?? '');

      const v = value.trim();
      if (v) next.set(param, v);
      else next.delete(param);

      const qs = next.toString();
      // не скроллим страницу при изменении поиска
      router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
    },
    [router, basePath, sp, param],
  );

  // небольшой debounce без внешних либ (без any)
  const debounced = useMemo(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    return (v: string) => {
      if (t) clearTimeout(t);
      t = setTimeout(() => onChange(v), 250);
    };
  }, [onChange]);

  return (
    <div className="md:hidden sticky top-14 z-40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-3 py-2 border-b">
      <input
        defaultValue={current}
        onChange={(e) => debounced(e.target.value)}
        placeholder={placeholder}
        inputMode="search"
        className="w-full h-10 rounded-xl border px-3 text-sm outline-none"
      />
    </div>
  );
}
