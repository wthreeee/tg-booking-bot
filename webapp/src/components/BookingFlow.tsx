import { useEffect, useState } from 'react';

import { ApiError, api, formatPrice, type Booking, type Day, type MasterChoice, type Service, type Slot } from '../api';
import { insideTelegram, tg } from '../telegram';
import { useRequest } from '../useRequest';
import { Empty, ErrorMessage, Loader, StepTitle } from './ui';

type Step = 'service' | 'master' | 'time' | 'confirm' | 'done';

type Selection = {
  service?: Service;
  master?: { id: MasterChoice; name: string };
  day?: Day;
  slot?: Slot;
};

const previousStep: Partial<Record<Step, Step>> = { master: 'service', time: 'master', confirm: 'time' };

export function BookingFlow({ onShowMyBookings }: { onShowMyBookings: () => void }) {
  const [step, setStep] = useState<Step>('service');
  const [selection, setSelection] = useState<Selection>({});
  const [booking, setBooking] = useState<Booking | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const back = previousStep[step];
  useEffect(() => (back ? tg.showBackButton(() => setStep(back)) : undefined), [back]);

  const select = (patch: Selection, next: Step) => {
    tg.haptic.tap();
    setNotice(null);
    setSelection((s) => ({ ...s, ...patch }));
    setStep(next);
  };

  const restart = () => {
    setSelection({});
    setBooking(null);
    setStep('service');
  };

  return (
    <>
      {/* Внутри Telegram используется системная кнопка «Назад» в шапке */}
      {back && !insideTelegram && (
        <button className='back-link' onClick={() => setStep(back)}>
          ← Назад
        </button>
      )}

      {step === 'service' && <ServiceStep onSelect={(service) => select({ service, master: undefined }, 'master')} />}

      {step === 'master' && selection.service && (
        <MasterStep service={selection.service} onSelect={(master) => select({ master }, 'time')} />
      )}

      {step === 'time' && selection.service && selection.master && (
        <TimeStep
          service={selection.service}
          masterId={selection.master.id}
          initialDate={selection.day?.date}
          notice={notice}
          onSelect={(day, slot) => select({ day, slot }, 'confirm')}
        />
      )}

      {step === 'confirm' && (
        <ConfirmStep
          selection={selection}
          onBooked={(created) => {
            tg.haptic.success();
            setBooking(created);
            setStep('done');
          }}
          onSlotTaken={(message) => {
            tg.haptic.error();
            setNotice(message);
            setStep('time');
          }}
        />
      )}

      {step === 'done' && booking && <DoneStep booking={booking} onAgain={restart} onShowMyBookings={onShowMyBookings} />}
    </>
  );
}

