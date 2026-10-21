import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { masterSlots, parseDayKey } from './slots.ts';

const master = { workDays: [1, 2, 3, 4, 5], workStart: '10:00', workEnd: '13:00' };
// Понедельник
const monday = new Date(2026, 9, 26);
const at = (h: number, m = 0) => new Date(2026, 9, 26, h, m).getTime();
const longAgo = new Date(2026, 0, 1).getTime();
const labels = (slots: number[]) =>
  slots.map((ms) => new Date(ms).toTimeString().slice(0, 5));

describe('masterSlots', () => {
  it('нарезает рабочий день с шагом 30 минут с учётом длительности услуги', () => {
    assert.deepEqual(labels(masterSlots(master, 60, monday, [], longAgo)), [
      '10:00', '10:30', '11:00', '11:30', '12:00'
    ]);
  });

  it('не показывает время, пересекающееся с другими записями', () => {
    const busy = [{ startsAt: at(11), endsAt: at(12) }];
    assert.deepEqual(labels(masterSlots(master, 60, monday, busy, longAgo)), ['10:00', '12:00']);
  });

  it('пропускает выходные дни мастера', () => {
    const sunday = new Date(2026, 9, 25);
    assert.deepEqual(masterSlots(master, 30, sunday, [], longAgo), []);
  });

  it('не даёт записаться меньше чем за час', () => {
    assert.deepEqual(labels(masterSlots(master, 30, monday, [], at(10, 45))), ['12:00', '12:30']);
  });
});

describe('parseDayKey', () => {
  it('разбирает корректную дату и отклоняет некорректную', () => {
    assert.equal(parseDayKey('2026-10-26')?.getDate(), 26);
    assert.equal(parseDayKey('2026-02-30'), null);
    assert.equal(parseDayKey('завтра'), null);
  });
});
