
/**
 * Simple Vault — полные тесты для Solana Devnet
 *
 * Проверяем:
 * 1. Инициализацию vault
 * 2. created_at у карточки пользователя
 * 3. Уникальность карточки (PDA)
 * 4. Запрет повторного создания
 * 5. Запрет управления паузой не-администратором
 * 6. Включение паузы администратором
 * 7. Запрет создания карточки во время паузы
 * 8. Закрытие карточки во время паузы
 * 9. Запрет закрытия чужой карточки
 * 10. Отключение паузы
 * 11. Создание карточки после снятия паузы
 * 12. Возврат ренты после закрытия карточки
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { createMint } from "@solana/spl-token";

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
async function expectFailure(
  action: () => Promise<unknown>,
  message: string
) {
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

  const userA = Keypair.generate();
  const userB = Keypair.generate();
  const userC = Keypair.generate();

  let tokenMint: PublicKey;
  let vaultStatePDA: PublicKey;
  let vaultTokenAccountPDA: PublicKey;
  let shareMintPDA: PublicKey;

  // PDA карточки конкретного пользователя.
  const cardPda = (user: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [
        Buffer.from("user_card"),
        vaultStatePDA.toBuffer(),
        user.toBuffer(),
      ],
      program.programId
    )[0];

  before(async () => {
    // Пополняем тестовые кошельки.
    for (const user of [userA, userB, userC]) {
      await fundFromAdmin(
        provider,
        admin,
        user.publicKey
      );
    }

    // Создаём новый SPL Mint.
    // Благодаря этому каждый запуск тестов создаёт новый Vault PDA.
    tokenMint = await createMint(
      provider.connection,
      admin,
      admin.publicKey,
      null,
      6
    );

    [vaultStatePDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault"),
        tokenMint.toBuffer(),
      ],
      program.programId
    );

    [vaultTokenAccountPDA] =
      PublicKey.findProgramAddressSync(
        [
          Buffer.from("vault_tokens"),
          tokenMint.toBuffer(),
        ],
        program.programId
      );

    [shareMintPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("share_mint"),
        tokenMint.toBuffer(),
      ],
      program.programId
    );
  });

  // ---------------------------------------------------------------------------
  // Тест 1. Инициализация Vault
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

    const vault = await program.account.vaultState.fetch(
      vaultStatePDA
    );

    assert.equal(
      vault.admin.toBase58(),
      admin.publicKey.toBase58()
    );

    assert.equal(
      vault.tokenMint.toBase58(),
      tokenMint.toBase58()
    );

    assert.equal(
      vault.shareMint.toBase58(),
      shareMintPDA.toBase58()
    );

    // Задание 3: пауза изначально выключена.
    assert.isFalse(vault.paused);
  });

  // ---------------------------------------------------------------------------
  // Тест 2. Создание карточек и created_at
  // ---------------------------------------------------------------------------

  it("create_user_card: карточки созданы с created_at", async () => {
    for (const user of [userA, userB]) {
      const userCard = cardPda(user.publicKey);

      await program.methods
        .createUserCard()
        .accounts({
          vaultState: vaultStatePDA,
          userCard,
          user: user.publicKey,
        } as any)
        .signers([user])
        .rpc();

      const card = await program.account.userCard.fetch(
        userCard
      );

      assert.equal(
        card.owner.toBase58(),
        user.publicKey.toBase58()
      );

      assert.equal(
        card.vault.toBase58(),
        vaultStatePDA.toBase58()
      );

      // Задание 1: проверяем timestamp.
      assert.isAbove(
        card.createdAt.toNumber(),
        0,
        "created_at должен быть больше нуля"
      );

      console.log(
        "Created at:",
        card.createdAt.toNumber()
      );
    }

    assert.notEqual(
      cardPda(userA.publicKey).toBase58(),
      cardPda(userB.publicKey).toBase58()
    );
  });

  // ---------------------------------------------------------------------------
  // Тест 3. Повторное создание запрещено
  // ---------------------------------------------------------------------------

  it("create_user_card: повторное создание отклонено", async () => {
    await expectFailure(
      async () => {
        await program.methods
          .createUserCard()
          .accounts({
            vaultState: vaultStatePDA,
            userCard: cardPda(userA.publicKey),
            user: userA.publicKey,
          } as any)
          .signers([userA])
          .rpc();
      },
      "Повторное создание карточки должно быть запрещено"
    );
  });

  // ---------------------------------------------------------------------------
  // Тест 4. Не-админ не может управлять паузой
  // ---------------------------------------------------------------------------

  it("set_paused: не-админ получает ошибку", async () => {
    await expectFailure(
      async () => {
        await program.methods
          .setPaused(true)
          .accounts({
            vaultState: vaultStatePDA,
            admin: userA.publicKey,
          } as any)
          .signers([userA])
          .rpc();
      },
      "Не-админ не должен управлять паузой"
    );

    const vault = await program.account.vaultState.fetch(
      vaultStatePDA
    );

    assert.isFalse(vault.paused);
  });

  // ---------------------------------------------------------------------------
  // Тест 5. Админ включает паузу
  // ---------------------------------------------------------------------------

  it("set_paused: администратор включает паузу", async () => {
    await program.methods
      .setPaused(true)
      .accounts({
        vaultState: vaultStatePDA,
        admin: admin.publicKey,
      } as any)
      .rpc();

    const vault = await program.account.vaultState.fetch(
      vaultStatePDA
    );

    assert.isTrue(vault.paused);
  });

  // ---------------------------------------------------------------------------
  // Тест 6. На паузе создание карточки запрещено
  // ---------------------------------------------------------------------------

  it("create_user_card: на паузе создание отклонено", async () => {
    const userCard = cardPda(userC.publicKey);

    await expectFailure(
      async () => {
        await program.methods
          .createUserCard()
          .accounts({
            vaultState: vaultStatePDA,
            userCard,
            user: userC.publicKey,
          } as any)
          .signers([userC])
          .rpc();
      },
      "Создание карточки во время паузы должно быть запрещено"
    );

    const account = await provider.connection.getAccountInfo(
      userCard,
      "confirmed"
    );

    assert.isNull(account);
  });

  // ---------------------------------------------------------------------------
  // Тест 7. Чужую карточку закрыть нельзя
  // ---------------------------------------------------------------------------

  it("close_user_card: чужой пользователь не может закрыть карточку", async () => {
    await expectFailure(
      async () => {
        await program.methods
          .closeUserCard()
          .accounts({
            vaultState: vaultStatePDA,
            userCard: cardPda(userA.publicKey),
            user: userB.publicKey,
          } as any)
          .signers([userB])
          .rpc();
      },
      "Чужую карточку нельзя закрыть"
    );

    const card = await program.account.userCard.fetch(
      cardPda(userA.publicKey)
    );

    assert.equal(
      card.owner.toBase58(),
      userA.publicKey.toBase58()
    );
  });

  // ---------------------------------------------------------------------------
  // Тест 8. Закрытие разрешено во время паузы
  // ---------------------------------------------------------------------------

  it("close_user_card: владелец закрывает карточку на паузе", async () => {
    const userCard = cardPda(userB.publicKey);

    const balanceBefore =
      await provider.connection.getBalance(
        userB.publicKey,
        "confirmed"
      );

    await program.methods
      .closeUserCard()
      .accounts({
        vaultState: vaultStatePDA,
        userCard,
        user: userB.publicKey,
      } as any)
      .signers([userB])
      .rpc();

    const account = await provider.connection.getAccountInfo(
      userCard,
      "confirmed"
    );

    assert.isNull(
      account,
      "Закрытая карточка больше не должна существовать"
    );

    const balanceAfter =
      await provider.connection.getBalance(
        userB.publicKey,
        "confirmed"
      );

    // Пользователь получает ренту обратно.
    // Комиссия за транзакцию вычитается из возвращённых средств.
    assert.isAbove(
      balanceAfter,
      balanceBefore,
      "Баланс должен увеличиться после возврата ренты"
    );
  });

  // ---------------------------------------------------------------------------
  // Тест 9. Админ снимает паузу
  // ---------------------------------------------------------------------------

  it("set_paused: администратор снимает паузу", async () => {
    await program.methods
      .setPaused(false)
      .accounts({
        vaultState: vaultStatePDA,
        admin: admin.publicKey,
      } as any)
      .rpc();

    const vault = await program.account.vaultState.fetch(
      vaultStatePDA
    );

    assert.isFalse(vault.paused);
  });

  // ---------------------------------------------------------------------------
  // Тест 10. После паузы создание снова работает
  // ---------------------------------------------------------------------------

  it("create_user_card: после паузы создание работает", async () => {
    const userCard = cardPda(userC.publicKey);

    await program.methods
      .createUserCard()
      .accounts({
        vaultState: vaultStatePDA,
        userCard,
        user: userC.publicKey,
      } as any)
      .signers([userC])
      .rpc();

    const card = await program.account.userCard.fetch(
      userCard
    );

    assert.equal(
      card.owner.toBase58(),
      userC.publicKey.toBase58()
    );

    assert.isAbove(
      card.createdAt.toNumber(),
      0
    );
  });

  // ---------------------------------------------------------------------------
  // Тест 11. Владелец закрывает карточку
  // ---------------------------------------------------------------------------

  it("close_user_card: владелец закрывает свою карточку", async () => {
    const userCard = cardPda(userA.publicKey);

    const balanceBefore =
      await provider.connection.getBalance(
        userA.publicKey,
        "confirmed"
      );

    await program.methods
      .closeUserCard()
      .accounts({
        vaultState: vaultStatePDA,
        userCard,
        user: userA.publicKey,
      } as any)
      .signers([userA])
      .rpc();

    const account = await provider.connection.getAccountInfo(
      userCard,
      "confirmed"
    );

    assert.isNull(
      account,
      "Карточка должна быть удалена после закрытия"
    );

    const balanceAfter =
      await provider.connection.getBalance(
        userA.publicKey,
        "confirmed"
      );

    assert.isAbove(
      balanceAfter,
      balanceBefore,
      "Рента должна вернуться владельцу"
    );
  });
});
