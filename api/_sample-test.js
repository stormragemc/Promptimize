const {createHash}=require('node:crypto');
const contract=require('../sample-contract');
const {stableStringify}=require('./_semantic-context');
const {semanticCase}=require('./_semantic-runtime');
const {messagesFor}=require('./_bundle');
const TOOL_MESSAGE='SIMULATED TOOL RESULT lookup_event_status(EV-7): organizer_cancelled. Decide eligibility now. JSON only.';
const LOOKUP={action:'lookup_event_status',event_id:'EV-7'};
const hash=c=>createHash('sha256').update(stableStringify({id:c.id,intent:c.intent,query:c.query,expected:c.expected,context:c.context,followupContext:c.followupContext})).digest('hex');
function testCase(input){
 const known=contract.CASES.find(c=>c.id===input?.id);
 if(!known||input.intent!==known.intent||input.expected!==known.expected||typeof input.query!=='string'||!input.query.trim()||input.query.length>1500)throw Error('Unsupported test case.');
 return {...known,query:input.query,context:contract.state(input.context??known.context),...(known.tool?{followupContext:contract.state(input.followupContext??known.followupContext)}:{})};
}
function prepare(files,a,c,mode,stage='initial'){
 const executionContext=stage==='followup'?c.followupContext:c.context;
 const prepared=a.semantic?semanticCase(files,a,{mode,executionContext,utterance:c.query,intent:c.intent}):{messages:messagesFor(files,a,c.intent,c.query,mode,executionContext)};
 if(prepared.messages&&stage==='followup')prepared.messages=[...prepared.messages,{role:'assistant',content:JSON.stringify(LOOKUP)},{role:'user',content:TOOL_MESSAGE}];
 return prepared;
}
module.exports={...contract,testCase,prepare,hash,TOOL_MESSAGE,LOOKUP};
