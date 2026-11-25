use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    hash::hash,
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};
use anchor_lang::solana_program::pubkey;

pub const RAYDIUM_CLMM: Pubkey =
    pubkey!("DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH");

pub const POSITION_POOL: Pubkey =
    pubkey!("4tAPx2mdfGQCWmx3EV4qCkbWK52PbzWVNFpxLkfs25nP");

// Дискриминатор инструкции Anchor.
fn discriminator(name: &str) -> [u8; 8] {
    let namespace = format!("global:{}", name);
    let result = hash(namespace.as_bytes()).to_bytes();

    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(&result[..8]);
    bytes
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct OpenPositionArgs {
    pub tick_lower: i32,
    pub tick_upper: i32,
    pub tick_array_lower_start: i32,
    pub tick_array_upper_start: i32,
    pub liquidity: u128,
    pub amount_max_a: u64,
    pub amount_max_b: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct DecreasePositionArgs {
    pub liquidity: u128,
    pub amount_min_a: u64,
    pub amount_min_b: u64,
}

// Формирование CPI с фиксированными правами аккаунтов.
fn invoke_raydium<'info>(
    program: &AccountInfo<'info>,
    accounts: &[AccountInfo<'info>],
    flags: &[(bool, bool)],
    data: Vec<u8>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    require_keys_eq!(
        program.key(),
        RAYDIUM_CLMM,
        PositionError::InvalidRaydiumProgram
    );

    require!(
        program.executable,
        PositionError::InvalidRaydiumProgram
    );

    require!(
        accounts.len() == flags.len(),
        PositionError::InvalidAccountCount
    );

    let metas: Vec<AccountMeta> = accounts
        .iter()
        .zip(flags.iter())
        .map(|(account, &(signer, writable))| {
            if writable {
                AccountMeta::new(account.key(), signer)
            } else {
                AccountMeta::new_readonly(account.key(), signer)
            }
        })
        .collect();

    let instruction = Instruction {
        program_id: RAYDIUM_CLMM,
        accounts: metas,
        data,
    };

    let mut infos = accounts.to_vec();
    infos.push(program.clone());

    invoke_signed(&instruction, &infos, signer_seeds)?;

    Ok(())
}

// Открытие позиции Raydium CLMM.
pub(crate) fn open_position_cpi<'info>(
    program: &AccountInfo<'info>,
    accounts: &[AccountInfo<'info>],
    args: &OpenPositionArgs,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    require!(
        accounts.len() == 22 || accounts.len() == 23,
        PositionError::InvalidAccountCount
    );

    require_keys_eq!(
        accounts[5].key(),
        POSITION_POOL,
        PositionError::InvalidPool
    );

    require!(
        args.tick_lower < args.tick_upper,
        PositionError::InvalidTickRange
    );

    require!(
        args.liquidity > 0,
        PositionError::InvalidLiquidity
    );

    let mut data = discriminator("open_position_v2").to_vec();

    data.extend_from_slice(&args.tick_lower.to_le_bytes());
    data.extend_from_slice(&args.tick_upper.to_le_bytes());

    data.extend_from_slice(
        &args.tick_array_lower_start.to_le_bytes()
    );

    data.extend_from_slice(
        &args.tick_array_upper_start.to_le_bytes()
    );

    data.extend_from_slice(&args.liquidity.to_le_bytes());
    data.extend_from_slice(&args.amount_max_a.to_le_bytes());
    data.extend_from_slice(&args.amount_max_b.to_le_bytes());

    // with_metadata = false
    data.push(0);

    // base_flag = None
    data.push(0);

    // Формат установленного SDK содержит дополнительный bool.
    data.push(0);

    // (is_signer, is_writable)
    let mut flags = vec![
        (true, true),    // payer
        (false, false),  // NFT owner
        (true, true),    // NFT mint
        (false, true),   // NFT account
        (false, true),   // metadata
        (false, true),   // pool
        (false, false),  // protocol position
        (false, true),   // lower tick array
        (false, true),   // upper tick array
        (false, true),   // personal position
        (false, true),   // owner vault A
        (false, true),   // owner vault B
        (false, true),   // pool vault A
        (false, true),   // pool vault B
        (false, false),  // rent
        (false, false),  // system program
        (false, false),  // token program
        (false, false),  // associated token program
        (false, false),  // metadata program
        (false, false),  // token 2022
        (false, false),  // mint A
        (false, false),  // mint B
    ];

    if accounts.len() == 23 {
        flags.push((false, true));
    }

    invoke_raydium(
        program,
        accounts,
        &flags,
        data,
        signer_seeds,
    )
}

// Уменьшение ликвидности.
// При liquidity = 0 используется для сбора комиссий.
pub(crate) fn decrease_position_cpi<'info>(
    program: &AccountInfo<'info>,
    accounts: &[AccountInfo<'info>],
    args: &DecreasePositionArgs,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    require!(
        accounts.len() == 16 || accounts.len() == 17,
        PositionError::InvalidAccountCount
    );

    require_keys_eq!(
        accounts[3].key(),
        POSITION_POOL,
        PositionError::InvalidPool
    );

    let mut data =
        discriminator("decrease_liquidity_v2").to_vec();

    data.extend_from_slice(&args.liquidity.to_le_bytes());
    data.extend_from_slice(&args.amount_min_a.to_le_bytes());
    data.extend_from_slice(&args.amount_min_b.to_le_bytes());

    let mut flags = vec![
        (true, false),   // NFT owner
        (false, false),  // NFT account
        (false, true),   // personal position
        (false, true),   // pool
        (false, false),  // protocol position
        (false, true),   // pool vault A
        (false, true),   // pool vault B
        (false, true),   // lower tick array
        (false, true),   // upper tick array
        (false, true),   // recipient vault A
        (false, true),   // recipient vault B
        (false, false),  // token program
        (false, false),  // token 2022
        (false, false),  // memo program
        (false, false),  // mint A
        (false, false),  // mint B
    ];

    if accounts.len() == 17 {
        flags.push((false, true));
    }

    invoke_raydium(
        program,
        accounts,
        &flags,
        data,
        signer_seeds,
    )
}

// Закрытие позиции после полного вывода ликвидности.
pub(crate) fn close_position_cpi<'info>(
    program: &AccountInfo<'info>,
    accounts: &[AccountInfo<'info>],
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    require!(
        accounts.len() == 6 || accounts.len() == 7,
        PositionError::InvalidAccountCount
    );

    let mut flags = vec![
        (true, true),    // NFT owner
        (false, true),   // NFT mint
        (false, true),   // NFT account
        (false, true),   // personal position
        (false, false),  // system program
        (false, false),  // token program
    ];

    if accounts.len() == 7 {
        require_keys_eq!(
            accounts[6].key(),
            POSITION_POOL,
            PositionError::InvalidPool
        );

        flags.push((false, true));
    }

    invoke_raydium(
        program,
        accounts,
        &flags,
        discriminator("close_position").to_vec(),
        signer_seeds,
    )
}

#[error_code]
pub enum PositionError {
    #[msg("Invalid Raydium CLMM program")]
    InvalidRaydiumProgram,

    #[msg("Invalid number of CPI accounts")]
    InvalidAccountCount,

    #[msg("Invalid Raydium pool")]
    InvalidPool,

    #[msg("Invalid tick range")]
    InvalidTickRange,

    #[msg("Liquidity must be greater than zero")]
    InvalidLiquidity,

    #[msg("Position is already open")]
    PositionAlreadyOpen,

    #[msg("Position is not open")]
    PositionNotOpen,

    #[msg("Vault funds are in the market")]
    FundsInMarket,

    #[msg("Vault accounting requires synchronization")]
    SyncRequired,

    #[msg("Invalid position account")]
    InvalidPosition,

    #[msg("Unauthorized strategy operation")]
    UnauthorizedStrategy,

    #[msg("Token B must be converted back to token A")]
    TokenBRemaining,
}