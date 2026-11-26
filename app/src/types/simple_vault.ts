/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/simple_vault.json`.
 */
export type SimpleVault = {
  "address": "AQ1t23jJHzxzT1YR1n5ygPeamaEjg3kEYG7tyitDyapm",
  "metadata": {
    "name": "simpleVault",
    "version": "0.1.0",
    "spec": "0.1.0"
  },
  "instructions": [
    {
      "name": "closePosition",
      "discriminator": [
        123,
        134,
        81,
        0,
        49,
        68,
        98,
        98
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "vaultState"
          ]
        },
        {
          "name": "vaultState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault_state.token_mint",
                "account": "vaultState"
              }
            ]
          }
        },
        {
          "name": "strategyState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110,
                  95,
                  115,
                  116,
                  114,
                  97,
                  116,
                  101,
                  103,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vaultState"
              }
            ]
          }
        },
        {
          "name": "vaultA",
          "writable": true
        },
        {
          "name": "vaultB",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  115,
                  95,
                  98
                ]
              },
              {
                "kind": "account",
                "path": "vaultState"
              }
            ]
          }
        },
        {
          "name": "clmmProgram",
          "address": "DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "minA",
          "type": "u64"
        },
        {
          "name": "minB",
          "type": "u64"
        }
      ]
    },
    {
      "name": "closeUserCard",
      "docs": [
        "Неделя 8: закрыть свою карточку и вернуть ренту.",
        "Карточку может закрыть только её владелец.",
        "Закрытие разрешено даже во время паузы.",
        "Неделя 9: нельзя закрыть карточку, на которой есть депозит или shares",
        "(иначе пропадёт учёт доли пользователя). Чтобы закрыть — сначала `withdraw` (неделя 10)."
      ],
      "discriminator": [
        48,
        156,
        133,
        38,
        191,
        116,
        165,
        94
      ],
      "accounts": [
        {
          "name": "vaultState",
          "docs": [
            "Проверяем, что vault является корректным PDA."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault_state.token_mint",
                "account": "vaultState"
              }
            ]
          }
        },
        {
          "name": "userCard",
          "docs": [
            "Закрыть можно только свою карточку, и только пустую (без депозита и shares)."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  99,
                  97,
                  114,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "vaultState"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "user",
          "docs": [
            "Владелец подтверждает закрытие подписью, рента возвращается ему."
          ],
          "writable": true,
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "collectFees",
      "discriminator": [
        164,
        152,
        207,
        99,
        30,
        186,
        19,
        182
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "vaultState"
          ]
        },
        {
          "name": "vaultState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault_state.token_mint",
                "account": "vaultState"
              }
            ]
          }
        },
        {
          "name": "strategyState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110,
                  95,
                  115,
                  116,
                  114,
                  97,
                  116,
                  101,
                  103,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vaultState"
              }
            ]
          }
        },
        {
          "name": "vaultA",
          "writable": true
        },
        {
          "name": "vaultB",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  115,
                  95,
                  98
                ]
              },
              {
                "kind": "account",
                "path": "vaultState"
              }
            ]
          }
        },
        {
          "name": "clmmProgram",
          "address": "DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "createUserCard",
      "docs": [
        "Создать личную карточку пользователя в vault.",
        "Один пользователь может иметь одну карточку в каждом vault."
      ],
      "discriminator": [
        25,
        67,
        231,
        22,
        28,
        170,
        76,
        39
      ],
      "accounts": [
        {
          "name": "vaultState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault_state.token_mint",
                "account": "vaultState"
              }
            ]
          }
        },
        {
          "name": "userCard",
          "docs": [
            "UserCard PDA — seeds: [\"user_card\", vault_state, user]"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  99,
                  97,
                  114,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "vaultState"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "deposit",
      "docs": [
        "Неделя 9: пользователь вносит `amount` токенов и получает share-токены.",
        "",
        "Формула:",
        "Первый депозит:       shares = amount (1:1)",
        "Последующие депозиты: shares = amount * total_shares / total_tokens"
      ],
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "vaultState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault_state.token_mint",
                "account": "vaultState"
              }
            ]
          }
        },
        {
          "name": "userCard",
          "docs": [
            "Карточка пользователя — депозит возможен только после create_user_card."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  99,
                  97,
                  114,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "vaultState"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "vaultTokenAccount",
          "docs": [
            "Токен-аккаунт vault — принимает токены."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "vault_state.token_mint",
                "account": "vaultState"
              }
            ]
          }
        },
        {
          "name": "shareMint",
          "docs": [
            "Share mint — vault печатает shares."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  97,
                  114,
                  101,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault_state.token_mint",
                "account": "vaultState"
              }
            ]
          }
        },
        {
          "name": "userTokenAccount",
          "docs": [
            "Токен-аккаунт пользователя (откуда списываем токены)."
          ],
          "writable": true
        },
        {
          "name": "userShareAccount",
          "docs": [
            "Share-аккаунт пользователя (куда придут shares)."
          ],
          "writable": true
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializePositionStrategy",
      "docs": [
        "Неделя 13: инициализация состояния LP-стратегии."
      ],
      "discriminator": [
        156,
        193,
        133,
        214,
        111,
        76,
        186,
        24
      ],
      "accounts": [
        {
          "name": "vaultState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault_state.token_mint",
                "account": "vaultState"
              }
            ]
          }
        },
        {
          "name": "strategyState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110,
                  95,
                  115,
                  116,
                  114,
                  97,
                  116,
                  101,
                  103,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vaultState"
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "vaultState"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initializeStrategy",
      "discriminator": [
        208,
        119,
        144,
        145,
        178,
        57,
        105,
        252
      ],
      "accounts": [
        {
          "name": "vaultState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault_state.token_mint",
                "account": "vaultState"
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "vaultState"
          ]
        },
        {
          "name": "mintB",
          "address": "A2dsMy371WJkZyuVBWUg9BscPz9SRcDG8f77C5YUDXX5"
        },
        {
          "name": "vaultB",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  115,
                  95,
                  98
                ]
              },
              {
                "kind": "account",
                "path": "vaultState"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initializeVault",
      "docs": [
        "Создать vault для конкретного SPL-токена.",
        "Создаёт VaultState PDA, vault_token_account PDA, share_mint PDA."
      ],
      "discriminator": [
        48,
        191,
        163,
        44,
        71,
        129,
        63,
        164
      ],
      "accounts": [
        {
          "name": "vaultState",
          "docs": [
            "VaultState PDA — seeds: [\"vault\", token_mint]"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "tokenMint"
              }
            ]
          }
        },
        {
          "name": "vaultTokenAccount",
          "docs": [
            "Token account, принадлежащий vault PDA."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "tokenMint"
              }
            ]
          }
        },
        {
          "name": "shareMint",
          "docs": [
            "Mint для shares — выпускается vault PDA."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  97,
                  114,
                  101,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "tokenMint"
              }
            ]
          }
        },
        {
          "name": "tokenMint",
          "docs": [
            "SPL-токен, который принимает vault."
          ]
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "openPosition",
      "discriminator": [
        135,
        128,
        47,
        77,
        15,
        152,
        240,
        49
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "vaultState"
          ]
        },
        {
          "name": "vaultState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault_state.token_mint",
                "account": "vaultState"
              }
            ]
          }
        },
        {
          "name": "strategyState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110,
                  95,
                  115,
                  116,
                  114,
                  97,
                  116,
                  101,
                  103,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vaultState"
              }
            ]
          }
        },
        {
          "name": "vaultA",
          "writable": true
        },
        {
          "name": "vaultB",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  115,
                  95,
                  98
                ]
              },
              {
                "kind": "account",
                "path": "vaultState"
              }
            ]
          }
        },
        {
          "name": "clmmProgram",
          "address": "DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "openPositionArgs"
            }
          }
        }
      ]
    },
    {
      "name": "setPaused",
      "docs": [
        "Неделя 8: включить или выключить паузу. Только администратор."
      ],
      "discriminator": [
        91,
        60,
        125,
        192,
        176,
        225,
        166,
        218
      ],
      "accounts": [
        {
          "name": "vaultState",
          "docs": [
            "Только сохранённый администратор может менять паузу."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault_state.token_mint",
                "account": "vaultState"
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "vaultState"
          ]
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "swap",
      "discriminator": [
        248,
        198,
        158,
        145,
        225,
        117,
        135,
        200
      ],
      "accounts": [
        {
          "name": "strategyState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110,
                  95,
                  115,
                  116,
                  114,
                  97,
                  116,
                  101,
                  103,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vaultState"
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "vaultState"
          ]
        },
        {
          "name": "vaultState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault_state.token_mint",
                "account": "vaultState"
              }
            ]
          }
        },
        {
          "name": "vaultA",
          "writable": true
        },
        {
          "name": "vaultB",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  115,
                  95,
                  98
                ]
              },
              {
                "kind": "account",
                "path": "vaultState"
              }
            ]
          }
        },
        {
          "name": "mintA",
          "address": "CCRTcoXihFnKNXepJk2eCA87qJNz8HWSgVMV19ctT1r"
        },
        {
          "name": "mintB",
          "address": "A2dsMy371WJkZyuVBWUg9BscPz9SRcDG8f77C5YUDXX5"
        },
        {
          "name": "clmmProgram",
          "address": "DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH"
        },
        {
          "name": "ammConfig",
          "address": "CD4aJtX11cqTCAc83nxSPkkh5JW2yjD6uwHeovjqQ1qu"
        },
        {
          "name": "poolState",
          "writable": true,
          "address": "4tAPx2mdfGQCWmx3EV4qCkbWK52PbzWVNFpxLkfs25nP"
        },
        {
          "name": "poolVaultA",
          "writable": true
        },
        {
          "name": "poolVaultB",
          "writable": true
        },
        {
          "name": "observationState",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "tokenProgram2022"
        },
        {
          "name": "memoProgram",
          "address": "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
        }
      ],
      "args": [
        {
          "name": "amountIn",
          "type": "u64"
        },
        {
          "name": "minimumAmountOut",
          "type": "u64"
        },
        {
          "name": "aToB",
          "type": "bool"
        }
      ]
    },
    {
      "name": "syncVault",
      "discriminator": [
        19,
        211,
        150,
        118,
        94,
        208,
        138,
        204
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "vaultState"
          ]
        },
        {
          "name": "vaultState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault_state.token_mint",
                "account": "vaultState"
              }
            ]
          }
        },
        {
          "name": "strategyState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110,
                  95,
                  115,
                  116,
                  114,
                  97,
                  116,
                  101,
                  103,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vaultState"
              }
            ]
          }
        },
        {
          "name": "vaultA",
          "writable": true
        },
        {
          "name": "vaultB",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  115,
                  95,
                  98
                ]
              },
              {
                "kind": "account",
                "path": "vaultState"
              }
            ]
          }
        },
        {
          "name": "clmmProgram",
          "address": "DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "withdraw",
      "docs": [
        "Неделя 10: пользователь возвращает `shares` share-токенов и забирает свои токены.",
        "",
        "Формула (округление ВНИЗ, чтобы vault никогда не отдал больше положенного):",
        "tokens = shares * total_tokens / total_shares",
        "",
        "Два вызова Token Program (CPI):",
        "1) burn      — сжигаем shares пользователя, подписывает ПОЛЬЗОВАТЕЛЬ;",
        "2) transfer  — отдаём токены из хранилища, подписывает ПРОГРАММА от имени PDA vault.",
        "",
        "Решение: вывод разрешён и на паузе — пользователь всегда может забрать свои деньги."
      ],
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "vaultState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault_state.token_mint",
                "account": "vaultState"
              }
            ]
          }
        },
        {
          "name": "userCard",
          "docs": [
            "Карточка пользователя: seeds включают подпись user, поэтому чужую карточку не подставить."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  99,
                  97,
                  114,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "vaultState"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "vaultTokenAccount",
          "docs": [
            "Токен-аккаунт vault — отсюда уходят токены."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "vault_state.token_mint",
                "account": "vaultState"
              }
            ]
          }
        },
        {
          "name": "shareMint",
          "docs": [
            "Share mint — у него уменьшится supply при сжигании."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  97,
                  114,
                  101,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault_state.token_mint",
                "account": "vaultState"
              }
            ]
          }
        },
        {
          "name": "userTokenAccount",
          "docs": [
            "Токен-аккаунт пользователя (куда придут токены)."
          ],
          "writable": true
        },
        {
          "name": "userShareAccount",
          "docs": [
            "Share-аккаунт пользователя (откуда сжигаем shares)."
          ],
          "writable": true
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "shares",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "strategyState",
      "discriminator": [
        83,
        18,
        224,
        109,
        174,
        100,
        39,
        139
      ]
    },
    {
      "name": "userCard",
      "discriminator": [
        99,
        156,
        133,
        85,
        192,
        58,
        202,
        10
      ]
    },
    {
      "name": "vaultState",
      "discriminator": [
        228,
        196,
        82,
        165,
        98,
        210,
        235,
        152
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "vaultPaused",
      "msg": "Vault is paused. This action is disabled."
    },
    {
      "code": 6001,
      "name": "unauthorized",
      "msg": "Unauthorized action: only the owner or admin is allowed."
    },
    {
      "code": 6002,
      "name": "invalidVault",
      "msg": "User card belongs to a different vault."
    },
    {
      "code": 6003,
      "name": "zeroAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6004,
      "name": "sharesTooSmall",
      "msg": "Shares would be zero - deposit too small"
    },
    {
      "code": 6005,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6006,
      "name": "cardNotEmpty",
      "msg": "User card still has deposited tokens or shares"
    },
    {
      "code": 6007,
      "name": "insufficientShares",
      "msg": "Not enough shares on the user card"
    },
    {
      "code": 6008,
      "name": "withdrawTooSmall",
      "msg": "Shares amount is too small - withdrawal would give 0 tokens"
    },
    {
      "code": 6009,
      "name": "strategyLocked",
      "msg": "Strategy active: convert B back to A before deposit or withdrawal"
    },
    {
      "code": 6010,
      "name": "invalidStrategy",
      "msg": "Invalid Raydium accounts or strategy state"
    },
    {
      "code": 6011,
      "name": "invalidSwapResult",
      "msg": "Swap output below specified minimum or input not fully spent"
    },
    {
      "code": 6012,
      "name": "positionAlreadyOpen",
      "msg": "Position is already open"
    }
  ],
  "types": [
    {
      "name": "openPositionArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "tickLower",
            "type": "i32"
          },
          {
            "name": "tickUpper",
            "type": "i32"
          },
          {
            "name": "tickArrayLowerStart",
            "type": "i32"
          },
          {
            "name": "tickArrayUpperStart",
            "type": "i32"
          },
          {
            "name": "liquidity",
            "type": "u128"
          },
          {
            "name": "amountMaxA",
            "type": "u64"
          },
          {
            "name": "amountMaxB",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "strategyState",
      "docs": [
        "Неделя 13: отдельный PDA состояния стратегии Raydium CLMM."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "inMarket",
            "type": "bool"
          },
          {
            "name": "needsSync",
            "type": "bool"
          },
          {
            "name": "positionNftMint",
            "type": "pubkey"
          },
          {
            "name": "personalPosition",
            "type": "pubkey"
          },
          {
            "name": "tickLower",
            "type": "i32"
          },
          {
            "name": "tickUpper",
            "type": "i32"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "userCard",
      "docs": [
        "Карточка пользователя в vault."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "deposited",
            "type": "u64"
          },
          {
            "name": "shares",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "createdAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "vaultState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "tokenMint",
            "type": "pubkey"
          },
          {
            "name": "vaultTokenAccount",
            "type": "pubkey"
          },
          {
            "name": "shareMint",
            "type": "pubkey"
          },
          {
            "name": "totalTokens",
            "type": "u64"
          },
          {
            "name": "totalShares",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "paused",
            "type": "bool"
          }
        ]
      }
    }
  ]
};
