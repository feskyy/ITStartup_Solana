
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

declare_id!("4J1kR1u9X7ktaAUsBQsJQpfBNmEw7QnmbYns4JGT2gdV");

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
        vault.bump = ctx.bumps.vault_state;

        // Задание 3: по умолчанию vault не на паузе.
        vault.paused = false;

        msg!("Vault initialized for mint: {}", vault.token_mint);
        msg!("Vault paused: {}", vault.paused);

        Ok(())
    }

    /// Создать личную карточку пользователя в vault.
    /// Один пользователь может иметь одну карточку в каждом vault.
    pub fn create_user_card(ctx: Context<CreateUserCard>) -> Result<()> {
        // Задание 3: запрещаем создание при включённой паузе.
        require!(
            !ctx.accounts.vault_state.paused,
            VaultError::VaultPaused
        );

        let card = &mut ctx.accounts.user_card;

        card.vault = ctx.accounts.vault_state.key();
        card.owner = ctx.accounts.user.key();
        card.bump = ctx.bumps.user_card;

        // Задание 1: время создания карточки.
        card.created_at = Clock::get()?.unix_timestamp;

        msg!("User card created for: {}", card.owner);
        msg!("Created at: {}", card.created_at);

        Ok(())
    }

    /// Задание 2: закрыть свою карточку и вернуть ренту.
    /// Карточку может закрыть только её владелец.
    /// Закрытие разрешено даже во время паузы.
    pub fn close_user_card(
        ctx: Context<CloseUserCard>
    ) -> Result<()> {
        msg!(
            "User card closed by: {}",
            ctx.accounts.user.key()
        );

        // Anchor автоматически закрывает аккаунт
        // благодаря close = user в структуре аккаунтов.
        Ok(())
    }

    /// Задание 3: включить или выключить паузу.
    /// Вызывать инструкцию может только администратор vault.
    pub fn set_paused(
        ctx: Context<SetPaused>,
        paused: bool
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault_state;

        vault.paused = paused;

        msg!("Vault paused status changed to: {}", paused);
        msg!("Changed by admin: {}", ctx.accounts.admin.key());

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
        seeds = [
            b"vault",
            token_mint.key().as_ref()
        ],
        bump,
    )]
    pub vault_state: Account<'info, VaultState>,

    /// Token account, принадлежащий vault PDA.
    #[account(
        init,
        payer = admin,
        token::mint = token_mint,
        token::authority = vault_state,
        seeds = [
            b"vault_tokens",
            token_mint.key().as_ref()
        ],
        bump,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// Mint для shares — выпускается vault PDA.
    #[account(
        init,
        payer = admin,
        mint::decimals = 6,
        mint::authority = vault_state,
        seeds = [
            b"share_mint",
            token_mint.key().as_ref()
        ],
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

// -----------------------------------------------------------------------------
// CreateUserCard
// -----------------------------------------------------------------------------

#[derive(Accounts)]
pub struct CreateUserCard<'info> {
    #[account(
        seeds = [
            b"vault",
            vault_state.token_mint.as_ref()
        ],
        bump = vault_state.bump,
    )]
    pub vault_state: Account<'info, VaultState>,

    /// UserCard PDA — seeds: ["user_card", vault_state, user].
    #[account(
        init,
        payer = user,
        space = UserCard::LEN,
        seeds = [
            b"user_card",
            vault_state.key().as_ref(),
            user.key().as_ref()
        ],
        bump,
    )]
    pub user_card: Account<'info, UserCard>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// -----------------------------------------------------------------------------
// Задание 2: CloseUserCard
// -----------------------------------------------------------------------------

#[derive(Accounts)]
pub struct CloseUserCard<'info> {
    /// Проверяем, что vault является корректным PDA.
    #[account(
        seeds = [
            b"vault",
            vault_state.token_mint.as_ref()
        ],
        bump = vault_state.bump,
    )]
    pub vault_state: Account<'info, VaultState>,

    /// Закрыть можно только свою карточку.
    #[account(
        mut,
        close = user,
        seeds = [
            b"user_card",
            vault_state.key().as_ref(),
            user.key().as_ref()
        ],
        bump = user_card.bump,
        constraint = user_card.owner == user.key()
            @ VaultError::Unauthorized,
        constraint = user_card.vault == vault_state.key()
            @ VaultError::InvalidVault,
    )]
    pub user_card: Account<'info, UserCard>,

    /// Владелец подтверждает закрытие подписью.
    /// На его кошелёк возвращаются лампорты.
    #[account(mut)]
    pub user: Signer<'info>,
}

// -----------------------------------------------------------------------------
// Задание 3: SetPaused
// -----------------------------------------------------------------------------

#[derive(Accounts)]
pub struct SetPaused<'info> {
    /// Только сохранённый администратор может менять паузу.
    #[account(
        mut,
        seeds = [
            b"vault",
            vault_state.token_mint.as_ref()
        ],
        bump = vault_state.bump,
        has_one = admin @ VaultError::Unauthorized,
    )]
    pub vault_state: Account<'info, VaultState>,

    pub admin: Signer<'info>,
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
    pub bump: u8,                    // 1

    // Задание 3: флаг паузы.
    pub paused: bool,                // 1
}

impl VaultState {
    pub const LEN: usize =
        8   // Anchor discriminator
        + 32 // admin
        + 32 // token_mint
        + 32 // vault_token_account
        + 32 // share_mint
        + 1  // bump
        + 1; // paused
}

// -----------------------------------------------------------------------------
// UserCard
// -----------------------------------------------------------------------------

/// Карточка пользователя в vault.
#[account]
#[derive(Default)]
pub struct UserCard {
    pub vault: Pubkey, // 32
    pub owner: Pubkey, // 32
    pub bump: u8,      // 1

    // Задание 1: Unix timestamp создания карточки.
    pub created_at: i64, // 8
}

impl UserCard {
    pub const LEN: usize =
        8   // Anchor discriminator
        + 32 // vault
        + 32 // owner
        + 1  // bump
        + 8; // created_at
}

// -----------------------------------------------------------------------------
// Custom Errors
// -----------------------------------------------------------------------------

#[error_code]
pub enum VaultError {
    #[msg("Vault is paused. Creating user cards is disabled.")]
    VaultPaused,

    #[msg("Unauthorized action: only the owner or admin is allowed.")]
    Unauthorized,

    #[msg("User card belongs to a different vault.")]
    InvalidVault,
}
