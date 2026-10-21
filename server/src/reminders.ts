import { InlineKeyboard } from 'grammy';

import type { Database } from './db.ts';
import { bookingCard } from './format.ts';

const CHECK_INTERVAL_MS = 60 * 1000;

type SendFn = (userId: number, text: string, keyboard?: InlineKeyboard) => Promise<void>;

/** Раз в минуту ищет записи, которым пора напомнить, и отправляет напоминания */
export function startReminders(db: Database, send: SendFn) {
  async function tick() {
    const now = Date.now();
    for (const hours of [24, 2] as const) {
      for (const booking of db.dueReminders(hours, now)) {
        // Отмечаем заранее: лучше пропустить одно напоминание, чем отправить его дважды
        db.markReminded(booking.id, hours);
        const title = hours === 24 ? '⏰ <b>Напоминаем: завтра у вас запись</b>' : '⏰ <b>Через 2 часа у вас запись</b>';
        await send(
          booking.userId,
          `${title}\n\n${bookingCard(booking)}\n\nЕсли планы изменились, пожалуйста, отмените запись заранее.`,
          new InlineKeyboard().text('Отменить запись', `cancel:${booking.id}`)
        );
      }
    }
  }

  const timer = setInterval(() => {
    tick().catch((error) => console.error('Ошибка при отправке напоминаний:', error));
  }, CHECK_INTERVAL_MS);

  return () => clearInterval(timer);
}
