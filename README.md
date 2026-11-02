# Simple Vault — практика Anchor (Solana Devnet)

**Учебный проект на Rust, Solana и Anchor Framework 0.31.1.**

Simple Vault — смарт-контракт для хранилища SPL-токенов (Vault): персональные карточки пользователей через PDA, депозиты и share-токены.

- Неделя 8 — каркас vault, карточки пользователей, пауза.
- Неделя 9 — депозит и share-токены.

## 1. Инструкции контракта

| Инструкция | Назначение | Кто вызывает |
|---|---|---|
| `initialize_vault` | Создаёт VaultState, токен-аккаунт хранилища и share mint | администратор |
| `create_user_card` | Создаёт персональную карточку пользователя | пользователь |
| `close_user_card` | Закрывает пустую карточку и возвращает ренту | владелец карточки |
| `set_paused` | Включает или выключает паузу | администратор |
| `deposit(amount)` | Переводит токены в vault и выпускает share-токены | пользователь |

## 2. Схема аккаунтов

| Аккаунт | Seeds | Владелец / authority | Что хранит |
|---|---|---|---|
| `vault_state` | `["vault", token_mint]` | программа | admin, token_mint, адреса аккаунтов, `total_tokens`, `total_shares`, bump, `paused` |
| `vault_token_account` | `["vault_tokens", token_mint]` | PDA `vault_state` | сами токены, внесённые пользователями |
| `share_mint` | `["share_mint", token_mint]` | PDA `vault_state` | mint share-токенов (6 decimals); выпускать может только программа |
| `user_card` | `["user_card", vault_state, user]` | программа | vault, owner, `deposited`, `shares`, bump, `created_at` |

Карточку пользователя всегда можно найти по адресу: он вычисляется из адреса vault и адреса пользователя, список пользователей хранить не нужно.

## 3. Депозит (неделя 9)

Пользователь вносит `amount` токенов и получает share-токены: «квитанцию» с его долей в vault.

Шаги внутри `deposit`:

1. Проверки: `amount > 0`, vault не на паузе.
2. Расчёт shares.
3. Перевод токенов пользователя в `vault_token_account` (CPI в Token Program, подписывает **пользователь**).
4. Выпуск shares на share-аккаунт пользователя (CPI в Token Program, подписывает **PDA vault**).
5. Обновление учёта: `total_tokens`, `total_shares` в vault, `deposited`, `shares` в карточке.

Формула:

```
Первый депозит:       shares = amount
Последующие депозиты: shares = amount × total_shares ÷ total_tokens
```

Пример: A вносит 100 → 100 shares. Затем B вносит 50 → 50 shares. В vault 150 токенов и 150 shares, доли: A — 2/3, B — 1/3. Если vault заработает и токенов станет больше, чем shares, поздний вкладчик получит shares меньше, чем внёс токенов: каждый share стал дороже, и доход ранних вкладчиков не достаётся новичкам.

Ошибки: `ZeroAmount`, `SharesTooSmall`, `MathOverflow`, `VaultPaused`, а также ошибка Anchor, если у пользователя нет карточки.

Дополнительные решения:

- Во время паузы депозиты запрещены (как и создание карточек).
- Карточку с депозитом или shares закрыть нельзя (`CardNotEmpty`), чтобы не потерять учёт доли. Пустую карточку можно закрыть даже на паузе.

## 4. Запуск

```bash
yarn install
anchor --version              # ожидается anchor-cli 0.31.1
solana config set --url devnet
solana balance                # нужны тестовые SOL (https://faucet.solana.com/)
anchor build
anchor deploy --provider.cluster devnet
yarn test
```

`yarn test` запускается с `--skip-deploy`, поэтому после изменений в коде сначала нужны `anchor build` и `anchor deploy`.

После `anchor build` и `anchor deploy` запустить тесты можно и напрямую, без `anchor test`:

```bash
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=$HOME/.config/solana/id.json \
yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/vault.ts
```

Если ID в `declare_id!` не совпадает с ключом в `target/deploy`, выполнить `anchor keys sync` и пересобрать программу, иначе тесты упадут с ошибкой `DeclaredProgramIdMismatch` (4100).

