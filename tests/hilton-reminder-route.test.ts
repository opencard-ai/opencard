import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as crypto from 'node:crypto';
import * as hilton from '../lib/hilton-anniversary';
import * as periods from '../lib/reminder-logic';

test('cron integrates Hilton-only email, copy dates, subscription gates, retries and failed-send reservation', async () => {
  const product='amex-hilton-honors';
  const user={created_at:1,status:'confirmed',marketing_optin:true,email_for_send:Buffer.from('fixture@example.invalid'.split('').reverse().join('')).toString('base64'),cards:[product],card_instances:[{instance_id:'one',card_id:product},{instance_id:'two',card_id:product}]};
  const users:Record<string,unknown>={yes:user,pending:{...user,status:'pending'},off:{...user,marketing_optin:false},unsub:{...user,status:'unsubscribed'}};
  const values=new Map<string,unknown>();
  for(const name of Object.keys(users))values.set(`opencard:user:${name}:open_dates`,{one:{year:2025,month:9},two:{year:2025,month:4}});
  const emails:{html:string;subject:string}[]=[];let fail=false;
  class Redis {
    async smembers(){return Object.keys(users)}
    async hgetall(key:string){return users[key.split(':').at(-1)!]}
    async get(key:string){return values.get(key)}
    async set(key:string,value:unknown,options?:{nx?:boolean}){if(options?.nx&&values.has(key))return null;values.set(key,value);return 'OK'}
  }
  class FixedDate extends Date {constructor(value?:string|number){super(value??'2026-09-20T16:00:00Z')}}
  const modules:Record<string,unknown>={
    'next/server':{NextResponse:{json:(body:unknown)=>body}},'@upstash/redis':{Redis},
    '../../../../lib/reminder-logic':periods,'@/lib/hilton-anniversary':hilton,
    '@/lib/email':{sendEmail:async(x:{html:string;subject:string})=>{emails.push(x);return {ok:!fail}}},'node:crypto':crypto,
  };
  const source=fs.readFileSync('app/api/cron/reminders/route.ts','utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const route=await vm.runInNewContext(`(async()=>{${compiled};return exports;})()`,{
    exports:{},require:(name:string)=>{assert(name in modules,name);return modules[name]},
    process:{env:{CRON_SECRET:'test-only',NEXT_PUBLIC_BASE_URL:'https://opencardai.com'}},Buffer,Date:FixedDate,
    setTimeout:(fn:()=>void)=>fn(),console:{error:()=>{},warn:()=>{}},
    fetch:async()=>({ok:true,json:async()=>[{card_id:product,name:'Hilton Honors',annual_fee:0,recurring_credits:[]}]}),
  });
  const request={headers:{get:()=> 'Bearer test-only'}};
  assert.equal((await route.GET(request)).sent,1);
  assert.equal(emails.length,1);assert(emails[0].html.includes('Card #1'));assert(!emails[0].html.includes('Card #2'));
  assert(emails[0].subject.includes('Hilton'));assert(emails[0].html.includes('/en/my-cards#my-cards-ai'));
  await route.GET(request);assert.equal(emails.length,1,'repeat invocation must not send again');
  users.failure=user;values.set('opencard:user:failure:open_dates',{one:{year:2025,month:9}});fail=true;
  assert.equal((await route.GET(request)).failed,1);
  await route.GET(request);assert.equal(emails.length,2,'failed/uncertain delivery reserved for review, not resent');
});
