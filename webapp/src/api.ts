import { tg } from './telegram';

export type Me = { id: number; name: string; isAdmin: boolean; businessName: string };
export type Service = { id: number; name: string; durationMin: number; price: number };
export type Master = { id: number; name: string; about: string };
export type Day = { date: string; hasSlots: boolean; weekday: string; dayOfMonth: number; label: string };
export type Slot = { startsAt: number; label: string };
export type Booking = {
  id: number;
  startsAt: number;
  dateLabel: string;
  timeLabel: string;
  serviceName: string;
  price: number;
  masterName: string;
  clientName: string;
  comment: string;
};
export type Schedule = { label: string; bookings: Booking[] };

/** null — «любой свободный мастер» */
export type MasterChoice = number | null;

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  // Сервер проверяет подпись initData и по ней узнаёт пользователя
  if (tg.initData) headers.set('Authorization', `tma ${tg.initData}`);
  if (init.body) headers.set('Content-Type', 'application/json');

  const response = await fetch(path, { ...init, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, data.error ?? 'Ошибка соединения с сервером', data.code);
  }
  return data as T;
}

const masterParam = (masterId: MasterChoice) => (masterId === null ? 'any' : String(masterId));

export const api = {
  me: () => request<Me>('/api/me'),
  services: () => request<Service[]>('/api/services'),
  masters: (serviceId: number) => request<Master[]>(`/api/services/${serviceId}/masters`),
  days: (serviceId: number, masterId: MasterChoice) =>
    request<Day[]>(`/api/days?serviceId=${serviceId}&masterId=${masterParam(masterId)}`),
  slots: (serviceId: number, masterId: MasterChoice, date: string) =>
    request<Slot[]>(`/api/slots?serviceId=${serviceId}&masterId=${masterParam(masterId)}&date=${date}`),
  createBooking: (body: { serviceId: number; masterId: MasterChoice; startsAt: number; comment: string }) =>
    request<Booking>('/api/bookings', { method: 'POST', body: JSON.stringify(body) }),
  myBookings: () => request<Booking[]>('/api/bookings/my'),
  cancelBooking: (id: number) => request<Booking>(`/api/bookings/${id}`, { method: 'DELETE' }),
  schedule: (date: string) => request<Schedule>(`/api/admin/schedule?date=${date}`)
};

export const formatPrice = (rub: number) => `${rub.toLocaleString('ru-RU')} ₽`;
