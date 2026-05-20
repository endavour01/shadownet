/* ============================================================
   ShadowNet — Tactical Mesh Messenger
   shadownet.js  (Frontend — connects to MySQL via REST API)
   ============================================================ */

const API      = 'https://shadownet-g0dp.onrender.com/api';
const OWNER_ID = 'A';   // Local soldier's node ID

// ============================================================
// STATE
// ============================================================
let nodes         = [];   // Loaded from MySQL via /api/nodes
let conversations = {};   // Loaded from MySQL via /api/conversations/:id
let activeConv    = null; // Currently open chat
let suggOpen      = false;
let activeTab     = 'STATUS';

// ============================================================
// SUGGESTION DATA (static templates — no DB needed)
// ============================================================
const tacticalSuggestions = {
  STATUS: {
    label: '📡 Status',
    chips: [
      { text: 'All clear. No hostile activity.',               cls: '' },
      { text: 'Sector secure. Holding position.',              cls: '' },
      { text: 'Position confirmed. Awaiting orders.',          cls: '' },
      { text: 'On standby. Ready to move.',                    cls: '' },
      { text: 'Returning to base. ETA 10 mins.',               cls: '' },
      { text: 'Perimeter secured. No threats detected.',       cls: '' },
      { text: 'Supply status: sufficient. No resupply needed.',cls: '' },
    ]
  },
  MOVEMENT: {
    label: '🏃 Movement',
    chips: [
      { text: 'Moving to checkpoint. ETA 5 mins.',             cls: '' },
      { text: 'Advancing to grid reference. Cover me.',        cls: '' },
      { text: 'Falling back to rally point. Regroup.',         cls: '' },
      { text: 'Flanking left. Maintain suppressive fire.',     cls: '' },
      { text: 'Crossing open ground. Need overwatch.',         cls: '' },
      { text: 'Route clear. Proceed on my signal.',            cls: '' },
      { text: 'Egressing via north corridor.',                 cls: '' },
      { text: 'Hold position. Do not advance yet.',            cls: '' },
    ]
  },
  CONTACT: {
    label: '🔴 Contact',
    chips: [
      { text: 'CONTACT! Hostile spotted. Grid: Alpha-7.',       cls: 'priority' },
      { text: 'Taking fire from east. 3 hostiles visible.',     cls: 'priority' },
      { text: 'Sniper detected. Taking cover. Do not expose.',  cls: 'priority' },
      { text: 'IED suspected at junction. All units halt.',     cls: 'priority' },
      { text: 'Vehicle approaching. Unknown affiliation.',      cls: 'priority' },
      { text: 'Ambush! Break contact. Withdraw immediately.',   cls: 'priority' },
      { text: 'Hostile neutralized. Area temporarily clear.',   cls: '' },
      { text: 'Lost contact with enemy. Maintain alert.',       cls: '' },
    ]
  },
  INTEL: {
    label: '🔍 Intel',
    chips: [
      { text: 'Civilian movement observed. Possible informant.',  cls: 'intel' },
      { text: 'Suspicious vehicle parked at grid B-4.',          cls: 'intel' },
      { text: 'Radio chatter detected. Source unknown.',         cls: 'intel' },
      { text: 'Campfire spotted 200m north. Multiple persons.',  cls: 'intel' },
      { text: 'Footprints heading toward ridge. Recent.',        cls: 'intel' },
      { text: 'Drone noise heard overhead. Possible surveillance.',cls:'intel'},
      { text: 'Supply cache found at coordinates. Securing.',    cls: 'intel' },
    ]
  },
  MEDICAL: {
    label: '🏥 Medical',
    chips: [
      { text: 'CASEVAC needed. One WIA. Grid: Bravo-3.',         cls: 'priority' },
      { text: 'Soldier down. Requesting immediate medevac.',     cls: 'priority' },
      { text: 'Minor injury. Treated on site. Combat effective.',cls: '' },
      { text: 'All personnel healthy. No medical needs.',        cls: '' },
      { text: 'Heat casualty. Moving to shade. Need water.',     cls: '' },
      { text: 'Requesting medic at my position ASAP.',           cls: 'priority' },
    ]
  },
  ORDERS: {
    label: '📋 Orders',
    chips: [
      { text: 'Roger that. Understood. Executing now.',          cls: '' },
      { text: 'Wilco. Will comply immediately.',                 cls: '' },
      { text: 'Negative. Cannot comply. Explain.',               cls: '' },
      { text: 'Confirmed. Moving as ordered.',                   cls: '' },
      { text: 'Hold on. Need clarification before proceeding.',  cls: '' },
      { text: 'Orders received. Briefing team now.',             cls: '' },
      { text: 'Mission complete. Returning to base.',            cls: '' },
      { text: 'Standby. Will report when ready.',                cls: '' },
    ]
  },
};

