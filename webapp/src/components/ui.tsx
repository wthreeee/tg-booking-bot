import type { ReactNode } from 'react';

export function Loader() {
  return (
    <div className='loader' aria-label='Загрузка'>
      <span />
      <span />
      <span />
    </div>
  );
}

export function ErrorMessage({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className='error'>
      <p>{message}</p>
      {onRetry && (
        <button className='button button_secondary' onClick={onRetry}>
          Повторить
        </button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className='empty'>{children}</p>;
}

export function StepTitle({ step, children }: { step?: string; children: ReactNode }) {
  return (
    <header className='step-title'>
      {step && <span className='step-title__step'>{step}</span>}
      <h1>{children}</h1>
    </header>
  );
}
