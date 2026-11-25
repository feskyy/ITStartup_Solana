import { PublicKey, Transaction, TransactionInstruction, ComputeBudgetProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync, getAccount } from '@solana/spl-token';
import * as sdk from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import fs from 'node:fs';
import { assertDevnetAndBalance, connection, owner, initSdk, readAddresses } from './raydium-config';
const pk=(x:any)=>new PublicKey(x);
const raw=(x:any):BN=>new BN((x?.amount?.raw ?? x?.raw ?? x?.amount ?? x).toString());
const saved=readAddresses();
const mintA=pk(saved.tokenA), mintB=pk(saved.tokenB), pool=pk(saved.poolId), clmm=pk(saved.programId);
const evidence='week13-results.json';
async function main(){
 await assertDevnetAndBalance(0.01);
 if(owner.publicKey.toBase58()!=='EAgnDMT9r5TUP6G1M4jRFxf81cuwpnBF9J47ctfYJprF') throw Error('Use the dedicated trader KEYPAIR');
 const [direction,value='100']=process.argv.slice(2);
 if(!['a-to-b','b-to-a'].includes(direction)||!/^\d+$/.test(value)) throw Error('Usage: a-to-b|b-to-a amount');
 const input=new BN(value).muln(1000000);
 if(input.isZero()||input.gt(new BN(100000000))) throw Error('Use 1–100 tokens per test');
 const inputMint=direction==='a-to-b'?mintA:mintB, outputMint=direction==='a-to-b'?mintB:mintA;
 const ataA=getAssociatedTokenAddressSync(mintA,owner.publicKey), ataB=getAssociatedTokenAddressSync(mintB,owner.publicKey);
 const balances=async()=>({a:(await getAccount(connection,ataA)).amount.toString(),b:(await getAccount(connection,ataB)).amount.toString()});
 const before=await balances();
 if(new BN(direction==='a-to-b'?before.a:before.b).lt(input)) throw Error('Insufficient trader tokens');
 const ray=await initSdk();
 const data:any=await ray.clmm.getPoolInfoFromRpc(saved.poolId);
 const poolMintA=pk(data.poolInfo.mintA.address), poolMintB=pk(data.poolInfo.mintB.address);
 if(!((poolMintA.equals(mintA)&&poolMintB.equals(mintB))||(poolMintA.equals(mintB)&&poolMintB.equals(mintA)))) throw Error('Pool mint mismatch');
 const zeroForOne=poolMintA.equals(inputMint);
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
 const min=expected.muln(99).divn(100);
 if(min.lten(0)) throw Error('Invalid quote');
 const keys=[{pubkey:owner.publicKey,isSigner:true,isWritable:false},
 ...[pk(saved.ammConfigId),pool,zeroForOne?getAssociatedTokenAddressSync(poolMintA,owner.publicKey):getAssociatedTokenAddressSync(poolMintB,owner.publicKey),getAssociatedTokenAddressSync(outputMint,owner.publicKey),pk(data.poolKeys.vault[zeroForOne?'A':'B']),pk(data.poolKeys.vault[zeroForOne?'B':'A']),observation,TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID,pk('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),inputMint,outputMint].map((pubkey,i)=>({pubkey,isSigner:false,isWritable:i>=1&&i<=6})),...remaining.map(pubkey=>({pubkey,isSigner:false,isWritable:true}))];
 const ix=new TransactionInstruction({programId:clmm,keys,data:Buffer.concat([Buffer.from([43,4,237,11,26,201,30,98]),input.toArrayLike(Buffer,'le',8),min.toArrayLike(Buffer,'le',8),Buffer.alloc(16),Buffer.from([1])])});
 const block=await connection.getLatestBlockhash('confirmed');
 const tx=new Transaction({...block,feePayer:owner.publicKey}).add(ComputeBudgetProgram.setComputeUnitLimit({units:600000}),ix);
 tx.sign(owner);
 const signature=await connection.sendRawTransaction(tx.serialize());
 const explorer=`https://explorer.solana.com/tx/${signature}?cluster=devnet`;
 console.log(explorer);
 const result=await connection.confirmTransaction({...block,signature},'confirmed');
 if(result.value.err) throw Error(JSON.stringify(result.value.err));
 const prev=fs.existsSync(evidence)?JSON.parse(fs.readFileSync(evidence,'utf8')):{};
 const info={signature,explorer,trader:owner.publicKey.toBase58(),direction,input:input.toString(),minimum:min.toString(),before,after:await balances()};
 fs.writeFileSync(evidence,JSON.stringify({...prev,traderSwaps:[...(prev.traderSwaps??[]),info]},null,2)+'\n');
 console.log(info);
}
main().then(()=>process.exit(0),e=>{console.error(e);process.exit(1)});