const contextRules = [
  { keywords: ['checkpoint','arrived','waypoint'],             suggestions: ['Proceed to next waypoint.', 'Hold at checkpoint. Await orders.', 'Checkpoint secured. Moving on.'] },
  { keywords: ['status','update','report'],                    suggestions: ['All clear. No threats.', 'Sector secure. Holding position.', 'On standby. Combat ready.'] },
  { keywords: ['contact','hostile','fire','enemy'],            suggestions: ['Roger. Moving to assist.', 'Taking cover. Returning fire.', 'Calling for backup. Grid?'] },
  { keywords: ['position','coordinates','grid','location'],    suggestions: ['Grid: Alpha-5, North ridge.', 'Moving to your position now.', 'Confirm grid. Sending now.'] },
  { keywords: ['medical','injured','casevac','medevac','wia'], suggestions: ['Medic en route. ETA 3 mins.', 'Acknowledged. Securing landing zone.', 'Stabilizing casualty. Need medevac.'] },
  { keywords: ['clear','secure','proceed'],                    suggestions: ['Roger. Proceeding now.', 'Acknowledged. Moving up.', 'Copy. Maintain overwatch.'] },
  { keywords: ['move','moving','advance'],                     suggestions: ['Moving to support. Cover me.', 'Copy. Flanking right.', 'Hold advance. Recon first.'] },
  { keywords: ['copy','roger','wilco'],                        suggestions: ['Understood. Continuing mission.', 'Roger. Out.', 'Confirmed. Standby.'] },
];

// ============================================================
// API HELPERS
// ============================================================
async function apiFetch(endpoint, options = {}) {
  try {
    const res  = await fetch(API + endpoint, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'API error');
    return json.data;
  } catch (err) {
    console.warn('API (' + endpoint + '):', err.message);
    return null;
  }
}

const apiGet   = ep        => apiFetch(ep);
const apiPost  = (ep, body) => apiFetch(ep, { method: 'POST',  body: JSON.stringify(body) });
const apiPatch = (ep, body) => apiFetch(ep, { method: 'PATCH', body: JSON.stringify(body) });

function nowTime() {
  const d = new Date();
  return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
}

// ============================================================
// CLOCK
// ============================================================
function updateTime() {
  document.getElementById('live-time').textContent = nowTime();
}
setInterval(updateTime, 1000);
updateTime();

// ============================================================
// LOADING PLACEHOLDER
// ============================================================
function setLoading(id, msg) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `
    <div style="text-align:center;padding:40px 20px;font-family:var(--mono);
                font-size:11px;color:var(--text3);">
      <div style="color:var(--accent);margin-bottom:8px;font-size:16px">◈</div>
      ${msg || 'Loading from database…'}
    </div>`;
}

// ============================================================
// NAVIGATION
// ============================================================
function switchScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('nav-' + name);
  if (btn) btn.classList.add('active');
}

function switchTab(name) {
  if (name === 'messages') loadAndRenderChatList();
  if (name === 'nodes')    loadAndRenderNodes();
  switchScreen(name);
}

function goBack() { switchTab('messages'); }

// ============================================================
// NODES SCREEN
// ============================================================
async function loadAndRenderNodes() {
  setLoading('nodes-list', 'Querying MySQL node registry…');
  const data = await apiGet('/nodes');
  if (data) nodes = data.filter(n => n.id !== OWNER_ID);
  renderNodes();
}

