import * as anchor from '@coral-xyz/anchor';
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction, ComputeBudgetProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getOrCreateAssociatedTokenAccount, getAccount } from '@solana/spl-token';
import * as sdk from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import fs from 'node:fs';
import { assertDevnetAndBalance, connection, owner, initSdk, readAddresses } from './raydium-config';
const id = new PublicKey('AQ1t23jJHzxzT1YR1n5ygPeamaEjg3kEYG7tyitDyapm');
const pk = (x:any) => new PublicKey(x);
const saved = readAddresses();
const mintA = pk(saved.tokenA), mintB = pk(saved.tokenB), pool = pk(saved.poolId), clmm = pk(saved.programId);
const pda = (seed:string, ...keys:PublicKey[]) => PublicKey.findProgramAddressSync([Buffer.from(seed), ...keys.map(k=>k.toBuffer())], id)[0];
const vaultState = pda('vault', mintA), vaultA = pda('vault_tokens', mintA), vaultB = pda('vault_tokens_b', vaultState), shareMint = pda('share_mint', mintA), userCard = pda('user_card', vaultState, owner.publicKey);
const strategyState = pda('position_strategy', vaultState);
const evidence = 'week13-results.json';
function record(patch:any) { const prev = fs.existsSync(evidence)?JSON.parse(fs.readFileSync(evidence,'utf8')):{}; fs.writeFileSync(evidence, JSON.stringify({...prev,...patch},null,2)+'\n'); }
const url = (s:string)=>`https://explorer.solana.com/tx/${s}?cluster=devnet`;
const raw = (x:any):BN => new BN((x?.amount?.raw ?? x?.raw ?? x?.amount ?? x).toString());
function amount(s:string) { if(!/^\d+(\.\d{1,6})?$/.test(s)) throw Error('Use positive amount with up to 6 decimals'); const [a,b='']=s.split('.'); const n=new BN(a).muln(1000000).add(new BN(b.padEnd(6,'0'))); if(n.isZero()||n.bitLength()>64) throw Error('Invalid amount'); return n; }
async function main(){
 await assertDevnetAndBalance(0.05);
 const provider = new anchor.AnchorProvider(connection,new anchor.Wallet(owner),{commitment:'confirmed'});
 const program:any = new anchor.Program(JSON.parse(fs.readFileSync('target/idl/simple_vault.json','utf8')),provider);
 if(!program.programId.equals(id)) throw Error('IDL program ID mismatch');
 const [cmd='status',value='1']=process.argv.slice(2);
 const common={vaultState,admin:owner.publicKey,tokenProgram:TOKEN_PROGRAM_ID,systemProgram:SystemProgram.programId};
 if(cmd==='init'){
  if(!await connection.getAccountInfo(vaultState)) console.log(url(await program.methods.initializeVault().accounts({...common,tokenMint:mintA,vaultTokenAccount:vaultA,shareMint,rent:SYSVAR_RENT_PUBKEY}).rpc()));
  const state=await program.account.vaultState.fetch(vaultState); if(!state.admin.equals(owner.publicKey)) throw Error('Wallet is not vault admin');
  if(!await connection.getAccountInfo(vaultB)) console.log(url(await program.methods.initializeStrategy().accounts({...common,mintB,vaultB}).rpc()));
  if (!await connection.getAccountInfo(strategyState)) console.log(url(await program.methods.initializePositionStrategy().accounts({vaultState,strategyState,admin:owner.publicKey,systemProgram:SystemProgram.programId}).rpc()));
   record({vaultState:vaultState.toBase58(),vaultA:vaultA.toBase58(),vaultB:vaultB.toBase58(),shareMint:shareMint.toBase58()}); return;
 }
 if(cmd==='deposit'||cmd==='withdraw'){
  const userTokenAccount=(await getOrCreateAssociatedTokenAccount(connection,owner,mintA,owner.publicKey)).address;
  const userShareAccount=(await getOrCreateAssociatedTokenAccount(connection,owner,shareMint,owner.publicKey)).address;
  if(!await connection.getAccountInfo(userCard)) await program.methods.createUserCard().accounts({vaultState,userCard,user:owner.publicKey,systemProgram:SystemProgram.programId}).rpc();
  const sig=await program.methods[cmd](amount(value)).accounts({vaultState,userCard,vaultTokenAccount:vaultA,shareMint,userTokenAccount,userShareAccount,user:owner.publicKey,tokenProgram:TOKEN_PROGRAM_ID}).rpc(); console.log(url(sig)); record({[cmd+'Tx']:sig}); return;
 }
 const ray=await initSdk();
 const data:any=await ray.clmm.getPoolInfoFromRpc(saved.poolId);
 const balances=async()=>({a:(await getAccount(connection,vaultA)).amount.toString(),b:(await getAccount(connection,vaultB)).amount.toString()});
 if(cmd==='status'){console.log({price:data.poolInfo.price,...await balances(),state:await program.account.vaultState.fetch(vaultState)});return;}
 if(!['swap','reject','reverse'].includes(cmd)) throw Error('Unknown command');
 const forward=cmd!=='reverse'; const inputMint=forward?mintA:mintB; const outputMint=forward?mintB:mintA;
 const zeroForOne=pk(data.poolInfo.mintA.address).equals(inputMint);
 const input= value==='all'&&!forward ? new BN((await balances()).b):amount(value);
 if(input.isZero()) throw Error('Nothing to swap');
 let expected:BN, remaining:PublicKey[], observation:PublicKey;
 const api:any=sdk;
 if(typeof (ray.clmm as any).getSwapPoolInfo==='function' && typeof api.swapInternal==='function'){
   const q:any=await (ray.clmm as any).getSwapPoolInfo(saved.poolId,zeroForOne);
   const bitmap=api.getPdaExBitmapAccount(clmm,pool).publicKey;
   const bitmapInfo=await connection.getAccountInfo(bitmap);
   if(!bitmapInfo) throw Error('Missing CLMM bitmap extension');
   const out=api.swapInternal({programId:clmm,poolId:pool,poolInfo:q.rpcData,tickArrays:q.tickArrays,configInfo:q.configInfo,tickarrayBitmapExtension:api.TickArrayBitmapExtensionLayout.decode(bitmapInfo.data),amountSpecified:input,sqrtPriceLimitX64:new BN(0),zeroForOne,isBaseInput:true,blockTimestamp:Math.floor(Date.now()/1000),includeExtraTickArrays:true});
   expected=raw(out.amountCalculated).abs(); remaining=out.accounts.map(pk); observation=pk(q.rpcData.observationId);
 }else{
   const c=data.computePoolInfo;
   const q=await api.PoolUtils.computeAmountOutFormat({poolInfo:c,tickarrayBitmapExtension:c.exBitmapInfo,tickArrayCache:data.tickData[saved.poolId],amountIn:input,tokenOut:zeroForOne?data.poolInfo.mintB:data.poolInfo.mintA,slippage:0.01,epochInfo:await ray.fetchEpochInfo(),blockTimestamp:Math.floor(Date.now()/1000)});
   expected=raw(q.amountOut); remaining=q.remainingAccounts.map(pk); observation=pk(c.observationId);
 }
 const min=cmd==='reject'?new BN('18446744073709551615'):expected.muln(99).divn(100);
 if(min.isZero()) throw Error('Minimum output is zero');
 const poolMintA=pk(data.poolInfo.mintA.address); if(![mintA,mintB].some(m=>m.equals(poolMintA))||!pk(data.poolInfo.mintB.address).equals(poolMintA.equals(mintA)?mintB:mintA)) throw Error('Pool mint mismatch');
 const poolVaultA=pk(data.poolKeys.vault[poolMintA.equals(mintA)?'A':'B']);
 const poolVaultB=pk(data.poolKeys.vault[poolMintA.equals(mintA)?'B':'A']);
 const before=await balances(); const priceBefore=String(data.poolInfo.price);
 console.log({input:input.toString(),expected:expected.toString(),minimum:min.toString(),priceBefore,before});
 const ix=await program.methods.swap(input,min,forward).accounts({strategyState,admin:owner.publicKey,vaultState,vaultA,vaultB,mintA,mintB,clmmProgram:clmm,ammConfig:pk(saved.ammConfigId),poolState:pool,poolVaultA,poolVaultB,observationState:observation,tokenProgram:TOKEN_PROGRAM_ID,tokenProgram2022:TOKEN_2022_PROGRAM_ID,memoProgram:pk('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')}).remainingAccounts(remaining.map(pubkey=>({pubkey,isSigner:false,isWritable:true}))).instruction();
 const block=await connection.getLatestBlockhash('confirmed'); const tx=new Transaction({...block,feePayer:owner.publicKey}).add(ComputeBudgetProgram.setComputeUnitLimit({units:600000}),ix);tx.sign(owner);
 // Skip preflight only for intentional failure, so Explorer gets a failed transaction.
 const signature=await connection.sendRawTransaction(tx.serialize(),{skipPreflight:cmd==='reject'}); console.log(url(signature));
 const result=await connection.confirmTransaction({...block,signature},'confirmed');
 const details=await connection.getTransaction(signature,{commitment:'confirmed',maxSupportedTransactionVersion:0});
 const logs=details?.meta?.logMessages??[]; console.log(logs.join('\n'));
 const after=await balances(); const priceAfter=String((await ray.clmm.getPoolInfoFromRpc(saved.poolId)).poolInfo.price);
 const info={signature,explorer:url(signature),input:input.toString(),expected:expected.toString(),minimum:min.toString(),before,after,priceBefore,priceAfter,error:result.value.err,logs};
 if(cmd==='reject'){
   if(!result.value.err||!logs.some(x=>/TooLittleOutputReceived|too little output|Price slippage|slippage/i.test(x))||before.a!==after.a||before.b!==after.b) throw Error('Not a verified slippage rejection; inspect transaction '+signature);
   record({rejectedSwap:info});
 }else{if(result.value.err) throw Error('Swap failed: '+JSON.stringify(result.value.err));record({[forward?'successfulSwap':'reverseSwap']:info});}
 console.log(info);
}
main().then(()=>process.exit(0),e=>{console.error(e);process.exit(1)});
