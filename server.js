// ================================================================
//  ShadowNet — Tactical Mesh Messenger
//  server.js  ·  Node.js + Express + PostgreSQL (Render)
//
//  RENDER SETUP:
//    1. Create PostgreSQL database on Render
//    2. Add environment variable:
//       DATABASE_URL = (paste Internal Database URL from Render)
//    3. Build Command:  npm install
//    4. Start Command:  node server.js
//
//  LOCAL SETUP:
//    1. npm install
//    2. Create .env file with DATABASE_URL=postgresql://...
//    3. node server.js
// ================================================================

require('dotenv').config();

const express = require('express');
const { Pool } = require('pg');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ================================================================
//  DATABASE CONNECTION
// ================================================================
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }  // required for Render PostgreSQL
    : false
});

// ================================================================
//  AUTO-INIT — creates tables + seeds soldiers on first run
// ================================================================
async function autoInitDatabase() {
  console.log('\n🔧  Initialising ShadowNet database...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS nodes (
      id         VARCHAR(20)  PRIMARY KEY,
      name       VARCHAR(100) NOT NULL,
      rank       VARCHAR(50)  DEFAULT '',
      unit       VARCHAR(100) DEFAULT '',
      signal     SMALLINT     DEFAULT 0,
      hops       SMALLINT     DEFAULT 0,
      status     VARCHAR(10)  DEFAULT 'offline'
                 CHECK (status IN ('online','relay','weak','offline')),
      route      VARCHAR(255) DEFAULT 'No route',
      last_seen  TIMESTAMP    DEFAULT NOW(),
      created_at TIMESTAMP    DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id         SERIAL       PRIMARY KEY,
      owner_id   VARCHAR(20)  NOT NULL,
      peer_id    VARCHAR(20)  NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
      peer_name  VARCHAR(100) NOT NULL,
      route      VARCHAR(255) DEFAULT '',
      hops       SMALLINT     DEFAULT 0,
      created_at TIMESTAMP    DEFAULT NOW(),
      UNIQUE (owner_id, peer_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id              BIGSERIAL    PRIMARY KEY,
      conversation_id INT          NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender          VARCHAR(5)   NOT NULL CHECK (sender IN ('me','them')),
      message_text    TEXT         NOT NULL,
      sent_time       VARCHAR(10)  NOT NULL,
      hops            SMALLINT     DEFAULT 1,
      delivered       BOOLEAN      DEFAULT FALSE,
      created_at      TIMESTAMP    DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS mesh_routes (
      id             SERIAL       PRIMARY KEY,
      source_id      VARCHAR(20)  NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
      destination_id VARCHAR(20)  NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
      next_hop_id    VARCHAR(20)  NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
      total_hops     SMALLINT     DEFAULT 1,
      link_quality   SMALLINT     DEFAULT 100,
      updated_at     TIMESTAMP    DEFAULT NOW(),
      UNIQUE (source_id, destination_id)
    );
  `);
  console.log('  ✅  Tables created (or already exist)');

  // Check if already seeded
  const { rows } = await db.query('SELECT COUNT(*) AS cnt FROM nodes');
  if (parseInt(rows[0].cnt) > 0) {
    console.log(`  ℹ️   Already seeded (${rows[0].cnt} nodes) — skipping\n`);
    return;
  }

  // ── SEED SOLDIERS ──────────────────────────────────────────
  await db.query(`
    INSERT INTO nodes (id, name, rank, unit, signal, hops, status, route) VALUES
      ('A',  'Vikalp Soni',      'Sepoy',    '7 RAJRIF',  4, 0, 'online',  'LOCAL'),
      ('B',  'Sharma Nishant',   'Naik',     '7 RAJRIF',  4, 1, 'relay',   'A → B'),
      ('C',  'Than Singh Dhakad','Havildar', '7 RAJRIF',  3, 2, 'online',  'A → B → C'),
      ('D',  'Field HQ',         '',         'Bravo Base',0, 0, 'offline', 'No route')
    ON CONFLICT (id) DO NOTHING;
  `);

  // ── SEED ROUTING TABLE ─────────────────────────────────────
  await db.query(`
    INSERT INTO mesh_routes (source_id, destination_id, next_hop_id, total_hops, link_quality) VALUES
      ('A', 'B', 'B', 1, 95),
      ('A', 'C', 'B', 2, 80),
      ('B', 'C', 'C', 1, 90),
      ('B', 'A', 'A', 1, 95),
      ('C', 'A', 'B', 2, 80),
      ('C', 'B', 'B', 1, 90)
    ON CONFLICT (source_id, destination_id) DO NOTHING;
  `);

  // ── SEED CONVERSATIONS ─────────────────────────────────────
  // A ↔ B
  await db.query(`
    INSERT INTO conversations (owner_id, peer_id, peer_name, route, hops) VALUES
      ('A', 'B', 'Sharma Nishant',   'A → B',     1),
      ('A', 'C', 'Than Singh Dhakad','A → B → C', 2)
    ON CONFLICT (owner_id, peer_id) DO NOTHING;
  `);

  // ── SEED DEMO MESSAGES ─────────────────────────────────────
  // Get conversation IDs
  const convAB = await db.query(
    `SELECT id FROM conversations WHERE owner_id='A' AND peer_id='B'`
  );
  const convAC = await db.query(
    `SELECT id FROM conversations WHERE owner_id='A' AND peer_id='C'`
  );

  const abId = convAB.rows[0].id;
  const acId = convAC.rows[0].id;

  await db.query(`
    INSERT INTO messages (conversation_id, sender, message_text, sent_time, hops) VALUES
      ($1, 'them', 'Sector clear. No hostile movement detected.',         '08:10', 1),
      ($1, 'me',   'Roger that. Maintain position at grid Alpha-3.',      '08:11', 1),
      ($1, 'them', 'Copy. Perimeter secured. Awaiting further orders.',   '08:12', 1),
      ($1, 'me',   'Wilco. Report back in 30 minutes.',                   '08:13', 1),
      ($1, 'them', 'CONTACT! Hostile vehicle spotted at junction B-4.',   '09:45', 1),
      ($1, 'me',   'Acknowledged. All units hold position. Do not engage.','09:46',1),
      ($1, 'them', 'Vehicle has moved on. Situation normal.',             '09:52', 1),
      ($1, 'me',   'Good work. Stay alert. Out.',                         '09:53', 1)
  `, [abId]);

  await db.query(`
    INSERT INTO messages (conversation_id, sender, message_text, sent_time, hops) VALUES
      ($1, 'them', 'Arrived at checkpoint Charlie. Requesting status.',   '10:00', 2),
      ($1, 'me',   'Status: All clear. Proceed to next waypoint.',        '10:01', 2),
      ($1, 'them', 'Copy that. Moving out. ETA 15 minutes.',              '10:02', 2),
      ($1, 'me',   'Acknowledged. Soldier B will provide overwatch.',     '10:03', 2),
      ($1, 'them', 'Reached waypoint Delta. Area secure.',                '10:22', 2),
      ($1, 'me',   'Excellent. Hold position and await extraction.',      '10:23', 2),
      ($1, 'them', 'Wilco. Standing by.',                                 '10:24', 2),
      ($1, 'me',   'Mission complete. Well done soldier.',                '10:30', 2)
  `, [acId]);

  console.log('  ✅  Soldiers A, B, C seeded with demo conversations\n');
}

// ================================================================
//  HELPERS
// ================================================================
const ok   = (res, data)            => res.json({ success: true,  data });
const fail = (res, msg, code = 500) => res.status(code).json({ success: false, error: msg });

// ================================================================
//  API — STATUS
// ================================================================
app.get('/api/status', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT NOW() AS ts');
    ok(res, { connected: true, db: 'shadownet_db', server_time: rows[0].ts });
  } catch (err) { fail(res, err.message); }
});

// ================================================================
//  API — NODES
// ================================================================
app.get('/api/nodes', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT id, name, rank, unit, signal, hops, status, route, last_seen, created_at
      FROM nodes
      ORDER BY
        CASE status
          WHEN 'online'  THEN 1
          WHEN 'relay'   THEN 2
          WHEN 'weak'    THEN 3
          ELSE 4
        END, name
    `);
    ok(res, rows);
  } catch (err) { fail(res, err.message); }
});

