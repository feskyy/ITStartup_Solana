# Simple Vault — практика Anchor (Solana Devnet)

**Учебный проект на Rust, Solana и Anchor Framework 0.31.1.**

Simple Vault — смарт-контракт для хранилища SPL-токенов (Vault): персональные карточки пользователей через PDA, депозиты и share-токены.

- Неделя 8 — каркас vault, карточки пользователей, пауза.
- Неделя 9 — депозит и share-токены.
- Неделя 10 — вывод из vault: сжигание share-токенов и возврат токенов через CPI.
- Неделя 11 — свои тестовые токены и свой CLMM-пул Raydium в devnet (скриптами, контракт не менялся).
- Неделя 12 — интеграция Raydium CLMM через CPI, второе токен-хранилище, обмен токенов, защита от slippage и обратный обмен с восстановлением учёта vault.

## 1. Инструкции контракта

| Инструкция | Назначение | Кто вызывает |
|---|---|---|
| `initialize_vault` | Создаёт VaultState, токен-аккаунт хранилища и share mint | администратор |
| `create_user_card` | Создаёт персональную карточку пользователя | пользователь |
| `close_user_card` | Закрывает пустую карточку и возвращает ренту | владелец карточки |
| `set_paused` | Включает или выключает паузу | администратор |
| `deposit(amount)` | Переводит токены в vault и выпускает share-токены | пользователь |
| `withdraw(shares)` | Сжигает share-токены и возвращает пользователю его долю токенов | пользователь |
| `initialize_strategy` | Создаёт второе токен-хранилище для Token B | администратор |
| `swap` | Выполняет обмен токенов A ↔ B через Raydium CLMM CPI | администратор |

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

## 4. Вывод (неделя 10)

Пользователь возвращает `shares` share-токенов и забирает свою долю токенов.

Формула (округление **вниз**, чтобы vault не отдал больше положенного):

```
tokens = shares × total_tokens ÷ total_shares
```

Шаги внутри `withdraw`:

1. Проверки: `shares > 0`, `shares <= user_card.shares`, итоговая сумма `tokens > 0`.
2. Расчёт `tokens` и части `deposited`, которая списывается с карточки (пропорционально выводимым shares).
3. **CPI `burn`** в Token Program: сжигаются share-токены пользователя. Подписывает **пользователь**.
4. **CPI `transfer`** в Token Program: токены из `vault_token_account` переводятся пользователю. Подписывает **программа от имени PDA `vault_state`** (`invoke_signed`: seeds `["vault", token_mint, bump]`).
5. Обновление учёта: `total_tokens` и `total_shares` уменьшаются, `shares` и `deposited` в карточке тоже.

Пример: в vault 140 токенов и 140 shares, пользователь возвращает 40 shares → получает 40 × 140 ÷ 140 = 40 токенов. Если бы vault заработал и в нём стало 154 токена при тех же 140 shares, то за 40 shares пользователь получил бы 40 × 154 ÷ 140 = 44 токена.

Решения:

- **Вывод разрешён и на паузе.** Пауза останавливает новые депозиты и карточки, но не должна запирать деньги пользователей.
- Администратор не может забрать токены vault своей подписью: хранилищем распоряжается только PDA, а подписать за PDA может только программа внутри `withdraw` (и других инструкций программы).
- `deposited` списывается пропорционально. Если вывести все shares, `deposited` и `shares` обнуляются, и карточку можно закрыть (`close_user_card`).
- Ограничение учебной версии: лимит вывода считается по `shares` на карточке. Share-токены обычные, их можно передать другому человеку, но вывести по ним получится только при совпадении с учётом карточки.

Ошибки: `ZeroAmount`, `InsufficientShares`, `WithdrawTooSmall`, `MathOverflow`, а также ошибка Anchor, если нет карточки или она чужая.

### Какие CPI видны в транзакции вывода

