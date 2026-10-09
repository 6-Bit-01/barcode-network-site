import Database from 'better-sqlite3';
import { isAbsolute } from 'node:path';
import { existsSync } from 'node:fs';
const [destination]=process.argv.slice(2),source=process.env.BARCODE_MEMBER_DATABASE_PATH;
if(!source||!destination||!isAbsolute(source)||!isAbsolute(destination)||source===destination||existsSync(destination))throw new Error('Distinct absolute database/unused backup paths required');
const db=new Database(source,{readonly:true,fileMustExist:true});
try{await db.backup(destination);const backup=new Database(destination,{readonly:true});try{if(backup.pragma('integrity_check',{simple:true})!=='ok')throw new Error('Backup integrity failed');}finally{backup.close();}console.info('member_backup_verified');}finally{db.close();}
