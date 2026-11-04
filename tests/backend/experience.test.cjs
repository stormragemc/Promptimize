const test=require('node:test'),assert=require('node:assert/strict');
const {nextAction,finishStats,formatStat,tour}=require('../../experience-model');
test('guidance follows the real review, freeze, bundle and budget gates',()=>{
 assert.equal(nextAction({panel:'input'}).id,'sample');
 assert.equal(nextAction({panel:'input',files:3}).id,'analyze');
 assert.equal(nextAction({panel:'proposal',proposalDirty:true}).id,'save-tree');
 assert.equal(nextAction({panel:'proposal',proposalDirty:false}).id,'to-review');
 assert.equal(nextAction({panel:'review',reviewSaved:true,reviewDirty:true}).id,'save-review');
 assert.equal(nextAction({panel:'review',reviewSaved:true}).id,'freeze');
 assert.equal(nextAction({panel:'review',approved:true}),null);
 assert.equal(nextAction({panel:'candidate'}).id,'prepare-bundle');
 assert.equal(nextAction({panel:'candidate',bundleReady:true,supported:true}).id,'go-tests');
 assert.equal(nextAction({panel:'candidate',bundleReady:true,supported:false}).id,'export-zip');
 const s={panel:'tests',supported:true};
 assert.equal(nextAction(s).id,'build-test-plan');s.plan=true;
 assert.equal(nextAction(s).id,'approve-test-plan');s.planApproved=true;
 assert.equal(nextAction(s).id,'preflight');s.preflight=true;
 assert.equal(nextAction(s).id,'edit-test-plan');s.canRun=true;s.budgetBlocked=true;
 assert.equal(nextAction(s).id,'edit-test-plan');s.budgetBlocked=false;
 assert.equal(nextAction(s).id,'run-tests');s.finished=true;assert.equal(nextAction(s),null);
});
test('guidance never nudges through a running operation, modal or active editor',()=>{
 for(const flag of ['busy','running','dialog','dirtyInput'])assert.equal(nextAction({panel:'input',files:3,[flag]:true}),null);
 assert.equal(nextAction({panel:'tests',supported:false}),null);
});
const report=()=>({expectedPairs:10,baseline:{passed:10,totalTokens:10000,unknownUsageCalls:0,p50LatencyMs:1000,costUSD:.05},candidate:{passed:9,totalTokens:8000,unknownUsageCalls:0,p50LatencyMs:1400,costUSD:.04}});
test('finish counters distinguish savings from added tokens and observed pass rates',()=>{
 const r=report(),stats=finishStats(r);
 assert.equal(stats[0].to,2000);assert.equal(stats[0].tone,'good');assert.equal(stats[0].caption,'-20.0% vs old tasks');
 assert.equal(stats[1].from,100);assert.equal(stats[1].to,90);assert.equal(stats[1].tone,'bad');
 assert.equal(stats[2].from,1);assert.equal(stats[2].to,1.4);assert.equal(stats[2].tone,'bad');
 assert.equal(stats[3].from,.05);assert.equal(stats[3].to,.04);assert.equal(formatStat(stats[3]),'$0.04000');
 r.candidate.totalTokens=11000;const increased=finishStats(r)[0];assert.equal(increased.label,'More task tokens');assert.equal(increased.tone,'bad');assert.equal(increased.caption,'+10.0% vs old tasks');
});
test('unknown receipts and cost never animate invented savings or zero cost',()=>{
 const r=report();r.candidate.unknownUsageCalls=1;r.candidate.costUSD=null;r.candidate.p50LatencyMs=null;
 const s=finishStats(r);assert.equal(s[0].tone,'');assert.match(s[0].caption,/unverified/);assert.equal(formatStat(s[3]),'Unverified');assert.equal(s[3].tone,'');assert.equal(s[2].to,null);
});
test('walkthrough covers each real workflow and explains paid actions and immutable drafts',()=>{
 assert.deepEqual([...new Set(tour.map(s=>s.panel))],['input','audit','proposal','review','candidate','tests','finish']);
 assert(tour.every(s=>s.target&&s.body&&s.note&&s.clicks.length));
 assert.match(tour.find(s=>s.title==='Size first. Then compare.').note,/paid model calls only after/);
 assert.match(tour.find(s=>s.panel==='review').note,/never silently patch/);
});
