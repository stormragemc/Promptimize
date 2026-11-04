// Deterministic, isolated tool fixtures. No production HR or payment API is called.
function simulateJD(test,answer){
 const c=test.context||{};const before={workspace:'jd',jdOpen:!!c.jd_viewer_open,evaluationOpen:!!c.jd_evaluation_results_modal_open,evaluationTab:'summary',candidateInfoOpen:!!c.candidate_information_modal_open,candidateInfoTab:'personal',selectedApplicant:null,attendees:[],leaveFormOpen:false};const state=structuredClone(before);const intent=answer.intent||answer.action,entities=answer.entities||{};let tool,allowed=true,args={},reason='';
 switch(intent){
 case 'navigate_published_jd_applicant_evaluation_tab':tool='evaluation.set_tab';args={tab:entities.evaluation_results_tab};allowed=state.evaluationOpen&&['summary','transcript','facial'].includes(args.tab);if(allowed)state.evaluationTab=args.tab;break;
 case 'close_published_jd_applicant_evaluation_results':tool='evaluation.close';allowed=state.evaluationOpen;if(allowed)state.evaluationOpen=false;break;
 case 'navigate_candidate_information_tab':tool='candidate_info.set_tab';args={tab:entities.candidate_information_tab};allowed=state.candidateInfoOpen&&['personal','education','payslips','references'].includes(args.tab);if(allowed)state.candidateInfoTab=args.tab;break;
 case 'view_published_jd_applicant':tool='applicants.select';args={name:entities.applicant_name_query};allowed=c.jd_published_viewer_active_tab==='applicants'&&args.name==='Alex Example';if(allowed)state.selectedApplicant='applicant-fixture-1';break;
 case 'interview_scheduling':tool='interview.add_attendee';args={name:entities.attendee_name_query};allowed=c.interview_workflow_phase==='awaiting_attendee_names'&&args.name==='Alex Example';if(allowed)state.attendees.push(args.name);break;
 case 'apply_leave':tool='workspace.open_leave';allowed=/leave/i.test(test.query);if(allowed){state.workspace='leave';state.leaveFormOpen=true}break;
 default:tool='unsupported_intent';args={intent};allowed=false;
 }
 if(!allowed)reason='The simulated tool rejected an unsupported action or unmet UI precondition.';
 const wanted={U01:{evaluationTab:'facial',evaluationOpen:true,jdOpen:true},U02:{evaluationOpen:false,jdOpen:true},U03:{candidateInfoTab:'education',candidateInfoOpen:true},U04:{selectedApplicant:'applicant-fixture-1',leaveFormOpen:false},U05:{attendees:['Alex Example'],selectedApplicant:null,leaveFormOpen:false},U06:{workspace:'leave',leaveFormOpen:true}}[test.id]||{};
 const assertions=Object.entries(wanted).map(([key,value])=>({label:key,expected:value,actual:state[key],pass:JSON.stringify(value)===JSON.stringify(state[key])}));
 return {kind:'jd-viewer',adapterDispatch:true,initialState:before,finalState:state,steps:[{type:'context',label:'Load request context',state:before},{type:'decision',label:'Model classification',detail:intent},{type:'tool',label:tool,arguments:args,executed:allowed,result:allowed?'Fixture state updated':reason,state},{type:'assertions',label:'Check resulting state',state}],assertions,passed:allowed&&assertions.every(x=>x.pass),invalidAttempts:allowed?0:1};
}
function simulateSample(test,answer,toolCalls,pass){
 const before={workspace:'event-operations',eligibility:'undecided',confirmation:'not requested',profile:'not displayed'};const state={...before};const action=answer.action;
 if(['eligible','ineligible'].includes(action))state.eligibility=action;if(action==='ask_confirmation')state.confirmation='waiting for owner';if(action==='show_profile')state.profile='read-only';
 return {kind:'event-operations',initialState:before,finalState:state,adapterDispatch:true,steps:[{type:'context',label:'Load event fixture',state:before},...toolCalls.map(t=>({type:'tool',label:t.name,arguments:t.arguments,executed:t.executed!==false,result:t.result})),{type:'decision',label:'Model action',detail:action,state},{type:'assertions',label:'Check expected behavior',state}],assertions:[{label:'Expected action',expected:test.expected,actual:action,pass}],passed:pass,invalidAttempts:toolCalls.filter(t=>t.executed===false).length};
}
module.exports={simulateJD,simulateSample};
