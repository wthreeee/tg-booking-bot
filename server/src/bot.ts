import { Bot, GrammyError, InlineKeyboard, type Context } from 'grammy';

import { BookingError, type BookingEvent, type BookingService } from './booking-service.ts';
import type { Database } from './db.ts';
import { bookingCard, escapeHtml, formatDate, formatPrice, formatTime } from './format.ts';
import { addDays, startOfDay } from './slots.ts';

type BotOptions = {
  token: string;
  db: Database;
  bookings: BookingService;
  adminIds: number[];
  webAppUrl: string;
  businessName: string;
};

export function createBot(options: BotOptions) {
  const { db, bookings, adminIds } = options;
  const bot = new Bot(options.token);
  // Telegram открывает Mini App только по HTTPS
  const hasWebApp = options.webAppUrl.startsWith('https://');
  const isAdmin = (ctx: Context) => Boolean(ctx.from && adminIds.includes(ctx.from.id));

  const mainMenu = () => {
    const keyboard = new InlineKeyboard();
    if (hasWebApp) keyboard.webApp('📅 Записаться', options.webAppUrl).row();
    return keyboard.text('📋 Мои записи', 'my').text('💈 Услуги и цены', 'prices');
  };

  async function notifyAdmins(text: string) {
    for (const adminId of adminIds) {
      await bot.api.sendMessage(adminId, text, { parse_mode: 'HTML' }).catch((error) => {
        console.error(`Не удалось отправить уведомление администратору ${adminId}:`, error.message);
      });
    }
  }

  async function notifyUser(userId: number, text: string, keyboard?: InlineKeyboard) {
    await bot.api.sendMessage(userId, text, { parse_mode: 'HTML', reply_markup: keyboard }).catch((error) => {
      // Пользователь мог заблокировать бота — это не ошибка приложения
      console.warn(`Не удалось отправить сообщение пользователю ${userId}:`, error.message);
    });
  }

  bookings.onEvent((event: BookingEvent) => {
    const { booking } = event;
    if (event.type === 'created') {
      void notifyUser(
        booking.userId,
        `✅ <b>Вы записаны!</b>\n\n${bookingCard(booking)}\n\nНапомним за сутки и за 2 часа до визита.`,
        new InlineKeyboard().text('Отменить запись', `cancel:${booking.id}`)
      );
      void notifyAdmins(`🆕 <b>Новая запись</b>\n\n${bookingCard(booking, { withClient: true })}`);
    } else {
      void notifyAdmins(`❌ <b>Запись отменена</b>\n\n${bookingCard(booking, { withClient: true })}`);
      if (event.byAdmin) {
        void notifyUser(
          booking.userId,
          `К сожалению, ваша запись отменена администратором:\n\n${bookingCard(booking)}\n\nВыберите другое время или свяжитесь с нами.`,
          mainMenu()
        );
      }
    }
  });

  bot.command('start', async (ctx) => {
    const name = escapeHtml(ctx.from?.first_name ?? '');
    const text = [
      `Здравствуйте, ${name}! 👋`,
      `Это бот онлайн-записи в <b>${escapeHtml(options.businessName)}</b>.`,
      '',
      hasWebApp
        ? 'Нажмите «Записаться», выберите услугу, мастера и удобное время — это займёт меньше минуты.'
        : '⚠️ Онлайн-запись ещё не настроена: не указан HTTPS-адрес Mini App (WEBAPP_URL).'
    ].join('\n');
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: mainMenu() });
  });

  bot.command('myid', (ctx) => ctx.reply(`Ваш Telegram ID: <code>${ctx.from?.id}</code>`, { parse_mode: 'HTML' }));

  async function sendMyBookings(ctx: Context) {
    const list = db.upcomingBookingsForUser(ctx.from!.id, Date.now());
    if (list.length === 0) {
      await ctx.reply('У вас пока нет предстоящих записей.', { reply_markup: mainMenu() });
      return;
    }
    for (const booking of list) {
      await ctx.reply(bookingCard(booking), {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().text('Отменить', `cancel:${booking.id}`)
      });
    }
  }

  bot.command('my', sendMyBookings);
  bot.callbackQuery('my', async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendMyBookings(ctx);
  });

  bot.callbackQuery('prices', async (ctx) => {
    await ctx.answerCallbackQuery();
    const lines = db
      .listServices()
      .map((s) => `• ${escapeHtml(s.name)} — <b>${formatPrice(s.price)}</b> (${s.durationMin} мин)`);
    await ctx.reply(`💈 <b>Услуги и цены</b>\n\n${lines.join('\n')}`, { parse_mode: 'HTML', reply_markup: mainMenu() });
  });

  // Отмена в два шага, чтобы не отменить запись случайным нажатием
  bot.callbackQuery(/^cancel:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const id = Number(ctx.match[1]);
    await ctx.reply('Точно отменить запись?', {
      reply_markup: new InlineKeyboard().text('Да, отменить', `cancel_yes:${id}`).text('Нет', 'cancel_no')
    });
  });

  bot.callbackQuery('cancel_no', async (ctx) => {
    await ctx.answerCallbackQuery('Запись сохранена');
    await ctx.deleteMessage().catch(() => {});
  });

  bot.callbackQuery(/^cancel_yes:(\d+)$/, async (ctx) => {
    try {
      const booking = bookings.cancelBooking(Number(ctx.match[1]), { userId: ctx.from.id, isAdmin: isAdmin(ctx) });
      await ctx.answerCallbackQuery('Запись отменена');
      await ctx.editMessageText(`Запись отменена:\n\n${bookingCard(booking)}`, { parse_mode: 'HTML' });
    } catch (error) {
      if (!(error instanceof BookingError)) throw error;
      await ctx.answerCallbackQuery({ text: error.message, show_alert: true });
    }
  });

  async function sendSchedule(ctx: Context, dayOffset: number) {
    if (!isAdmin(ctx)) {
      await ctx.reply('Эта команда доступна только администратору.');
      return;
    }
    const day = addDays(startOfDay(new Date()), dayOffset);
    const list = db.bookingsBetween(day.getTime(), addDays(day, 1).getTime());
    const header = `🗓 <b>${formatDate(day.getTime())}</b>`;
    if (list.length === 0) {
      await ctx.reply(`${header}\n\nЗаписей нет.`, { parse_mode: 'HTML' });
      return;
    }
    const lines = list.map(
      (b) => `<b>${formatTime(b.startsAt)}</b> · ${escapeHtml(b.masterName)} · ${escapeHtml(b.serviceName)}\n    ${escapeHtml(b.userName)}`
    );
    await ctx.reply(`${header}\n\n${lines.join('\n')}`, { parse_mode: 'HTML' });
  }

  bot.command('today', (ctx) => sendSchedule(ctx, 0));
  bot.command('tomorrow', (ctx) => sendSchedule(ctx, 1));

  bot.catch(({ error, ctx }) => {
    const description = error instanceof GrammyError ? error.description : String(error);
    console.error(`Ошибка при обработке update ${ctx.update.update_id}:`, description);
  });

  async function setup() {
    await bot.api.setMyCommands([
      { command: 'start', description: 'Главное меню' },
      { command: 'my', description: 'Мои записи' }
    ]);
    if (adminIds.length > 0) {
      const adminCommands = [
        { command: 'start', description: 'Главное меню' },
        { command: 'my', description: 'Мои записи' },
        { command: 'today', description: 'Расписание на сегодня' },
        { command: 'tomorrow', description: 'Расписание на завтра' }
      ];
      for (const chatId of adminIds) {
        await bot.api
          .setMyCommands(adminCommands, { scope: { type: 'chat', chat_id: chatId } })
          .catch(() => console.warn(`Администратор ${chatId} ещё не запускал бота — команды появятся позже`));
      }
    }
    if (hasWebApp) {
      await bot.api.setChatMenuButton({
        menu_button: { type: 'web_app', text: 'Записаться', web_app: { url: options.webAppUrl } }
      });
    }
  }

  return { bot, setup, notifyUser };
}
