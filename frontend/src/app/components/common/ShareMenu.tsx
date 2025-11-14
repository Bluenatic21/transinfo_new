'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  SharePayload,
  buildShareLinks,
  buildShareText,
  buildShareUrl,
} from '@/utils/share';

// Если у тебя уже есть своя иконка "поделиться" – подключи её вместо этого
import { FiShare2 } from 'react-icons/fi';

type Props = {
  payload: SharePayload;
  size?: 'sm' | 'md';
};

export const ShareMenu: React.FC<Props> = ({ payload, size = 'sm' }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // клик вне поповера – закрываем
  useEffect(() => {
    if (!open) return;

    const onClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [open]);

  const links = buildShareLinks(payload);

  const handleMainClick = async () => {
    const url = buildShareUrl(payload);
    const text = buildShareText(payload);

    // сперва пробуем системное меню шаринга
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({
          title: 'Transinfo',
          text,
          url,
        });
        return;
      } catch {
        // пользователь отменил — просто падаем в поповер
      }
    }
    setOpen((prev) => !prev);
  };

  return (
    <div className="shareMenu-root" ref={rootRef}>
      <button
        type="button"
        className={`iconButton iconButton--share iconButton--${size}`}
        onClick={handleMainClick}
        title="Поделиться"
      >
        <FiShare2 />
      </button>

      {open && (
        <div className="shareMenu-popover">
          <a
            href={links.whatsapp}
            target="_blank"
            rel="noreferrer"
            className="shareMenu-item shareMenu-item--wa"
            title="Поделиться в WhatsApp"
          >
            WA
          </a>
          <a
            href={links.telegram}
            target="_blank"
            rel="noreferrer"
            className="shareMenu-item shareMenu-item--tg"
            title="Поделиться в Telegram"
          >
            TG
          </a>
          <a
            href={links.viber}
            target="_blank"
            rel="noreferrer"
            className="shareMenu-item shareMenu-item--vb"
            title="Поделиться в Viber"
          >
            VB
          </a>
          <a
            href={links.facebook}
            target="_blank"
            rel="noreferrer"
            className="shareMenu-item shareMenu-item--fb"
            title="Поделиться в Facebook"
          >
            FB
          </a>
        </div>
      )}
    </div>
  );
};
