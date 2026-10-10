const tables={member_tool_schema:['version'],member_song_draft:['user_id','revision','title','lyrics','style','previous','error_code'],member_song_command:['id','user_id','session_id','request_id','request_hash','request_response','kind','options','base','status','created_at','lease_id','lease_expires_at','receipt_hash','receipt_response','authority_revoked'],member_song_audit:['id','user_id','command_id','action','created_at','previous_state','resulting_state']};
const exists=(db,type,name)=>!!db.prepare('SELECT 1 FROM sqlite_master WHERE type=? AND name=?').get(type,name);
export function toolSchemaReady(db){
 if(!exists(db,'table','member_tool_schema')||db.prepare('SELECT version FROM member_tool_schema').all().length!==1||db.prepare('SELECT version FROM member_tool_schema').get().version!==1)throw new Error('Explicit member tool schema migration required');
 for(const [table,columns]of Object.entries(tables))if(!exists(db,'table',table)||columns.some(column=>!db.prepare('PRAGMA table_info('+table+')').all().some(c=>c.name===column)))throw new Error('Member tool schema incomplete');
 for(const [name,columns,partial]of [['member_song_request_unique',['user_id','request_id'],0],['member_song_pending_unique',['user_id'],1]]){
  const index=db.prepare('PRAGMA index_list(member_song_command)').all().find(index=>index.name===name);
  if(!index||index.unique!==1||index.partial!==partial||JSON.stringify(db.prepare('PRAGMA index_info('+name+')').all().map(column=>column.name))!==JSON.stringify(columns))throw new Error('Member tool schema constraints missing');
 }
 if(['member_song_user_insert','member_song_access_revoke','member_song_session_revoke','member_song_verification_revoke'].some(name=>!exists(db,'trigger',name))||db.prepare('SELECT 1 FROM user u LEFT JOIN member_song_draft d ON d.user_id=u.id WHERE d.user_id IS NULL LIMIT 1').get())throw new Error('Member tool draft state incomplete');
 for(const table of ['member_song_draft','member_song_command','member_song_audit'])if(db.prepare('PRAGMA foreign_key_check('+table+')').get())throw new Error('Member tool schema foreign keys invalid');
}
export function migrateToolSchema(db){
 if(exists(db,'table','member_tool_schema')){toolSchemaReady(db);return;}
 if(Object.keys(tables).some(name=>exists(db,'table',name)))throw new Error('Incomplete member tool schema requires reviewed repair');
 db.exec('BEGIN IMMEDIATE');
 try{
  db.exec(`CREATE TABLE member_tool_schema(version INTEGER PRIMARY KEY CHECK(version=1));
   CREATE TABLE member_song_draft(user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),title TEXT NOT NULL DEFAULT '',lyrics TEXT NOT NULL DEFAULT '',style TEXT NOT NULL DEFAULT '',previous TEXT CHECK(previous IS NULL OR json_valid(previous)),error_code TEXT);
   CREATE TABLE member_song_command(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,session_id TEXT NOT NULL,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,request_response TEXT NOT NULL CHECK(json_valid(request_response)),kind TEXT NOT NULL CHECK(kind IN('generate','lyrics','style','undo')),options TEXT NOT NULL CHECK(json_valid(options)),base TEXT NOT NULL CHECK(json_valid(base)),status TEXT NOT NULL CHECK(status IN('pending','leased','applied','failed')),created_at INTEGER NOT NULL,lease_id TEXT,lease_expires_at INTEGER,receipt_hash TEXT,receipt_response TEXT CHECK(receipt_response IS NULL OR json_valid(receipt_response)),authority_revoked INTEGER NOT NULL DEFAULT 0 CHECK(authority_revoked IN(0,1)));
   CREATE UNIQUE INDEX member_song_request_unique ON member_song_command(user_id,request_id);
   CREATE UNIQUE INDEX member_song_pending_unique ON member_song_command(user_id) WHERE status IN('pending','leased');
   CREATE TABLE member_song_audit(id INTEGER PRIMARY KEY,user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,command_id TEXT NOT NULL REFERENCES member_song_command(id),action TEXT NOT NULL,created_at INTEGER NOT NULL,previous_state TEXT NOT NULL CHECK(json_valid(previous_state)),resulting_state TEXT NOT NULL CHECK(json_valid(resulting_state)));
   INSERT INTO member_song_draft(user_id) SELECT id FROM user;
   CREATE TRIGGER member_song_user_insert AFTER INSERT ON user BEGIN INSERT INTO member_song_draft(user_id) VALUES(NEW.id);END;
   CREATE TRIGGER member_song_access_revoke AFTER UPDATE OF owner,crew,permissions,suspended ON member_access WHEN NEW.suspended<>0 OR (NEW.owner<>1 AND (NEW.crew<>1 OR NOT EXISTS(SELECT 1 FROM json_each(NEW.permissions) WHERE value='song.generate'))) BEGIN UPDATE member_song_command SET authority_revoked=1 WHERE user_id=NEW.user_id AND status IN('pending','leased');END;
   CREATE TRIGGER member_song_session_revoke AFTER DELETE ON session BEGIN UPDATE member_song_command SET authority_revoked=1 WHERE session_id=OLD.id AND status IN('pending','leased');END;
   CREATE TRIGGER member_song_verification_revoke AFTER UPDATE OF emailVerified ON user WHEN NEW.emailVerified<>1 BEGIN UPDATE member_song_command SET authority_revoked=1 WHERE user_id=NEW.id AND status IN('pending','leased');END;
   INSERT INTO member_tool_schema(version) VALUES(1);`);
  toolSchemaReady(db);db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error;}
}
