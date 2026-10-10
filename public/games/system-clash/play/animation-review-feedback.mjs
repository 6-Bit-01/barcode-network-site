const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
  &&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const decisions=new Set(['approved','rejected','unreviewed']);
const faces=['right','left'];
const itemsFor=index=>plain(index)&&Array.isArray(index.items)?index.items.filter(item=>
  plain(item)&&own(item,'id')&&typeof item.id==='string'&&item.id.length>0
  &&own(item,'bankSignature')&&typeof item.bankSignature==='string'):[];
export const keyFor=(item,facing)=>item.id+'/'+facing;
export const signatureFor=(item,index)=>item.bankSignature+':'+index.runtimeSignature;

export function normalizeReviewEntries(index,entries){
  const accepted=Object.create(null),known=new Map(itemsFor(index).map(item=>[item.id,item]));
  let ignored=0;
  const array=Array.isArray(entries);
  if(!array&&!plain(entries))return {accepted,ignored:1};
  const pairs=array?entries.map(entry=>[null,entry]):Object.entries(entries);
  for(const [key,record] of pairs){
    if(!plain(record)){ignored++;continue;}
    const cut=key===null?-1:key.lastIndexOf('/');
    const id=key===null?(own(record,'id')?record.id:null):key.slice(0,cut);
    const facing=key===null?(own(record,'facing')?record.facing:null):key.slice(cut+1);
    const item=known.get(id);
    if(!item||!faces.includes(facing)||(key!==null&&key!==keyFor(item,facing))
      ||(own(record,'id')&&record.id!==id)||(own(record,'facing')&&record.facing!==facing)
      ||!own(record,'decision')||!decisions.has(record.decision)
      ||!own(record,'signature')||typeof index.runtimeSignature!=='string'
      ||record.signature!==signatureFor(item,index)
      ||(own(record,'notes')&&typeof record.notes!=='string')
      ||(own(record,'updatedAt')&&typeof record.updatedAt!=='string')){
      ignored++;continue;
    }
    const currentKey=keyFor(item,facing);
    if(own(accepted,currentKey))ignored++;
    accepted[currentKey]={decision:record.decision,
      notes:own(record,'notes')?record.notes.slice(0,8000):'',
      updatedAt:own(record,'updatedAt')?record.updatedAt.slice(0,128):'',
      signature:signatureFor(item,index)};
  }
  return {accepted,ignored};
}

function summarize(index,accepted){
  const total=plain(index)&&Array.isArray(index.items)?index.items.length*2:0;
  const result={total,approved:0,rejected:0,noted:0,unreviewed:total};
  for(const item of itemsFor(index))for(const facing of faces){
    const record=accepted[keyFor(item,facing)];if(!record)continue;
    if(record.decision!=='unreviewed'){result[record.decision]++;result.unreviewed--;}
    if(record.notes.trim())result.noted++;
  }
  return result;
}
export function reviewSummary(index,records){
  return summarize(index,normalizeReviewEntries(index,records).accepted);
}
export function feedbackDocument(index,records){
  const accepted=normalizeReviewEntries(index,records).accepted,entries=[];
  for(const item of itemsFor(index))for(const facing of faces){
    const record=accepted[keyFor(item,facing)];
    if(!record||(record.decision==='unreviewed'&&!record.notes.trim()&&!record.updatedAt))continue;
    entries.push({id:item.id,fighterId:item.fighterId,clipName:item.clipName,bank:item.bank,
      facing,...record});
  }
  return {schemaVersion:1,gameRevision:index.gameRevision,runtimeSignature:index.runtimeSignature,
    exportedAt:new Date().toISOString(),summary:summarize(index,accepted),entries};
}
