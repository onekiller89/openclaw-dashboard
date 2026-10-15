const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8');
for (const page of ['sys-security','config-editor','docker']) {
  assert(!html.includes(`data-page="${page}"`));
  assert(!html.includes(`id="${page}"`));
}
for (const endpoint of ['/api/docker','/api/openclaw-config','/api/sys-security','/api/cron/']) assert(!html.includes(endpoint));
assert(html.includes('data-page="security"')); // Existing account/MFA page stays.
for (const handler of ['toggleNotifPanel','fetchNotifications','checkNewNotifications']) assert(html.includes(`function ${handler}(`));
assert(html.includes('setInterval(checkNewNotifications, 30000)'));
const panel = {innerHTML:''};
let response;
const context = vm.createContext({document:{getElementById:id=>{assert.equal(id,'cronJobs');return panel;}},
  API_BASE:'', authFetch:async()=>{if(response instanceof Error)throw response;return response;}, Date});
const start = html.indexOf('// Cron inventory rendering:');
const end = html.indexOf('// End cron inventory rendering.',start);
assert(start>0 && end>start);
vm.runInContext(html.slice(start,end),context);
const call = (name,data)=>{context.input=data;return vm.runInContext(`${name}(input)`,context);};
(async()=>{
  call('renderCronInventory',{status:'current',checkedAt:1,jobs:[{name:'<img src=x onerror=evil()>',schedule:'<script>evil()</script>',enabled:true,lastStatus:'<b>ok</b>',nextRunAt:42,lastDuration:0}]});
  assert(panel.innerHTML.includes('&lt;img'));assert(!panel.innerHTML.includes('<img'));
  assert(panel.innerHTML.includes('&lt;script&gt;'));assert(!panel.innerHTML.includes('<button'));
  call('renderCronInventory',{status:'current',jobs:[]});assert(panel.innerHTML.includes('No current cron jobs returned'));
  call('renderCronInventory',{status:'legacy-snapshot',jobs:[]});assert(panel.innerHTML.includes('current inventory remains unverified'));
  call('renderCronInventory',{status:'unavailable',jobs:[]});assert(panel.innerHTML.includes('unavailable'));assert(!panel.innerHTML.includes('No current cron jobs'));
  for (responseValue of [new Error('private'),{ok:false},{ok:true,json:async()=>({wrong:true})},{ok:true,json:async()=>{throw Error('private');}}]) {
    panel.innerHTML='OLD JOB';response=responseValue;await vm.runInContext('fetchCronInventory()',context);
    assert(!panel.innerHTML.includes('OLD JOB'));assert(panel.innerHTML.includes('unavailable'));assert(!panel.innerHTML.includes('private'));
  }
  console.log('PASS removed controls, retained account security, escaped read-only current/legacy/empty rendering, stale panel cleared on HTTP/network/schema/JSON errors');
})().catch(e=>{console.error(e);process.exitCode=1;});
