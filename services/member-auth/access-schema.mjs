import { normalizeName, isReservedName } from './names.mjs';
import { tryGetCurrentAuthEndpointContext } from '@better-auth/core/context';
export function registerNameConstraints(db){
 db.function('member_name_key',{deterministic:true},value=>normalizeName(value).key);
 db.function('member_actor_id',()=>tryGetCurrentAuthEndpointContext()?.context?.session?.user?.id||null);
}
export function accessSchemaReady(db) {
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='member_access_schema'").get()||db.prepare('SELECT version FROM member_access_schema').get()?.version!==1)throw new Error('Explicit account access migration required');
 for(const name of ['member_access','member_access_audit','member_reserved_names'])if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))throw new Error('Account access schema incomplete');
 const triggers=db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'member_access_%'").all();
 if(triggers.length!==5||!db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='member_user_name_unique'").get())throw new Error('Account name constraints missing');
 if(db.prepare('SELECT 1 FROM user u LEFT JOIN member_access a ON a.user_id=u.id WHERE a.user_id IS NULL OR u.nameKey IS NULL OR u.nameKey=? LIMIT 1').get(''))throw new Error('Account access schema incomplete');
}
export function preflightAccessMigration(db,{preserveReservedUserId}={}) {
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='user'").get()){if(preserveReservedUserId)throw new Error('Reviewed reserved-name user ID does not exist');return [];}
 const hasKey=db.prepare('PRAGMA table_info(user)').all().some(c=>c.name==='nameKey');
 const users=db.prepare('SELECT id,name,'+(hasKey?'nameKey':'NULL AS nameKey')+' FROM user').all(),keys=new Map(),rows=[];
 if(preserveReservedUserId&&!users.some(u=>u.id===preserveReservedUserId))throw new Error('Reviewed reserved-name user ID does not exist');
 for(const user of users){
  const n=normalizeName(user.name);if(keys.has(n.key))throw new Error('Account name collision requires reviewed resolution: '+keys.get(n.key)+' / '+user.id);keys.set(n.key,user.id);
  const already=db.prepare("SELECT 1 FROM sqlite_master WHERE name='member_reserved_names'").get()&&db.prepare('SELECT 1 FROM member_reserved_names WHERE user_id=? AND name_key=?').get(user.id,n.key);
  if(isReservedName(n.key)&&!already&&user.id!==preserveReservedUserId)throw new Error('Reserved account name requires reviewed preserve-ID migration: '+user.id);
  rows.push({...user,...n});
 }
 return rows;
}
export function migrateAccessSchema(db,{preserveReservedUserId}={}) {
 registerNameConstraints(db);
 const rows=preflightAccessMigration(db,{preserveReservedUserId});
 db.exec('BEGIN IMMEDIATE');
 try{
 if(!db.prepare('PRAGMA table_info(user)').all().some(c=>c.name==='nameKey'))db.exec('ALTER TABLE user ADD COLUMN nameKey TEXT');
 db.exec(`CREATE TABLE IF NOT EXISTS member_access_schema(version INTEGER PRIMARY KEY CHECK(version=1));
 CREATE TABLE IF NOT EXISTS member_reserved_names(name_key TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS member_access(user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE, owner INTEGER NOT NULL DEFAULT 0 CHECK(owner IN(0,1)),crew INTEGER NOT NULL DEFAULT 0 CHECK(crew IN(0,1)),permissions TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(permissions)),suspended INTEGER NOT NULL DEFAULT 0 CHECK(suspended IN(0,1)),revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0));
 CREATE TABLE IF NOT EXISTS member_access_audit(id INTEGER PRIMARY KEY,actor_id TEXT NOT NULL,target_id TEXT NOT NULL,action TEXT NOT NULL,created_at INTEGER NOT NULL,previous_state TEXT NOT NULL,resulting_state TEXT NOT NULL,request_id TEXT,request_hash TEXT,response TEXT);
 CREATE UNIQUE INDEX IF NOT EXISTS member_access_request_unique ON member_access_audit(actor_id,request_id) WHERE request_id IS NOT NULL;`);
 for(const r of rows){
  if(isReservedName(r.key)&&r.id===preserveReservedUserId)db.prepare('INSERT OR IGNORE INTO member_reserved_names(name_key,user_id) VALUES (?,?)').run(r.key,r.id);
  if(r.nameKey!==r.key)db.prepare('UPDATE user SET nameKey=? WHERE id=?').run(r.key,r.id);
  db.prepare('INSERT OR IGNORE INTO member_access(user_id) VALUES (?)').run(r.id);
 }
 db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS member_user_name_unique ON user(nameKey);
 CREATE TRIGGER IF NOT EXISTS member_access_user_insert_check BEFORE INSERT ON user BEGIN
 SELECT CASE WHEN NEW.nameKey IS NULL OR NEW.nameKey<>member_name_key(NEW.name) OR (NEW.nameKey IN('barcode network','corporate','bnl','bnl-01','owner','admin') AND NOT EXISTS(SELECT 1 FROM member_reserved_names WHERE name_key=NEW.nameKey AND user_id=NEW.id)) THEN RAISE(ABORT,'member_name_key_required') END;
 END;
 CREATE TRIGGER IF NOT EXISTS member_access_user_update_check BEFORE UPDATE OF name,nameKey ON user BEGIN
 SELECT CASE WHEN NEW.nameKey IS NULL OR NEW.nameKey<>member_name_key(NEW.name) OR (NEW.nameKey IN('barcode network','corporate','bnl','bnl-01','owner','admin') AND NOT EXISTS(SELECT 1 FROM member_reserved_names WHERE name_key=NEW.nameKey AND user_id=NEW.id)) THEN RAISE(ABORT,'member_name_key_required') END;
 END;
 CREATE TRIGGER IF NOT EXISTS member_access_user_insert AFTER INSERT ON user BEGIN INSERT INTO member_access(user_id) VALUES(NEW.id); END;
 CREATE TRIGGER IF NOT EXISTS member_access_user_update AFTER UPDATE OF name,nameKey ON user WHEN NEW.name<>OLD.name OR NEW.nameKey<>OLD.nameKey BEGIN
 UPDATE member_access SET revision=revision+1 WHERE user_id=NEW.id;
 INSERT INTO member_access_audit(actor_id,target_id,action,created_at,previous_state,resulting_state) SELECT member_actor_id(),NEW.id,'set-name',CAST(unixepoch('subsec')*1000 AS INTEGER),json_object('id',OLD.id,'name',OLD.name,'revision',revision-1),json_object('id',NEW.id,'name',NEW.name,'revision',revision) FROM member_access WHERE user_id=NEW.id AND member_actor_id()=NEW.id;
 END;
 CREATE TRIGGER IF NOT EXISTS member_access_session_insert BEFORE INSERT ON session WHEN EXISTS(SELECT 1 FROM member_access WHERE user_id=NEW.userId AND suspended=1) BEGIN SELECT RAISE(ABORT,'member_account_suspended'); END;
 INSERT OR IGNORE INTO member_access_schema(version) VALUES(1);`);
 db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
 accessSchemaReady(db);
}
