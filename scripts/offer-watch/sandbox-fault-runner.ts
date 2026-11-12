/** Synthetic opt-in fault acceptance. No real publisher/source/model; SDK requires existing exact pin. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Redis } from '@upstash/redis';
import { sandboxConfiguration } from './sandbox-runner';
import { createRedisOfferState, STATE_SCRIPTS, type EvalTransport } from './redis-state';
import { mockRedis } from './redis-state.fixtures';
import { syntheticSnapshotBundle } from './state-snapshot.fixtures';
import { exportSnapshot, importSnapshot, restoreSnapshotToSandbox, snapshotDocuments } from './state-snapshot';
import { createAcceptanceFixture } from './acceptance-fixture';
import { runSandboxDaily } from './daily';
import { asyncOfferCheck } from './async-check';
import { isOfferCli } from './cli-entry';
type AfterEval=(script:string)=>void;
export interface FaultContext {
 mode:'fixtures-mock-redis'|'official-sdk-http-sandbox';
 session(scenario:string,runner:string,ttl?:number,after?:AfterEval):ReturnType<typeof createRedisOfferState>;
 expire():Promise<void>;
}
function context(prefix:string,transport:EvalTransport,expire:()=>Promise<void>,mode:FaultContext['mode']):FaultContext {
 return {mode,expire,session(scenario,runner,ttl=60000,after){
  assert.match(scenario,/^[a-z-]{1,20}$/);
  return createRedisOfferState({enabled:true,prefix:prefix.replace('}:',`-${scenario}}:`),runnerId:runner,ttlMs:ttl,transport:{eval:async(script,keys,args)=>{const result=await transport.eval(script,keys,args);after?.(script);return result;}}});
 }};
}
export function fixtureFaultContext():FaultContext {
 const db=mockRedis();return context('opencard:offer-state:{sandbox-fault-fixture}:',db.transport,async()=>{db.advance(1300);},'fixtures-mock-redis');
}
export async function casFault(ctx:FaultContext){
 const a=ctx.session('cas','cas-runner');await a.lease.acquire();
 try{const race=await Promise.allSettled([a.cas('operational',0,{synthetic:'a'}),a.cas('operational',0,{synthetic:'b'})]);
 assert.equal(race.filter(v=>v.status==='fulfilled').length,1);assert.equal(race.filter(v=>v.status==='rejected').length,1);
 await assert.rejects(a.cas('operational',0,{synthetic:'stale'}));assert.equal((await a.read('operational'))?.version,1);
 return {raceWinners:1,raceRejected:1,staleRejected:true,version:1};
 }finally{await a.lease.release();}
}
export async function expiryFault(ctx:FaultContext,options:{suppressLeaseSignalForTest?:boolean}={}){
 assert.ok(!options.suppressLeaseSignalForTest||ctx.mode==='fixtures-mock-redis','mutation allowed only with mockRedis');
 let leaseCanceledBeforeTimeout=false,delayed=false,injected=false,renewRejected=false,started=false,pid=0,old:ReturnType<typeof createRedisOfferState>|undefined;
 const h=createAcceptanceFixture({prettyMulti:true,checker:true,faultWait:true,stateFactory:id=>{
  const state=ctx.session('expiry',id,1000);old=state;const renew=state.lease.renew;
  state.lease.renew=async()=>{if(delayed){injected=true;await ctx.expire();}try{await renew();}catch(e){renewRejected=true;throw e;}};return state;
 }});
 try{const a=h.make('fault-expiry');const pidFile=path.join(path.dirname(a.repo),'fault-child.pid');
 a.options.config.checks=[['fixture-check','fault-wait']];
 a.options.asyncRun=async(_cmd,_args,signal,where)=>{
  const local=new AbortController();const combined=options.suppressLeaseSignalForTest?local.signal:AbortSignal.any([signal,local.signal]);const began=performance.now();
  const running=asyncOfferCheck('npm',['run','validate'],combined,{cwd:where.cwd,timeoutMs:6000,killGraceMs:20}).catch(error=>{leaseCanceledBeforeTimeout=signal.aborted&&performance.now()-began<5500;throw error;});
  void running.catch(()=>{});
  try{for(let n=0;n<200&&!fs.existsSync(pidFile);n++)await delay(10);assert.ok(fs.existsSync(pidFile));pid=Number(fs.readFileSync(pidFile,'utf8'));assert.ok(Number.isSafeInteger(pid)&&pid>0);started=true;delayed=true;return await running;}
  finally{local.abort();await running.catch(()=>{});}
 };
 await assert.rejects(runSandboxDaily(a.options));assert.ok(started&&injected&&renewRejected);assert.deepEqual(h.writes,[]);assert.ok(leaseCanceledBeforeTimeout,'lease abort must cancel child before fallback timeout');
 let stopped=false;for(let n=0;n<100;n++){try{process.kill(pid,0);if(/\) Z /.test(fs.readFileSync(`/proc/${pid}/stat`,'utf8'))){stopped=true;break;}}catch(e){if(['ESRCH','ENOENT'].includes((e as NodeJS.ErrnoException).code??'')){stopped=true;break;}throw e;}await delay(10);}assert.ok(stopped,'child must stop within bounded SIGKILL observation');assert.ok(old);
 const successor=ctx.session('expiry','fault-successor',60000);await successor.lease.acquire();
 try{assert.ok(successor.lease.fencing()!>old.lease.fencing()!);await assert.rejects(old.cas('operational',0,{synthetic:'stale-owner'}));}
 finally{await successor.lease.release();}
 return {childStarted:true,expiryInjected:true,renewRejected:true,leaseCanceledBeforeTimeout:true,childKilled:true,publicationWrites:0,successorFenceIncreased:true,oldOwnerWriteRejected:true};
 }finally{h.close();}
}
export async function restoreFault(ctx:FaultContext){
 const key=randomBytes(32);
 try{const bundle=syntheticSnapshotBundle(),encoded=exportSnapshot(bundle,key),decoded=importSnapshot(encoded,key);assert.deepEqual(decoded.bundle,bundle);
 let tamperCalls=0;const corrupt=JSON.parse(encoded.toString());corrupt.tag=Buffer.alloc(16).toString('base64');
 await assert.rejects(restoreSnapshotToSandbox({importIntoNewNamespace:async()=>{tamperCalls++;return 'forbidden';}},Buffer.from(JSON.stringify(corrupt)),key,true));assert.equal(tamperCalls,0);
 let injected=false;const first=ctx.session('restore','restore-interrupted',1000,script=>{if(script===STATE_SCRIPTS.reserveImport&&!injected){injected=true;throw Error('synthetic stop AFTER reservation acknowledgment');}});
 const fence=await first.lease.acquire();await assert.rejects(restoreSnapshotToSandbox(first,encoded,key,true));assert.ok(injected);
 await ctx.expire();const resumed=ctx.session('restore','restore-resumed');await resumed.lease.acquire();
 try{assert.ok(resumed.lease.fencing()!>fence);await assert.rejects(resumed.read('operational'));
 assert.equal(await restoreSnapshotToSandbox(resumed,encoded,key,true),'imported');assert.equal(await restoreSnapshotToSandbox(resumed,encoded,key,true),'already-imported');
 assert.deepEqual((await resumed.read('operational'))?.value,snapshotDocuments(bundle).operational);
 assert.deepEqual(await resumed.journal().load(bundle.journals[0].runId),bundle.journals[0]);
 await resumed.journal().claim(bundle.journals[0].fingerprints,bundle.journals[0].runId);await assert.rejects(async()=>{await resumed.journal().claim(bundle.journals[0].fingerprints,'different-run');});
 }finally{await resumed.lease.release();}
 const copy=ctx.session('restore-copy','restore-independent');await copy.lease.acquire();
 try{assert.equal(await restoreSnapshotToSandbox(copy,encoded,key,true),'imported');assert.deepEqual((await copy.read('operational'))?.value,snapshotDocuments(bundle).operational);assert.deepEqual(await copy.journal().load(bundle.journals[0].runId),bundle.journals[0]);await assert.rejects(async()=>{await copy.journal().claim(bundle.journals[0].fingerprints,'different-copy-run');});}
 finally{await copy.lease.release();}
 return {tamperRejectedBeforeTransport:true,interruptedAfterAck:true,pendingHidden:true,newFence:true,resumed:true,repeatIdempotent:true,journalExact:true,claimsPreserved:true,independentCopyExact:true};
 }finally{key.fill(0);}
}
export async function runFaultAcceptance(args:string[],env:NodeJS.ProcessEnv=process.env){
 // Reuse the exact production-excluding DB/endpointSHA/namespace/output guard, never .env or private files.
 const config=sandboxConfiguration(args,env);fs.mkdirSync(config.out,{mode:0o700});
 let ctx:FaultContext;
 if(config.sdk){const redis=new Redis({url:env.OPENCARD_SANDBOX_URL!,token:env.OPENCARD_SANDBOX_TOKEN!,retry:false,automaticDeserialization:false,enableAutoPipelining:false,signal:()=>AbortSignal.timeout(10000)});ctx=context(config.prefix!,{eval:(script,keys,values)=>redis.eval(script,keys,values)},async()=>{await delay(1300);},'official-sdk-http-sandbox');}
 else ctx=fixtureFaultContext();
 const summary={schema:1,mode:ctx.mode,syntheticOnly:true,remotePublication:'ALWAYS MOCKED',cas:await casFault(ctx),lease:await expiryFault(ctx),restore:await restoreFault(ctx),claim:'Injected post-ack stop/new session, NOT OS crash/failover or production DR'};
 fs.writeFileSync(path.join(config.out,'result.json'),JSON.stringify(summary,null,2),{mode:0o600,flag:'wx'});return summary;
}
if(isOfferCli(import.meta.url))runFaultAcceptance(process.argv.slice(2)).then(()=>console.log('Synthetic fault scenarios passed; summary only')).catch(()=>{console.error('Fault acceptance failed closed; details suppressed');process.exitCode=1;});