function renderNodes() {
  const list    = document.getElementById('nodes-list');
  const pillMap = { online:'pill-online', relay:'pill-relay', weak:'pill-weak', offline:'pill-offline' };
  const lblMap  = { online:'Online', relay:'Active Relay', weak:'Weak Signal', offline:'Offline' };

  if (!nodes.length) {
    list.innerHTML = `<div style="text-align:center;padding:40px;font-family:var(--mono);font-size:11px;color:var(--text3)">No nodes found in database.</div>`;
    return;
  }

  list.innerHTML = nodes.map(n => {
    const bars = [1,2,3,4].map((_,i) =>
      `<div class="bar ${i < n.signal ? 'active' : ''}" style="height:${(i+1)*5}px"></div>`
    ).join('');
    return `
      <div class="node-card">
        <div class="node-icon">
          <span style="font-family:var(--mono);font-size:14px;font-weight:700;
                       color:${n.status==='offline'?'var(--muted)':'var(--accent)'}">${n.id}</span>
        </div>
        <div class="node-info">
          <div class="node-name">${n.name}</div>
          <div class="node-detail">${n.rank ? n.rank+' · ' : ''}${n.unit} · ${n.hops > 0 ? n.hops+' hop'+(n.hops>1?'s':'') : 'No route'}</div>
          <div class="node-detail" style="margin-top:2px;color:var(--text3)">${n.route}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
          <div class="signal-bars">${bars}</div>
          <span class="status-pill ${pillMap[n.status]}">${lblMap[n.status]}</span>
        </div>
      </div>`;
  }).join('');
}

// ============================================================
// CHAT LIST
// ============================================================
async function loadAndRenderChatList() {
  setLoading('chat-list', 'Loading conversations from MySQL…');
  const data = await apiGet(`/conversations/${OWNER_ID}`);
  if (data) {
    conversations = {};
    data.forEach(c => {
      conversations[c.peer_id] = {
        db_id:    c.id,
        name:     c.peer_name,
        route:    c.route,
        hops:     c.hops,
        status:   c.peer_status,
        lastMsg:  c.last_message || 'No messages yet',
        lastTime: c.last_time    || '--:--',
        messages: null
      };
    });
  }
  renderChatList();
}

function renderChatList() {
  const list    = document.getElementById('chat-list');
  const entries = Object.entries(conversations);

  if (!entries.length) {
    list.innerHTML = `<div style="text-align:center;padding:40px;font-family:var(--mono);font-size:11px;color:var(--text3)">No conversations yet.<br>Tap + New to start one.</div>`;
    return;
  }

  list.innerHTML = entries.map(([peerId, conv]) => `
    <div class="chat-item" onclick="openChat('${peerId}')">
      <div class="chat-avatar">
        ${peerId}
        <span class="online-dot ${conv.status !== 'offline' ? '' : 'offline-dot'}"></span>
      </div>
      <div class="chat-info">
        <div class="chat-name">${conv.name}</div>
        <div class="chat-preview">${conv.lastMsg}</div>
      </div>
      <div class="chat-meta">
        <div class="chat-time">${conv.lastTime}</div>
        <div class="hop-badge">${conv.hops} hop${conv.hops>1?'s':''}</div>
      </div>
    </div>`).join('');
}

// ============================================================
// CHAT DETAIL
// ============================================================
async function openChat(peerId) {
  const conv = conversations[peerId];
  if (!conv) return;

  activeConv = peerId;
  suggOpen   = true;

  const panel = document.getElementById('sugg-panel');
  const btn   = document.getElementById('sugg-toggle-btn');
  if (panel) panel.classList.add('open');
  if (btn)   btn.classList.remove('active');

  document.getElementById('chat-name-title').textContent  = conv.name;
  document.getElementById('chat-route-label').textContent = 'Route: ' + conv.route;
  document.getElementById('chat-status-dot').style.color  =
    conv.status !== 'offline' ? 'var(--accent)' : 'var(--muted)';

  switchScreen('chat');
  setLoading('chat-messages', 'Fetching messages from MySQL…');

  const msgs = await apiGet(`/messages/${conv.db_id}`);
  if (msgs) conv.messages = msgs;
  renderMessages();
}

