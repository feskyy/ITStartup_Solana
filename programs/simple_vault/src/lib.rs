use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};

mod raydium_swap;
use raydium_swap::*;

mod raydium_position;
use raydium_position::OpenPositionArgs;

declare_id!("AQ1t23jJHzxzT1YR1n5ygPeamaEjg3kEYG7tyitDyapm");
#[program]
pub mod simple_vault {
    use super::*;

    pub fn open_position<'info>(ctx: Context<'_, '_, '_, 'info, PositionAction<'info>>, args: OpenPositionArgs) -> Result<()> {
        let a = ctx.accounts;
        require!(!a.strategy_state.in_market, VaultError::PositionAlreadyOpen);
        require!(!a.strategy_state.needs_sync, VaultError::InvalidStrategy);
        require!(a.vault_state.total_shares > 0 && !a.vault_state.paused, VaultError::InvalidStrategy);
        let r = ctx.remaining_accounts;
        require!(r.len() == 22 || r.len() == 23, VaultError::InvalidStrategy);
        require_keys_eq!(r[0].key(), a.admin.key(), VaultError::Unauthorized);
        require_keys_eq!(r[1].key(), a.vault_state.key(), VaultError::InvalidStrategy);
        let (first, second) = position_vault_order(a, &r[10], &r[11])?;
        require_keys_eq!(r[20].key(), first.mint, VaultError::InvalidStrategy);
        require_keys_eq!(r[21].key(), second.mint, VaultError::InvalidStrategy);
        require_keys_eq!(r[16].key(), a.token_program.key(), VaultError::InvalidStrategy);
        require!(args.amount_max_a > 0 && args.amount_max_b > 0 && args.amount_max_a <= first.amount && args.amount_max_b <= second.amount, VaultError::InvalidStrategy);
        let nft = r[2].key();
        let personal = Pubkey::find_program_address(&[b"position", nft.as_ref()], &raydium_position::RAYDIUM_CLMM).0;
        require_keys_eq!(r[9].key(), personal, VaultError::InvalidStrategy);
        let mint = a.vault_state.token_mint;
        let bump = [a.vault_state.bump];
        let seeds: &[&[u8]] = &[b"vault", mint.as_ref(), &bump];
        let signer = &[seeds];
        // Временное разрешение payer списать только заданный максимум.
        for (account, amount) in [(first, args.amount_max_a), (second, args.amount_max_b)] {
            token::approve(CpiContext::new_with_signer(a.token_program.to_account_info(), token::Approve {
                to: account.to_account_info(), delegate: a.admin.to_account_info(), authority: a.vault_state.to_account_info(),
            }, signer), amount)?;
        }
        raydium_position::open_position_cpi(&a.clmm_program.to_account_info(), r, &args, signer)?;
        for account in [first, second] {
            token::revoke(CpiContext::new_with_signer(a.token_program.to_account_info(), token::Revoke {
                source: account.to_account_info(), authority: a.vault_state.to_account_info(),
            }, signer))?;
        }
        check_position_nft(&r[3], a.vault_state.key(), nft)?;
        require!(position_liquidity(&r[9], nft)? > 0, VaultError::InvalidStrategy);
        a.strategy_state.in_market = true;
        a.strategy_state.needs_sync = true;
        a.strategy_state.position_nft_mint = nft;
        a.strategy_state.personal_position = personal;
        a.strategy_state.tick_lower = args.tick_lower;
        a.strategy_state.tick_upper = args.tick_upper;
        a.vault_state.total_tokens = STRATEGY_LOCK;
        Ok(())
    }

    pub fn collect_fees<'info>(ctx: Context<'_, '_, '_, 'info, PositionAction<'info>>) -> Result<()> {
        decrease_position_checked(ctx.accounts, ctx.remaining_accounts, false, 0, 0)
    }

    pub fn close_position<'info>(ctx: Context<'_, '_, '_, 'info, PositionAction<'info>>, min_a: u64, min_b: u64) -> Result<()> {
        let a = ctx.accounts;
        require!(min_a > 0 || min_b > 0, VaultError::ZeroAmount);
        decrease_position_checked(a, ctx.remaining_accounts, true, min_a, min_b)?;
        let r = ctx.remaining_accounts;
        // NFT mint и System Program передаются последними двумя аккаунтами.
        let n = r.len();
        require_keys_eq!(r[n-2].key(), a.strategy_state.position_nft_mint, VaultError::InvalidStrategy);
        require_keys_eq!(r[n-1].key(), anchor_lang::system_program::ID, VaultError::InvalidStrategy);
        let mint = a.vault_state.token_mint;
        let bump = [a.vault_state.bump];
        let seeds: &[&[u8]] = &[b"vault", mint.as_ref(), &bump];
        let accounts = [a.vault_state.to_account_info(), r[n-2].clone(), r[1].clone(), r[2].clone(), r[n-1].clone(), a.token_program.to_account_info()];
        raydium_position::close_position_cpi(&a.clmm_program.to_account_info(), &accounts, &[seeds])?;
        a.strategy_state.in_market = false;
        a.strategy_state.position_nft_mint = Pubkey::default();
        a.strategy_state.personal_position = Pubkey::default();
        a.strategy_state.tick_lower = 0;
        a.strategy_state.tick_upper = 0;
        Ok(())
    }

    pub fn sync_vault(ctx: Context<PositionAction>) -> Result<()> {
        let a = ctx.accounts;
        require!(!a.strategy_state.in_market && a.strategy_state.needs_sync && a.vault_b.amount == 0, VaultError::InvalidStrategy);
        a.vault_state.total_tokens = a.vault_a.amount;
        a.strategy_state.needs_sync = false;
        Ok(())
    }

    /// Неделя 13: инициализация состояния LP-стратегии.
    pub fn initialize_position_strategy(
        ctx: Context<InitializePositionStrategy>,
    ) -> Result<()> {
        let strategy = &mut ctx.accounts.strategy_state;
        strategy.vault = ctx.accounts.vault_state.key();
        strategy.in_market = false;
        strategy.needs_sync = false;
        strategy.position_nft_mint = Pubkey::default();
        strategy.personal_position = Pubkey::default();
        strategy.tick_lower = 0;
        strategy.tick_upper = 0;
        strategy.bump = ctx.bumps.strategy_state;
        msg!("Position strategy initialized");
        msg!("Vault: {}", strategy.vault);
        Ok(())
    }


    pub fn initialize_strategy(ctx: Context<InitializeStrategy>) -> Result<()> {
        raydium_swap::initialize(ctx)
    }

    pub fn swap<'info>(ctx: Context<'_, '_, '_, 'info, SwapVault<'info>>, amount_in: u64, minimum_amount_out: u64, a_to_b: bool) -> Result<()> {
        require!(!ctx.accounts.strategy_state.in_market, VaultError::StrategyLocked);
        raydium_swap::execute(ctx, amount_in, minimum_amount_out, a_to_b)
    }

    /// Создать vault для конкретного SPL-токена.
    /// Создаёт VaultState PDA, vault_token_account PDA, share_mint PDA.
    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        let vault = &mut ctx.accounts.vault_state;

        vault.admin = ctx.accounts.admin.key();
        vault.token_mint = ctx.accounts.token_mint.key();
        vault.vault_token_account = ctx.accounts.vault_token_account.key();
        vault.share_mint = ctx.accounts.share_mint.key();
        vault.total_tokens = 0; // неделя 9
        vault.total_shares = 0; // неделя 9
        vault.bump = ctx.bumps.vault_state;

        // Неделя 8: по умолчанию vault не на паузе.
        vault.paused = false;

        msg!("Vault initialized for mint: {}", vault.token_mint);
        msg!("Vault paused: {}", vault.paused);

        Ok(())
    }

    /// Создать личную карточку пользователя в vault.
    /// Один пользователь может иметь одну карточку в каждом vault.
    pub fn create_user_card(ctx: Context<CreateUserCard>) -> Result<()> {
        // Неделя 8: запрещаем создание при включённой паузе.
        require!(
            !ctx.accounts.vault_state.paused,
            VaultError::VaultPaused
        );

        let card = &mut ctx.accounts.user_card;

        card.vault = ctx.accounts.vault_state.key();
        card.owner = ctx.accounts.user.key();
        card.deposited = 0; // неделя 9
        card.shares = 0; // неделя 9
        card.bump = ctx.bumps.user_card;

        // Неделя 8: время создания карточки.
        card.created_at = Clock::get()?.unix_timestamp;

        msg!("User card created for: {}", card.owner);
        msg!("Created at: {}", card.created_at);

        Ok(())
    }

    /// Неделя 8: закрыть свою карточку и вернуть ренту.
    /// Карточку может закрыть только её владелец.
    /// Закрытие разрешено даже во время паузы.
    /// Неделя 9: нельзя закрыть карточку, на которой есть депозит или shares
    /// (иначе пропадёт учёт доли пользователя). Чтобы закрыть — сначала `withdraw` (неделя 10).
    pub fn close_user_card(ctx: Context<CloseUserCard>) -> Result<()> {
        msg!("User card closed by: {}", ctx.accounts.user.key());

        // Anchor сам закрывает аккаунт благодаря close = user.
        Ok(())
    }

    /// Неделя 8: включить или выключить паузу. Только администратор.
    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        let vault = &mut ctx.accounts.vault_state;

        vault.paused = paused;

        msg!("Vault paused status changed to: {}", paused);
        msg!("Changed by admin: {}", ctx.accounts.admin.key());

        Ok(())
    }

    /// Неделя 9: пользователь вносит `amount` токенов и получает share-токены.
    ///
    /// Формула:
    ///   Первый депозит:       shares = amount (1:1)
    ///   Последующие депозиты: shares = amount * total_shares / total_tokens
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(ctx.accounts.vault_state.total_tokens != STRATEGY_LOCK, VaultError::StrategyLocked);
        require!(amount > 0, VaultError::ZeroAmount);

        // Во время паузы депозиты запрещены.
        require!(
            !ctx.accounts.vault_state.paused,
            VaultError::VaultPaused
        );

        let vault = &ctx.accounts.vault_state;

        // Шаг 1. Сколько shares положено пользователю.
        require!(vault.total_shares == 0 || vault.total_tokens > 0, VaultError::InvalidStrategy);
        let shares = if vault.total_shares == 0 {
            amount // первый депозит: 1 share = 1 token
        } else {
            (amount as u128)
                .checked_mul(vault.total_shares as u128)
                .and_then(|v| v.checked_div(vault.total_tokens as u128))
                .and_then(|v| u64::try_from(v).ok())
                .ok_or(VaultError::MathOverflow)?
        };
        require!(shares > 0, VaultError::SharesTooSmall);

        // Шаг 2. Переводим токены: пользователь -> vault (подписывает пользователь).
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.vault_token_account.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
        )?;

        // Шаг 3. Выпускаем shares пользователю (подписывает PDA vault).
        let token_mint_key = ctx.accounts.vault_state.token_mint;
        let seeds = &[
            b"vault".as_ref(),
            token_mint_key.as_ref(),
            &[ctx.accounts.vault_state.bump],
        ];
        let signer = &[&seeds[..]];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.share_mint.to_account_info(),
                    to: ctx.accounts.user_share_account.to_account_info(),
                    authority: ctx.accounts.vault_state.to_account_info(),
                },
                signer,
            ),
            shares,
        )?;

        // Шаг 4. Обновляем учёт: vault и карточка пользователя.
        let vault = &mut ctx.accounts.vault_state;
        vault.total_tokens = vault
            .total_tokens
            .checked_add(amount)
            .ok_or(VaultError::MathOverflow)?;
        vault.total_shares = vault
            .total_shares
            .checked_add(shares)
            .ok_or(VaultError::MathOverflow)?;

        let card = &mut ctx.accounts.user_card;
        card.deposited = card
            .deposited
            .checked_add(amount)
            .ok_or(VaultError::MathOverflow)?;
        card.shares = card
            .shares
            .checked_add(shares)
            .ok_or(VaultError::MathOverflow)?;

        msg!(
            "Deposit: {} tokens -> {} shares (total_tokens={}, total_shares={})",
            amount,
            shares,
            vault.total_tokens,
            vault.total_shares
        );
        Ok(())
    }

    /// Неделя 10: пользователь возвращает `shares` share-токенов и забирает свои токены.
    ///
    /// Формула (округление ВНИЗ, чтобы vault никогда не отдал больше положенного):
    ///   tokens = shares * total_tokens / total_shares
    ///
    /// Два вызова Token Program (CPI):
    ///   1) burn      — сжигаем shares пользователя, подписывает ПОЛЬЗОВАТЕЛЬ;
    ///   2) transfer  — отдаём токены из хранилища, подписывает ПРОГРАММА от имени PDA vault.
    ///
    /// Решение: вывод разрешён и на паузе — пользователь всегда может забрать свои деньги.
    pub fn withdraw(ctx: Context<Withdraw>, shares: u64) -> Result<()> {
        require!(ctx.accounts.vault_state.total_tokens != STRATEGY_LOCK, VaultError::StrategyLocked);
        require!(shares > 0, VaultError::ZeroAmount);

        // Нельзя вывести больше shares, чем записано на карточке пользователя.
        require!(
            shares <= ctx.accounts.user_card.shares,
            VaultError::InsufficientShares
        );

        let vault = &ctx.accounts.vault_state;
        require!(vault.total_shares > 0, VaultError::MathOverflow);

        // Шаг 1. Сколько токенов положено за эти shares.
        let tokens = (shares as u128)
            .checked_mul(vault.total_tokens as u128)
            .and_then(|v| v.checked_div(vault.total_shares as u128))
            .and_then(|v| u64::try_from(v).ok())
            .ok_or(VaultError::MathOverflow)?;
        require!(tokens > 0, VaultError::WithdrawTooSmall);

        // Шаг 2. Сколько списать из поля `deposited` карточки — пропорционально выводу.
        // Если выводим ВСЕ shares карточки, deposited обнулится точно, и карточку можно закрыть.
        let deposited_part = (ctx.accounts.user_card.deposited as u128)
            .checked_mul(shares as u128)
            .and_then(|v| v.checked_div(ctx.accounts.user_card.shares as u128))
            .and_then(|v| u64::try_from(v).ok())
            .ok_or(VaultError::MathOverflow)?;

        // Шаг 3. Сжигаем shares пользователя (подписывает пользователь).
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.share_mint.to_account_info(),
                    from: ctx.accounts.user_share_account.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            shares,
        )?;

        // Шаг 4. Отдаём токены пользователю (подписывает PDA vault).
        let token_mint_key = ctx.accounts.vault_state.token_mint;
        let seeds = &[
            b"vault".as_ref(),
            token_mint_key.as_ref(),
            &[ctx.accounts.vault_state.bump],
        ];
        let signer = &[&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_token_account.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.vault_state.to_account_info(),
                },
                signer,
            ),
            tokens,
        )?;

        // Шаг 5. Обновляем учёт: vault и карточка пользователя.
        let vault = &mut ctx.accounts.vault_state;
        vault.total_tokens = vault
            .total_tokens
            .checked_sub(tokens)
            .ok_or(VaultError::MathOverflow)?;
        vault.total_shares = vault
            .total_shares
            .checked_sub(shares)
            .ok_or(VaultError::MathOverflow)?;

        let card = &mut ctx.accounts.user_card;
        card.shares = card
            .shares
            .checked_sub(shares)
            .ok_or(VaultError::MathOverflow)?;
        card.deposited = card
            .deposited
            .checked_sub(deposited_part)
            .ok_or(VaultError::MathOverflow)?;

        msg!(
            "Withdraw: {} shares -> {} tokens (total_tokens={}, total_shares={})",
            shares,
            tokens,
            vault.total_tokens,
            vault.total_shares
        );
        Ok(())
    }
}

