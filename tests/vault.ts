/**
 * Simple Vault — тесты для Solana Devnet (неделя 8 + неделя 9)
 *
 * Неделя 8: инициализация, карточки, created_at, пауза, закрытие карточки.
 * Неделя 9: депозит, расчёт share-токенов, учёт в vault и карточке.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";

import {
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

import { assert } from "chai";
import { SimpleVault } from "../target/types/simple_vault";

// Финансирование тестовых кошельков из кошелька администратора.
async function fundFromAdmin(
  provider: anchor.AnchorProvider,
  admin: Keypair,
  pubkey: PublicKey,
  lamports = 0.05 * LAMPORTS_PER_SOL
) {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: admin.publicKey,
      toPubkey: pubkey,
      lamports,
    })
  );
  await provider.sendAndConfirm(tx, [admin]);
}

// Проверка, что транзакция завершилась ошибкой.
async function expectFailure(action: () => Promise<unknown>, message: string) {
  let failed = false;
  try {
    await action();
  } catch {
    failed = true;
  }
  assert.isTrue(failed, message);
}

describe("simple_vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SimpleVault as Program<SimpleVault>;
  const admin = (provider.wallet as anchor.Wallet).payer;

  const userA = Keypair.generate(); // карточка + депозит 100
  const userB = Keypair.generate(); // карточка + депозит 50
  const userC = Keypair.generate(); // пустая карточка (закроем на паузе)
  const userD = Keypair.generate(); // без карточки

  const users = [userA, userB, userC, userD];
  const UNIT = 1_000_000; // decimals = 6

  let tokenMint: PublicKey;
  let vaultStatePDA: PublicKey;
  let vaultTokenAccountPDA: PublicKey;
  let shareMintPDA: PublicKey;

  // Токен-аккаунты (токен vault) и share-аккаунты пользователей.
  const tokenAcc: Record<string, PublicKey> = {};
  const shareAcc: Record<string, PublicKey> = {};

  const cardPda = (user: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("user_card"), vaultStatePDA.toBuffer(), user.toBuffer()],
      program.programId
    )[0];

  const createCard = (user: Keypair) =>
    program.methods
      .createUserCard()
      .accounts({
        vaultState: vaultStatePDA,
        userCard: cardPda(user.publicKey),
        user: user.publicKey,
      } as any)
      .signers([user])
      .rpc();

  const closeCard = (owner: Keypair, cardOwner: Keypair = owner) =>
    program.methods
      .closeUserCard()
      .accounts({
        vaultState: vaultStatePDA,
        userCard: cardPda(cardOwner.publicKey),
        user: owner.publicKey,
      } as any)
      .signers([owner])
      .rpc();

  const setPaused = (paused: boolean, signer: Keypair = admin) =>
    program.methods
      .setPaused(paused)
      .accounts({
        vaultState: vaultStatePDA,
        admin: signer.publicKey,
      } as any)
      .signers(signer === admin ? [] : [signer])
      .rpc();

  const deposit = (user: Keypair, amount: number) =>
    program.methods
      .deposit(new anchor.BN(amount))
      .accounts({
        vaultState: vaultStatePDA,
        userCard: cardPda(user.publicKey),
        vaultTokenAccount: vaultTokenAccountPDA,
        shareMint: shareMintPDA,
        userTokenAccount: tokenAcc[user.publicKey.toBase58()],
        userShareAccount: shareAcc[user.publicKey.toBase58()],
        user: user.publicKey,
      } as any)
      .signers([user])
      .rpc();

  before(async () => {
    for (const user of users) {
      await fundFromAdmin(provider, admin, user.publicKey);
    }

    // Новый mint при каждом запуске -> новый Vault PDA.
    tokenMint = await createMint(
      provider.connection,
      admin,
      admin.publicKey,
      null,
      6
    );

    [vaultStatePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), tokenMint.toBuffer()],
      program.programId
    );
    [vaultTokenAccountPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_tokens"), tokenMint.toBuffer()],
      program.programId
    );
    [shareMintPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("share_mint"), tokenMint.toBuffer()],
      program.programId
    );
  });

  // ---------------------------------------------------------------------------
  // Неделя 8
  // ---------------------------------------------------------------------------

  it("initialize_vault: vault создан", async () => {
    await program.methods
      .initializeVault()
      .accounts({
        vaultState: vaultStatePDA,
        vaultTokenAccount: vaultTokenAccountPDA,
        shareMint: shareMintPDA,
        tokenMint,
        admin: admin.publicKey,
      } as any)
      .rpc();

    const vault = await program.account.vaultState.fetch(vaultStatePDA);
    assert.equal(vault.admin.toBase58(), admin.publicKey.toBase58());
    assert.equal(vault.tokenMint.toBase58(), tokenMint.toBase58());
    assert.equal(vault.shareMint.toBase58(), shareMintPDA.toBase58());
    assert.isFalse(vault.paused);
    assert.equal(vault.totalTokens.toNumber(), 0);
    assert.equal(vault.totalShares.toNumber(), 0);
  });

  it("create_user_card: карточки созданы с created_at", async () => {
    for (const user of [userA, userB, userC]) {
      await createCard(user);

      const card = await program.account.userCard.fetch(
        cardPda(user.publicKey)
      );
      assert.equal(card.owner.toBase58(), user.publicKey.toBase58());
      assert.equal(card.vault.toBase58(), vaultStatePDA.toBase58());
      assert.isAbove(card.createdAt.toNumber(), 0, "created_at > 0");
      assert.equal(card.deposited.toNumber(), 0);
      assert.equal(card.shares.toNumber(), 0);
    }

    assert.notEqual(
      cardPda(userA.publicKey).toBase58(),
      cardPda(userB.publicKey).toBase58()
    );
  });

  it("create_user_card: повторное создание отклонено", async () => {
    await expectFailure(
      () => createCard(userA),
      "Повторное создание карточки должно быть запрещено"
    );
  });

  it("set_paused: не-админ получает ошибку", async () => {
    await expectFailure(
      () => setPaused(true, userA),
      "Не-админ не должен управлять паузой"
    );
    const vault = await program.account.vaultState.fetch(vaultStatePDA);
    assert.isFalse(vault.paused);
  });

  // ---------------------------------------------------------------------------
  // Неделя 9: депозит
  // ---------------------------------------------------------------------------

  it("setup: токен-аккаунты и стартовые токены пользователей", async () => {
    for (const user of users) {
      const key = user.publicKey.toBase58();
      tokenAcc[key] = await createAccount(
        provider.connection,
        admin,
        tokenMint,
        user.publicKey
      );
      shareAcc[key] = await createAccount(
        provider.connection,
        admin,
        shareMintPDA,
        user.publicKey
      );
      await mintTo(
        provider.connection,
        admin,
        tokenMint,
        tokenAcc[key],
        admin,
        1000 * UNIT
      );
    }
  });

  it("deposit: A вносит 100 токенов -> получает 100 shares", async () => {
    await deposit(userA, 100 * UNIT);

    const shares = await getAccount(
      provider.connection,
      shareAcc[userA.publicKey.toBase58()]
    );
    assert.equal(shares.amount, BigInt(100 * UNIT));

    const card = await program.account.userCard.fetch(cardPda(userA.publicKey));
    assert.equal(card.deposited.toNumber(), 100 * UNIT);
    assert.equal(card.shares.toNumber(), 100 * UNIT);
  });

  it("deposit: B вносит 50 токенов -> получает 50 shares", async () => {
    await deposit(userB, 50 * UNIT);

    const shares = await getAccount(
      provider.connection,
      shareAcc[userB.publicKey.toBase58()]
    );
    assert.equal(shares.amount, BigInt(50 * UNIT));

    const vault = await program.account.vaultState.fetch(vaultStatePDA);
    assert.equal(vault.totalTokens.toNumber(), 150 * UNIT);
    assert.equal(vault.totalShares.toNumber(), 150 * UNIT);

    const vaultTokens = await getAccount(
      provider.connection,
      vaultTokenAccountPDA
    );
    assert.equal(vaultTokens.amount, BigInt(150 * UNIT));
  });

  it("deposit: без карточки — ошибка", async () => {
    await expectFailure(
      () => deposit(userD, 10 * UNIT),
      "Депозит без карточки должен быть отклонён"
    );
  });

  it("deposit: сумма 0 — ошибка", async () => {
    await expectFailure(
      () => deposit(userA, 0),
      "Нулевой депозит должен быть отклонён"
    );
  });

  // ---------------------------------------------------------------------------
  // Пауза + закрытие карточек
  // ---------------------------------------------------------------------------

  it("set_paused: администратор включает паузу", async () => {
    await setPaused(true);
    const vault = await program.account.vaultState.fetch(vaultStatePDA);
    assert.isTrue(vault.paused);
  });

  it("create_user_card: на паузе создание отклонено", async () => {
    await expectFailure(
      () => createCard(userD),
      "Создание карточки на паузе должно быть запрещено"
    );
    const account = await provider.connection.getAccountInfo(
      cardPda(userD.publicKey),
      "confirmed"
    );
    assert.isNull(account);
  });

  it("deposit: на паузе депозит отклонён", async () => {
    await expectFailure(
      () => deposit(userA, 10 * UNIT),
      "Депозит на паузе должен быть запрещён"
    );
    const vault = await program.account.vaultState.fetch(vaultStatePDA);
    assert.equal(vault.totalTokens.toNumber(), 150 * UNIT);
  });

  it("close_user_card: чужой пользователь не может закрыть карточку", async () => {
    await expectFailure(
      () => closeCard(userB, userA),
      "Чужую карточку нельзя закрыть"
    );
    const card = await program.account.userCard.fetch(cardPda(userA.publicKey));
    assert.equal(card.owner.toBase58(), userA.publicKey.toBase58());
  });

  it("close_user_card: карточку с депозитом закрыть нельзя", async () => {
    await expectFailure(
      () => closeCard(userA),
      "Карточка с депозитом и shares не должна закрываться"
    );
    const card = await program.account.userCard.fetch(cardPda(userA.publicKey));
    assert.equal(card.shares.toNumber(), 100 * UNIT);
  });

  it("close_user_card: владелец закрывает пустую карточку на паузе", async () => {
    const userCard = cardPda(userC.publicKey);
    const balanceBefore = await provider.connection.getBalance(
      userC.publicKey,
      "confirmed"
    );

    await closeCard(userC);

    const account = await provider.connection.getAccountInfo(
      userCard,
      "confirmed"
    );
    assert.isNull(account, "Закрытая карточка больше не должна существовать");

    const balanceAfter = await provider.connection.getBalance(
      userC.publicKey,
      "confirmed"
    );
    assert.isAbove(balanceAfter, balanceBefore, "Рента должна вернуться");
  });

  it("set_paused: администратор снимает паузу", async () => {
    await setPaused(false);
    const vault = await program.account.vaultState.fetch(vaultStatePDA);
    assert.isFalse(vault.paused);
  });

  it("create_user_card: после паузы создание работает", async () => {
    await createCard(userD);
    const card = await program.account.userCard.fetch(cardPda(userD.publicKey));
    assert.equal(card.owner.toBase58(), userD.publicKey.toBase58());
    assert.isAbove(card.createdAt.toNumber(), 0);
  });

  it("deposit: после паузы D вносит 30 токенов -> получает 30 shares", async () => {
    await deposit(userD, 30 * UNIT);

    const vault = await program.account.vaultState.fetch(vaultStatePDA);
    assert.equal(vault.totalTokens.toNumber(), 180 * UNIT);
    assert.equal(vault.totalShares.toNumber(), 180 * UNIT);

    const shares = await getAccount(
      provider.connection,
      shareAcc[userD.publicKey.toBase58()]
    );
    assert.equal(shares.amount, BigInt(30 * UNIT));
  });
});
