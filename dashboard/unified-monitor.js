const express = require('express');
const { exec } = require('child_process');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

try { require('dotenv').config(); } catch(e) {}

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, { cors: { origin: false } });

const CONFIG = {
  DASHBOARD_PASSWORD: process.env.DASHBOARD_PASSWORD || 'changeme',
  PORT: parseInt(process.env.PORT) || 5000,
  SESSION_TIMEOUT: 3600000,
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_TIME: 900000,
  // Remote servers to monitor — configure via servers.json
};

// Load remote server list from servers.json
function loadServers() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'servers.json'), 'utf8'));
  } catch(e) {
    // Default: this local server only
    return [
      { id: 'local', name: 'This Server', flag: '🖥️', host: 'localhost', apiPort: 3000, apiKey: '', isLocal: true }
    ];
  }
}

const sessions = new Map();
const loginAttempts = new Map();
const historyByServer = {};

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', (req, res, next) => {
  const ip = req.ip;
  const attempts = loginAttempts.get(ip);
  if (attempts && attempts.count >= CONFIG.MAX_LOGIN_ATTEMPTS) {
    const timeSince = Date.now() - attempts.lastAttempt;
    if (timeSince < CONFIG.LOCKOUT_TIME) {
      const remaining = Math.ceil((CONFIG.LOCKOUT_TIME - timeSince) / 60000);
      return res.status(429).json({ error: `Too many attempts. Try again in ${remaining} min.` });
    } else { loginAttempts.delete(ip); }
  }
  next();
});

function requireAuth(req, res, next) {
  const token = req.headers['x-session-token'] || req.query.token;
  if (!token || !sessions.has(token)) return res.status(401).json({ error: 'Unauthorized' });
  const s = sessions.get(token);
  if (Date.now() - s.created > CONFIG.SESSION_TIMEOUT) { sessions.delete(token); return res.status(401).json({ error: 'Session expired' }); }
  s.lastActive = Date.now();
  next();
}

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token || !sessions.has(token)) return next(new Error('Unauthorized'));
  next();
});

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  const ip = req.ip;
  if (password !== CONFIG.DASHBOARD_PASSWORD) {
    const a = loginAttempts.get(ip) || { count: 0, lastAttempt: 0 };
    a.count++; a.lastAttempt = Date.now();
    loginAttempts.set(ip, a);
    return res.status(401).json({ error: 'Invalid password' });
  }
  loginAttempts.delete(ip);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { created: Date.now(), lastActive: Date.now() });
  res.json({ token });
});

app.post('/api/logout', requireAuth, (req, res) => { sessions.delete(req.headers['x-session-token']); res.json({ ok: true }); });

function runCmd(cmd) {
  return new Promise((resolve) => exec(cmd, { timeout: 5000 }, (err, stdout) => resolve(err ? '' : stdout.trim())));
}

// Get stats from LOCAL server commands
async function getLocalStats() {
  const [wgOut, cpu, mem, disk, uptime, load] = await Promise.all([
    runCmd('sudo wg show wg0 dump'),
    runCmd("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'"),
    runCmd("free -m | awk 'NR==2{printf \"%.1f %.0f %.0f\", $3*100/$2, $3, $2}'"),
    runCmd("df -h / | awk 'NR==2{print $5, $3, $2}'"),
    runCmd('uptime -p'),
    runCmd("cat /proc/loadavg | awk '{print $1, $2, $3}'"),
  ]);

  const peers = [];
  let wgStatus = 'off';
  if (wgOut) {
    wgStatus = 'on';
    const lines = wgOut.split('\n');
    for (let i = 1; i < lines.length; i++) {
      const p = lines[i].split('\t');
      if (p.length < 7) continue;
      const lastHs = parseInt(p[4]);
      const secAgo = lastHs > 0 ? Math.floor(Date.now()/1000) - lastHs : null;
      peers.push({
        publicKey: p[0].slice(0,16) + '...',
        endpoint: p[2] || '—',
        lastHandshake: lastHs === 0 ? 'Never' : new Date(lastHs*1000).toLocaleString(),
        secondsAgo: secAgo,
        isActive: secAgo !== null && secAgo < 180,
        rxBytes: parseInt(p[5]) || 0,
        txBytes: parseInt(p[6]) || 0,
      });
    }
  }

  const memP = mem.split(' ');
  const diskP = disk.split(' ');
  let totalRx = 0, totalTx = 0;
  peers.forEach(p => { totalRx += p.rxBytes; totalTx += p.txBytes; });

  return {
    wgStatus,
    peers,
    activePeers: peers.filter(p => p.isActive).length,
    totalPeers: peers.length,
    totalRx, totalTx,
    cpu: parseFloat(cpu) || 0,
    mem: parseFloat(memP[0]) || 0,
    memUsed: memP[1] || '0',
    memTotal: memP[2] || '0',
    disk: parseInt(diskP[0]) || 0,
    uptime: uptime.replace('up ', ''),
    loadAvg: load,
    reachable: true,
  };
}

