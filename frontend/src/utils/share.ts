// src/utils/share.ts
export type ShareKind = 'transport' | 'order';

export interface SharePayload {
  id: string | number;
  kind: ShareKind;
  from: string;
  to: string;
  bodyType?: string;
  dates?: string;
  cargo?: string;
}

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://transinfo.ge';

export function buildShareUrl(p: SharePayload): string {
  const path =
    p.kind === 'transport'
      ? `/transport/${p.id}`
      : `/order/${p.id}`;
  return `${SITE_URL}${path}`;
}

export function buildShareText(p: SharePayload): string {
  const lines: string[] = [];

  // строка маршрута
  if (p.from || p.to) {
    lines.push(`${p.from || '—'} → ${p.to || '—'}`);
  }

  if (p.bodyType) {
    lines.push(`Тип кузова: ${p.bodyType}`);
  }
  if (p.dates) {
    lines.push(`Даты / режим: ${p.dates}`);
  }
  if (p.cargo) {
    lines.push(`Груз: ${p.cargo}`);
  }

  const url = buildShareUrl(p);
  lines.push('', `Открыть в Transinfo: ${url}`);

  return lines.join('\n');
}

export function buildShareLinks(p: SharePayload) {
  const url = buildShareUrl(p);
  const text = buildShareText(p);

  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(text)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(
      url,
    )}&text=${encodeURIComponent(text)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
      url,
    )}`,
    viber: `viber://forward?text=${encodeURIComponent(text)}`,
  };
}
