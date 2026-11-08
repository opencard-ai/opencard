import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { sandboxConfiguration, TEST_DATABASE_ID } from './sandbox-runner';
const workflow=()=>fs.readFileSync('.github/workflows/news-isolated-dry-run.yml','utf8');
test('workflow defaults SDK off and isolates test secrets from fixture chain',()=>{
 const text = workflow();
 const fixture = text.match(/^[\s\S]*?\n  fixture-dry-run:\n[\s\S]*?(?=^  [a-z][a-z0-9-]*:\n|(?![\s\S]))/m)?.[0];
 const sdk = text.match(/^  sdk-sandbox:\n[\s\S]*?(?=^  [a-z][a-z0-9-]*:\n|(?![\s\S]))/m)?.[0];
 assert.ok(fixture);assert.ok(sdk);
 assert.match(fixture,/sdk_sandbox:[\s\S]*?type: boolean\n        default: false/);
 assert.doesNotMatch(fixture,/secrets\.|environment:/);
 assert.match(sdk,/inputs\.sdk_sandbox == true/);assert.match(sdk,/needs: fixture-dry-run/);
 assert.match(sdk,/environment: opencard-migration-sandbox/);assert.doesNotMatch(sdk,/OPENCARD_SANDBOX_TOKEN=|OPENCARD_SANDBOX_URL=/);
 assert.deepEqual([...sdk.matchAll(/secrets\.([A-Z_]+)/g)].map(m=>m[1]).sort(),['OPENCARD_SANDBOX_TOKEN','OPENCARD_SANDBOX_URL']);
});
test('default CLI refuses; explicit fixtures never inspect SDK credentials',()=>{
 const env=new Proxy({},{get(){throw Error('SDK credentials must not be inspected');}});
 assert.throws(()=>sandboxConfiguration([],env));
 assert.equal(sandboxConfiguration(['--fixtures','--out',path.join(os.tmpdir(),'unused-cloud-policy-output')],env).sdk,false);
});
test('missing SDK credentials or mismatched endpoint fail before output/network',()=>{
 const args=['--sdk','--confirm-sandbox','--namespace','cloud-policy-test','--out',path.join(os.tmpdir(),'unused-cloud-policy-output')];
 assert.throws(()=>sandboxConfiguration(args,{}));
 assert.throws(()=>sandboxConfiguration(args,{OPENCARD_SANDBOX_DATABASE_ID:TEST_DATABASE_ID,OPENCARD_SANDBOX_URL:'https://example.invalid',OPENCARD_SANDBOX_TOKEN:'synthetic-policy-token'}));
});
test('SDK invalid configuration emits sanitized error with no secret or artifact',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sdk-policy-invalid-'));
 try{const out=path.join(root,'summary'),token='synthetic-policy-token',url='https://example.invalid';
 const result=spawnSync('python3',['scripts/offer-watch/sandbox-launch.py','--sdk','--confirm-sandbox','--namespace','cloud-policy-test','--out',out],{encoding:'utf8',timeout:60000,env:{PATH:process.env.PATH,HOME:root,OPENCARD_SANDBOX_DATABASE_ID:TEST_DATABASE_ID,OPENCARD_SANDBOX_URL:url,OPENCARD_SANDBOX_TOKEN:token}});
 assert.notEqual(result.status,0);const log=result.stdout+result.stderr;assert.match(log,/failed closed/);assert.ok(!log.includes(token)&&!log.includes(url));assert.equal(fs.existsSync(out),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('fixture runner artifact has exact safe schema despite irrelevant SDK env',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sdk-policy-fixture-'));
 try{const out=path.join(root,'summary'),token='synthetic-policy-token';
 const result=spawnSync('python3',['scripts/offer-watch/sandbox-launch.py','--fixtures','--out',out],{encoding:'utf8',timeout:60000,env:{PATH:process.env.PATH,HOME:root,OPENCARD_SANDBOX_URL:'https://example.invalid',OPENCARD_SANDBOX_TOKEN:token}});assert.equal(result.status,0,result.stderr);
 assert.deepEqual(fs.readdirSync(out),['result.json']);const text=fs.readFileSync(path.join(out,'result.json'),'utf8'),value=JSON.parse(text);
 assert.equal(value.mode,'fixtures-mock-redis');assert.equal(value.databaseId,null);assert.ok(!text.includes(token));
 assert.deepEqual(Object.keys(value).sort(),['mode','fixtureOnly','databaseId','syntheticSlot','stages','sourceFetches','mockPublicationSequences','freshLinkedWorktrees','actualFixtureNpmChecks','remotePublication','actionsValidated'].sort());
 assert.equal(value.remotePublication,'ALWAYS MOCKED; no real push/PR/merge/deploy');assert.equal(value.freshLinkedWorktrees,2);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
