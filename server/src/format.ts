import type { BookingDetails } from './types.ts';

// Форматтеры используют часовой пояс процесса, который выставляется в config.ts
const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
const dayChipWeekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' });

export const formatTime = (ms: number) => timeFormat.format(ms);
export const formatDate = (ms: number) => dateFormat.format(ms);
export const formatDateTime = (ms: number) => `${formatDate(ms)}, ${formatTime(ms)}`;
export const formatWeekday = (ms: number) => dayChipWeekday.format(ms);

export const formatPrice = (rub: number) => `${rub.toLocaleString('ru-RU')} ₽`;

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Карточка записи для сообщений в Telegram (HTML-разметка) */
export function bookingCard(b: BookingDetails, { withClient = false } = {}): string {
  const lines = [
    `📅 <b>${formatDateTime(b.startsAt)}</b>`,
    `✂️ ${escapeHtml(b.serviceName)} — ${formatPrice(b.price)}`,
    `👤 Мастер: ${escapeHtml(b.masterName)}`
  ];
  if (withClient) lines.push(`🙋 Клиент: ${escapeHtml(b.userName)}`);
  if (b.comment) lines.push(`💬 ${escapeHtml(b.comment)}`);
  return lines.join('\n');
}
