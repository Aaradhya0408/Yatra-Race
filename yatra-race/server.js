import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const io = new Server(server, { cors: { origin: allowed.length ? allowed : true }, pingInterval: 20000, pingTimeout: 25000 });
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'yatra-race', persistence: pool ? 'postgres' : 'memory' }));

let pool = null;
if (process.env.DATABASE_URL) {
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined });
}
const rooms = new Map();
const tokenSecret = process.env.TOKEN_SECRET || crypto.randomBytes(32).toString('hex');
const MAX_PLAYERS = 8;
const TURN_MS = 8000;
const GRACE_MS = 12000;
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;

const bank = {
  world: [
    q('Taj Mahal','India','Which country is home to the Taj Mahal?',['India','Nepal','Thailand','Egypt'],'The Taj Mahal is a marble mausoleum in Agra, India.','🕌'),
    q('Eiffel Tower','France','In which city can you find the Eiffel Tower?',['Paris','Rome','Madrid','Berlin'],'The Eiffel Tower was built for the 1889 World’s Fair in Paris.','🗼'),
    q('Great Wall of China','China','The Great Wall is most closely associated with which country?',['China','Japan','Mongolia','India'],'The Great Wall is a historic system of fortifications in China.','🧱'),
    q('Machu Picchu','Peru','Machu Picchu was built by which civilization?',['Inca','Roman','Maya','Viking'],'Machu Picchu is an Inca site high in the Andes of Peru.','⛰️'),
    q('Pyramids of Giza','Egypt','The famous Pyramids of Giza are in which country?',['Egypt','Mexico','Greece','Jordan'],'The pyramids stand near Cairo, on the Giza Plateau.','🔺'),
    q('Sydney Opera House','Australia','Which city is famous for the sail-shaped Opera House?',['Sydney','Melbourne','Auckland','Perth'],'The Sydney Opera House opened in 1973 beside Sydney Harbour.','🎭'),
    q('Statue of Liberty','United States','The Statue of Liberty stands in the harbor of which city?',['New York City','Boston','Los Angeles','Miami'],'The statue is on Liberty Island in New York Harbor.','🗽'),
    q('Colosseum','Italy','Which ancient city is home to the Colosseum?',['Rome','Athens','Istanbul','Lisbon'],'The Colosseum is a huge ancient amphitheatre in Rome.','🏛️'),
    q('Christ the Redeemer','Brazil','On which mountain does Christ the Redeemer overlook Rio de Janeiro?',['Corcovado','Sugarloaf','Mount Fuji','Table Mountain'],'The statue stands atop Corcovado Mountain in Brazil.','🗿'),
    q('Mount Fuji','Japan','Mount Fuji is the highest mountain in which country?',['Japan','South Korea','China','Indonesia'],'Mount Fuji is a famous volcanic peak in Japan.','🗻'),
    q('Big Ben','United Kingdom','Big Ben is the nickname commonly used for the great bell at which landmark?',['Palace of Westminster','Buckingham Palace','Tower Bridge','Windsor Castle'],'Big Ben is the great bell at the Palace of Westminster in London.','🕰️'),
    q('Petra','Jordan','Petra is famous for buildings carved into what?',['Rose-colored rock','Ice','Bamboo','Coral'],'Petra is an archaeological city carved into sandstone in Jordan.','🌹'),
    q('Angkor Wat','Cambodia','Angkor Wat is a celebrated temple complex in which country?',['Cambodia','Laos','Vietnam','Sri Lanka'],'Angkor Wat is one of Cambodia’s best-known historic sites.','🛕'),
    q('Louvre Museum','France','Which famous museum in Paris displays the Mona Lisa?',['The Louvre','The Prado','The Uffizi','The Met'],'The Louvre is one of the world’s most visited art museums.','🖼️'),
    q('Golden Gate Bridge','United States','The Golden Gate Bridge is in which US city?',['San Francisco','Chicago','Seattle','New York City'],'The orange-red suspension bridge crosses the Golden Gate strait.','🌉'),
    q('Acropolis','Greece','The Acropolis is a historic hilltop site in which city?',['Athens','Sparta','Rome','Cairo'],'The Acropolis of Athens includes the famous Parthenon.','🏺'),
    q('Burj Khalifa','United Arab Emirates','The Burj Khalifa, one of the world’s tallest buildings, is in which city?',['Dubai','Doha','Abu Dhabi','Riyadh'],'The Burj Khalifa rises above Dubai in the United Arab Emirates.','🏙️'),
    q('Chichén Itzá','Mexico','Chichén Itzá was built by which Mesoamerican civilization?',['Maya','Inca','Aztec only','Olmec only'],'Chichén Itzá is a major Maya archaeological site in Mexico.','🌞')
  ],
  bharat: [
    q('Taj Mahal','Agra, Uttar Pradesh','The Taj Mahal is located in which Indian city?',['Agra','Jaipur','Lucknow','Bhopal'],'The Taj Mahal is in Agra, beside the Yamuna River.','🕌'),
    q('Mathura','Uttar Pradesh','Mathura is traditionally known as the birthplace of which Hindu deity?',['Krishna','Ganesha','Hanuman','Karttikeya'],'Mathura is an important pilgrimage city associated with Krishna.','🪷'),
    q('Vrindavan','Uttar Pradesh','Vrindavan is especially associated with stories of which deity?',['Krishna','Shiva','Surya','Indra'],'Vrindavan is known for its many temples and Krishna traditions.','🪷'),
    q('Varanasi','Uttar Pradesh','Which river flows through Varanasi?',['Ganga','Godavari','Narmada','Kaveri'],'Varanasi is one of the historic cities along the Ganga.','🛶'),
    q('Golden Temple','Amritsar, Punjab','The Golden Temple is the holiest shrine of which religion?',['Sikhism','Buddhism','Jainism','Zoroastrianism'],'Harmandir Sahib in Amritsar is a central Sikh place of worship.','✨'),
    q('Rishikesh','Uttarakhand','Rishikesh is widely known for yoga and its setting beside which river?',['Ganga','Yamuna','Brahmaputra','Tapti'],'Rishikesh lies in the Himalayan foothills beside the Ganga.','🧘'),
    q('Ayodhya','Uttar Pradesh','Ayodhya is traditionally associated with the life of which epic hero?',['Rama','Arjuna','Bhima','Karna'],'Ayodhya is an important city in the Ramayana tradition.','🏹'),
    q('Hawa Mahal','Jaipur, Rajasthan','The Hawa Mahal is in which Indian city?',['Jaipur','Jodhpur','Udaipur','Ajmer'],'Jaipur’s Hawa Mahal is known for its many small windows.','🏰'),
    q('Qutub Minar','Delhi','Qutub Minar is a famous historic tower in which city?',['Delhi','Mumbai','Kolkata','Chennai'],'Qutub Minar is part of a historic complex in Delhi.','🗼'),
    q('Gateway of India','Mumbai, Maharashtra','The Gateway of India faces which body of water?',['Arabian Sea','Bay of Bengal','Indian Ocean near Chennai','Dal Lake'],'The arch monument stands on Mumbai’s waterfront.','🌊'),
    q('Konark Sun Temple','Odisha','The Konark Sun Temple is designed in the form of a giant what?',['Chariot','Ship','Lotus pond','Mountain'],'The temple is famed for its stone chariot design and wheels.','☀️'),
    q('Sanchi Stupa','Madhya Pradesh','Sanchi is famous for ancient Buddhist monuments, especially a what?',['Stupa','Palace','Lighthouse','Fortress ship'],'The Great Stupa at Sanchi is a major Buddhist monument.','☸️'),
    q('Mysore Palace','Karnataka','Mysore Palace is especially famous for its grand architecture and what annual festival illumination?',['Dasara','Onam','Bihu','Lohri'],'Mysuru celebrates Dasara with events and palace lighting.','👑'),
    q('Meenakshi Temple','Madurai, Tamil Nadu','Meenakshi Temple is famous for colorful, sculpted what?',['Tower gateways','Glass domes','Wooden windmills','Snow arches'],'Its towering gopurams are covered in detailed sculptures.','🛕'),
    q('Kaziranga National Park','Assam','Which animal is Kaziranga especially famous for protecting?',['One-horned rhinoceros','Red panda','Asiatic lion','Snow leopard'],'Kaziranga is a major stronghold for the greater one-horned rhinoceros.','🦏'),
    q('Hampi','Karnataka','Hampi was once the capital of which historic empire?',['Vijayanagara Empire','Maurya Empire','Mughal Empire','Chola Empire'],'Hampi preserves ruins of the Vijayanagara Empire.','🪨'),
    q('Dal Lake','Srinagar','Dal Lake is located in which city?',['Srinagar','Shimla','Gangtok','Dehradun'],'Dal Lake is known for houseboats and shikaras in Srinagar.','🚣'),
    q('Statue of Unity','Gujarat','The Statue of Unity honors which Indian leader?',['Sardar Vallabhbhai Patel','Mahatma Gandhi','Jawaharlal Nehru','Subhas Chandra Bose'],'The statue honors Sardar Vallabhbhai Patel in Gujarat.','🗽')
  ]
};
function q(name, location, prompt, options, fact, emoji) { return { name, location, prompt, options, answer: options[0], fact, emoji }; }