В Solana Explorer в транзакции вывода (Instruction: Withdraw) видны два вызова
Token Program (Inner Instructions), сделанные из программы Simple Vault:

1. `Burn` — сжигание 30 share-токенов (authority — пользователь, он подписывает транзакцию).
2. `Transfer` — перевод 30 токенов из хранилища vault пользователю
   (authority — PDA `vault_state`, подписывает программа через `invoke_signed`).

Лог программы: `Withdraw: 30000000 shares -> 30000000 tokens (total_tokens = 100000000, total_shares = 100000000)`.

Транзакция вывода: https://explorer.solana.com/tx/3qkLB3QH96L4PU5jT3qkRuR1iGfYHq2jpjXNT66wQwCi3WA3Kf7N9wH4Er8EEkWgCBzJG9ZEKvs3tdrqF6Vdef57?cluster=devnet

## 5. Свои токены и CLMM-пул Raydium (неделя 11)

Контракт `simple_vault` на этой неделе **не менялся**. Нужно было подготовить площадку для недель 12–13: свои токены и свой пул с ликвидностью, в котором vault будет обменивать токены и открывать позиции. Всё сделано скриптами из папки `scripts/` (запуск через `tsx`, сеть devnet).

| Шаг | Команда | Что делает |
|---|---|---|
| 1 | `yarn week11:tokens` | создаёт два тестовых токена (6 decimals) и выпускает по 1 000 000 каждого на кошелёк |
| 2 | `yarn week11:pool` | создаёт CLMM-пул Raydium из этих токенов с начальной ценой 1 |
| 3 | `yarn week11:position` | вручную, со своего кошелька, открывает одну позицию вокруг текущей цены |

Файлы: `scripts/raydium-config.ts` (общие настройки и проверка, что RPC именно devnet), `scripts/create-tokens.ts`, `scripts/create-clmm-pool.ts`, `scripts/open-position.ts`. Все адреса сохранены в `week11-addresses.json` (только публичные адреса, ключей там нет). Версия `@raydium-io/raydium-sdk-v2` указана в `package.json`.

### Адреса в devnet

