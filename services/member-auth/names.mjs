import { APIError } from 'better-auth/api';
const reserved=new Set(['barcode network','corporate','bnl','bnl-01','owner','admin']);
export function normalizeName(value) {
 if(typeof value!=='string')throw new APIError('BAD_REQUEST',{code:'INVALID_NAME',message:'Account name must be 1 to 80 characters.'});
 const name=value.normalize('NFKC').trim().replace(/\s+/gu,' ');
 if(!name||name.length>80||/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/u.test(value))throw new APIError('BAD_REQUEST',{code:'INVALID_NAME',message:'Account name must be 1 to 80 visible characters.'});
 return {name,key:name.toLowerCase()};
}
export function isReservedName(key){return reserved.has(key);}
export function checkedName(database,value,userId) {
 const {name,key}=normalizeName(value);
 if(isReservedName(key)&&!database.prepare('SELECT 1 FROM member_reserved_names WHERE name_key=? AND user_id=?').get(key,userId||''))throw new APIError('BAD_REQUEST',{code:'NAME_UNAVAILABLE',message:'This account name is unavailable.'});
 const existing=database.prepare('SELECT id FROM user WHERE nameKey=?').get(key);
 if(existing&&existing.id!==userId)throw new APIError('BAD_REQUEST',{code:'NAME_UNAVAILABLE',message:'This account name is unavailable.'});
 return {name,nameKey:key};
}
