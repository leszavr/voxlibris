# YooKassa emulator для локальной разработки

Изолированный dev-only эмулятор YooKassa без зависимостей. Не меняет `package.json`, `pnpm-lock.yaml` и не должен попадать в GitHub.

Папка добавлена в локальный `.git/info/exclude`:

```text
infra/yooksssa_emulator/
```

## Возможности

- `POST /v3/payments` — создание fake payment.
- `GET /v3/payments/:id` — проверка payment для webhook verification.
- `GET /pay/:paymentId` — локальная страница оплаты.
- Кнопки:
  - успешная оплата;
  - отмена;
  - повтор webhook для проверки идемпотентности.
- Fake 54-ФЗ receipt:
  - `fiscalReceiptId`;
  - `fiscalReceiptUrl`;
  - HTML-страница `/receipts/:receiptId`.

Важно: fake receipt не является юридически значимым фискальным документом.

## Запуск

```bash
node infra/yooksssa_emulator/server.mjs
```

По умолчанию:

```text
Emulator URL:  http://127.0.0.1:4010
Webhook URL:   http://127.0.0.1:5000/api/commerce/webhooks/yookassa
```

Можно переопределить:

```bash
YOOKASSA_EMULATOR_PORT=4010 \
YOOKASSA_EMULATOR_WEBHOOK_URL=http://127.0.0.1:5000/api/commerce/webhooks/yookassa \
node infra/yooksssa_emulator/server.mjs
```

## Подключение backend к эмулятору

Текущий `server/services/monetization.ts` использует жёсткий URL:

```text
https://api.yookassa.ru/v3
```

Чтобы backend ходил в эмулятор, нужен небольшой dev-safe override в YooKassa adapter:

```ts
const yookassaApiBaseUrl = process.env.YOOKASSA_API_BASE_URL ?? 'https://api.yookassa.ru/v3';
```

И заменить обращения:

```ts
fetch(`${yookassaApiBaseUrl}/payments`, ...)
fetch(`${yookassaApiBaseUrl}/payments/${encodeURIComponent(paymentId)}`, ...)
```

Локальный env:

```env
YOOKASSA_API_BASE_URL=http://127.0.0.1:4010/v3
```

Production без этой переменной продолжит использовать настоящую YooKassa.

## Локальные credentials

В админке payment provider можно указать фиктивные значения:

```text
shopId: local_shop
apiKey: local_secret
receiptEnabled: true
vatCode: 1
paymentSubject: service
paymentMode: full_payment
```

Эмулятор принимает любой Basic auth. Реальные ключи YooKassa в dev не нужны.

## Проверочный сценарий

1. Запустить backend.
2. Запустить эмулятор.
3. Настроить active provider `yookassa` с локальными credentials.
4. Создать checkout в приложении.
5. Открыть `confirmation_url` вида:

```text
http://127.0.0.1:4010/pay/emul_payment_...
```

6. Нажать «Успешно оплатить».
7. Проверить в БД/админке:
   - `commerce_orders.status = paid`;
   - `commerce_payments.status = succeeded`;
   - `commerce_payment_events` создан;
   - `commerce_entitlements` выдан;
   - membership/grant создан;
   - `commerce_ledger_entries` созданы для reader-led flow.
8. Нажать «Повторить webhook» и проверить, что дубликаты не появились.

## 54-ФЗ fake receipt

При успешной оплате эмулятор создаёт fake receipt и добавляет в webhook metadata:

```json
{
  "fiscalReceiptId": "emul_receipt_...",
  "fiscalReceiptUrl": "http://127.0.0.1:4010/receipts/emul_receipt_..."
}
```

Если backend начнёт сохранять эти поля в `commerce_payments.fiscalReceiptId` и `commerce_payments.fiscalReceiptUrl`, audit UI сможет проверять фискальный контур локально.

## Ограничения

- Не настоящая YooKassa.
- Не настоящая 54-ФЗ фискализация.
- Нет refunds.
- Нет recurring payments.
- Данные хранятся в памяти и пропадают после перезапуска.
- Предназначено только для локальной разработки.
