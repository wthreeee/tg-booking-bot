import type { Master } from './types.ts';

/** Шаг сетки времени: записи начинаются в :00 и :30 */
export const SLOT_STEP_MIN = 30;
/** Нельзя записаться менее чем за час до начала */
export const MIN_LEAD_MIN = 60;
/** На сколько дней вперёд открыта запись */
export const BOOKING_HORIZON_DAYS = 14;

const MINUTE = 60 * 1000;

type Interval = { startsAt: number; endsAt: number };

/** Дата в формате YYYY-MM-DD по местному времени */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Разбирает YYYY-MM-DD в полночь этого дня. Возвращает null для некорректной даты */
export function parseDayKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return dayKey(date) === key ? date : null;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Свободные времена начала услуги у мастера в указанный день.
 * Учитывает график мастера, длительность услуги, занятые интервалы и минимальный запас до начала.
 */
export function masterSlots(
  master: Pick<Master, 'workDays' | 'workStart' | 'workEnd'>,
  durationMin: number,
  day: Date,
  busy: Interval[],
  now: number
): number[] {
  if (!master.workDays.includes(day.getDay())) return [];

  const workStart = toMinutes(master.workStart);
  const workEnd = toMinutes(master.workEnd);
  const slots: number[] = [];

  for (let minute = workStart; minute + durationMin <= workEnd; minute += SLOT_STEP_MIN) {
    const startsAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minute).getTime();
    const endsAt = startsAt + durationMin * MINUTE;

    if (startsAt < now + MIN_LEAD_MIN * MINUTE) continue;
    if (busy.some((b) => b.startsAt < endsAt && b.endsAt > startsAt)) continue;

    slots.push(startsAt);
  }

  return slots;
}
