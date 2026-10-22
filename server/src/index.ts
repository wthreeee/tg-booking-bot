// config.ts импортируется первым: он выставляет часовой пояс до создания форматтеров дат
import { config } from './config.ts';

import { fileURLToPath } from 'node:url';

import { createApi } from './api.ts';
import { createBookingService } from './booking-service.ts';
import { createBot } from './bot.ts';
import { openDatabase } from './db.ts';
import { startReminders } from './reminders.ts';

const db = openDatabase(config.dbPath);
const bookings = createBookingService(db);

const { bot, setup, notifyUser } = createBot({
  token: config.botToken,
  db,
  bookings,
  adminIds: config.adminIds,
  webAppUrl: config.webAppUrl,
  businessName: config.businessName,
  proxyUrl: config.telegramProxy
});

const api = createApi({
  db,
  bookings,
  botToken: config.botToken,
  isAdmin: (userId) => config.adminIds.includes(userId),
  businessName: config.businessName,
  devUserId: config.devUserId,
  webappDist: fileURLToPath(new URL('../../webapp/dist', import.meta.url))
});

await setup();
await api.listen({ port: config.port, host: '0.0.0.0' });
const stopReminders = startReminders(db, notifyUser);

// Long polling: подходит и для VPS, и для локальной разработки, не требует вебхука
void bot.start({
  onStart: (info) => {
    console.log(`Бот @${info.username} запущен`);
    console.log(`API и Mini App: http://localhost:${config.port}`);
    if (!config.webAppUrl.startsWith('https://')) {
      console.log('⚠️  WEBAPP_URL не задан или не HTTPS — кнопка «Записаться» в боте не появится');
    }
    if (config.adminIds.length === 0) {
      console.log('⚠️  ADMIN_IDS не задан — уведомления о записях никому не приходят. Узнать свой ID: /myid');
    }
  }
});

async function shutdown() {
  stopReminders();
  await bot.stop();
  await api.close();
  db.close();
  process.exit(0);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
