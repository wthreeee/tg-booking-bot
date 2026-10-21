import { createHmac, timingSafeEqual } from 'node:crypto';

import type { TelegramUser } from './types.ts';

/** initData старше суток считаем недействительной */
const MAX_AGE_SEC = 24 * 60 * 60;

/**
 * Проверяет подпись initData, которую Telegram передаёт в Mini App.
 * Без этой проверки любой мог бы отправить запрос от имени чужого пользователя.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(initData: string, botToken: string, nowSec = Date.now() / 1000): TelegramUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheckString).digest();
  const received = Buffer.from(hash, 'hex');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;

  const authDate = Number(params.get('auth_date'));
  if (!authDate || nowSec - authDate > MAX_AGE_SEC) return null;

  try {
    const user = JSON.parse(params.get('user') ?? '') as TelegramUser;
    return Number.isInteger(user.id) ? user : null;
  } catch {
    return null;
  }
}

export const displayName = (user: TelegramUser) =>
  [user.first_name, user.last_name].filter(Boolean).join(' ') + (user.username ? ` (@${user.username})` : '');