const now = () => Date.now();
function code() { const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from({length:6}, () => chars[crypto.randomInt(chars.length)]).join(''); }
function signToken(playerId, roomCode) { const payload = `${playerId}.${roomCode}.${now()}`; const sig = crypto.createHmac('sha256', tokenSecret).update(payload).digest('hex'); return Buffer.from(`${payload}.${sig}`).toString('base64url'); }
function verifyToken(token, roomCode) {
  try { const decoded = Buffer.from(token, 'base64url').toString(); const parts = decoded.split('.'); if (parts.length !== 4 || parts[1] !== roomCode) return null; const payload = parts.slice(0,3).join('.'); const expected = crypto.createHmac('sha256', tokenSecret).update(payload).digest('hex'); if (!crypto.timingSafeEqual(Buffer.from(parts[3]), Buffer.from(expected))) return null; return parts[0]; } catch { return null; }
}
function cleanName(name) { return String(name || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0,18); }
function publicRoom(room) {
  return { code: room.code, theme: room.theme, phase: room.phase, hostId: room.hostId, players: [...room.players.values()].map(p => ({ id:p.id, name:p.name, avatar:p.avatar, position:p.position, connected:p.connected, isHost:p.id===room.hostId })), round: room.round, currentPlayerId: room.turnOrder[room.turnIndex] || null, deadline: room.deadline, landmark: room.phase === 'playing' ? room.route[room.round] || null : null, routeStops: room.phase === 'playing' ? room.route.map(item => ({ name:item.name, location:item.location, emoji:item.emoji })) : [], question: room.phase === 'playing' ? safeQuestion(room.route[room.round]) : null, answerAttempts: room.phase === 'playing' ? (room.attempts[room.turnOrder[room.turnIndex]] || 0) : 0, lastResult: room.lastResult, winnerId: room.winnerId, results: room.results || [] };
}
function safeQuestion(item) { if (!item) return null; return { name:item.name, location:item.location, prompt:item.prompt, options:item.shuffledOptions, fact:item.fact, emoji:item.emoji }; }
function shuffle(a) { const b=[...a]; for(let i=b.length-1;i>0;i--){const j=crypto.randomInt(i+1);[b[i],b[j]]=[b[j],b[i]];} return b; }
function broadcast(room) { io.to(room.code).emit('room:update', publicRoom(room)); persist(room).catch(e => console.error('Persist error:', e.message)); }
async function persist(room) { if (!pool) return; await pool.query(`INSERT INTO game_rooms (code, state, updated_at) VALUES ($1,$2::jsonb,NOW()) ON CONFLICT (code) DO UPDATE SET state=EXCLUDED.state, updated_at=NOW()`, [room.code, JSON.stringify(serialize(room))]); }
function serialize(room) { return {code:room.code,theme:room.theme,phase:room.phase,hostId:room.hostId,players:[...room.players.values()],round:room.round,route:room.route,turnOrder:room.turnOrder,turnIndex:room.turnIndex,deadline:room.deadline,attempts:room.attempts,lastResult:room.lastResult,winnerId:room.winnerId,results:room.results,createdAt:room.createdAt,updatedAt:room.updatedAt}; }
async function initDb() { if (!pool) return; await pool.query(`CREATE TABLE IF NOT EXISTS game_rooms (code TEXT PRIMARY KEY, state JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`); const {rows}=await pool.query(`SELECT state FROM game_rooms WHERE updated_at > NOW() - INTERVAL '2 hours'`); for(const row of rows){ const s=row.state; const room={...s,players:new Map((s.players||[]).map(p=>[p.id,{...p,connected:false,socketId:null}])),timer:null,graceTimers:new Map()}; if(room.phase==='playing' && room.deadline && room.deadline < now()){ room.deadline=now()+3000; } rooms.set(room.code,room); } }
function newRoom(theme, player) { const c=code(); return {code:c,theme,phase:'lobby',hostId:player.id,players:new Map([[player.id,player]]),round:0,route:[],turnOrder:[],turnIndex:0,deadline:null,attempts:{},lastResult:null,winnerId:null,results:[],createdAt:now(),updatedAt:now(),timer:null,graceTimers:new Map()}; }
function clearTimer(room) { if(room.timer) clearTimeout(room.timer); room.timer=null; }
function scheduleTurn(room, delay=TURN_MS) { clearTimer(room); if(room.phase!=='playing') return; room.deadline=now()+delay; room.timer=setTimeout(()=>{ if(room.phase!=='playing') return; const playerId=room.turnOrder[room.turnIndex]; room.lastResult={playerId,correct:false,timeout:true,message:'Time is up — your turn is skipped.'}; nextTurn(room); }, delay); }
function nextTurn(room) {
  clearTimer(room); if(room.phase!=='playing') return;
  const current=room.turnOrder[room.turnIndex]; room.attempts[current]=0;
  let guard=0;
  do { room.turnIndex++; if(room.turnIndex>=room.turnOrder.length){ room.turnIndex=0; room.round++; if(room.round>=room.route.length){ finish(room); return; } } guard++; if(guard>room.turnOrder.length+1) { finish(room); return; } } while(!room.players.has(room.turnOrder[room.turnIndex]));
  room.lastResult=room.lastResult || null; scheduleTurn(room); broadcast(room);
}
function finish(room) { clearTimer(room); room.phase='finished'; room.deadline=null; const sorted=[...room.players.values()].sort((a,b)=>b.position-a.position || b.correctFirst-a.correctFirst || b.correctTotal-a.correctTotal || a.joinedAt-b.joinedAt); room.winnerId=sorted[0]?.id || null; room.results=sorted.map((p,i)=>({id:p.id,name:p.name,avatar:p.avatar,position:p.position,correctTotal:p.correctTotal,correctFirst:p.correctFirst,rank:i+1})); broadcast(room); }
function startGame(room) { if(room.phase!=='lobby'||room.players.size<2) return false; room.phase='playing'; room.route=shuffle(bank[room.theme]).slice(0,10).map(item=>({...item,shuffledOptions:shuffle(item.options)})); room.round=0; room.turnOrder=[...room.players.values()].sort((a,b)=>a.joinedAt-b.joinedAt).map(p=>p.id); room.turnIndex=0; room.attempts={}; room.lastResult=null; for(const p of room.players.values()){p.position=0;p.correctTotal=0;p.correctFirst=0;} scheduleTurn(room); broadcast(room); return true; }
function joinRoom(socket, room, player) { player.connected=true; player.socketId=socket.id; player.lastSeen=now(); room.players.set(player.id,player); socket.join(room.code); socket.data.roomCode=room.code; socket.data.playerId=player.id; if(!room.turnOrder.includes(player.id) && room.phase==='playing') room.turnOrder.push(player.id); broadcast(room); socket.emit('session:ready',{roomCode:room.code,playerId:player.id,token:signToken(player.id,room.code)}); }
function roomError(socket, message) { socket.emit('game:error',{message}); }