app.get('/api/nodes/:id', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM nodes WHERE id=$1', [req.params.id]);
    if (!rows.length) return fail(res, 'Node not found', 404);
    ok(res, rows[0]);
  } catch (err) { fail(res, err.message); }
});

app.post('/api/nodes', async (req, res) => {
  const { id, name, rank='', unit='', signal=0, hops=0, status='offline', route='No route' } = req.body;
  if (!id || !name) return fail(res, 'id and name are required', 400);
  try {
    await db.query(`
      INSERT INTO nodes (id,name,rank,unit,signal,hops,status,route)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (id) DO UPDATE SET
        name=$2, rank=$3, unit=$4, signal=$5,
        hops=$6, status=$7, route=$8, last_seen=NOW()
    `, [id,name,rank,unit,signal,hops,status,route]);
    ok(res, { id,name,rank,unit,signal,hops,status,route });
  } catch (err) { fail(res, err.message); }
});

app.patch('/api/nodes/:id/status', async (req, res) => {
  const { status, signal, hops, route } = req.body;
  try {
    await db.query(`
      UPDATE nodes SET
        status    = COALESCE($1, status),
        signal    = COALESCE($2, signal),
        hops      = COALESCE($3, hops),
        route     = COALESCE($4, route),
        last_seen = NOW()
      WHERE id = $5
    `, [status, signal, hops, route, req.params.id]);
    ok(res, { updated: req.params.id });
  } catch (err) { fail(res, err.message); }
});

