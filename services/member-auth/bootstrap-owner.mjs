import { createMemberAuth } from './auth.mjs';
import { loadConfiguration } from './configuration.mjs';
const args=process.argv.slice(2);
if(args.length<2||args.length>3||args[0]!=='--user-id'||! /^[A-Za-z0-9_-]{1,128}$/.test(args[1])||(args.length===3&&args[2]!=='--revoke'))throw new Error('Usage: node bootstrap-owner.mjs --user-id EXACT_VERIFIED_BARCODE_ID [--revoke]');
const app=createMemberAuth(loadConfiguration());
try{
 await app.assertReady();
 if(args[2]==='--revoke'){await app.access.revokeOwner(args[1]);console.info('member_owner_revocation_ready');}
 else{await app.access.bootstrapOwner(args[1]);console.info('member_owner_bootstrap_ready');}
}finally{await app.close();}
