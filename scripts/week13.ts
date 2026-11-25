import * as anchor from '@coral-xyz/anchor';
import { PublicKey, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction, ComputeBudgetProgram, AccountMeta } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, getAccount } from '@solana/spl-token';
import * as sdk from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import Decimal from 'decimal.js';
import fs from 'node:fs';
import { assertDevnetAndBalance, connection, owner, initSdk, readAddresses } from './raydium-config';
const api:any=sdk, saved=readAddresses(), pk=(v:any)=>new PublicKey(v);
const id=pk('AQ1t23jJHzxzT1YR1n5ygPeamaEjg3kEYG7tyitDyapm'), clmm=pk(saved.programId), pool=pk(saved.poolId), mintA=pk(saved.tokenA), mintB=pk(saved.tokenB);
const pda=(seed:string,...keys:PublicKey[])=>PublicKey.findProgramAddressSync([Buffer.from(seed),...keys.map(k=>k.toBuffer())],id)[0];
const vaultState=pda('vault',mintA), vaultA=pda('vault_tokens',mintA), vaultB=pda('vault_tokens_b',vaultState), strategyState=pda('position_strategy',vaultState);
const metadata=pk('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'), memo=pk('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const file='week13-results.json';
function record(key:string,value:any){const old=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};fs.writeFileSync(file,JSON.stringify({...old,[key]:value},null,2)+'\n');}
const meta=(pubkey:PublicKey,isWritable=false,isSigner=false):AccountMeta=>({pubkey,isWritable,isSigner});
const raw=(v:any)=>new BN(v.toString());
const min=(a:BN,b:BN)=>a.lt(b)?a:b;
const maxSlip=(a:BN)=>a.muln(101).addn(99).divn(100);
const minSlip=(a:BN)=>a.muln(99).divn(100);
async function main(){
 await assertDevnetAndBalance(0.05);
 const program:any=new anchor.Program(JSON.parse(fs.readFileSync('target/idl/simple_vault.json','utf8')),new anchor.AnchorProvider(connection,new anchor.Wallet(owner),{commitment:'confirmed'}));
 if(!program.programId.equals(id))throw Error('Wrong program ID');
 const cmd=process.argv[2]||'status';
 const common={admin:owner.publicKey,vaultState,strategyState,vaultA,vaultB,clmmProgram:clmm,tokenProgram:TOKEN_PROGRAM_ID};
 const balances=async()=>({a:(await getAccount(connection,vaultA)).amount.toString(),b:(await getAccount(connection,vaultB)).amount.toString()});
 async function send(key:string,builder:any,extra:Keypair[]=[],context:any={}){
  const before=await balances();const ix=await builder.instruction();const block=await connection.getLatestBlockhash('confirmed');
  const tx=new Transaction({...block,feePayer:owner.publicKey}).add(ComputeBudgetProgram.setComputeUnitLimit({units:1000000}),ix);tx.sign(owner,...extra);
  const signature=await connection.sendRawTransaction(tx.serialize());console.log('https://explorer.solana.com/tx/'+signature+'?cluster=devnet');
  const result=await connection.confirmTransaction({...block,signature},'confirmed');if(result.value.err)throw Error(JSON.stringify(result.value.err));
  const details=await connection.getTransaction(signature,{commitment:'confirmed',maxSupportedTransactionVersion:0});
  record(key,{signature,before,after:await balances(),...context,logs:details?.meta?.logMessages??[]});
 }
 if(cmd==='init'){if(!await connection.getAccountInfo(strategyState))await send('init',program.methods.initializePositionStrategy().accountsStrict({vaultState,strategyState,admin:owner.publicKey,systemProgram:SystemProgram.programId}));else console.log('Already initialized');return;}
 const state=await program.account.strategyState.fetch(strategyState);
 if(cmd==='status'){console.log({strategy:state,vault:await program.account.vaultState.fetch(vaultState),balances:await balances()});return;}
 if(cmd==='sync'){await send('sync',program.methods.syncVault().accountsStrict(common));return;}
 if(!['open','collect','close'].includes(cmd))throw Error('Use init/status/open/collect/close/sync');
 const ray=await initSdk(), data:any=await ray.clmm.getPoolInfoFromRpc(saved.poolId), info=data.poolInfo;
 const m0=pk(info.mintA.address),m1=pk(info.mintB.address),forward=m0.equals(mintA);
 if(!m0.equals(forward?mintA:mintB)||!m1.equals(forward?mintB:mintA))throw Error('Pool mint mismatch');
 const v0=forward?vaultA:vaultB,v1=forward?vaultB:vaultA,pv0=pk(data.poolKeys.vault.A),pv1=pk(data.poolKeys.vault.B);
 const spacing=Number(saved.feeTier.tickSpacing), price=Number(info.price);
 if(!Number.isFinite(price)||price<=0)throw Error('Invalid pool price');
 const lower=cmd==='open'?Math.floor(Math.log(price*0.9)/Math.log(1.0001)/spacing)*spacing:state.tickLower;
 const upper=cmd==='open'?Math.ceil(Math.log(price*1.1)/Math.log(1.0001)/spacing)*spacing:state.tickUpper;
 const start=(t:number)=>api.TickArrayUtil.getTickArrayStartIndex(t,spacing);
 const lo=api.getPdaTickArrayAddress(clmm,pool,start(lower)).publicKey,hi=api.getPdaTickArrayAddress(clmm,pool,start(upper)).publicKey;
 const protocol=api.getPdaProtocolPositionAddress(clmm,pool,lower,upper).publicKey;
 const bitmap=api.getPdaExBitmapAccount(clmm,pool).publicKey;
 const bitmapMeta=await connection.getAccountInfo(bitmap)?[meta(bitmap,true)]:[];
 const sqrt=api.TickUtil.priceToSqrtPriceX64(new Decimal(info.price),info.mintA.decimals,info.mintB.decimals),sl=api.TickUtil.getSqrtPriceAtTick(lower),su=api.TickUtil.getSqrtPriceAtTick(upper);
 const math=api.LiquidityMathUtil;
 if(cmd==='open'){
  if(state.inMarket||state.needsSync)throw Error('Strategy not ready');
  const cap=new BN(10000000),b0=min(cap,raw((await getAccount(connection,v0)).amount)),b1=min(cap,raw((await getAccount(connection,v1)).amount));
  const liquidity=math.getLiquidityFromAmounts(sqrt,sl,su,b0.muln(98).divn(100),b1.muln(98).divn(100));
  const amounts=math.getAmountsForLiquidity(sqrt,sl,su,liquidity,true),max0=maxSlip(amounts.amountA),max1=maxSlip(amounts.amountB);
  if(liquidity.isZero()||max0.isZero()||max1.isZero()||max0.gt(b0)||max1.gt(b1))throw Error('Insufficient A/B or invalid range');
  const nft=Keypair.generate(),nftAta=getAssociatedTokenAddressSync(nft.publicKey,vaultState,true),personal=api.getPdaPersonalPositionAddress(clmm,nft.publicKey).publicKey;
  const md=PublicKey.findProgramAddressSync([Buffer.from('metadata'),metadata.toBuffer(),nft.publicKey.toBuffer()],metadata)[0];
  const r=[meta(owner.publicKey,true,true),meta(vaultState),meta(nft.publicKey,true,true),meta(nftAta,true),meta(md,true),meta(pool,true),meta(protocol),meta(lo,true),meta(hi,true),meta(personal,true),meta(v0,true),meta(v1,true),meta(pv0,true),meta(pv1,true),meta(SYSVAR_RENT_PUBKEY),meta(SystemProgram.programId),meta(TOKEN_PROGRAM_ID),meta(ASSOCIATED_TOKEN_PROGRAM_ID),meta(metadata),meta(TOKEN_2022_PROGRAM_ID),meta(m0),meta(m1),...bitmapMeta];
  await send('open',program.methods.openPosition({tickLower:lower,tickUpper:upper,tickArrayLowerStart:start(lower),tickArrayUpperStart:start(upper),liquidity,amountMaxA:max0,amountMaxB:max1}).accountsStrict(common).remainingAccounts(r),[nft],{nft:nft.publicKey.toBase58(),personal:personal.toBase58(),lower,upper,liquidity:liquidity.toString(),max0:max0.toString(),max1:max1.toString()});
  const account=await getAccount(connection,nftAta);if(!account.owner.equals(vaultState)||account.amount.toString()!=='1')throw Error('NFT ownership verification failed');record('nftVerified',{owner:account.owner.toBase58(),amount:account.amount.toString()});return;
 }
 if(!state.inMarket)throw Error('No open position');
 const nft=pk(state.positionNftMint),personal=pk(state.personalPosition),nftAta=getAssociatedTokenAddressSync(nft,vaultState,true);
 const pos=await connection.getAccountInfo(personal);if(!pos||!pos.owner.equals(clmm))throw Error('Missing position');
 const liquidity=api.PersonalPositionLayout.decode(pos.data).liquidity;
 const r=[meta(vaultState),meta(nftAta,cmd==='close'),meta(personal,true),meta(pool,true),meta(protocol),meta(pv0,true),meta(pv1,true),meta(lo,true),meta(hi,true),meta(v0,true),meta(v1,true),meta(TOKEN_PROGRAM_ID),meta(TOKEN_2022_PROGRAM_ID),meta(memo),meta(m0),meta(m1),...bitmapMeta];
 if(cmd==='collect'){await send('collect',program.methods.collectFees().accountsStrict(common).remainingAccounts(r));return;}
 const amounts=math.getAmountsForLiquidity(sqrt,sl,su,liquidity,false),min0=minSlip(amounts.amountA),min1=minSlip(amounts.amountB);
 await send('close',program.methods.closePosition(min0,min1).accountsStrict(common).remainingAccounts([...r,meta(nft,true),meta(SystemProgram.programId)]),[],{min0:min0.toString(),min1:min1.toString()});
}
main().then(()=>process.exit(0),e=>{console.error(e);process.exit(1)});