// -----------------------------------------------------------------------------
// Accounts
// -----------------------------------------------------------------------------

#[derive(Accounts)]
pub struct PositionAction<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(mut, seeds=[b"vault", vault_state.token_mint.as_ref()], bump=vault_state.bump,
        has_one=admin, constraint=vault_state.token_mint == anchor_lang::solana_program::pubkey!("CCRTcoXihFnKNXepJk2eCA87qJNz8HWSgVMV19ctT1r") @ VaultError::InvalidStrategy)]
    pub vault_state: Account<'info, VaultState>,
    #[account(mut, seeds=[b"position_strategy", vault_state.key().as_ref()], bump=strategy_state.bump,
        constraint=strategy_state.vault == vault_state.key() @ VaultError::InvalidStrategy)]
    pub strategy_state: Account<'info, StrategyState>,
    #[account(mut, address=vault_state.vault_token_account, token::authority=vault_state,
        constraint=vault_a.mint == vault_state.token_mint @ VaultError::InvalidStrategy)]
    pub vault_a: Account<'info, TokenAccount>,
    #[account(mut, seeds=[b"vault_tokens_b", vault_state.key().as_ref()], bump, token::authority=vault_state,
        constraint=vault_b.mint == anchor_lang::solana_program::pubkey!("A2dsMy371WJkZyuVBWUg9BscPz9SRcDG8f77C5YUDXX5") @ VaultError::InvalidStrategy)]
    pub vault_b: Account<'info, TokenAccount>,
    /// CHECK: pinned executable Raydium program.
    #[account(address=raydium_position::RAYDIUM_CLMM, executable)]
    pub clmm_program: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

