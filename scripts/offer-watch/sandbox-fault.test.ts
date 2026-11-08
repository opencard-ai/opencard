import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fixtureFaultContext,casFault,expiryFault,restoreFault} from './sandbox-fault-runner';
test('CAS scenario executes actual model race and rejects stale revision',async()=>{assert.deepEqual(await casFault(fixtureFaultContext()),{raceWinners:1,raceRejected:1,staleRejected:true,version:1});});
test('loss injected by fake Redis clock aborts real harmless npm process group before publication',async()=>{const r=await expiryFault(fixtureFaultContext());assert.equal(r.childKilled,true);assert.equal(r.publicationWrites,0);assert.equal(r.successorFenceIncreased,true);});
test('AES interrupted acknowledgment resumes hidden manifest and preserves journal/claims/copy',async()=>{const r=await restoreFault(fixtureFaultContext());assert.ok(Object.values(r).every(v=>v===true));});
test('CAS scenario cannot pass if fake competitor is wrongly accepted',async()=>{const ctx=fixtureFaultContext(),make=ctx.session;ctx.session=(...args)=>{const s=make(...args);s.cas=async()=>({schema:1,version:1,fence:1,value:{}} as never);return s;};await assert.rejects(casFault(ctx));});
test('restore scenario cannot pass if postack interruption hook is ignored',async()=>{const ctx=fixtureFaultContext(),make=ctx.session;ctx.session=(scenario,id,ttl)=>make(scenario,id,ttl);await assert.rejects(restoreFault(ctx));});
test('fixed launcher fixture fault entry writes only sanitized summary; invalidSDK pin makes none',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'fault-cli-test-'));
 try{const out=path.join(root,'summary'),env={PATH:process.env.PATH,HOME:root,OPENCARD_SANDBOX_URL:'https://example.invalid',OPENCARD_SANDBOX_TOKEN:'synthetic-not-live'};
 const r=spawnSync('python3',['scripts/offer-watch/sandbox-launch.py','--fault-scenarios','--fixtures','--out',out],{env,encoding:'utf8',timeout:20000});assert.equal(r.status,0,r.stderr);assert.deepEqual(fs.readdirSync(out),['result.json']);const raw=fs.readFileSync(path.join(out,'result.json'),'utf8'),v=JSON.parse(raw);assert.equal(v.mode,'fixtures-mock-redis');assert.equal(v.lease.childKilled,true);assert.equal(v.restore.independentCopyExact,true);assert.ok(!raw.includes(env.OPENCARD_SANDBOX_TOKEN)&&!raw.includes(env.OPENCARD_SANDBOX_URL));assert.equal(fs.statSync(path.join(out,'result.json')).mode&0o077,0);
 const bad=path.join(root,'bad'),b=spawnSync('python3',['scripts/offer-watch/sandbox-launch.py','--fault-scenarios','--sdk','--confirm-sandbox','--namespace','fault-fixture-test','--out',bad],{env,encoding:'utf8',timeout:10000});assert.notEqual(b.status,0);assert.equal(fs.existsSync(bad),false);assert.ok(!(b.stdout+b.stderr).includes(env.OPENCARD_SANDBOX_TOKEN));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('fallback timeout cannot impersonate lease-triggered cancellation',async()=>{await assert.rejects(expiryFault(fixtureFaultContext(),{suppressLeaseSignalForTest:true}),/lease abort must cancel child before fallback timeout/);});
