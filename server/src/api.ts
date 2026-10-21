import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';

import { BookingError, type BookingService } from './booking-service.ts';
import type { Database } from './db.ts';
import { formatDate, formatTime, formatWeekday } from './format.ts';
import { addDays, parseDayKey } from './slots.ts';
import { displayName, validateInitData } from './telegram-auth.ts';
import type { BookingDetails, TelegramUser } from './types.ts';

declare module 'fastify' {
  interface FastifyRequest {
    tgUser: TelegramUser;
  }
}

type ApiOptions = {
  db: Database;
  bookings: BookingService;
  botToken: string;
  isAdmin: (userId: number) => boolean;
  businessName: string;
  devUserId: number | null;
  webappDist?: string;
};

const errorStatus: Record<BookingError['code'], number> = {
  not_found: 404,
  slot_taken: 409,
  invalid_time: 400,
  too_many: 409,
  forbidden: 403,
  already_cancelled: 409
};

/** Запись в виде, удобном для Mini App: даты уже отформатированы в часовом поясе бизнеса */
const bookingDto = (b: BookingDetails) => ({
  id: b.id,
  startsAt: b.startsAt,
  dateLabel: formatDate(b.startsAt),
  timeLabel: formatTime(b.startsAt),
  serviceName: b.serviceName,
  price: b.price,
  masterName: b.masterName,
  clientName: b.userName,
  comment: b.comment
});

const toInt = (value: unknown) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** masterId=any или отсутствует — «любой мастер» */
const parseMasterId = (value: unknown) => (value === undefined || value === 'any' ? null : toInt(value));

export function createApi(options: ApiOptions) {
  const { db, bookings } = options;
  const app = Fastify({ logger: { level: 'warn' } });

  // Каждый запрос к API должен прийти из Mini App с подписанной initData
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.url.startsWith('/api/')) return;

    const header = request.headers.authorization ?? '';
    const initData = header.startsWith('tma ') ? header.slice(4) : '';
    const user = initData ? validateInitData(initData, options.botToken) : null;

    if (user) {
      request.tgUser = user;
    } else if (options.devUserId && !initData) {
      request.tgUser = { id: options.devUserId, first_name: 'Разработчик' };
    } else {
      return reply.code(401).send({ error: 'Откройте приложение через Telegram' });
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof BookingError) {
      return reply.code(errorStatus[error.code]).send({ error: error.message, code: error.code });
    }
    app.log.error(error);
    return reply.code(500).send({ error: 'Что-то пошло не так. Попробуйте ещё раз' });
  });

  app.get('/api/me', async (request) => ({
    id: request.tgUser.id,
    name: request.tgUser.first_name,
    isAdmin: options.isAdmin(request.tgUser.id),
    businessName: options.businessName
  }));

  app.get('/api/services', async () => db.listServices());

  app.get<{ Params: { id: string } }>('/api/services/:id/masters', async (request, reply) => {
    const serviceId = toInt(request.params.id);
    if (!serviceId) return reply.code(400).send({ error: 'Некорректная услуга' });
    return db.mastersForService(serviceId).map(({ id, name, about }) => ({ id, name, about }));
  });

  app.get<{ Querystring: { serviceId?: string; masterId?: string } }>('/api/days', async (request, reply) => {
    const serviceId = toInt(request.query.serviceId);
    const masterId = parseMasterId(request.query.masterId);
    if (!serviceId || (request.query.masterId !== undefined && request.query.masterId !== 'any' && !masterId)) {
      return reply.code(400).send({ error: 'Некорректные параметры' });
    }
    return bookings.availableDays(serviceId, masterId).map((day) => {
      const ms = parseDayKey(day.date)!.getTime();
      return { ...day, weekday: formatWeekday(ms), dayOfMonth: new Date(ms).getDate(), label: formatDate(ms) };
    });
  });

  app.get<{ Querystring: { serviceId?: string; masterId?: string; date?: string } }>(
    '/api/slots',
    async (request, reply) => {
      const serviceId = toInt(request.query.serviceId);
      const masterId = parseMasterId(request.query.masterId);
      const day = parseDayKey(request.query.date ?? '');
      if (!serviceId || !day) return reply.code(400).send({ error: 'Некорректные параметры' });
      return bookings
        .slotsForDay(serviceId, masterId, day)
        .map(({ startsAt }) => ({ startsAt, label: formatTime(startsAt) }));
    }
  );

  app.post<{ Body: { serviceId?: unknown; masterId?: unknown; startsAt?: unknown; comment?: unknown } }>(
    '/api/bookings',
    async (request, reply) => {
      const { body } = request;
      const serviceId = toInt(body?.serviceId);
      const masterId = body?.masterId === null || body?.masterId === 'any' ? null : toInt(body?.masterId);
      const startsAt = Number(body?.startsAt);
      if (!serviceId || (body?.masterId != null && body?.masterId !== 'any' && !masterId) || !Number.isFinite(startsAt)) {
        return reply.code(400).send({ error: 'Некорректные данные записи' });
      }

      const booking = bookings.createBooking({
        userId: request.tgUser.id,
        userName: displayName(request.tgUser),
        serviceId,
        masterId,
        startsAt,
        comment: typeof body.comment === 'string' ? body.comment : ''
      });
      return reply.code(201).send(bookingDto(booking));
    }
  );

  app.get('/api/bookings/my', async (request) =>
    db.upcomingBookingsForUser(request.tgUser.id, Date.now()).map(bookingDto)
  );

  app.delete<{ Params: { id: string } }>('/api/bookings/:id', async (request, reply) => {
    const id = toInt(request.params.id);
    if (!id) return reply.code(400).send({ error: 'Некорректная запись' });
    const booking = bookings.cancelBooking(id, {
      userId: request.tgUser.id,
      isAdmin: options.isAdmin(request.tgUser.id)
    });
    return bookingDto(booking);
  });

  app.get<{ Querystring: { date?: string } }>('/api/admin/schedule', async (request, reply) => {
    if (!options.isAdmin(request.tgUser.id)) return reply.code(403).send({ error: 'Только для администратора' });
    const day = parseDayKey(request.query.date ?? '');
    if (!day) return reply.code(400).send({ error: 'Некорректная дата' });
    return {
      label: formatDate(day.getTime()),
      bookings: db.bookingsBetween(day.getTime(), addDays(day, 1).getTime()).map(bookingDto)
    };
  });

  // В продакшене сервер сам раздаёт собранный Mini App
  if (options.webappDist && existsSync(options.webappDist)) {
    const root = resolve(options.webappDist);
    app.register(fastifyStatic, { root });
    app.setNotFoundHandler((request, reply) =>
      request.url.startsWith('/api/') ? reply.code(404).send({ error: 'Не найдено' }) : reply.sendFile('index.html')
    );
  }

  return app;
}
