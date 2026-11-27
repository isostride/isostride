import { dateText, distanceText, number, toDistance, toPace } from '@/lib/i18n';

/** min:ss per km (or per mile, in the units chosen) from m/s; its unit is paceUnit() */
export function pace(speed: number | null | undefined): string {
  if (!speed || speed <= 0) return '–';
  const secPerKm = toPace(1000 / speed);
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm - m * 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`;
}

/** h:mm:ss or m:ss, to the whole second: rounded before it is split (299.87 s is 5:00; split first, it read 4:60). */
export function duration(seconds: number): string {
  const whole = Math.round(seconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Kilometres (or miles, in the units chosen) with two decimals, in the language in use (5.24, 5,24); its unit is distanceUnit(). */
export function km(meters: number): string {
  return number(toDistance(meters), 2);
}

/** A distance with its unit, in the units chosen: "5.24 km", "3.26 mi". */
export const distance = (meters: number, digits = 2): string => distanceText(meters, digits);

export function date(iso: string): string {
  return dateText(iso, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function time(iso: string): string {
  return dateText(iso, { hour: '2-digit', minute: '2-digit' });
}
