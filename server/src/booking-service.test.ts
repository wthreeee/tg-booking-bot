import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { BookingError, MAX_ACTIVE_BOOKINGS, createBookingService, type BookingService } from './booking-service.ts';
import { openDatabase, type Database } from './db.ts';

// «Сейчас» — понедельник 26.10.2026, 09:00. В демо-данных Алексей работает пн–пт 10:00–20:00
const NOW = new Date(2026, 9, 26, 9, 0).getTime();
const at = (h: number, m = 0) => new Date(2026, 9, 26, h, m).getTime();
const HAIRCUT = 1; // «Мужская стрижка», 60 минут
const ALEXEY = 1;

let db: Database;
let service: BookingService;

const book = (overrides: Partial<Parameters<BookingService['createBooking']>[0]> = {}) =>
  service.createBooking({ userId: 100, userName: 'Иван', serviceId: HAIRCUT, masterId: ALEXEY, startsAt: at(12), ...overrides });

const expectError = (fn: () => unknown, code: BookingError['code']) =>
  assert.throws(fn, (error) => error instanceof BookingError && error.code === code);

beforeEach(() => {
  db = openDatabase(':memory:');
  service = createBookingService(db, () => NOW);
});

describe('createBooking', () => {
  it('создаёт запись и убирает занятое время из свободных', () => {
    const booking = book();
    assert.equal(booking.masterName, 'Алексей');
    assert.equal(booking.endsAt, at(13));

    const slots = service.slotsForDay(HAIRCUT, ALEXEY, new Date(NOW)).map((s) => s.startsAt);
    assert.ok(!slots.includes(at(12)));
    assert.ok(!slots.includes(at(11, 30)), 'стрижка в 11:30 пересеклась бы с записью на 12:00');
    assert.ok(slots.includes(at(13)));
  });

  it('не даёт записаться на занятое время', () => {
    book();
    expectError(() => book({ userId: 200 }), 'slot_taken');
  });

  it('для «любого мастера» выбирает свободного', () => {
    book();
    const second = book({ userId: 200, masterId: null });
    assert.notEqual(second.masterId, ALEXEY);
  });

  it('ограничивает число активных записей одного клиента', () => {
    for (let i = 0; i < MAX_ACTIVE_BOOKINGS; i++) book({ startsAt: at(12 + i * 2) });
    expectError(() => book({ startsAt: at(19) }), 'too_many');
  });

  it('не принимает время вне сетки слотов', () => {
    expectError(() => book({ startsAt: at(12, 10) }), 'slot_taken');
  });

  it('не отправляет напоминание за сутки, если до визита меньше суток', () => {
    const booking = book();
    assert.equal(booking.reminded24h, true);
    assert.equal(booking.reminded2h, false);
  });
});

describe('cancelBooking', () => {
  it('отменяет свою запись и освобождает время', () => {
    const booking = book();
    service.cancelBooking(booking.id, { userId: 100, isAdmin: false });
    const slots = service.slotsForDay(HAIRCUT, ALEXEY, new Date(NOW)).map((s) => s.startsAt);
    assert.ok(slots.includes(at(12)));
  });

  it('не даёт отменить чужую запись, но разрешает администратору', () => {
    const booking = book();
    expectError(() => service.cancelBooking(booking.id, { userId: 999, isAdmin: false }), 'forbidden');
    assert.equal(service.cancelBooking(booking.id, { userId: 999, isAdmin: true }).status, 'cancelled');
  });

  it('сообщает слушателям о создании и отмене', () => {
    const events: string[] = [];
    service.onEvent((e) => events.push(e.type));
    const booking = book();
    service.cancelBooking(booking.id, { userId: 100, isAdmin: false });
    assert.deepEqual(events, ['created', 'cancelled']);
  });
});