// Get stats from a REMOTE server via its API
async function getRemoteStats(srv) {
  try {
    const fetch = (await import('node-fetch')).default;
    const res = await fetch(`http://${srv.host}:${srv.apiPort}/vpn/status`, {
      headers: { 'x-api-key': srv.apiKey },
      timeout: 4000
    });
    const data = await res.json();
    return { wgStatus: data.status, reachable: true, peers: [], activePeers: 0, totalPeers: 0, totalRx: 0, totalTx: 0, cpu: 0, mem: 0, disk: 0, uptime: '—', remote: true };
  } catch(e) {
    return { wgStatus: 'unknown', reachable: false, remote: true };
  }
}

async function getAllServerStats() {
  const servers = loadServers();
  const results = [];
  for (const srv of servers) {
    let stats;
    if (srv.isLocal) stats = await getLocalStats();
    else stats = await getRemoteStats(srv);

    // Track bandwidth history per server
    if (!historyByServer[srv.id]) historyByServer[srv.id] = { lastRx: 0, lastTx: 0, points: [] };
    const h = historyByServer[srv.id];
    const rxBw = Math.max(0, (stats.totalRx - h.lastRx) / 3);
    const txBw = Math.max(0, (stats.totalTx - h.lastTx) / 3);
    h.lastRx = stats.totalRx; h.lastTx = stats.totalTx;
    h.points.push({ rx: Math.round(rxBw/1024), tx: Math.round(txBw/1024), t: Date.now() });
    if (h.points.length > 40) h.points.shift();

    results.push({ ...srv, stats, bandwidth: { rx: rxBw, tx: txBw }, history: h.points });
  }
  return results;
}

// Control a server's VPN
async function controlServer(serverId, action) {
  const servers = loadServers();
  const srv = servers.find(s => s.id === serverId);
  if (!srv) return { error: 'Server not found' };

  if (srv.isLocal) {
    const cmd = action === 'on' ? 'sudo systemctl start wg-quick@wg0' : 'sudo systemctl stop wg-quick@wg0';
    await runCmd(cmd);
    return { status: action };
  } else {
    try {
      const fetch = (await import('node-fetch')).default;
      const res = await fetch(`http://${srv.host}:${srv.apiPort}/vpn/${action}`, {
        method: 'POST',
        headers: { 'x-api-key': srv.apiKey },
        timeout: 4000
      });
      return await res.json();
    } catch(e) {
      return { error: e.message };
    }
  }
}

app.get('/api/servers', requireAuth, async (req, res) => res.json(await getAllServerStats()));
app.post('/api/server/:id/:action', requireAuth, async (req, res) => {
  res.json(await controlServer(req.params.id, req.params.action));
});

io.on('connection', (socket) => {
  const interval = setInterval(async () => {
    try { socket.emit('servers', await getAllServerStats()); } catch(e) {}
  }, 3000);
  socket.on('disconnect', () => clearInterval(interval));
});

server.listen(CONFIG.PORT, '0.0.0.0', () => {
  console.log(`Unified VPN Dashboard running on port ${CONFIG.PORT}`);
  if (CONFIG.DASHBOARD_PASSWORD === 'changeme') console.warn('⚠️  Set DASHBOARD_PASSWORD in .env!');
});
