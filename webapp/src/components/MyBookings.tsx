import { useState } from 'react';

import { api, formatPrice, type Booking } from '../api';
import { tg } from '../telegram';
import { useRequest } from '../useRequest';
import { Empty, ErrorMessage, Loader, StepTitle } from './ui';

export function MyBookings({ onBook }: { onBook: () => void }) {
  const { data, error, loading, reload } = useRequest(api.myBookings, []);

  return (
    <section>
      <StepTitle>Мои записи</StepTitle>
      {loading && <Loader />}
      {error && <ErrorMessage message={error} onRetry={reload} />}
      {data && data.length === 0 && (
        <>
          <Empty>У вас пока нет предстоящих записей</Empty>
          <button className='button button_primary' onClick={onBook}>
            Записаться
          </button>
        </>
      )}
      <ul className='list'>
        {data?.map((booking) => (
          <li key={booking.id}>
            <BookingCard booking={booking} onCancelled={reload} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BookingCard({
  booking,
  onCancelled,
  showClient = false
}: {
  booking: Booking;
  onCancelled: () => void;
  showClient?: boolean;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = async () => {
    if (!(await tg.confirm('Отменить эту запись?'))) return;
    setCancelling(true);
    setError(null);
    try {
      await api.cancelBooking(booking.id);
      tg.haptic.success();
      onCancelled();
    } catch (e) {
      tg.haptic.error();
      setError(e instanceof Error ? e.message : 'Не удалось отменить запись');
      setCancelling(false);
    }
  };

  return (
    <article className='booking'>
      <div className='booking__when'>
        <span className='booking__time'>{booking.timeLabel}</span>
        <span className='booking__date'>{booking.dateLabel}</span>
      </div>
      <div className='booking__info'>
        <span className='card__title'>{booking.serviceName}</span>
        <span className='card__meta'>
          Мастер {booking.masterName} · {formatPrice(booking.price)}
        </span>
        {showClient && <span className='card__meta'>Клиент: {booking.clientName}</span>}
        {booking.comment && <span className='card__meta'>💬 {booking.comment}</span>}
        {error && <span className='booking__error'>{error}</span>}
      </div>
      <button className='button button_danger' disabled={cancelling} onClick={cancel}>
        {cancelling ? '…' : 'Отменить'}
      </button>
    </article>
  );
}
