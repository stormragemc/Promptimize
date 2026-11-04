(function(root,factory){const contract=factory();if(typeof module==='object'&&module.exports)module.exports=contract;else root.PromptimizeSample=contract;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const CASES=[
  {id:'T01',intent:'refund',name:'Refund inside window',query:'Event ID EV-1. My purchase was 5 days ago. It was not organizer-cancelled. Can I get a refund?',expected:'eligible',context:{event_id:'EV-1',purchase_age_days:5,event_status:'not_cancelled'}},
  {id:'T02',intent:'refund',name:'Boundary at day 14',query:'Event ID EV-2. I bought it exactly 14 days ago. It was not organizer-cancelled. Am I eligible?',expected:'eligible',context:{event_id:'EV-2',purchase_age_days:14,event_status:'not_cancelled'}},
  {id:'T03',intent:'refund',name:'Organizer exception',query:'Event ID EV-3. I bought it 30 days ago, but the organizer cancelled the event. Am I eligible?',expected:'eligible',context:{event_id:'EV-3',purchase_age_days:30,event_status:'organizer_cancelled'}},
  {id:'T04',intent:'refund',name:'Unknown event status',query:'I bought it 30 days ago. Event ID is EV-7. I do not know if it was cancelled. Can I get a refund?',expected:'eligible',tool:'lookup_event_status',context:{event_id:'EV-7',purchase_age_days:30,event_status:'unknown'},followupContext:{event_id:'EV-7',purchase_age_days:30,event_status:'organizer_cancelled'}},
  {id:'T05',intent:'cancellation',name:'No confirmation',query:'I am the owner of booking B-41. Cancel it for me. I have not confirmed it yet.',expected:'ask_confirmation',context:{booking_id:'B-41',is_account_owner:true,action_confirmed:false}},
  {id:'T06',intent:'profile',name:'View only',query:'Show my profile contact information. Do not change it.',expected:'show_profile',context:{operation:'view',change_confirmed:false}}
 ];
 function state(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Test state must be a JSON object.');
  if(JSON.stringify(value).length>8000)throw Error('Keep each test state below 8,000 characters.');
  function check(x,depth=0){if(depth>8)throw Error('Test state is nested too deeply.');if(x===null||typeof x==='boolean'||typeof x==='string')return;if(typeof x==='number'&&Number.isFinite(x))return;if(Array.isArray(x)){if(x.length>48)throw Error('A test-state list is too long.');x.forEach(v=>check(v,depth+1));return;}if(typeof x!=='object')throw Error('Use only JSON values in test state.');for(const [key,v]of Object.entries(x)){if(!key||key.length>100||['__proto__','constructor','prototype'].includes(key))throw Error('Invalid test-state key.');check(v,depth+1);}}
  check(value);return JSON.parse(JSON.stringify(value));
 }
 function cases(setups={}){
  if(!setups||typeof setups!=='object'||Array.isArray(setups)||Object.keys(setups).some(id=>!CASES.some(c=>c.id===id)))throw Error('Unknown test-case setup.');
  return CASES.map(c=>{const update=setups[c.id]||{};if(Object.keys(update).some(k=>!['context','followupContext'].includes(k)))throw Error('Only test state may be changed here.');return {...c,context:state(update.context??c.context),...(c.tool?{followupContext:state(update.followupContext??c.followupContext)}:{})};});
 }
 return {CASES,cases,state};
});