function ServiceStep({ onSelect }: { onSelect: (service: Service) => void }) {
  const { data, error, loading, reload } = useRequest(api.services, []);

  return (
    <section>
      <StepTitle step='Шаг 1 из 3'>Выберите услугу</StepTitle>
      {loading && <Loader />}
      {error && <ErrorMessage message={error} onRetry={reload} />}
      <ul className='list'>
        {data?.map((service) => (
          <li key={service.id}>
            <button className='card' onClick={() => onSelect(service)}>
              <span className='card__title'>{service.name}</span>
              <span className='card__meta'>{service.durationMin} мин</span>
              <span className='card__price'>{formatPrice(service.price)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MasterStep({ service, onSelect }: { service: Service; onSelect: (m: { id: MasterChoice; name: string }) => void }) {
  const { data, error, loading, reload } = useRequest(() => api.masters(service.id), [service.id]);

  return (
    <section>
      <StepTitle step='Шаг 2 из 3'>Выберите мастера</StepTitle>
      <p className='subtitle'>{service.name}</p>
      {loading && <Loader />}
      {error && <ErrorMessage message={error} onRetry={reload} />}
      {data && (
        <ul className='list'>
          <li>
            <button className='card' onClick={() => onSelect({ id: null, name: 'Любой свободный' })}>
              <span className='avatar avatar_any'>★</span>
              <span className='card__title'>Любой мастер</span>
              <span className='card__meta'>Подберём свободного на выбранное время</span>
            </button>
          </li>
          {data.map((master) => (
            <li key={master.id}>
              <button className='card' onClick={() => onSelect({ id: master.id, name: master.name })}>
                <span className='avatar'>{master.name[0]}</span>
                <span className='card__title'>{master.name}</span>
                <span className='card__meta'>{master.about}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type TimeStepProps = {
  service: Service;
  masterId: MasterChoice;
  initialDate?: string;
  notice: string | null;
  onSelect: (day: Day, slot: Slot) => void;
};

function TimeStep({ service, masterId, initialDate, notice, onSelect }: TimeStepProps) {
  const days = useRequest(() => api.days(service.id, masterId), [service.id, masterId]);
  const [date, setDate] = useState<string | undefined>(initialDate);

  // По умолчанию выбираем первый день, в котором есть свободное время
  const selectedDate = date ?? days.data?.find((d) => d.hasSlots)?.date;
  const selectedDay = days.data?.find((d) => d.date === selectedDate);

  return (
    <section>
      <StepTitle step='Шаг 3 из 3'>Выберите время</StepTitle>
      {notice && <p className='notice'>{notice}</p>}
      {days.loading && <Loader />}
      {days.error && <ErrorMessage message={days.error} onRetry={days.reload} />}
      {days.data && !days.data.some((d) => d.hasSlots) && (
        <Empty>В ближайшие две недели нет свободного времени. Попробуйте выбрать другого мастера.</Empty>
      )}
      {days.data && (
        <div className='days' role='tablist'>
          {days.data.map((day) => (
            <button
              key={day.date}
              role='tab'
              aria-selected={day.date === selectedDate}
              className={`day ${day.date === selectedDate ? 'day_active' : ''}`}
              disabled={!day.hasSlots}
              onClick={() => {
                tg.haptic.tap();
                setDate(day.date);
              }}
            >
              <span className='day__weekday'>{day.weekday}</span>
              <span className='day__number'>{day.dayOfMonth}</span>
            </button>
          ))}
        </div>
      )}
      {selectedDay && <Slots service={service} masterId={masterId} day={selectedDay} onSelect={onSelect} />}
    </section>
  );
}

function Slots({ service, masterId, day, onSelect }: Omit<TimeStepProps, 'notice' | 'initialDate'> & { day: Day }) {
  const { data, error, loading, reload } = useRequest(
    () => api.slots(service.id, masterId, day.date),
    [service.id, masterId, day.date]
  );

  return (
    <>
      <p className='subtitle'>{day.label}</p>
      {loading && <Loader />}
      {error && <ErrorMessage message={error} onRetry={reload} />}
      {data && data.length === 0 && <Empty>На этот день свободного времени не осталось</Empty>}
      <div className='slots'>
        {data?.map((slot) => (
          <button key={slot.startsAt} className='slot' onClick={() => onSelect(day, slot)}>
            {slot.label}
          </button>
        ))}
      </div>
    </>
  );
}

type ConfirmStepProps = {
  selection: Selection;
  onBooked: (booking: Booking) => void;
  onSlotTaken: (message: string) => void;
};

function ConfirmStep({ selection, onBooked, onSlotTaken }: ConfirmStepProps) {
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { service, master, day, slot } = selection;
  if (!service || !master || !day || !slot) return null;

  const submit = async () => {
    setSending(true);
    setError(null);
    try {
      onBooked(await api.createBooking({ serviceId: service.id, masterId: master.id, startsAt: slot.startsAt, comment }));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'slot_taken') return onSlotTaken(e.message);
      tg.haptic.error();
      setError(e instanceof Error ? e.message : 'Не удалось записаться');
    } finally {
      setSending(false);
    }
  };

  return (
    <section>
      <StepTitle>Проверьте запись</StepTitle>
      <dl className='summary'>
        <dt>Услуга</dt>
        <dd>
          {service.name} · {service.durationMin} мин
        </dd>
        <dt>Мастер</dt>
        <dd>{master.name}</dd>
        <dt>Когда</dt>
        <dd>
          {day.label}, {slot.label}
        </dd>
        <dt>Стоимость</dt>
        <dd className='summary__price'>{formatPrice(service.price)}</dd>
      </dl>

      <label className='field'>
        <span>Комментарий (необязательно)</span>
        <textarea
          value={comment}
          maxLength={300}
          rows={3}
          placeholder='Например: хочу сохранить длину'
          onChange={(e) => setComment(e.target.value)}
        />
      </label>

      {error && <ErrorMessage message={error} />}

      <button className='button button_primary' disabled={sending} onClick={submit}>
        {sending ? 'Записываем…' : 'Записаться'}
      </button>
    </section>
  );
}

function DoneStep({ booking, onAgain, onShowMyBookings }: { booking: Booking; onAgain: () => void; onShowMyBookings: () => void }) {
  return (
    <section className='done'>
      <div className='done__icon'>✓</div>
      <h1>Вы записаны!</h1>
      <p>
        {booking.dateLabel}, {booking.timeLabel}
        <br />
        {booking.serviceName} · мастер {booking.masterName}
      </p>
      <p className='subtitle'>Подтверждение и напоминания придут в чат с ботом</p>
      <button className='button button_primary' onClick={tg.close}>
        Готово
      </button>
      <button className='button button_secondary' onClick={onShowMyBookings}>
        Мои записи
      </button>
      <button className='button button_link' onClick={onAgain}>
        Записаться ещё
      </button>
    </section>
  );
}