fn position_vault_order<'a, 'info>(a: &'a PositionAction<'info>, first: &AccountInfo<'info>, second: &AccountInfo<'info>) -> Result<(&'a Account<'info, TokenAccount>, &'a Account<'info, TokenAccount>)> {
    if first.key() == a.vault_a.key() && second.key() == a.vault_b.key() { Ok((&a.vault_a, &a.vault_b)) }
    else if first.key() == a.vault_b.key() && second.key() == a.vault_a.key() { Ok((&a.vault_b, &a.vault_a)) }
    else { err!(VaultError::InvalidStrategy) }
}

fn check_position_nft(info: &AccountInfo, owner: Pubkey, mint: Pubkey) -> Result<()> {
    require_keys_eq!(*info.owner, token::ID, VaultError::InvalidStrategy);
    let data = info.try_borrow_data()?;
    let nft = TokenAccount::try_deserialize(&mut &data[..])?;
    require!(nft.owner == owner && nft.mint == mint && nft.amount == 1, VaultError::InvalidStrategy);
    Ok(())
}

fn position_liquidity(info: &AccountInfo, nft: Pubkey) -> Result<u128> {
    require_keys_eq!(*info.owner, raydium_position::RAYDIUM_CLMM, VaultError::InvalidStrategy);
    let data = info.try_borrow_data()?;
    require!(data.len() >= 97, VaultError::InvalidStrategy);
    require!(data[9..41] == nft.to_bytes() && data[41..73] == raydium_position::POSITION_POOL.to_bytes(), VaultError::InvalidStrategy);
    let bytes: [u8; 16] = data[81..97].try_into().map_err(|_| VaultError::InvalidStrategy)?;
    Ok(u128::from_le_bytes(bytes))
}

