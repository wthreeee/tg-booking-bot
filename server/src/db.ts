import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { seedMasters, seedServices } from './seed.ts';
import type { Booking, BookingDetails, Master, Service } from './types.ts';

type Row = Record<string, unknown>;

export type Database = ReturnType<typeof openDatabase>;

export function openDatabase(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS services (
      id           INTEGER PRIMARY KEY,
      name         TEXT    NOT NULL,
      duration_min INTEGER NOT NULL,
      price        INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS masters (
      id         INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      about      TEXT NOT NULL DEFAULT '',
      work_days  TEXT NOT NULL,
      work_start TEXT NOT NULL,
      work_end   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS master_services (
      master_id  INTEGER NOT NULL REFERENCES masters(id),
      service_id INTEGER NOT NULL REFERENCES services(id),
      PRIMARY KEY (master_id, service_id)
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id           INTEGER PRIMARY KEY,
      user_id      INTEGER NOT NULL,
      user_name    TEXT    NOT NULL,
      service_id   INTEGER NOT NULL REFERENCES services(id),
      master_id    INTEGER NOT NULL REFERENCES masters(id),
      starts_at    INTEGER NOT NULL,
      ends_at      INTEGER NOT NULL,
      comment      TEXT    NOT NULL DEFAULT '',
      status       TEXT    NOT NULL DEFAULT 'active',
      created_at   INTEGER NOT NULL,
      reminded_24h INTEGER NOT NULL DEFAULT 0,
      reminded_2h  INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS bookings_master_time ON bookings (master_id, starts_at);
    CREATE INDEX IF NOT EXISTS bookings_user ON bookings (user_id, starts_at);
  `);

  seedIfEmpty(db);

  const toService = (r: Row): Service => ({
    id: Number(r.id),
    name: String(r.name),
    durationMin: Number(r.duration_min),
    price: Number(r.price)
  });

  const toMaster = (r: Row): Master => ({
    id: Number(r.id),
    name: String(r.name),
    about: String(r.about),
    workDays: String(r.work_days).split(',').map(Number),
    workStart: String(r.work_start),
    workEnd: String(r.work_end)
  });

  const toBooking = (r: Row): Booking => ({
    id: Number(r.id),
    userId: Number(r.user_id),
    userName: String(r.user_name),
    serviceId: Number(r.service_id),
    masterId: Number(r.master_id),
    startsAt: Number(r.starts_at),
    endsAt: Number(r.ends_at),
    comment: String(r.comment),
    status: r.status === 'cancelled' ? 'cancelled' : 'active',
    createdAt: Number(r.created_at),
    reminded24h: Boolean(r.reminded_24h),
    reminded2h: Boolean(r.reminded_2h)
  });

  const toDetails = (r: Row): BookingDetails => ({
    ...toBooking(r),
    serviceName: String(r.service_name),
    price: Number(r.price),
    masterName: String(r.master_name)
  });

  const detailsSelect = `
    SELECT b.*, s.name AS service_name, s.price AS price, m.name AS master_name
    FROM bookings b
    JOIN services s ON s.id = b.service_id
    JOIN masters m ON m.id = b.master_id
  `;

  const all = (sql: string, ...params: (string | number)[]) => db.prepare(sql).all(...params) as Row[];
  const get = (sql: string, ...params: (string | number)[]) => db.prepare(sql).get(...params) as Row | undefined;

  return {
    listServices: () => all('SELECT * FROM services ORDER BY id').map(toService),

    getService: (id: number) => {
      const row = get('SELECT * FROM services WHERE id = ?', id);
      return row ? toService(row) : undefined;
    },

    getMaster: (id: number) => {
      const row = get('SELECT * FROM masters WHERE id = ?', id);
      return row ? toMaster(row) : undefined;
    },

    mastersForService: (serviceId: number) =>
      all(
        `SELECT m.* FROM masters m
         JOIN master_services ms ON ms.master_id = m.id
         WHERE ms.service_id = ? ORDER BY m.id`,
        serviceId
      ).map(toMaster),

    /** Активные записи мастера, пересекающиеся с интервалом [from, to) */
    activeBookingsForMaster: (masterId: number, from: number, to: number) =>
      all(
        `SELECT * FROM bookings
         WHERE master_id = ? AND status = 'active' AND starts_at < ? AND ends_at > ?`,
        masterId,
        to,
        from
      ).map(toBooking),

    insertBooking: (b: Omit<Booking, 'id' | 'status'>) => {
      const result = db
        .prepare(
          `INSERT INTO bookings
             (user_id, user_name, service_id, master_id, starts_at, ends_at, comment, created_at, reminded_24h, reminded_2h)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          b.userId,
          b.userName,
          b.serviceId,
          b.masterId,
          b.startsAt,
          b.endsAt,
          b.comment,
          b.createdAt,
          Number(b.reminded24h),
          Number(b.reminded2h)
        );
      return Number(result.lastInsertRowid);
    },

    getBookingDetails: (id: number) => {
      const row = get(`${detailsSelect} WHERE b.id = ?`, id);
      return row ? toDetails(row) : undefined;
    },

    upcomingBookingsForUser: (userId: number, now: number) =>
      all(
        `${detailsSelect} WHERE b.user_id = ? AND b.status = 'active' AND b.starts_at > ? ORDER BY b.starts_at`,
        userId,
        now
      ).map(toDetails),

    bookingsBetween: (from: number, to: number) =>
      all(
        `${detailsSelect} WHERE b.status = 'active' AND b.starts_at >= ? AND b.starts_at < ? ORDER BY b.starts_at, m.id`,
        from,
        to
      ).map(toDetails),

    cancelBooking: (id: number) => {
      db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`).run(id);
    },

    /** Записи, которым пора отправить напоминание за `hours` часов */
    dueReminders: (hours: 24 | 2, now: number) => {
      const column = hours === 24 ? 'reminded_24h' : 'reminded_2h';
      return all(
        `${detailsSelect} WHERE b.status = 'active' AND b.${column} = 0 AND b.starts_at > ? AND b.starts_at <= ?`,
        now,
        now + hours * 60 * 60 * 1000
      ).map(toDetails);
    },

    markReminded: (id: number, hours: 24 | 2) => {
      const column = hours === 24 ? 'reminded_24h' : 'reminded_2h';
      db.prepare(`UPDATE bookings SET ${column} = 1 WHERE id = ?`).run(id);
    },

    /** Выполняет fn в транзакции: защищает от двух одновременных записей на одно время */
    transaction<T>(fn: () => T): T {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = fn();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },

    close: () => db.close()
  };
}

function seedIfEmpty(db: DatabaseSync) {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM services').get() as { count: number };
  if (count > 0) return;

  const insertService = db.prepare('INSERT INTO services (name, duration_min, price) VALUES (?, ?, ?)');
  const insertMaster = db.prepare(
    'INSERT INTO masters (name, about, work_days, work_start, work_end) VALUES (?, ?, ?, ?, ?)'
  );
  const link = db.prepare('INSERT INTO master_services (master_id, service_id) VALUES (?, ?)');

  const serviceIds = new Map<string, number>();
  for (const s of seedServices) {
    serviceIds.set(s.name, Number(insertService.run(s.name, s.durationMin, s.price).lastInsertRowid));
  }
  for (const m of seedMasters) {
    const masterId = Number(
      insertMaster.run(m.name, m.about, m.workDays.join(','), m.workStart, m.workEnd).lastInsertRowid
    );
    for (const serviceName of m.services) {
      const serviceId = serviceIds.get(serviceName);
      if (serviceId) link.run(masterId, serviceId);
    }
  }
}
