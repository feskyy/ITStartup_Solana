use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};

// Твой Program ID из недели 8 (не меняй, иначе не сможешь обновить программу в devnet).
declare_id!("AQ1t23jJHzxzT1YR1n5ygPeamaEjg3kEYG7tyitDyapm");

#[program]
pub mod simple_vault {
    use super::*;

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
    /// (иначе пропадёт учёт доли пользователя).
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
        require!(amount > 0, VaultError::ZeroAmount);

        // Во время паузы депозиты запрещены.
        require!(
            !ctx.accounts.vault_state.paused,
            VaultError::VaultPaused
        );

        let vault = &ctx.accounts.vault_state;

        // Шаг 1. Сколько shares положено пользователю.
        let shares = if vault.total_shares == 0 || vault.total_tokens == 0 {
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
}

// -----------------------------------------------------------------------------
// Accounts
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// State
// -----------------------------------------------------------------------------

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
}