fn decrease_position_checked<'info>(a: &mut PositionAction<'info>, r: &[AccountInfo<'info>], closing: bool, min_a: u64, min_b: u64) -> Result<()> {
    require!(a.strategy_state.in_market, VaultError::InvalidStrategy);
    let count = if closing { r.len().checked_sub(2).ok_or(VaultError::InvalidStrategy)? } else { r.len() };
    require!(count == 16 || count == 17, VaultError::InvalidStrategy);
    require_keys_eq!(r[0].key(), a.vault_state.key(), VaultError::InvalidStrategy);
    require_keys_eq!(r[2].key(), a.strategy_state.personal_position, VaultError::InvalidStrategy);
    check_position_nft(&r[1], a.vault_state.key(), a.strategy_state.position_nft_mint)?;
    let (first, second) = position_vault_order(a, &r[9], &r[10])?;
    require_keys_eq!(r[14].key(), first.mint, VaultError::InvalidStrategy);
    require_keys_eq!(r[15].key(), second.mint, VaultError::InvalidStrategy);
    require_keys_eq!(r[11].key(), a.token_program.key(), VaultError::InvalidStrategy);
    let liquidity = position_liquidity(&r[2], a.strategy_state.position_nft_mint)?;
    let mint = a.vault_state.token_mint;
    let bump = [a.vault_state.bump];
    let seeds: &[&[u8]] = &[b"vault", mint.as_ref(), &bump];
    let args = raydium_position::DecreasePositionArgs { liquidity: if closing { liquidity } else { 0 }, amount_min_a: min_a, amount_min_b: min_b };
    raydium_position::decrease_position_cpi(&a.clmm_program.to_account_info(), &r[..count], &args, &[seeds])?;
    if closing { require!(position_liquidity(&r[2], a.strategy_state.position_nft_mint)? == 0, VaultError::InvalidStrategy); }
    Ok(())
}

