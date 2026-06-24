
const db = require('better-sqlite3')('C:/Users/maopu/AppData/Roaming/bailongma/data/jarvis.db', {readonly: true});
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('=== Tables ===');
tables.forEach(t => console.log(' ', t.name));
try {
  const agents = db.prepare('SELECT id, name, available, invoke_type FROM known_agents').all();
  console.log('\n=== known_agents (' + agents.length + ') ===');
  agents.forEach(a => console.log(' ', a.id, '|', a.name, '| avail=' + a.available, '| type=' + (a.invoke_type||'-')));
} catch(e) { console.log('agents:', e.message); }
db.close();
