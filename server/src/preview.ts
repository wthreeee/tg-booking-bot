// Режим предпросмотра: запускает только API (без Telegram-бота) на временной базе в памяти.
// Нужен, чтобы открыть Mini App в обычном браузере и посмотреть интерфейс без токена бота.
process.env.TZ = process.env.BUSINESS_TZ ?? 'Europe/Moscow';

const { fileURLToPath } = await import('node:url');
const { createApi } = await import('./api.ts');
const { createBookingService } = await import('./booking-service.ts');
const { openDatabase } = await import('./db.ts');

const PREVIEW_USER_ID = 1;
const port = Number(process.env.PORT ?? 3000);
const db = openDatabase(':memory:');

const api = createApi({
  db,
  bookings: createBookingService(db),
  botToken: 'preview',
  isAdmin: (userId) => userId === PREVIEW_USER_ID,
  businessName: 'Барбершоп «Борода» (демо)',
  devUserId: PREVIEW_USER_ID,
  webappDist: fileURLToPath(new URL('../../webapp/dist', import.meta.url))
});

await api.listen({ port, host: '127.0.0.1' });
console.log(`Предпросмотр: http://localhost:${port} (данные хранятся в памяти и сбрасываются при перезапуске)`);
