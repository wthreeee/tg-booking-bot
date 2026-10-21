import { useState } from 'react';

import { api } from '../api';
import { useRequest } from '../useRequest';
import { BookingCard } from './MyBookings';
import { Empty, ErrorMessage, Loader, StepTitle } from './ui';

const toKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const shiftDays = (key: string, days: number) => {
  const [y, m, d] = key.split('-').map(Number);
  return toKey(new Date(y, m - 1, d + days));
};

/** Расписание на день для администратора: все записи всех мастеров */
export function AdminSchedule() {
  const [date, setDate] = useState(() => toKey(new Date()));
  const { data, error, loading, reload } = useRequest(() => api.schedule(date), [date]);

  return (
    <section>
      <StepTitle>Расписание</StepTitle>
      <div className='date-switcher'>
        <button className='button button_secondary' onClick={() => setDate(shiftDays(date, -1))} aria-label='Предыдущий день'>
          ←
        </button>
        <span className='date-switcher__label'>{data?.label ?? '…'}</span>
        <button className='button button_secondary' onClick={() => setDate(shiftDays(date, 1))} aria-label='Следующий день'>
          →
        </button>
      </div>
      {loading && <Loader />}
      {error && <ErrorMessage message={error} onRetry={reload} />}
      {data && data.bookings.length === 0 && <Empty>На этот день записей нет</Empty>}
      {data && data.bookings.length > 0 && (
        <p className='subtitle'>
          Записей: {data.bookings.length} · выручка {data.bookings.reduce((sum, b) => sum + b.price, 0).toLocaleString('ru-RU')} ₽
        </p>
      )}
      <ul className='list'>
        {data?.bookings.map((booking) => (
          <li key={booking.id}>
            <BookingCard booking={booking} onCancelled={reload} showClient />
          </li>
        ))}
      </ul>
    </section>
  );
}
