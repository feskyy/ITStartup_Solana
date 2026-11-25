//! Devnet-only CLMM swap_v2 CPI adapter. ABI: raydium-cpi-example proxy_swap.rs.
use super::*;
use anchor_lang::solana_program::{instruction::{AccountMeta, Instruction}, program::invoke_signed, pubkey};

pub const STRATEGY_LOCK: u64 = u64::MAX;
const RAYDIUM: Pubkey = pubkey!("DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH");
const POOL: Pubkey = pubkey!("4tAPx2mdfGQCWmx3EV4qCkbWK52PbzWVNFpxLkfs25nP");
const CONFIG: Pubkey = pubkey!("CD4aJtX11cqTCAc83nxSPkkh5JW2yjD6uwHeovjqQ1qu");
const MINT_A: Pubkey = pubkey!("CCRTcoXihFnKNXepJk2eCA87qJNz8HWSgVMV19ctT1r");
const MINT_B: Pubkey = pubkey!("A2dsMy371WJkZyuVBWUg9BscPz9SRcDG8f77C5YUDXX5");
const TOKEN_2022: Pubkey = pubkey!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const MEMO: Pubkey = pubkey!("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

#[derive(Accounts)]
pub struct InitializeStrategy<'info> {
    #[account(seeds=[b"vault", vault_state.token_mint.as_ref()], bump=vault_state.bump,
        has_one=admin, constraint=vault_state.token_mint == MINT_A @ VaultError::InvalidStrategy)]
    pub vault_state: Account<'info, VaultState>,
    #[account(mut)] pub admin: Signer<'info>,
    #[account(address=MINT_B)] pub mint_b: Account<'info, Mint>,
    #[account(init, payer=admin, seeds=[b"vault_tokens_b", vault_state.key().as_ref()], bump,
        token::mint=mint_b, token::authority=vault_state)]
    pub vault_b: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
pub fn initialize(_ctx: Context<InitializeStrategy>) -> Result<()> { Ok(()) }

#[derive(Accounts)]
pub struct SwapVault<'info> {
    #[account(seeds=[b"position_strategy", vault_state.key().as_ref()], bump=strategy_state.bump,
        constraint=strategy_state.vault == vault_state.key() @ VaultError::InvalidStrategy)]
    pub strategy_state: Account<'info, StrategyState>,
    pub admin: Signer<'info>,
    #[account(mut, seeds=[b"vault", vault_state.token_mint.as_ref()], bump=vault_state.bump,
        has_one=admin, constraint=vault_state.token_mint == MINT_A @ VaultError::InvalidStrategy)]
    pub vault_state: Account<'info, VaultState>,
    #[account(mut, address=vault_state.vault_token_account, token::mint=mint_a, token::authority=vault_state)]
    pub vault_a: Account<'info, TokenAccount>,
    #[account(mut, seeds=[b"vault_tokens_b", vault_state.key().as_ref()], bump,
        token::mint=mint_b, token::authority=vault_state)]
    pub vault_b: Account<'info, TokenAccount>,
    #[account(address=MINT_A)] pub mint_a: Account<'info, Mint>,
    #[account(address=MINT_B)] pub mint_b: Account<'info, Mint>,
    /// CHECK: pinned executable program.
    #[account(address=RAYDIUM, executable)] pub clmm_program: UncheckedAccount<'info>,
    /// CHECK: pinned Raydium config.
    #[account(address=CONFIG, owner=RAYDIUM)] pub amm_config: UncheckedAccount<'info>,
    /// CHECK: pinned pool; Raydium validates its internal state.
    #[account(mut, address=POOL, owner=RAYDIUM)] pub pool_state: UncheckedAccount<'info>,
    #[account(mut, token::mint=mint_a, constraint=pool_vault_a.owner == POOL)]
    pub pool_vault_a: Account<'info, TokenAccount>,
    #[account(mut, token::mint=mint_b, constraint=pool_vault_b.owner == POOL)]
    pub pool_vault_b: Account<'info, TokenAccount>,
    /// CHECK: Raydium validates observation against pool.
    #[account(mut, owner=RAYDIUM)] pub observation_state: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    /// CHECK: fixed executable Token-2022 program.
    #[account(address=TOKEN_2022, executable)] pub token_program_2022: UncheckedAccount<'info>,
    /// CHECK: fixed executable Memo program.
    #[account(address=MEMO, executable)] pub memo_program: UncheckedAccount<'info>,
}

