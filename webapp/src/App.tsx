import { useState } from 'react';

import { api } from './api';
import { AdminSchedule } from './components/AdminSchedule';
import { BookingFlow } from './components/BookingFlow';
import { MyBookings } from './components/MyBookings';
import { ErrorMessage, Loader } from './components/ui';
import { insideTelegram, tg } from './telegram';
import { useRequest } from './useRequest';

type Tab = 'book' | 'my' | 'schedule';

export function App() {
  const me = useRequest(api.me, []);
  const [tab, setTab] = useState<Tab>('book');
  // Новый key пересоздаёт форму записи с первого шага
  const [flowKey, setFlowKey] = useState(0);

  if (me.loading) return <Loader />;
  if (me.error) {
    return (
      <main className='app'>
        <ErrorMessage
          message={insideTelegram ? me.error : 'Откройте приложение через кнопку «Записаться» в Telegram-боте'}
          onRetry={me.reload}
        />
      </main>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'book', label: 'Запись' },
    { id: 'my', label: 'Мои записи' },
    ...(me.data?.isAdmin ? [{ id: 'schedule' as const, label: 'Расписание' }] : [])
  ];

  const openTab = (id: Tab) => {
    tg.haptic.tap();
    if (id === 'book') setFlowKey((k) => k + 1);
    setTab(id);
  };

  return (
    <main className='app'>
      <p className='brand'>{me.data?.businessName}</p>
      <nav className='tabs'>
        {tabs.map(({ id, label }) => (
          <button key={id} className={`tabs__item ${tab === id ? 'tabs__item_active' : ''}`} onClick={() => openTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'book' && <BookingFlow key={flowKey} onShowMyBookings={() => setTab('my')} />}
      {tab === 'my' && <MyBookings onBook={() => openTab('book')} />}
      {tab === 'schedule' && <AdminSchedule />}
    </main>
  );
}
