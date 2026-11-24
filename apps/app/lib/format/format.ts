import { dateText, number } from '@/lib/i18n';

/** min:ss per km from m/s */
export function pace(speed: number | null | undefined): string {
  if (!speed || speed <= 0) return '–';
  const secPerKm = 1000 / speed;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm - m * 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`;
}

export function duration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Kilometres with two decimals, in the language in use (5.24, 5,24). */
export function km(meters: number): string {
  return number(meters / 1000, 2);
}

export function date(iso: string): string {
  return dateText(iso, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function time(iso: string): string {
  return dateText(iso, { hour: '2-digit', minute: '2-digit' });
}