| Что | Адрес |
|---|---|
| Токен A | [`CCRTcoXihFnKNXepJk2eCA87qJNz8HWSgVMV19ctT1r`](https://explorer.solana.com/address/CCRTcoXihFnKNXepJk2eCA87qJNz8HWSgVMV19ctT1r?cluster=devnet) |
| Токен B | [`A2dsMy371WJkZyuVBWUg9BscPz9SRcDG8f77C5YUDXX5`](https://explorer.solana.com/address/A2dsMy371WJkZyuVBWUg9BscPz9SRcDG8f77C5YUDXX5?cluster=devnet) |
| Программа CLMM Raydium (devnet) | [`DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH`](https://explorer.solana.com/address/DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH?cluster=devnet) |
| Конфиг комиссий (amm config) | [`CD4aJtX11cqTCAc83nxSPkkh5JW2yjD6uwHeovjqQ1qu`](https://explorer.solana.com/address/CD4aJtX11cqTCAc83nxSPkkh5JW2yjD6uwHeovjqQ1qu?cluster=devnet) |
| **Пул** | [`4tAPx2mdfGQCWmx3EV4qCkbWK52PbzWVNFpxLkfs25nP`](https://explorer.solana.com/address/4tAPx2mdfGQCWmx3EV4qCkbWK52PbzWVNFpxLkfs25nP?cluster=devnet) |
| **Позиция (NFT)** | [`FiiVsEg2qKrsFDiFdsAv6KFnbKnDE4vGCECbbtN7Jj6J`](https://explorer.solana.com/address/FiiVsEg2qKrsFDiFdsAv6KFnbKnDE4vGCECbbtN7Jj6J?cluster=devnet) |
| Транзакция создания пула | [ссылка](https://explorer.solana.com/tx/szmL6EQM3DgZP83qZrSku2r5KnYVKUq6RNEx5xAq65uanvJSgUEAQiNeNYgdWjqD8G7TFLXhPsLAjpgbpd1mmpP?cluster=devnet) |
| Транзакция открытия позиции | [ссылка](https://explorer.solana.com/tx/3AxxHDnrvK77R6NwCVCTmndDBX4HPwKEsyuJoP2ub69kcoiZUtVVPdESqZjiuMsSH1N4GQNhPVZdF7w5W5dnpCdk?cluster=devnet) |

Кошелёк, с которого всё сделано: `mXNWnxD3gdAiWqsPFF1Zb9V4yZtJW1zMbr7FRgXRxJb` (devnet). NFT позиции лежит у него: тот, кто владеет NFT, владеет позицией.

### Параметры пула и позиции

- **Текущая цена пула:** 1 (1 токен A = 1 токен B), это начальная цена при создании пула. Открытие позиции внутри диапазона цену не двигает.
- **Комиссия пула:** 0,25% с каждого обмена (`tradeFeeRate` 2500), шаг цены `tickSpacing` = 60.
- **Выбранный диапазон:** от 0,9 до 1,1, то есть ±10% от текущей цены. После округления до шага тиков (кратных 60) реальные границы: тики −1080 … 960, то есть цена примерно 0,8976 … 1,1008.
- **Внесено в позицию:** около 10 000 токенов первого токена пула (порядок токенов в пуле задаёт Raydium по сортировке адресов) и около 11 100–11 200 второго. Точные суммы видны в транзакции открытия позиции в Explorer.

### Почему выбран именно такой диапазон

Пара токенов у нас учебная, обе стороны стоят одинаково (цена 1), поэтому логично сделать диапазон симметричным вокруг текущей цены. Ширину ±10% я взял как «обычное колебание цены за период»: это правило из методички (отступить от цены вверх и вниз на обычное колебание, например 5–10%).

Что это даёт и чем рискуем:

- **Узкий диапазон зарабатывает больше.** В обычном пуле деньги размазаны по всем ценам от нуля до бесконечности, и почти все лежат без дела. Здесь те же деньги работают только рядом с текущей ценой, поэтому на каждый обмен в этом коридоре позиция получает большую долю комиссий.
- **Но за это приходится следить.** Если цена выйдет за границы диапазона (ниже 0,8976 или выше 1,1008), позиция перестанет участвовать в обменах и не будет зарабатывать комиссии, пока цена не вернётся или диапазон не передвинут (это называется ребалансировка). Чем уже диапазон, тем чаще это случается.
- **Соотношение токенов в позиции зависит от цены.** Пока цена внутри диапазона, в позиции есть оба токена. Если цена уйдёт выше верхней границы, позиция превратится целиком во второй токен, если ниже нижней, то целиком в первый.
- **Почему не уже.** Шаг цены в пуле 60 тиков (около 0,6%), и очень узкий диапазон при учебных тестах слишком часто выходил бы из рабочей зоны. ±10% — разумный компромисс между доходом и вниманием.

На неделях 12–13 vault будет делать то же самое сам: обменивать токены в нужной пропорции и открывать/закрывать такие позиции через CPI.

## 6. Запуск

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

## 7. Тесты (`tests/vault.ts`)

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
19. Неделя 10: A возвращает 40 shares и получает 40 токенов, учёт в vault и карточке обновлён.
20. Вывод 0 отклоняется.
21. Вывод больше, чем есть на карточке, отклоняется.
22. По чужой карточке вывести нельзя.
23. На паузе вывод работает.
24. D выводит всё: карточка обнуляется и закрывается.


## 8. Адреса и ссылки

- Сеть: Solana Devnet
- Program ID: `AQ1t23jJHzxzT1YR1n5ygPeamaEjg3kEYG7tyitDyapm`
- Программа в Explorer: https://explorer.solana.com/address/AQ1t23jJHzxzT1YR1n5ygPeamaEjg3kEYG7tyitDyapm?cluster=devnet
- Транзакция деплоя: https://explorer.solana.com/tx/eKSH2eoHqVjrNN7vtjJ2LjYzNyCc6dfeF2yMesJEvnxs7QDR8SE4ZgQr3GRxTYJ6xaWKEDoUQThchEKfdLdJkrZ?cluster=devnet
- Репозиторий: https://github.com/feskyy/ITStartup_Solana
- **Транзакция депозита в Explorer:** https://explorer.solana.com/tx/23o4ZKvv4rZvzZKbL3btdHLpmeDQpkN7Vx5XJwzW5qX9btbjpnptnUkuYkopzkDoeLtKS9ALQWsKW3vhCi6xrTe2?cluster=devnet

- **Транзакция вывода в Explorer: https://explorer.solana.com/tx/3qkLB3QH96L4PU5jT3qkRuR1iGfYHq2jpjXNT66wQwCi3WA3Kf7N9wH4Er8EEkWgCBzJG9ZEKvs3tdrqF6Vdef57?cluster=devnet

- Программы, которые участвуют в транзакции депозита: Simple Vault (`AQ1t23jJHzxzT1YR1n5ygPeamaEjg3kEYG7tyitDyapm`) вызывает Token Program (`transfer` — перевод токенов пользователя в vault, `mint_to` — выпуск share-токенов). 
- Программы, которые участвуют в транзакции депозита: Simple Vault (`AQ1t23jJHzxzT1YR1n5ygPeamaEjg3kEYG7tyitDyapm`) вызывает Token Program (`transfer` — перевод токенов пользователя в vault, `mint_to` — выпуск share-токенов).

## 9. Безопасность

- Токены vault лежат на PDA, у которого нет приватного ключа: ни администратор, ни кто-то другой не может забрать их своей подписью.
- Share-токены выпускает только программа (mint authority — PDA vault).
- Токены из vault переводятся через `withdraw` при погашении shares пользователя или через `swap` при выполнении стратегии Raydium CLMM.
- Инструкция `swap` предусматривает проверку полномочий администратора.
- Обмен выполняется через CPI с подписью PDA vault.
- Минимальное количество выходных токенов защищает vault от недопустимого результата обмена.
- При отклонении swap изменения состояния транзакции отменяются.
- Пока Vault B содержит токены стратегии, депозит и вывод временно заблокированы.
- После полного обратного обмена B → A внутренний учёт восстанавливается.
- Перевод токенов пользователя подписывает сам пользователь.
- Проверки seeds и bump, `has_one = admin` для паузы, ограничения владельца карточки.
- Арифметика через `checked_*` и `u128`, чтобы не было переполнения.
- Не публиковать в GitHub: `id.json`, `*-keypair.json`, seed-фразы.

## 10. Частые ошибки

| Ошибка | Причина | Решение |
|---|---|---|
| `Insufficient funds` | Мало тестовых SOL | Пополнить через faucet |
| `AccountNotInitialized` | Программа не развёрнута или нет карточки | `anchor build`, `anchor deploy`, затем `create_user_card` |
| `already in use` | Карточка уже существует | Ожидаемо: карточка одна на пользователя |
| `VaultPaused` | Включена пауза | Администратор вызывает `set_paused(false)` |
| `ZeroAmount` | `amount = 0` | Вносить сумму больше нуля |
| `SharesTooSmall` | Депозит слишком мал | Увеличить сумму |
| `CardNotEmpty` | На карточке есть депозит | Сначала вывести все shares через `withdraw` |
| `InsufficientShares` | Вывод больше, чем shares на карточке | Уменьшить сумму |
| `WithdrawTooSmall` | За эти shares получилось бы 0 токенов | Увеличить сумму |
| `429 Too Many Requests` | Лимит публичного RPC | Подождать: клиент сам повторяет запросы |
| `DeclaredProgramIdMismatch` (4100) | В задеплоенном бинарнике другой ID, чем адрес программы | `anchor keys sync`, `anchor build`, `anchor deploy` |
## Week 12 — Raydium CLMM swap (Devnet)

Реализация подготовлена для пула недели 11. `initialize_strategy` создаёт второй SPL token account с authority vault PDA. `swap` проверяет администратора, фиксированные адреса пула и программы, mint и authority хранилищ. CPI `swap_v2` подписывается seeds `vault`, mint A, bump. Клиент рассчитывает quote и минимум 99% от ожидаемого выхода. Обратный обмен B → A поддерживается.

Используется локальный ABI-адаптер `raydium_swap.rs` вместо прямой Rust-зависимости Raydium: официальный CPI example использует Anchor 0.29, проект — 0.31.1. Порядок аккаунтов и аргументов взят из официального `proxy_swap.rs`. Это отклонение от буквального требования подключить библиотеку; согласуйте с преподавателем. Существующая зависимость Raydium SDK V2 используется для quote.

Учебное ограничение: `total_tokens == u64::MAX` означает активную стратегию (не баланс). Депозиты и вывод блокируются до полного обратного обмена B → A; затем учёт синхронизируется с балансом A. Размер VaultState не изменён. Для недели 13 рекомендуется заменить sentinel отдельным состоянием стратегии и учитывать открытую LP-позицию. Не использовать в mainnet.

Фактические транзакции добавляются командой `yarn week12:report` после исполнения в Devnet. До этого результаты не подтверждены.


<!-- WEEK12_EVIDENCE_START -->
### Week 12 — фактические результаты Devnet

- Vault: 8BhjDWjuCJ1XbMKssyjx59B53rufTZh99PQpHziDhZjG
- Token A storage: J2XXhFpWZG9p5NuUhg82AiLCuh9PYLtgT4AKGNsZEaPx
- Token B storage: HbkscEwZMdVzDsLYyU27FpAjmsuWLPQcs9FyqkXpySpD
- Успешный swap: https://explorer.solana.com/tx/4usG7Ckv1VkSY6z5DKnR3H2W5v4NPhufPtYngzT7PhDQWSeXbCGwARZFfSa5YEayeUjWfBCm1dp4DEzSAVcYQRk7?cluster=devnet
- Отклонённый swap (slippage): https://explorer.solana.com/tx/5hSJwYJeYj7xpDqzZ4J3LHewbAYtKUN3FmcpFA6A6dtsiEU4emyvN2CRMk4ChP3vw3zHL2hAeeNUhZ8f5a426Mrn?cluster=devnet
- Цена пула до: 1; после: 0.9999065130238968 (в порядке mintA/mintB Raydium).
- Балансы до (raw): A=100000000, B=0; после: A=90000000, B=9974533.
- Ожидаемый выход: 9974533; минимальный: 9874787 (raw).
- При отклонении балансы vault не изменились; комиссия сети может быть списана.
- Обратный обмен: https://explorer.solana.com/tx/4BxHNUPn4MJ6gi77kfmJ5bpdsSACTU8nu7Zu7HiBjxUSCCxCQik3mJGJ5iRxuYhiiB4qhw99erq69nfYoik6e8Ht?cluster=devnet

<!-- WEEK12_EVIDENCE_END -->

### Дополнительные результаты тестирования Week 12

Дата тестирования: 25 ноября 2026 года.

Сеть: Solana Devnet.

Версия Anchor: 0.31.1.

#### Результаты операций

Все значения токенов и shares в таблице приведены с учётом 6 decimals.

| Операция | Vault A | Vault B | Total Shares | Цена пула |
|---|---:|---:|---:|---:|
| Initialization | 0 | 0 | 0 | 1 |
| Deposit | 100 | 0 | 100 | 1 |
| Swap A → B | 90 | 9.974533 | 100 | 0.9999065130238968 |
| Rejected Swap | 90 | 9.974533 | 100 | 0.9999065130238968 |
| Reverse Swap B → A | 99.950062 | 0 | 100 | 0.9999997662640966 |
| Withdraw | 98.950562 | 0 | 99 | 0.9999997662640966 |

#### Проверка CPI

В логах успешной транзакции подтверждена следующая последовательность вызовов:

1. Simple Vault Program — invoke [1].
2. Raydium CLMM Program, инструкция SwapV2 — invoke [2].
3. SPL Token Program — invoke [3].

Обмен 10 Token A вернул 9.974533 Token B при минимально допустимом результате 9.874787 Token B.

Программа Simple Vault использовала 76 096 Compute Units, из которых 46 508 CU пришлось на вызов Raydium CLMM.

#### Проверка Slippage Protection

Для отрицательного теста использовался обмен 1 Token A с намеренно недостижимым минимальным выходом `u64::MAX`.

Raydium вернул ошибку:

- Error Code: TooLittleOutputReceived.
- Error Number: 6018.
- Custom Program Error: 0x1782.

После отклонения транзакции балансы обоих хранилищ и цена пула остались неизменными. Это подтверждает атомарность операции. Сетевая комиссия составила 0.000005 SOL.

#### Обратный обмен и восстановление учёта

Весь баланс Vault B (9.974533 Token B) был обменян обратно на 9.950062 Token A.

После обратного обмена:

- Vault A: 99.950062 Token A.
- Vault B: 0 Token B.
- Total Tokens: 99.950062.
- Total Shares: 100.
- Блокировка стратегии снята.

Совокупная потеря при двойном обмене составила 0.049938 Token A, или 0.049938% первоначального депозита.

#### Проверка Withdraw

После завершения стратегии выполнено погашение одной доли.

Пользователь получил 0.999500 Token A с учётом округления вниз.

Итоговое состояние хранилища:

- Total Tokens: 98.950562.
- Total Shares: 99.
- Vault B: 0.

Таким образом, возможность вывода средств после завершения стратегии подтверждена практической транзакцией.

#### Дополнительные транзакции Solana Explorer

- [Обновление программы Week 12](https://explorer.solana.com/tx/2tJYme9ue4E1Yh1jHhA8hp2y7yNe6zX1W915i8ya4PcyeWe3DgRJNVa2nrpmKcpCLs5kKF4QbEhdiL3k35ydBcrn?cluster=devnet)
- [Deposit 100 Token A](https://explorer.solana.com/tx/5FjFgt1wjgvrVrnsvam8KzAxytADFiLvr1FoJSnLRiAqbihsrbiuuwqH5urgjX75L6ewPfK4zSRjCxKStdr5TNCi?cluster=devnet)
- [Withdraw после завершения стратегии](https://explorer.solana.com/tx/2Gd1BtcZaVGZoFjwuLAr7b3WLEL5PsGkHGmfDr7fcHJWVtgVAPSbLPekXxHsk3qj2KaZVPQTnsdP8KPWomMQvaKW?cluster=devnet)

#### Ограничения учебной реализации

Для интеграции Raydium используется локальный ABI-адаптер `raydium_swap.rs`. Его работоспособность подтверждена транзакциями Devnet.

Для временной блокировки операций используется специальное значение `total_tokens = u64::MAX`. В дальнейшем необходимо выделить отдельное состояние стратегии и реализовать полноценный учёт стоимости активов.

Отдельный отрицательный тест вызова swap неавторизованным пользователем не проводился.

Реализация предназначена для учебного использования в Devnet и не рекомендуется для Mainnet без дополнительного тестирования и аудита безопасности.

#### Заключение

В рамках Week 12 реализован и практически проверен обмен токенов между хранилищами Simple Vault через Raydium CLMM CPI. Подтверждены успешный обмен, изменение цены пула, защита от недопустимого slippage, атомарность отклонённой транзакции, обратный обмен и восстановление учёта хранилища.