function renderMessages() {
  if (!activeConv) return;
  const conv      = conversations[activeConv];
  const container = document.getElementById('chat-messages');
  const msgs      = conv.messages || [];

  container.innerHTML = `
    <div class="route-banner">
      🔒 E2E Encrypted · ${conv.hops} hop${conv.hops>1?'s':''} · ${conv.route}
      <span style="margin-left:8px;color:var(--accent);font-size:9px">● MySQL</span>
    </div>`;

  if (!msgs.length) {
    container.innerHTML += `<div style="text-align:center;padding:30px;font-family:var(--mono);font-size:11px;color:var(--text3)">No messages yet. Say something.</div>`;
  } else {
    msgs.forEach(msg => {
      const isSent = (msg.sender || msg.from) === 'me';
      const text   = msg.text || msg.message_text || '';
      const time   = msg.time || msg.sent_time    || '';
      container.innerHTML += `
        <div class="bubble-wrap ${isSent ? 'sent' : 'recv'}">
          <div class="bubble ${isSent ? 'sent' : 'recv'}">${text}</div>
          <div class="bubble-meta">
            <span>${time}</span>
            <span class="hop-tag">via ${msg.hops} hop${msg.hops>1?'s':''}</span>
            ${isSent ? '<span>✓✓</span>' : ''}
          </div>
        </div>`;
    });
  }
  container.scrollTop = container.scrollHeight;
}

async function sendMsg() {
  const input = document.getElementById('msg-input');
  const text  = input.value.trim();
  if (!text || !activeConv) return;

  const conv = conversations[activeConv];
  const time = nowTime();
  input.value = '';

  // Optimistic render
  if (!conv.messages) conv.messages = [];
  conv.messages.push({ sender: 'me', text, time, hops: conv.hops });
  conv.lastMsg  = text;
  conv.lastTime = time;
  renderMessages();

  // Save to MySQL
  await apiPost('/messages', {
    conversation_id: conv.db_id,
    sender: 'me', text, time, hops: conv.hops
  });

  // Simulated reply
  const replies = ['Copy that. Understood.', 'Roger. Will comply.', 'Confirmed. Proceeding.', 'Acknowledged. Standby.', 'Received. Over.'];
  setTimeout(async () => {
    const replyText = replies[Math.floor(Math.random() * replies.length)];
    const replyTime = nowTime();
    conv.messages.push({ sender: 'them', text: replyText, time: replyTime, hops: conv.hops });
    conv.lastMsg  = replyText;
    conv.lastTime = replyTime;
    renderMessages();
    await apiPost('/messages', {
      conversation_id: conv.db_id,
      sender: 'them', text: replyText, time: replyTime, hops: conv.hops
    });
  }, 1200 + Math.random() * 800);
}

// ============================================================
// NEW CONVERSATION SCREEN
// ============================================================
function newChat() {
  const s = document.getElementById('nc-search');
  if (s) s.value = '';
  renderNewChatList('');
  switchScreen('newchat');
}

function filterNewChat(val) { renderNewChatList(val.toLowerCase().trim()); }

function renderNewChatList(filter) {
  const list      = document.getElementById('nc-list');
  const dotColors = { online:'#4caf50', relay:'#f59e0b', weak:'#f59e0b', offline:'#3a5035' };
  const avClass   = { online:'', relay:'relay-av', weak:'weak-av', offline:'off-av' };
  const order     = { online:0, relay:1, weak:2, offline:3 };

  const sorted   = [...nodes].sort((a,b) => order[a.status] - order[b.status]);
  const filtered = sorted.filter(n =>
    !filter ||
    n.name.toLowerCase().includes(filter) ||
    n.unit.toLowerCase().includes(filter) ||
    (n.rank||'').toLowerCase().includes(filter) ||
    n.id.toLowerCase().includes(filter)
  );

  document.getElementById('nc-count').textContent =
    filtered.length + ' node' + (filtered.length !== 1 ? 's' : '');

  if (!filtered.length) {
    list.innerHTML = `<div class="nc-empty">No nodes match your search.<br>Try a name, unit or rank.</div>`;
    return;
  }

  list.innerHTML = filtered.map(n => {
    const isOffline = n.status === 'offline';
    const hasConv   = !!conversations[n.id];
    const bars = [1,2,3,4].map((_,i) =>
      `<div class="bar ${i < n.signal ? 'active' : ''}" style="height:${(i+1)*5}px"></div>`
    ).join('');
    const actionBtn = isOffline
      ? `<span style="font-family:var(--mono);font-size:9px;color:var(--muted)">OFFLINE</span>`
      : hasConv
        ? `<button class="nc-start-btn" onclick="event.stopPropagation();openExistingChat('${n.id}')">Open</button>
           <span class="nc-existing">Existing chat</span>`
        : `<button class="nc-start-btn" onclick="event.stopPropagation();startNewChat('${n.id}')">Message</button>`;
    const clickHandler = !isOffline ? `onclick="${hasConv?'openExistingChat':'startNewChat'}('${n.id}')"` : '';
    return `
      <div class="nc-card ${isOffline?'offline':''}" ${clickHandler}>
        <div class="nc-avatar ${avClass[n.status]}">${n.id}
          <span class="nc-dot" style="background:${dotColors[n.status]};"></span>
        </div>
        <div class="nc-info">
          <div class="nc-name">${n.name}</div>
          <div class="nc-meta">${[n.rank,n.unit].filter(Boolean).join(' · ')} · ${n.hops>0?n.hops+' hop'+(n.hops>1?'s':''):'—'}</div>
          <div class="nc-route">${n.route}</div>
        </div>
        <div class="nc-action">
          <div class="signal-bars" style="margin-bottom:2px">${bars}</div>
          ${actionBtn}
        </div>
      </div>`;
  }).join('');
}

