const tables={member_artist_schema:['version'],artist_project:['id','catalog_project_key'],member_artist_state:['user_id','revision'],member_artist_link:['user_id','artist_id','approved'],member_artist_history:['id','user_id','artist_id','reference','approved'],member_artist_audit:['actor_id','target_id','action','created_at','previous_state','resulting_state','request_id','request_hash','response']};
const exists=(db,type,name)=>!!db.prepare('SELECT 1 FROM sqlite_master WHERE type=? AND name=?').get(type,name);
export function artistSchemaReady(db){
 if(!exists(db,'table','member_artist_schema')||db.prepare('SELECT version FROM member_artist_schema').all().length!==1||db.prepare('SELECT version FROM member_artist_schema').get().version!==1)throw new Error('Explicit Artist schema migration required');
 for(const [table,columns]of Object.entries(tables))if(!exists(db,'table',table)||columns.some(column=>!db.prepare('PRAGMA table_info('+table+')').all().some(c=>c.name===column)))throw new Error('Artist schema incomplete');
 for(const [table,name,columns]of [['artist_project','member_artist_project_key_unique',['catalog_project_key']],['member_artist_history','member_artist_history_reference_unique',['user_id','reference']],['member_artist_audit','member_artist_request_unique',['actor_id','request_id']]]){
  const index=db.prepare('PRAGMA index_list('+table+')').all().find(index=>index.name===name);
  if(!index||index.unique!==1||JSON.stringify(db.prepare('PRAGMA index_info('+name+')').all().map(column=>column.name))!==JSON.stringify(columns))throw new Error('Artist schema constraints missing');
 }
 if(!exists(db,'trigger','member_artist_user_insert')||db.prepare('SELECT 1 FROM user u LEFT JOIN member_artist_state s ON s.user_id=u.id WHERE s.user_id IS NULL LIMIT 1').get())throw new Error('Artist state incomplete');
 for(const table of ['member_artist_state','member_artist_link','member_artist_history'])if(db.prepare('PRAGMA foreign_key_check('+table+')').get())throw new Error('Artist schema foreign keys invalid');
}
export function migrateArtistSchema(db){
 if(exists(db,'table','member_artist_schema')){artistSchemaReady(db);return;}
 if(Object.keys(tables).some(name=>exists(db,'table',name)))throw new Error('Incomplete Artist schema requires reviewed repair');
 db.exec('BEGIN IMMEDIATE');
 try{
  db.exec(`CREATE TABLE member_artist_schema(version INTEGER PRIMARY KEY CHECK(version=1));
   CREATE TABLE artist_project(id TEXT PRIMARY KEY,catalog_project_key TEXT NOT NULL);
   CREATE UNIQUE INDEX member_artist_project_key_unique ON artist_project(catalog_project_key);
   CREATE TABLE member_artist_state(user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0));
   CREATE TABLE member_artist_link(user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,artist_id TEXT NOT NULL REFERENCES artist_project(id),approved INTEGER NOT NULL CHECK(approved IN(0,1)),PRIMARY KEY(user_id,artist_id));
   CREATE TABLE member_artist_history(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,artist_id TEXT NOT NULL REFERENCES artist_project(id),reference TEXT NOT NULL CHECK(json_valid(reference)),approved INTEGER NOT NULL CHECK(approved IN(0,1)),FOREIGN KEY(user_id,artist_id) REFERENCES member_artist_link(user_id,artist_id));
   CREATE UNIQUE INDEX member_artist_history_reference_unique ON member_artist_history(user_id,reference);
   CREATE TABLE member_artist_audit(id INTEGER PRIMARY KEY,actor_id TEXT NOT NULL,target_id TEXT NOT NULL,action TEXT NOT NULL,created_at INTEGER NOT NULL,previous_state TEXT NOT NULL,resulting_state TEXT NOT NULL,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,response TEXT NOT NULL);
   CREATE UNIQUE INDEX member_artist_request_unique ON member_artist_audit(actor_id,request_id);
   INSERT INTO member_artist_state(user_id) SELECT id FROM user;
   CREATE TRIGGER member_artist_user_insert AFTER INSERT ON user BEGIN INSERT INTO member_artist_state(user_id) VALUES(NEW.id);END;
   INSERT INTO member_artist_schema(version) VALUES(1);`);
  artistSchemaReady(db);db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error;}
}
