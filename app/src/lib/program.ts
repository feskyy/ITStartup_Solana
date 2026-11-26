import { Program } from '@coral-xyz/anchor'
import type { SimpleVault } from '../types/simple_vault'

import idl from '../idl/simple_vault.json'

import {
  connection,
  PROGRAM_ID,
} from '../config/solana'

export function getProgram(): Program<SimpleVault> {
  const program = new Program<SimpleVault>(
    idl as unknown as SimpleVault,
    { connection }
  )

  if (!program.programId.equals(PROGRAM_ID)) {
    throw new Error('IDL program ID mismatch')
  }

  return program
}