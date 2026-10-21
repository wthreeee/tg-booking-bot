export type Service = {
  id: number;
  name: string;
  durationMin: number;
  price: number;
};

export type Master = {
  id: number;
  name: string;
  about: string;
  /** Рабочие дни недели: 0 — воскресенье, 1 — понедельник, … 6 — суббота */
  workDays: number[];
  /** Начало и конец рабочего дня в формате HH:MM */
  workStart: string;
  workEnd: string;
};

export type BookingStatus = 'active' | 'cancelled';

export type Booking = {
  id: number;
  userId: number;
  userName: string;
  serviceId: number;
  masterId: number;
  startsAt: number;
  endsAt: number;
  comment: string;
  status: BookingStatus;
  createdAt: number;
  reminded24h: boolean;
  reminded2h: boolean;
};

/** Запись вместе с названиями услуги и мастера — для показа пользователю */
export type BookingDetails = Booking & {
  serviceName: string;
  price: number;
  masterName: string;
};

export type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
};
