// Минимальные типы для Telegram Mini Apps SDK (telegram-web-app.js подключён в index.html)
type BackButton = {
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
};

type WebApp = {
  initData: string;
  colorScheme: 'light' | 'dark';
  ready(): void;
  expand(): void;
  close(): void;
  BackButton: BackButton;
  HapticFeedback: {
    impactOccurred(style: 'light' | 'medium' | 'heavy'): void;
    notificationOccurred(type: 'success' | 'error' | 'warning'): void;
    selectionChanged(): void;
  };
  showConfirm(message: string, callback: (ok: boolean) => void): void;
};

declare global {
  interface Window {
    Telegram?: { WebApp: WebApp };
  }
}

const webApp = window.Telegram?.WebApp;

/** true, если приложение открыто внутри Telegram, а не в обычном браузере */
export const insideTelegram = Boolean(webApp?.initData);

export const tg = {
  initData: webApp?.initData ?? '',

  init() {
    webApp?.ready();
    webApp?.expand();
  },

  haptic: {
    tap: () => webApp?.HapticFeedback.selectionChanged(),
    success: () => webApp?.HapticFeedback.notificationOccurred('success'),
    error: () => webApp?.HapticFeedback.notificationOccurred('error')
  },

  /** Системная кнопка «Назад» в шапке Telegram. Возвращает функцию для её скрытия */
  showBackButton(onBack: () => void) {
    if (!insideTelegram || !webApp) return () => {};
    webApp.BackButton.onClick(onBack);
    webApp.BackButton.show();
    return () => {
      webApp.BackButton.offClick(onBack);
      webApp.BackButton.hide();
    };
  },

  confirm(message: string): Promise<boolean> {
    if (insideTelegram && webApp) {
      return new Promise((resolve) => webApp.showConfirm(message, resolve));
    }
    return Promise.resolve(window.confirm(message));
  },

  close: () => webApp?.close()
};