async function startNewChat(peerId) {
  const node = nodes.find(n => n.id === peerId);
  if (!node || node.status === 'offline') return;
  const conv = await apiPost('/conversations', {
    owner_id: OWNER_ID, peer_id: peerId,
    peer_name: node.name, route: node.route, hops: node.hops
  });
  if (!conv) return;
  conversations[peerId] = {
    db_id: conv.id, name: node.name, route: node.route,
    hops: node.hops, status: node.status,
    lastMsg: 'No messages yet', lastTime: '--:--', messages: []
  };
  openChat(peerId);
  renderChatList();
}

function openExistingChat(id) { openChat(id); }

// ============================================================
// SUGGESTION SYSTEM
// ============================================================
function getAISuggestions() {
  if (!activeConv) return [];
  const conv    = conversations[activeConv];
  const msgs    = conv.messages || [];
  const lastMsg = msgs.filter(m => (m.sender||m.from) === 'them').pop();
  if (!lastMsg) return ['Roger. Understood.', 'Acknowledged.', 'Standby. Will respond shortly.'];
  const lower = (lastMsg.text || lastMsg.message_text || '').toLowerCase();
  for (const rule of contextRules)
    if (rule.keywords.some(k => lower.includes(k))) return rule.suggestions;
  return ['Acknowledged. Standby.', 'Roger that.', 'Copy. Proceeding as planned.'];
}

function renderSuggestions() {
  document.getElementById('sugg-tabs').innerHTML =
    Object.entries(tacticalSuggestions).map(([key, cat]) =>
      `<button class="sugg-tab ${key===activeTab?'active':''}" onclick="setTab('${key}')">${cat.label}</button>`
    ).join('');
  document.getElementById('sugg-chips').innerHTML =
    tacticalSuggestions[activeTab].chips.map(c =>
      `<div class="sugg-chip ${c.cls}" onclick="useChip(this.textContent.trim())">${c.text}</div>`
    ).join('');
  document.getElementById('ai-chips').innerHTML =
    getAISuggestions().map(s =>
      `<div class="ai-chip" onclick="useChip('${s.replace(/'/g,"\\'")}')"> ${s}</div>`
    ).join('');
}

function setTab(key) { activeTab = key; renderSuggestions(); }

function toggleSuggestions() {
  suggOpen = !suggOpen;
  document.getElementById('sugg-panel').classList.toggle('open', suggOpen);
  if (suggOpen) renderSuggestions();
}

function useChip(text) {
  document.getElementById('msg-input').value = text;
  sendMsg();
}

function onInputChange(val) { if (!val && suggOpen) renderSuggestions(); }

// ============================================================
// INIT — load from MySQL on page start
// ============================================================
async function init() {
  const [nodesData, convsData] = await Promise.all([
    apiGet('/nodes'),
    apiGet(`/conversations/${OWNER_ID}`)
  ]);

  if (nodesData) nodes = nodesData.filter(n => n.id !== OWNER_ID);

  if (convsData) {
    conversations = {};
    convsData.forEach(c => {
      conversations[c.peer_id] = {
        db_id:    c.id,
        name:     c.peer_name,
        route:    c.route,
        hops:     c.hops,
        status:   c.peer_status,
        lastMsg:  c.last_message || 'No messages yet',
        lastTime: c.last_time    || '--:--',
        messages: null
      };
    });
  }

  renderChatList();
  renderNodes();
}

init();