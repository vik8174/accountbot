/**
 * Ukrainian translations (ISO 639-1: uk)
 */
export const uk = {
  start: {
    welcome: "Привіт, {name}! Ласкаво просимо до AccountBot.",
    tagline: "Просто. Швидко. Точно.",
  },
  help: {
    title: "Допомога AccountBot",
    add: "/add — Додати транзакцію",
    balance: "/balance — Переглянути баланси",
    history: "/history — Історія транзакцій",
    sync: "/sync — Синхронізувати баланс",
  },
  add: {
    selectAccount: "Оберіть рахунок:",
    noAccounts: "Немає доступних рахунків.",
    enterAmount: "Введіть суму (додатню або від'ємну):",
    enterDescription: "Введіть опис транзакції:",
    invalidNumber: "Введіть коректне число (не нуль):",
    maxDecimals: "Максимум 2 знаки після коми (напр. 25.50):",
    maxAmount: "Сума не може перевищувати {max}:",
    success: "Транзакцію додано",
    accountNotFound: "Рахунок не знайдено. Транзакцію скасовано.",
    selected: "Обрано: <b>{name}</b>",
  },
  sync: {
    selectAccount: "Оберіть рахунок для синхронізації:",
    currentBalance: "Поточний баланс: {balance}",
    enterActual: "Введіть фактичний баланс:",
    negativeNotAllowed: "Баланс не може бути від'ємним:",
    noChange: "Баланс вже коректний. Змін не внесено.",
    success: "Баланс синхронізовано",
    balanceSync: "Синхронізація балансу",
    maxBalance: "Баланс не може перевищувати {max}:",
    cancelled: "Рахунок не знайдено. Синхронізацію скасовано.",
  },
  balance: {
    title: "Баланси рахунків",
    noAccounts: "Рахунків не знайдено.",
  },
  history: {
    title: "Останні транзакції",
    noTransactions: "Транзакцій не знайдено.",
    balanceSync: "Синхронізація балансу",
  },
  common: {
    account: "Рахунок",
    amount: "Сума",
    description: "Опис",
    newBalance: "Новий баланс",
    previous: "Попередній",
    adjustment: "Коригування",
    error: "Помилка. Спробуйте ще раз.",
    failed: "Не вдалося завантажити. Спробуйте ще раз.",
    userError: "Помилка: не вдалося ідентифікувати чат або користувача.",
    accountNotFound: "Рахунок не знайдено.",
  },
};
