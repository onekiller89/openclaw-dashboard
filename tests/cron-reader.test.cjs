const assert = require('node:assert/strict');
const { normalizeJobs, createCronReader } = require('../cron-reader');
(async () => {
  const current = { jobs: [{ id: 'current', name: '<img src=x>', enabled: false,
    schedule: { kind: 'cron', expr: '0 9 15 * *', tz: 'Australia/Sydney' },
    state: { lastRunStatus: 'ok', lastStatus: 'error', nextRunAtMs: 42, lastDurationMs: 0 } }], total: 1, hasMore: false };
  const rows = normalizeJobs(current);
  assert.equal(rows[0].lastStatus, 'ok'); assert.equal(rows[0].enabled, false);
  assert.equal(rows[0].schedule, '0 9 15 * * (Australia/Sydney)');
  assert.equal(normalizeJobs({jobs:[{id:'every',schedule:{kind:'every',everyMs:60000}},
    {id:'at',schedule:{kind:'at',at:'2026-11-02T00:00:00Z'}}]})[0].schedule,'Every 60s');
  assert.equal(normalizeJobs({jobs:[{id:'old',schedule:'0 * * * *',state:{lastStatus:'ok'}}]})[0].lastStatus,'ok');
  assert.equal(normalizeJobs({jobs:[{id:'unknown'}]})[0].enabled,null);
  for (const data of [{}, {jobs:null}, {jobs:[{}]}, {jobs:[{id:'a'},{id:'a'}]},
    {jobs:[],hasMore:true}, {jobs:[],total:1}]) assert.throws(() => normalizeJobs(data));
  let reads = 0;
  let result = await createCronReader('/synthetic', {readCurrent:async()=>current,
    readFile:async()=>{throw Error('must not read snapshot');}})();
  assert.equal(result.status,'current'); assert.equal(result.readOnly,true);
  result = await createCronReader('/synthetic', {readCurrent:async()=>({jobs:[]})}) ();
  assert.equal(result.status,'current'); assert.deepEqual(result.jobs,[]);
  result = await createCronReader('/synthetic', {readCurrent:async()=>{throw Error('secret not emitted');},
    readFile:async file=>{reads++;assert.equal(file,'/synthetic/cron/jobs.json');return JSON.stringify({jobs:[{id:'old',enabled:true,state:{lastStatus:'ok'}}]});}})();
  assert.equal(result.status,'legacy-snapshot'); assert.equal(reads,1); assert.match(result.message,/unverified/);
  for (const content of ['not json', '{}', '{"jobs":null}']) {
    result=await createCronReader('/synthetic',{readCurrent:async()=>{throw Error('private');},readFile:async()=>content})();
    assert.equal(result.status,'unavailable'); assert.deepEqual(result.jobs,[]);
    assert(!JSON.stringify(result).includes('private'));
  }
  result=await createCronReader('/synthetic',{readCurrent:async()=>{throw Error('timeout');},readFile:async()=>{throw Error('EACCES');}})();
  assert.equal(result.status,'unavailable');
  // A later failed read must replace a prior successful response, never retain it.
  const realNow=Date.now;let now=100000;let calls=0;
  Date.now=()=>now;
  try {
    const reader=createCronReader('/synthetic',{readCurrent:async()=>{calls++;if(calls===1)return current;throw Error('failed');},readFile:async()=>{throw Error('absent');}});
    const pair=await Promise.all([reader(),reader()]);assert.equal(calls,1);assert.equal(pair[0].status,'current');
    now+=16000;result=await reader();assert.equal(result.status,'unavailable');assert.deepEqual(result.jobs,[]);
  } finally {Date.now=realNow;}
  // Exercise the default child adapter with a mocked subprocess, not a real CLI.
  const vm=require('vm'),fs=require('fs'),path=require('path');
  const source=fs.readFileSync(path.join(__dirname,'../cron-reader.js'),'utf8');
  for (const mode of ['ok','error','invalid']) {
    const module={exports:{}};
    const context=vm.createContext({module,Date,require:name=>{
      if(name==='child_process')return {execFile:(executable,args,options,callback)=>{
        assert.equal(executable,'openclaw');assert.deepEqual(Array.from(args),['cron','list','--all','--json']);
        assert.equal(options.timeout,12000);assert.equal(options.maxBuffer,2097152);assert.equal(options.env,undefined);
        callback(mode==='error'?Error('DO NOT EMIT PRIVATE STDERR'):null,mode==='invalid'?'bad json':JSON.stringify(current));
      }};
      if(name==='fs')return {existsSync:()=>false,promises:{readFile:async()=>{throw Error('absent');}}};
      return require(name);
    }});
    vm.runInContext(source,context);
    const output=await module.exports.createCronReader('/synthetic')();
    assert.equal(output.status,mode==='ok'?'current':'unavailable');assert(!JSON.stringify(output).includes('PRIVATE'));
  }
  console.log('PASS current/legacy formats, current empty, invalid/partial inventories, missing/unreadable files, safe errors, no historical fallback');
})().catch(e=>{console.error(e);process.exitCode=1;});
