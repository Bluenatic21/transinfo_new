'use client';

import { useEffect, useRef } from 'react';

export default function BootLoaderClient() {
  // защита от повторного запуска (HMR/повторный mount)
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const root = document.documentElement;
    const el = document.getElementById('boot-loader');

    // 1) Сразу разблокируем взаимодействия и скролл
    try {
      root.removeAttribute('data-booting');
    } catch {}

    // Если лоадера нет — просто ничего не делаем (возвращаем void)
    if (!el) return;

    // перестраховка: лоадер больше не перехватывает события
    try {
      el.style.pointerEvents = 'none';
      el.setAttribute('aria-hidden', 'true');
      // inert может не поддерживаться, но безопасен
      (el as HTMLElement & { inert?: boolean }).inert = true;
    } catch {}

    // 2) Плавное скрытие: добавляем .boot-hide на следующий кадр
    const rafId = requestAnimationFrame(() => {
      try {
        if (!el.classList.contains('boot-hide')) {
          el.classList.add('boot-hide');
        }
      } catch {}
    });

    // 3) Удаление: по окончанию анимации + жёсткий таймаут-фолбэк
    const cleanup = () => {
      try {
        el.remove();
      } catch {}
    };

    // once:true — слушатель сам удалится после первого срабатывания
    const onEnd = () => cleanup();
    el.addEventListener('transitionend', onEnd, { once: true });

    const timeoutId = window.setTimeout(cleanup, 1200); // если transitionend не пришёл

    // Деструктор эффекта (TS: () => void)
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
      // onEnd удалится автоматически благодаря { once:true }, дополнительное снятие не нужно
    };
  }, []);

  return null;
}
