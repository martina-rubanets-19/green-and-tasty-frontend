# Домашнє завдання Frontend #6 — екран Owner групового pre-order

Виконано **всі рівні**: 🟢 1, 🔵 2, 🟣 3 і бонус **Remove Guest**.

Демо: `npm start` → http://localhost:4200/reservations/demo-reservation/group-order?demo

## Що зроблено

### Практичне + 🟢 рівень 1 — верстка
- `components/group-orders/participant-card/` — картка учасника: «My Pre-Order» / «Owner: …» / «Guest: …», статус кошика **текстом** (Submitted / Still choosing), страви з фото 40×40 або першою літерою, кількість, ціна, Subtotal.
- `pages/group-order-page/` — сторінка за макетом `01-owner-review.png`: шапка (адреса, дата, час, «N of M guests»), бейдж статусу, список учасників, Grand Total, зелена кнопка Submit Pre-Order.
- Семантика: один `<main>`, один `<h1>`, учасники — `<ul>/<li>`, картка — `<article>`.
- Кольори — `@use 'app/shared/styles/abstracts/colors' as color`; адаптив до 375 px (сітка рядка страви перебудовується).

### 🔵 рівень 2 — логіка на мок-бекенді
- `services/group-orders/group-orders.service.ts`: `getGroupInvite$`, `getSessions$`, `getOwnerSessionId$`, `getStatus$`, `submit$`, `removeSession$`.
- Стан — `signal()`, похідні — `computed()`; без нових `Subject` / `BehaviorSubject`.
- Блок «Consolidated pre-order» через `consolidatePreOrder()`; **Grand Total = сума лише підтверджених кошиків** (тест «$540, а не $760»).
- Жовта плашка «N participants haven’t submitted their cart yet…», бейдж «Collecting pre-orders» / «Sent to Restaurant».
- Submit через `<app-modal>`: кнопка неактивна без страв у підтверджених кошиках і під час запиту («Submitting…»), подвійний клік не відправляє двічі; після успіху — toast, бейдж «Sent to Restaurant», екран read-only; при помилці екран не ламається.
- Стани: loading, error з «Try again», 404 «Group reservation not found», empty «Participants haven’t added any dishes yet».

### 🟣 рівень 3 — синхронізація з API
- Поки група `Open`, кожні 15 с — тихий запит кошиків і статусу (`interval` + `exhaustMap`, `{ silent: true }` → `SKIP_ERROR_TOAST`).
- Без повноекранного лоадера; рядок «Updated at HH:mm:ss», кнопка **Refresh**; при помилці — «Couldn’t refresh. Showing data from …» і останні дані.
- Таймер не дублюється (Try again перезапускає один), зупиняється після Submit і при виході зі сторінки (`DestroyRef`).
- **Виправлення в `auth/token.interceptor.ts`**: для `/guest/…` інтерсептор не додавав токен і ігнорував `SKIP_ERROR_TOAST`. Тепер для `/guest/groups/…` додається токен Owner (якщо в запиті ще немає власного `Authorization` гостя), а тихі запити не показують toast. Покрито 3 новими тестами в `token.interceptor.spec.ts`.
- У картці бронювання (`card-reservation`) додано кнопку **Group Pre-Order** для бронювань на 2+ гостей — вхід на екран, як на макеті `03-remove-guest.png`.

### Бонус — Remove Guest
- «Remove Guest» з `aria-label="Remove <ім'я>"` у картці кожного гостя (не в Owner і не після submit); підтвердження через `<app-modal>`; після успіху список і суми оновлюються з відповіді сервера.

## Перевірка

| Команда | Результат |
|---|---|
| `npm run test:hw` | **67 / 67 SUCCESS** (практичне 8, рівень 2: 5 + 13, рівень 3: 3 + 6, бонус 1 + 5, `shared/helpers`) |
| `npx tsc -p tsconfig.app.json --noEmit` | без помилок |
| `npx tsc -p tsconfig.spec.json --noEmit` | без помилок |
| `BACKEND_URL=https://example.com npm run build` | `Bundle check passed` (попередження бюджетів — ті самі, що й до змін) |
| `ng test --include src/app/auth` | нові тести інтерсептора зелені; червоні `GeneralInformationComponent` / `RegisterComponent` були червоні й до змін — ці файли не змінювались |

Вручну на мок-бекенді перевірено: дані й суми, плашку, Submit і read-only після нього, Remove Guest, стани помилок.

## Скріни

Папка `screenshots/`: 01 — огляд кошиків, 02 — діалог Submit, 03 — «Sent to Restaurant», 04 — Remove Guest.

## Використання AI

Так, використовувався Claude (Anthropic): аналіз завдання, тестів і макетів, написання коду компонентів, сервісу, стилів і тестів інтерсептора. Результат перевірено запуском усіх тестів домашки, обох `tsc`, production-збірки та вручну в браузері на мок-бекенді.