app.delete('/api/nodes/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM nodes WHERE id=$1', [req.params.id]);
    ok(res, { deleted: req.params.id });
  } catch (err) { fail(res, err.message); }
});

// ================================================================
//  API — CONVERSATIONS
// ================================================================
app.get('/api/conversations/:ownerId', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT c.*,
        (SELECT message_text FROM messages m
         WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
        (SELECT sent_time FROM messages m
         WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1) AS last_time,
        n.status AS peer_status
      FROM conversations c
      JOIN nodes n ON n.id = c.peer_id
      WHERE c.owner_id = $1
      ORDER BY c.created_at DESC
    `, [req.params.ownerId]);
    ok(res, rows);
  } catch (err) { fail(res, err.message); }
});

app.post('/api/conversations', async (req, res) => {
  const { owner_id, peer_id, peer_name, route='', hops=0 } = req.body;
  if (!owner_id||!peer_id||!peer_name) return fail(res,'owner_id, peer_id, peer_name required',400);
  try {
    const { rows } = await db.query(`
      INSERT INTO conversations (owner_id, peer_id, peer_name, route, hops)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (owner_id, peer_id) DO UPDATE SET route=$4, hops=$5
      RETURNING *
    `, [owner_id, peer_id, peer_name, route, hops]);
    ok(res, rows[0]);
  } catch (err) { fail(res, err.message); }
});

// ================================================================
//  API — MESSAGES
// ================================================================
app.get('/api/messages/:conversationId', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT id, sender, message_text AS text, sent_time AS time,
             hops, delivered, created_at
      FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC
    `, [req.params.conversationId]);
    ok(res, rows);
  } catch (err) { fail(res, err.message); }
});

app.post('/api/messages', async (req, res) => {
  const { conversation_id, sender, text, time, hops=1 } = req.body;
  if (!conversation_id||!sender||!text||!time)
    return fail(res,'conversation_id, sender, text, time required',400);
  try {
    const { rows } = await db.query(`
      INSERT INTO messages (conversation_id, sender, message_text, sent_time, hops)
      VALUES ($1,$2,$3,$4,$5) RETURNING id
    `, [conversation_id, sender, text, time, hops]);
    ok(res, { id:rows[0].id, conversation_id, sender, text, time, hops });
  } catch (err) { fail(res, err.message); }
});

app.patch('/api/messages/:id/delivered', async (req, res) => {
  try {
    await db.query('UPDATE messages SET delivered=TRUE WHERE id=$1', [req.params.id]);
    ok(res, { delivered: req.params.id });
  } catch (err) { fail(res, err.message); }
});

// ================================================================
//  API — MESH ROUTES
// ================================================================
app.get('/api/routes/:sourceId', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT r.*, n.name AS dest_name, nh.name AS next_hop_name
      FROM mesh_routes r
      JOIN nodes n  ON n.id  = r.destination_id
      JOIN nodes nh ON nh.id = r.next_hop_id
      WHERE r.source_id = $1
      ORDER BY r.total_hops, r.link_quality DESC
    `, [req.params.sourceId]);
    ok(res, rows);
  } catch (err) { fail(res, err.message); }
});

app.post('/api/routes', async (req, res) => {
  const { source_id, destination_id, next_hop_id, total_hops=1, link_quality=100 } = req.body;
  if (!source_id||!destination_id||!next_hop_id)
    return fail(res,'source_id, destination_id, next_hop_id required',400);
  try {
    await db.query(`
      INSERT INTO mesh_routes (source_id, destination_id, next_hop_id, total_hops, link_quality)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (source_id, destination_id) DO UPDATE SET
        next_hop_id=$3, total_hops=$4, link_quality=$5, updated_at=NOW()
    `, [source_id, destination_id, next_hop_id, total_hops, link_quality]);
    ok(res, { source_id, destination_id, next_hop_id, total_hops, link_quality });
  } catch (err) { fail(res, err.message); }
});

// ================================================================
//  CATCH-ALL — serve index.html
// ================================================================
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ================================================================
//  BOOT
// ================================================================
(async () => {
  try {
    await autoInitDatabase();
    app.listen(PORT, () => {
      console.log('🛡️  ShadowNet running at http://localhost:' + PORT);
      console.log('    Soldiers: A (Vikalp) · B (Nishant) · C (Than Singh)');
      console.log('    API  →  http://localhost:' + PORT + '/api');
      console.log('    Press Ctrl+C to stop.\n');
    });
  } catch (err) {
    console.error('\n❌  Boot failed:', err.message);
    process.exit(1);
  }
})();