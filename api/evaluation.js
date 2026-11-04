// Preserve the three public evaluation URLs while sharing one deployed function.
const {json}=require('./_meta');
const handlers=Object.freeze({plan:require('./_evaluation-plan'),preflight:require('./_evaluation-preflight'),case:require('./_evaluation-case')});
module.exports=(req,res)=>{
 const operation=req.query?.operation;
 if(typeof operation!=='string'||!Object.hasOwn(handlers,operation))return json(res,404,{error:'Unknown evaluation operation.'});
 return handlers[operation](req,res);
};