#[derive(Accounts)]
pub struct InitializePositionStrategy<'info> {
    #[account(
        seeds = [b"vault", vault_state.token_mint.as_ref()],
        bump = vault_state.bump,
        has_one = admin @ VaultError::Unauthorized,
    )]
    pub vault_state: Account<'info, VaultState>,

    #[account(
        init,
        payer = admin,
        space = StrategyState::LEN,
        seeds = [b"position_strategy", vault_state.key().as_ref()],
        bump,
    )]
    pub strategy_state: Account<'info, StrategyState>,

    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    /// VaultState PDA — seeds: ["vault", token_mint]
    #[account(
        init,
        payer = admin,
        space = VaultState::LEN,
        seeds = [b"vault", token_mint.key().as_ref()],
        bump,
    )]
    pub vault_state: Account<'info, VaultState>,

    /// Token account, принадлежащий vault PDA.
    #[account(
        init,
        payer = admin,
        token::mint = token_mint,
        token::authority = vault_state,
        seeds = [b"vault_tokens", token_mint.key().as_ref()],
        bump,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// Mint для shares — выпускается vault PDA.
    #[account(
        init,
        payer = admin,
        mint::decimals = 6,
        mint::authority = vault_state,
        seeds = [b"share_mint", token_mint.key().as_ref()],
        bump,
    )]
    pub share_mint: Account<'info, Mint>,

    /// SPL-токен, который принимает vault.
    pub token_mint: Account<'info, Mint>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct CreateUserCard<'info> {
    #[account(
        seeds = [b"vault", vault_state.token_mint.as_ref()],
        bump = vault_state.bump,
    )]
    pub vault_state: Account<'info, VaultState>,

    /// UserCard PDA — seeds: ["user_card", vault_state, user]
    #[account(
        init,
        payer = user,
        space = UserCard::LEN,
        seeds = [b"user_card", vault_state.key().as_ref(), user.key().as_ref()],
        bump,
    )]
    pub user_card: Account<'info, UserCard>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseUserCard<'info> {
    /// Проверяем, что vault является корректным PDA.
    #[account(
        seeds = [b"vault", vault_state.token_mint.as_ref()],
        bump = vault_state.bump,
    )]
    pub vault_state: Account<'info, VaultState>,

    /// Закрыть можно только свою карточку, и только пустую (без депозита и shares).
    #[account(
        mut,
        close = user,
        seeds = [b"user_card", vault_state.key().as_ref(), user.key().as_ref()],
        bump = user_card.bump,
        constraint = user_card.owner == user.key()
            @ VaultError::Unauthorized,
        constraint = user_card.vault == vault_state.key()
            @ VaultError::InvalidVault,
        constraint = user_card.deposited == 0 && user_card.shares == 0
            @ VaultError::CardNotEmpty,
    )]
    pub user_card: Account<'info, UserCard>,

    /// Владелец подтверждает закрытие подписью, рента возвращается ему.
    #[account(mut)]
    pub user: Signer<'info>,
}