io.on('connection', socket => {
  socket.on('room:create', ({name,theme='world',avatar='🧭'}={}) => {
    const nickname=cleanName(name); if(nickname.length<1) return roomError(socket,'Choose a nickname first.'); if(!['world','bharat'].includes(theme)) return roomError(socket,'Choose a valid theme.');
    let room; do { room=newRoom(theme,{id:crypto.randomUUID(),name:nickname,avatar:String(avatar).slice(0,8),position:0,connected:true,socketId:socket.id,joinedAt:now(),correctTotal:0,correctFirst:0}); } while(rooms.has(room.code)); rooms.set(room.code,room); joinRoom(socket,room,room.players.get(room.hostId));
  });
  socket.on('room:join', ({code:rawCode,name,avatar='🧭'}={}) => {
    const c=String(rawCode||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6); const room=rooms.get(c); const nickname=cleanName(name); if(!room) return roomError(socket,'Room not found. Check the code and try again.'); if(!nickname) return roomError(socket,'Choose a nickname first.'); if(room.phase!=='lobby') return roomError(socket,'This race has already started. Ask the host for a new room.'); if(room.players.size>=MAX_PLAYERS) return roomError(socket,'This room is full (8 players maximum).'); if([...room.players.values()].some(p=>p.name.toLowerCase()===nickname.toLowerCase())) return roomError(socket,'That nickname is already in this room. Choose another.');
    joinRoom(socket,room,{id:crypto.randomUUID(),name:nickname,avatar:String(avatar).slice(0,8),position:0,connected:true,socketId:socket.id,joinedAt:now(),correctTotal:0,correctFirst:0});
  });
  socket.on('room:rejoin', ({code:rawCode,token}={}) => {
    const c=String(rawCode||'').toUpperCase().slice(0,6); const room=rooms.get(c); const id=verifyToken(String(token||''),c); if(!room||!id||!room.players.has(id)) return roomError(socket,'Rejoin link expired or invalid. Ask the host for help.');
    const p=room.players.get(id); if(p.socketId && p.socketId!==socket.id) { const old=io.sockets.sockets.get(p.socketId); old?.disconnect(true); } p.connected=true;p.socketId=socket.id;p.lastSeen=now();socket.join(room.code);socket.data.roomCode=room.code;socket.data.playerId=id; const gt=room.graceTimers.get(id); if(gt){clearTimeout(gt);room.graceTimers.delete(id);} if(room.phase==='playing'&&room.turnOrder[room.turnIndex]===id) scheduleTurn(room,TURN_MS); broadcast(room);socket.emit('session:ready',{roomCode:c,playerId:id,token:signToken(id,c)});
  });
  socket.on('room:leave', () => { const room=rooms.get(socket.data.roomCode); const id=socket.data.playerId; if(!room||!id)return; const p=room.players.get(id); if(room.phase==='lobby'){ room.players.delete(id); const gt=room.graceTimers.get(id); if(gt)clearTimeout(gt); room.graceTimers.delete(id); if(room.hostId===id){const next=[...room.players.values()][0];if(next)room.hostId=next.id;} socket.leave(room.code); socket.data.roomCode=null; socket.data.playerId=null; if(room.players.size===0){rooms.delete(room.code);if(pool)pool.query('DELETE FROM game_rooms WHERE code=$1',[room.code]).catch(()=>{});}else broadcast(room); } else { if(p){p.connected=false;p.socketId=null;p.lastSeen=now();} socket.leave(room.code);socket.data.roomCode=null;socket.data.playerId=null;broadcast(room); } });
  socket.on('room:start', () => { const room=rooms.get(socket.data.roomCode); if(!room) return roomError(socket,'Room not found.'); if(socket.data.playerId!==room.hostId) return roomError(socket,'Only the host can start the race.'); if(room.players.size<2) return roomError(socket,'At least two players are needed to start.'); if(!startGame(room)) return roomError(socket,'This race cannot be started now.'); });
  socket.on('room:theme', ({theme}={}) => { const room=rooms.get(socket.data.roomCode); if(!room||room.phase!=='lobby') return; if(socket.data.playerId!==room.hostId) return roomError(socket,'Only the host can change the theme.'); if(!['world','bharat'].includes(theme)) return; room.theme=theme;broadcast(room); });
  socket.on('answer:submit', ({answer}={}) => {
    const room=rooms.get(socket.data.roomCode); const id=socket.data.playerId; if(!room||room.phase!=='playing') return; const active=room.turnOrder[room.turnIndex]; if(id!==active) return roomError(socket,'It is not your turn yet.'); if(!room.players.get(id)?.connected) return; if(now()>room.deadline) return roomError(socket,'Time is up.');
    const item=room.route[room.round]; if(!item) return; const p=room.players.get(id); const correct=String(answer)===item.answer;
    if(correct){ p.position=Math.min(10,p.position+1);p.correctTotal++; if((room.attempts[id]||0)===0)p.correctFirst++; room.lastResult={playerId:id,correct:true,timeout:false,message:`Correct! ${item.fact}`}; if(p.position>=10){room.winnerId=id;finish(room);return;} broadcast(room); setTimeout(()=>{if(room.phase==='playing'&&room.turnOrder[room.turnIndex]===id)nextTurn(room);},1800); clearTimer(room);room.timer=setTimeout(()=>{if(room.phase==='playing'&&room.turnOrder[room.turnIndex]===id)nextTurn(room);},1800);
    } else { room.attempts[id]=(room.attempts[id]||0)+1; room.lastResult={playerId:id,correct:false,timeout:false,message:room.attempts[id]===1?'Not quite — one more try!':`Not quite. ${item.fact}`}; if(room.attempts[id]>=2){clearTimer(room);broadcast(room);room.timer=setTimeout(()=>{if(room.phase==='playing'&&room.turnOrder[room.turnIndex]===id)nextTurn(room);},1800);} else broadcast(room); }
  });
  socket.on('room:again', () => { const old=rooms.get(socket.data.roomCode); if(!old||old.phase!=='finished'||socket.data.playerId!==old.hostId) return roomError(socket,'Only the host can start a rematch.'); const players=[...old.players.values()].filter(p=>p.connected).sort((a,b)=>a.joinedAt-b.joinedAt); if(players.length<2) return roomError(socket,'At least two connected players are needed for a rematch.'); const fresh=newRoom(old.theme,{...players[0],position:0,correctTotal:0,correctFirst:0,joinedAt:now()}); fresh.code=old.code;fresh.hostId=players[0].id;fresh.players=new Map(players.map((p,i)=>[p.id,{...p,position:0,correctTotal:0,correctFirst:0,joinedAt:now()+i}]));rooms.set(old.code,fresh);for(const p of fresh.players.values()){const s=io.sockets.sockets.get(p.socketId);if(s){s.join(fresh.code);s.data.roomCode=fresh.code;s.data.playerId=p.id;}}broadcast(fresh); });
  socket.on('disconnect', () => { const room=rooms.get(socket.data.roomCode);const id=socket.data.playerId;if(!room||!id||!room.players.has(id))return;const p=room.players.get(id);if(p.socketId!==socket.id)return;p.connected=false;p.lastSeen=now();p.socketId=null;if(room.hostId===id){const next=[...room.players.values()].find(x=>x.connected);if(next)room.hostId=next.id;} if(room.phase==='playing'&&room.turnOrder[room.turnIndex]===id){clearTimer(room);room.deadline=now()+GRACE_MS;room.timer=setTimeout(()=>{if(room.phase==='playing'&&room.turnOrder[room.turnIndex]===id&&!room.players.get(id)?.connected){room.lastResult={playerId:id,correct:false,timeout:true,message:'Player disconnected — turn skipped.'};nextTurn(room);}},GRACE_MS);} const gt=setTimeout(()=>{if(room.players.has(id)&&!room.players.get(id).connected&&room.phase==='lobby'){room.players.delete(id);if(room.players.size===0)rooms.delete(room.code);else broadcast(room);}},ROOM_TTL_MS);room.graceTimers.set(id,gt);broadcast(room); });
});

setInterval(()=>{ for(const [c,r] of rooms){ if(now()-r.updatedAt>ROOM_TTL_MS && r.phase!=='playing') {clearTimer(r);rooms.delete(c);if(pool)pool.query('DELETE FROM game_rooms WHERE code=$1',[c]).catch(()=>{});continue;} r.updatedAt=now(); } },60000).unref();
const port=Number(process.env.PORT||3000);
initDb().then(()=>server.listen(port,()=>console.log(`Yatra Race listening on ${port} (${pool?'PostgreSQL persistence':'in-memory rooms'})`))).catch(err=>{console.error('Database initialization failed:',err);process.exit(1);});