Структура аккаунтов изменилась по сравнению с неделей 8, поэтому старые vault и карточки с devnet не подходят. Тесты каждый раз создают новый mint, а значит, новый vault.

## 5. Тесты (`tests/vault.ts`)

1. `initialize_vault` — vault создан, `paused = false`, `total_tokens = 0`, `total_shares = 0`.
2. `create_user_card` — карточки созданы, `created_at > 0`.
3. Повторное создание карточки отклоняется.
4. `set_paused` не-админом отклоняется.
5. Setup токен-аккаунтов.
6. Депозит A: 100 токенов → 100 shares.
7. Депозит B: 50 токенов → 50 shares, `total_tokens = total_shares = 150`.
8. Депозит без карточки отклоняется.
9. Депозит 0 отклоняется.
10. Администратор включает паузу.
11. Создание карточки на паузе отклоняется.
12. Депозит на паузе отклоняется.
13. Чужую карточку закрыть нельзя.
14. Карточку с депозитом закрыть нельзя.
15. Пустую карточку можно закрыть на паузе, рента возвращается.
16. Администратор снимает паузу.
17. После паузы карточка создаётся.
18. После паузы депозит работает.

**Результат запуска (devnet):** `18 passing`, 0 failing.

## 6. Адреса и ссылки

- Сеть: Solana Devnet
- Program ID: `AQ1t23jJHzxzT1YR1n5ygPeamaEjg3kEYG7tyitDyapm`
- Программа в Explorer: https://explorer.solana.com/address/AQ1t23jJHzxzT1YR1n5ygPeamaEjg3kEYG7tyitDyapm?cluster=devnet
- Транзакция деплоя: https://explorer.solana.com/tx/eKSH2eoHqVjrNN7vtjJ2LjYzNyCc6dfeF2yMesJEvnxs7QDR8SE4ZgQr3GRxTYJ6xaWKEDoUQThchEKfdLdJkrZ?cluster=devnet
- Репозиторий: https://github.com/feskyy/ITStartup_Solana
- **Транзакция депозита в Explorer:** https://explorer.solana.com/tx/23o4ZKvv4rZvzZKbL3btdHLpmeDQpkN7Vx5XJwzW5qX9btbjpnptnUkuYkopzkDoeLtKS9ALQWsKW3vhCi6xrTe2?cluster=devnet

- Программы, которые участвуют в транзакции депозита: Simple Vault (`AQ1t23jJHzxzT1YR1n5ygPeamaEjg3kEYG7tyitDyapm`) вызывает Token Program (`transfer` — перевод токенов пользователя в vault, `mint_to` — выпуск share-токенов). _Сверить с Explorer, добавить System Program, если он виден._

## 7. Безопасность

- Токены vault лежат на PDA, у которого нет приватного ключа: ни администратор, ни кто-то другой не может забрать их своей подписью.
- Share-токены выпускает только программа (mint authority — PDA vault).
- Перевод токенов пользователя подписывает сам пользователь.
- Проверки seeds и bump, `has_one = admin` для паузы, ограничения владельца карточки.
- Арифметика через `checked_*` и `u128`, чтобы не было переполнения.
- Не публиковать в GitHub: `id.json`, `*-keypair.json`, seed-фразы.

## 8. Частые ошибки

| Ошибка | Причина | Решение |
|---|---|---|
| `Insufficient funds` | Мало тестовых SOL | Пополнить через faucet |
| `AccountNotInitialized` | Программа не развёрнута или нет карточки | `anchor build`, `anchor deploy`, затем `create_user_card` |
| `already in use` | Карточка уже существует | Ожидаемо: карточка одна на пользователя |
| `VaultPaused` | Включена пауза | Администратор вызывает `set_paused(false)` |
| `ZeroAmount` | `amount = 0` | Вносить сумму больше нуля |
| `SharesTooSmall` | Депозит слишком мал | Увеличить сумму |
| `CardNotEmpty` | На карточке есть депозит | Сначала вывести (неделя 10) |
| `429 Too Many Requests` | Лимит публичного RPC | Подождать: клиент сам повторяет запросы |
| `DeclaredProgramIdMismatch` (4100) | В задеплоенном бинарнике другой ID, чем адрес программы | `anchor keys sync`, `anchor build`, `anchor deploy` |