#[derive(Accounts)]
pub struct SetPaused<'info> {
    /// Только сохранённый администратор может менять паузу.
    #[account(
        mut,
        seeds = [b"vault", vault_state.token_mint.as_ref()],
        bump = vault_state.bump,
        has_one = admin @ VaultError::Unauthorized,
    )]
    pub vault_state: Account<'info, VaultState>,

    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault_state.token_mint.as_ref()],
        bump = vault_state.bump,
    )]
    pub vault_state: Account<'info, VaultState>,

    /// Карточка пользователя — депозит возможен только после create_user_card.
    #[account(
        mut,
        seeds = [b"user_card", vault_state.key().as_ref(), user.key().as_ref()],
        bump = user_card.bump,
    )]
    pub user_card: Account<'info, UserCard>,

    /// Токен-аккаунт vault — принимает токены.
    #[account(
        mut,
        seeds = [b"vault_tokens", vault_state.token_mint.as_ref()],
        bump,
        token::mint = vault_state.token_mint,
        token::authority = vault_state,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// Share mint — vault печатает shares.
    #[account(
        mut,
        seeds = [b"share_mint", vault_state.token_mint.as_ref()],
        bump,
        mint::authority = vault_state,
    )]
    pub share_mint: Account<'info, Mint>,

    /// Токен-аккаунт пользователя (откуда списываем токены).
    #[account(
        mut,
        token::mint = vault_state.token_mint,
        token::authority = user,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    /// Share-аккаунт пользователя (куда придут shares).
    #[account(
        mut,
        token::mint = share_mint,
        token::authority = user,
    )]
    pub user_share_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault_state.token_mint.as_ref()],
        bump = vault_state.bump,
    )]
    pub vault_state: Account<'info, VaultState>,

    /// Карточка пользователя: seeds включают подпись user, поэтому чужую карточку не подставить.
    #[account(
        mut,
        seeds = [b"user_card", vault_state.key().as_ref(), user.key().as_ref()],
        bump = user_card.bump,
    )]
    pub user_card: Account<'info, UserCard>,

    /// Токен-аккаунт vault — отсюда уходят токены.
    #[account(
        mut,
        seeds = [b"vault_tokens", vault_state.token_mint.as_ref()],
        bump,
        token::mint = vault_state.token_mint,
        token::authority = vault_state,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// Share mint — у него уменьшится supply при сжигании.
    #[account(
        mut,
        seeds = [b"share_mint", vault_state.token_mint.as_ref()],
        bump,
        mint::authority = vault_state,
    )]
    pub share_mint: Account<'info, Mint>,

    /// Токен-аккаунт пользователя (куда придут токены).
    #[account(
        mut,
        token::mint = vault_state.token_mint,
        token::authority = user,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    /// Share-аккаунт пользователя (откуда сжигаем shares).
    #[account(
        mut,
        token::mint = share_mint,
        token::authority = user,
    )]
    pub user_share_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

