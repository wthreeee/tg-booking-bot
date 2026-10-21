import type { Database } from './db.ts';
import { BOOKING_HORIZON_DAYS, addDays, dayKey, masterSlots, startOfDay } from './slots.ts';
import type { BookingDetails, Master, Service } from './types.ts';

/** Сколько будущих записей может быть у одного клиента одновременно */
export const MAX_ACTIVE_BOOKINGS = 3;

const HOUR = 60 * 60 * 1000;

export type BookingErrorCode =
  | 'not_found'
  | 'slot_taken'
  | 'invalid_time'
  | 'too_many'
  | 'forbidden'
  | 'already_cancelled';

export class BookingError extends Error {
  code: BookingErrorCode;

  constructor(code: BookingErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export type Slot = { startsAt: number; masterIds: number[] };

export type BookingEvent =
  | { type: 'created'; booking: BookingDetails }
  | { type: 'cancelled'; booking: BookingDetails; byAdmin: boolean };

type CreateBookingInput = {
  userId: number;
  userName: string;
  serviceId: number;
  /** null — «любой свободный мастер» */
  masterId: number | null;
  startsAt: number;
  comment?: string;
};

export function createBookingService(db: Database, now: () => number = Date.now) {
  const listeners: ((event: BookingEvent) => void)[] = [];
  const emit = (event: BookingEvent) => {
    for (const listener of listeners) {
      // Ошибка в уведомлении не должна ломать саму запись
      try {
        listener(event);
      } catch (error) {
        console.error('Ошибка обработчика события записи:', error);
      }
    }
  };

  function requireService(serviceId: number): Service {
    const service = db.getService(serviceId);
    if (!service) throw new BookingError('not_found', 'Услуга не найдена');
    return service;
  }

  function candidateMasters(serviceId: number, masterId: number | null): Master[] {
    const masters = db.mastersForService(serviceId);
    if (masterId === null) return masters;
    const master = masters.find((m) => m.id === masterId);
    if (!master) throw new BookingError('not_found', 'Мастер не оказывает эту услугу');
    return [master];
  }

  /** Свободные слоты на день. Для «любого мастера» объединяет слоты всех подходящих мастеров */
  function slotsForDay(serviceId: number, masterId: number | null, day: Date): Slot[] {
    const service = requireService(serviceId);
    const dayStart = startOfDay(day).getTime();
    const dayEnd = addDays(day, 1).getTime();
    const bySlot = new Map<number, number[]>();

    for (const master of candidateMasters(serviceId, masterId)) {
      const busy = db.activeBookingsForMaster(master.id, dayStart, dayEnd);
      for (const startsAt of masterSlots(master, service.durationMin, day, busy, now())) {
        bySlot.set(startsAt, [...(bySlot.get(startsAt) ?? []), master.id]);
      }
    }

    return [...bySlot.entries()]
      .sort(([a], [b]) => a - b)
      .map(([startsAt, masterIds]) => ({ startsAt, masterIds }));
  }

  /** Ближайшие дни, открытые для записи, с отметкой, есть ли в них свободное время */
  function availableDays(serviceId: number, masterId: number | null) {
    const today = startOfDay(new Date(now()));
    return Array.from({ length: BOOKING_HORIZON_DAYS }, (_, i) => {
      const day = addDays(today, i);
      return { date: dayKey(day), hasSlots: slotsForDay(serviceId, masterId, day).length > 0 };
    });
  }

  function createBooking(input: CreateBookingInput): BookingDetails {
    const service = requireService(input.serviceId);
    const current = now();

    if (input.startsAt > addDays(new Date(current), BOOKING_HORIZON_DAYS).getTime()) {
      throw new BookingError('invalid_time', 'Запись открыта только на ближайшие две недели');
    }

    const bookingId = db.transaction(() => {
      if (db.upcomingBookingsForUser(input.userId, current).length >= MAX_ACTIVE_BOOKINGS) {
        throw new BookingError('too_many', `Можно иметь не больше ${MAX_ACTIVE_BOOKINGS} активных записей`);
      }

      const slot = slotsForDay(input.serviceId, input.masterId, new Date(input.startsAt)).find(
        (s) => s.startsAt === input.startsAt
      );
      if (!slot) {
        throw new BookingError('slot_taken', 'Это время уже занято. Выберите другое');
      }

      const startsInMs = input.startsAt - current;
      return db.insertBooking({
        userId: input.userId,
        userName: input.userName,
        serviceId: service.id,
        masterId: slot.masterIds[0],
        startsAt: input.startsAt,
        endsAt: input.startsAt + service.durationMin * 60 * 1000,
        comment: (input.comment ?? '').trim().slice(0, 300),
        createdAt: current,
        // Если до визита меньше суток (или двух часов), это напоминание уже не нужно
        reminded24h: startsInMs <= 24 * HOUR,
        reminded2h: startsInMs <= 2 * HOUR
      });
    });

    const booking = db.getBookingDetails(bookingId)!;
    emit({ type: 'created', booking });
    return booking;
  }

  function cancelBooking(bookingId: number, actor: { userId: number; isAdmin: boolean }): BookingDetails {
    const booking = db.getBookingDetails(bookingId);
    if (!booking) throw new BookingError('not_found', 'Запись не найдена');
    if (booking.userId !== actor.userId && !actor.isAdmin) {
      throw new BookingError('forbidden', 'Можно отменить только свою запись');
    }
    if (booking.status === 'cancelled') {
      throw new BookingError('already_cancelled', 'Запись уже отменена');
    }
    if (booking.startsAt <= now() && !actor.isAdmin) {
      throw new BookingError('invalid_time', 'Нельзя отменить прошедшую запись');
    }

    db.cancelBooking(bookingId);
    const cancelled = { ...booking, status: 'cancelled' as const };
    emit({ type: 'cancelled', booking: cancelled, byAdmin: booking.userId !== actor.userId });
    return cancelled;
  }

  return {
    slotsForDay,
    availableDays,
    createBooking,
    cancelBooking,
    onEvent: (listener: (event: BookingEvent) => void) => listeners.push(listener)
  };
}

export type BookingService = ReturnType<typeof createBookingService>;
