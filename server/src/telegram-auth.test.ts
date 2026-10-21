import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';

import { validateInitData } from './telegram-auth.ts';

const TOKEN = '123456:TEST-TOKEN';
const NOW_SEC = 1_800_000_000;

/** Подписывает initData так же, как это делает Telegram */
function sign(fields: Record<string, string>, token = TOKEN): string {
  const dataCheckString = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

const fields = {
  auth_date: String(NOW_SEC - 60),
  query_id: 'AAE',
  user: JSON.stringify({ id: 42, first_name: 'Иван', username: 'ivan' })
};

describe('validateInitData', () => {
  it('принимает корректно подписанные данные', () => {
    assert.equal(validateInitData(sign(fields), TOKEN, NOW_SEC)?.id, 42);
  });

  it('отклоняет данные, подписанные другим токеном', () => {
    assert.equal(validateInitData(sign(fields, '999:OTHER'), TOKEN, NOW_SEC), null);
  });

  it('отклоняет подменённого пользователя', () => {
    const tampered = sign(fields).replace('%22id%22%3A42', '%22id%22%3A1');
    assert.equal(validateInitData(tampered, TOKEN, NOW_SEC), null);
  });

  it('отклоняет устаревшие данные', () => {
    const old = sign({ ...fields, auth_date: String(NOW_SEC - 2 * 24 * 60 * 60) });
    assert.equal(validateInitData(old, TOKEN, NOW_SEC), null);
  });
});