// -----------------------------------------------------------------------------
// State
// -----------------------------------------------------------------------------

/// Неделя 13: отдельный PDA состояния стратегии Raydium CLMM.
#[account]
#[derive(Default)]
pub struct StrategyState {
    pub vault: Pubkey,
    pub in_market: bool,
    pub needs_sync: bool,
    pub position_nft_mint: Pubkey,
    pub personal_position: Pubkey,
    pub tick_lower: i32,
    pub tick_upper: i32,
    pub bump: u8,
}

impl StrategyState {
    pub const LEN: usize = 8 + 32 + 1 + 1 + 32 + 32 + 4 + 4 + 1;
}

#[account]
#[derive(Default)]
pub struct VaultState {
    pub admin: Pubkey,               // 32
    pub token_mint: Pubkey,          // 32
    pub vault_token_account: Pubkey, // 32
    pub share_mint: Pubkey,          // 32
    pub total_tokens: u64,           // 8  — всего токенов в vault (неделя 9)
    pub total_shares: u64,           // 8  — всего выпущено shares (неделя 9)
    pub bump: u8,                    // 1
    pub paused: bool,                // 1  (неделя 8)
}

impl VaultState {
    pub const LEN: usize =
        8    // Anchor discriminator
        + 32 // admin
        + 32 // token_mint
        + 32 // vault_token_account
        + 32 // share_mint
        + 8  // total_tokens
        + 8  // total_shares
        + 1  // bump
        + 1; // paused
}

/// Карточка пользователя в vault.
#[account]
#[derive(Default)]
pub struct UserCard {
    pub vault: Pubkey,   // 32
    pub owner: Pubkey,   // 32
    pub deposited: u64,  // 8 — сколько токенов внёс пользователь (неделя 9)
    pub shares: u64,     // 8 — сколько shares он получил (неделя 9)
    pub bump: u8,        // 1
    pub created_at: i64, // 8 — Unix timestamp создания (неделя 8)
}

impl UserCard {
    pub const LEN: usize =
        8    // Anchor discriminator
        + 32 // vault
        + 32 // owner
        + 8  // deposited
        + 8  // shares
        + 1  // bump
        + 8; // created_at
}

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

#[error_code]
pub enum VaultError {
    #[msg("Vault is paused. This action is disabled.")]
    VaultPaused,

    #[msg("Unauthorized action: only the owner or admin is allowed.")]
    Unauthorized,

    #[msg("User card belongs to a different vault.")]
    InvalidVault,

    #[msg("Amount must be greater than zero")]
    ZeroAmount,

    #[msg("Shares would be zero - deposit too small")]
    SharesTooSmall,

    #[msg("Math overflow")]
    MathOverflow,

    #[msg("User card still has deposited tokens or shares")]
    CardNotEmpty,

    #[msg("Not enough shares on the user card")]
    InsufficientShares,

    #[msg("Shares amount is too small - withdrawal would give 0 tokens")]
    WithdrawTooSmall,
    #[msg("Strategy active: convert B back to A before deposit or withdrawal")]
    StrategyLocked,
    #[msg("Invalid Raydium accounts or strategy state")]
    InvalidStrategy,
    #[msg("Swap output below specified minimum or input not fully spent")]
    InvalidSwapResult,
    #[msg("Position is already open")]
    PositionAlreadyOpen,
}