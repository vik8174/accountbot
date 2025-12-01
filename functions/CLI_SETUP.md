# CLI Scripts Setup

## Аутентифікація для локальних CLI скриптів

CLI скрипти (`add-account`, `list-accounts`) потребують аутентифікації для доступу до Firestore.

### Варіант 1: Service Account Key (Рекомендовано для локальної розробки)

1. **Завантажте service account key:**
   - Відкрийте Firebase Console: https://console.firebase.google.com/
   - Виберіть проект (`accountbot-dev` або `accountbot-prod`)
   - Settings → Service Accounts
   - Натисніть "Generate new private key"
   - Збережіть файл як `serviceAccountKey.json` в директорії `functions/`

2. **Додайте файл в `.gitignore`:**
   ```bash
   echo "serviceAccountKey.json" >> functions/.gitignore
   ```

3. **Запустіть скрипти:**
   ```bash
   cd functions
   npm run list-accounts
   npm run add-account
   ```

### Варіант 2: Google Cloud SDK (Application Default Credentials)

Якщо у вас встановлений Google Cloud SDK:

```bash
gcloud auth application-default login
```

Після цього скрипти автоматично знайдуть credentials.

## Використання скриптів

### Переглянути всі аккаунти
```bash
npm run list-accounts
```

### Додати новий аккаунт
```bash
npm run add-account
```

Скрипт запитає:
- Назву аккаунту (наприклад: "Cash", "Visa Card")
- Slug (унікальний ідентифікатор, lowercase)
- Валюту (EUR, USD, UAH)
- Початковий баланс (за замовчуванням 0)

## Troubleshooting

### "Unable to detect a Project Id"

**Причина:** Відсутні credentials.

**Рішення:**
1. Переконайтесь що `serviceAccountKey.json` існує в `functions/`
2. Або виконайте `gcloud auth application-default login`

### "Failed to read credentials from file"

**Причина:** Неправильний шлях до credentials.

**Рішення:** Переконайтесь що service account key знаходиться в `functions/serviceAccountKey.json`