pub fn execute<'info>(ctx: Context<'_, '_, '_, 'info, SwapVault<'info>>, amount: u64, min_out: u64, a_to_b: bool) -> Result<()> {
    require!(amount > 0 && min_out > 0, VaultError::ZeroAmount);
    require!(ctx.accounts.vault_state.total_shares > 0, VaultError::InvalidStrategy);
    let a = ctx.accounts;
    let before_a = a.vault_a.amount;
    let before_b = a.vault_b.amount;
    let (input, output, pv_in, pv_out, mint_in, mint_out) = if a_to_b {
        (&a.vault_a, &a.vault_b, &a.pool_vault_a, &a.pool_vault_b, &a.mint_a, &a.mint_b)
    } else { (&a.vault_b, &a.vault_a, &a.pool_vault_b, &a.pool_vault_a, &a.mint_b, &a.mint_a) };
    require!(input.amount >= amount, VaultError::InvalidStrategy);
    let infos = vec![a.vault_state.to_account_info(), a.amm_config.to_account_info(), a.pool_state.to_account_info(),
        input.to_account_info(), output.to_account_info(), pv_in.to_account_info(), pv_out.to_account_info(),
        a.observation_state.to_account_info(), a.token_program.to_account_info(), a.token_program_2022.to_account_info(),
        a.memo_program.to_account_info(), mint_in.to_account_info(), mint_out.to_account_info()];
    let mut metas: Vec<AccountMeta> = infos.iter().enumerate().map(|(i, acc)| {
        if (2..=7).contains(&i) { AccountMeta::new(*acc.key, false) }
        else { AccountMeta::new_readonly(*acc.key, i == 0) }
    }).collect();
    let mut infos = infos;
    for acc in ctx.remaining_accounts {
        require_keys_eq!(*acc.owner, RAYDIUM, VaultError::InvalidStrategy);
        metas.push(if acc.is_writable { AccountMeta::new(*acc.key, false) } else { AccountMeta::new_readonly(*acc.key, false) });
        infos.push(acc.clone());
    }
    let mut data = vec![43, 4, 237, 11, 26, 201, 30, 98];
    data.extend_from_slice(&amount.to_le_bytes());
    data.extend_from_slice(&min_out.to_le_bytes());
    data.extend_from_slice(&0u128.to_le_bytes()); // no explicit sqrt price limit
    data.push(1); // exact input
    infos.push(a.clmm_program.to_account_info());
    let bump = [a.vault_state.bump];
    let mint = a.vault_state.token_mint;
    let seeds: &[&[u8]] = &[b"vault", mint.as_ref(), &bump];
    invoke_signed(&Instruction { program_id:RAYDIUM, accounts:metas, data }, &infos, &[seeds])?;
    a.vault_a.reload()?;
    a.vault_b.reload()?;
    let (spent, received) = if a_to_b {
        (before_a.checked_sub(a.vault_a.amount), a.vault_b.amount.checked_sub(before_b))
    } else { (before_b.checked_sub(a.vault_b.amount), a.vault_a.amount.checked_sub(before_a)) };
    require!(spent == Some(amount) && received.unwrap_or(0) >= min_out, VaultError::InvalidSwapResult);
    // Preserve the old account layout. Sentinel blocks deposits AND withdrawals until B is zero.
    a.vault_state.total_tokens = if a.vault_b.amount == 0 && !a.strategy_state.needs_sync { a.vault_a.amount } else { STRATEGY_LOCK };
    msg!("Swap: spent={}, received={}, A={}, B={}", amount, received.unwrap(), a.vault_a.amount, a.vault_b.amount);
    Ok(())
}
