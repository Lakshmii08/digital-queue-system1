const express = require("express");
const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const app = express();
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

// Keep the database outside public/ so it cannot be downloaded by browsers.
const dataDir = process.env.DATA_DIR || path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, "queue.db"));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS queue_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE,
    name TEXT NOT NULL,
    department TEXT NOT NULL DEFAULT 'General Enquiry',
    status TEXT NOT NULL DEFAULT 'WAITING' CHECK(status IN ('WAITING','SERVING','COMPLETED')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_queue_status_id ON queue_tokens(status, id);
`);
// Assign stable token numbers to new records. The AUTOINCREMENT ID prevents reuse after reset.
const mapToken = row => row ? ({
  id: row.id, token: row.token, name: row.name, department: row.department,
  status: row.status, createdAt: row.created_at, updatedAt: row.updated_at
}) : null;
const all = db.prepare('SELECT * FROM queue_tokens ORDER BY id DESC');
const byId = db.prepare('SELECT * FROM queue_tokens WHERE id = ?');
const currentStmt = db.prepare("SELECT * FROM queue_tokens WHERE status = 'SERVING' ORDER BY id LIMIT 1");
const waitingStmt = db.prepare("SELECT * FROM queue_tokens WHERE status = 'WAITING' ORDER BY id LIMIT 1");

app.get('/health', (req, res) => res.status(200).json({ status: 'healthy', database: 'sqlite' }));
app.get('/api', (req, res) => res.json({ name: 'Digital Queue Management API', version: '1.0.0', docs: '/api/docs' }));
app.get('/api/docs', (req, res) => res.json({
  endpoints: [
    { method: 'GET', path: '/api/queue', description: 'List tokens. Optional ?status=WAITING|SERVING|COMPLETED' },
    { method: 'GET', path: '/api/queue/current', description: 'Get the currently serving token' },
    { method: 'GET', path: '/api/queue/stats', description: 'Queue totals and average wait estimate' },
    { method: 'GET', path: '/api/queue/:id', description: 'Get a token by numeric ID' },
    { method: 'POST', path: '/api/queue', description: 'Create a token; JSON: { name, department }' },
    { method: 'POST', path: '/api/queue/next', description: 'Call the next waiting token' },
    { method: 'PATCH', path: '/api/queue/:id/complete', description: 'Complete the currently serving token' },
    { method: 'DELETE', path: '/api/queue/:id', description: 'Cancel a waiting token' },
    { method: 'DELETE', path: '/api/queue/reset', description: 'Clear all tokens (demo/admin use)' }
  ]
}));
app.get('/api/queue', (req, res) => {
  const status = String(req.query.status || '').toUpperCase();
  if (status && !['WAITING','SERVING','COMPLETED'].includes(status)) return res.status(400).json({ error: 'Invalid status filter' });
  const rows = status ? db.prepare('SELECT * FROM queue_tokens WHERE status = ? ORDER BY id DESC').all(status) : all.all();
  res.json(rows.map(mapToken));
});
app.get('/api/queue/current', (req, res) => res.json(mapToken(currentStmt.get()) || null));
app.get('/api/queue/stats', (req, res) => {
  const counts = db.prepare("SELECT status, COUNT(*) AS count FROM queue_tokens GROUP BY status").all();
  const result = { waiting: 0, serving: 0, completed: 0, total: 0, estimatedWaitMinutes: 0 };
  for (const row of counts) { result[row.status.toLowerCase()] = row.count; result.total += row.count; }
  // Simple configurable estimate; adjust AVG_SERVICE_MINUTES for your service desk.
  result.estimatedWaitMinutes = result.waiting * (Number(process.env.AVG_SERVICE_MINUTES) || 5);
  res.json(result);
});
app.get('/api/queue/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid token ID' });
  const item = mapToken(byId.get(id));
  return item ? res.json(item) : res.status(404).json({ error: 'Token not found' });
});
app.post('/api/queue', (req, res) => {
  const name = String(req.body?.name || '').trim();
  const department = String(req.body?.department || 'General Enquiry').trim();
  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (name.length > 80) return res.status(400).json({ error: 'Name must be 80 characters or fewer' });
  if (department.length > 60) return res.status(400).json({ error: 'Department must be 60 characters or fewer' });
  const info = db.prepare('INSERT INTO queue_tokens (token, name, department) VALUES (NULL, ?, ?)').run(name, department || 'General Enquiry');
  const id = Number(info.lastInsertRowid);
  const token = `Q${String(id).padStart(3, '0')}`;
  db.prepare('UPDATE queue_tokens SET token = ?, updated_at = datetime(\'now\') WHERE id = ?').run(token, id);
  res.status(201).json(mapToken(byId.get(id)));
});
app.post('/api/queue/next', (req, res) => {
  const serving = currentStmt.get();
  if (serving) return res.status(409).json({ error: 'Complete the current token first' });
  const next = waitingStmt.get();
  if (!next) return res.status(404).json({ error: 'No waiting tokens' });
  db.prepare("UPDATE queue_tokens SET status = 'SERVING', updated_at = datetime('now') WHERE id = ? AND status = 'WAITING'").run(next.id);
  res.json(mapToken(byId.get(next.id)));
});
app.patch('/api/queue/:id/complete', (req, res) => {
  const id = Number(req.params.id);
  const item = mapToken(byId.get(id));
  if (!item) return res.status(404).json({ error: 'Token not found' });
  if (item.status !== 'SERVING') return res.status(409).json({ error: 'Only the serving token can be completed' });
  db.prepare("UPDATE queue_tokens SET status = 'COMPLETED', updated_at = datetime('now') WHERE id = ?").run(id);
  res.json(mapToken(byId.get(id)));
});
app.delete('/api/queue/reset', (req, res) => {
  // Demo endpoint: protect this endpoint with authentication before public deployment.
  db.exec('DELETE FROM queue_tokens;');
  res.json({ message: 'Queue reset successfully' });
});
app.delete('/api/queue/:id', (req, res) => {
  const id = Number(req.params.id);
  const item = mapToken(byId.get(id));
  if (!item) return res.status(404).json({ error: 'Token not found' });
  if (item.status !== 'WAITING') return res.status(409).json({ error: 'Only waiting tokens can be cancelled' });
  db.prepare('DELETE FROM queue_tokens WHERE id = ?').run(id);
  res.json({ message: 'Token cancelled', item });
});
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
module.exports = app;
