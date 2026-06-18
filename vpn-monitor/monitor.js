const express = require('express');
const { exec } = require('child_process');
const http = require('http');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, { cors: { origin: false } });

const CONFIG = {
  DASHBOARD_PASSWORD: 'changeme',
  PORT: 4000,
  SESSION_TIMEOUT: 3600000,
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_TIME: 900000,
  HISTORY_POINTS: 60,
};

const sessions = new Map();
const loginAttempts = new Map();
const trafficHistory = [];
let peakBandwidth = { rx: 0, tx: 0 };
let lastNetworkStats = null;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', (req, res, next) => {
  const ip = req.ip;
  const attempts = loginAttempts.get(ip);
  if (attempts && attempts.count >= CONFIG.MAX_LOGIN_ATTEMPTS) {
    const timeSince = Date.now() - attempts.lastAttempt;
    if (timeSince < CONFIG.LOCKOUT_TIME) {
      const remaining = Math.ceil((CONFIG.LOCKOUT_TIME - timeSince) / 60000);
      return res.status(429).json({ error: `Too many attempts. Try again in ${remaining} minutes.` });
    } else { loginAttempts.delete(ip); }
  }
  next();
});

function requireAuth(req, res, next) {
  const token = req.headers['x-session-token'] || req.query.token;
  if (!token || !sessions.has(token)) return res.status(401).json({ error: 'Unauthorized' });
  const session = sessions.get(token);
  if (Date.now() - session.created > CONFIG.SESSION_TIMEOUT) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Session expired' });
  }
  session.lastActive = Date.now();
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
    const attempts = loginAttempts.get(ip) || { count: 0, lastAttempt: 0 };
    attempts.count++; attempts.lastAttempt = Date.now();
    loginAttempts.set(ip, attempts);
    return res.status(401).json({ error: 'Invalid password' });
  }
  loginAttempts.delete(ip);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { created: Date.now(), lastActive: Date.now(), ip });
  res.json({ token });
});

app.post('/api/logout', requireAuth, (req, res) => {
  sessions.delete(req.headers['x-session-token']);
  res.json({ ok: true });
});

function runCmd(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 5000 }, (err, stdout) => resolve(err ? '' : stdout.trim()));
  });
}

async function getWgStats() {
  const out = await runCmd('sudo wg show wg0 dump');
  if (!out) return { peers: [], status: 'off', listenPort: 55804 };
  const lines = out.split('\n');
  const ifaceParts = lines[0]?.split('\t') || [];
  const peers = [];
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split('\t');
    if (p.length < 7) continue;
    const lastHs = parseInt(p[4]);
    const secAgo = lastHs > 0 ? Math.floor(Date.now() / 1000) - lastHs : null;
    peers.push({
      publicKey: p[0].slice(0, 20) + '...',
      endpoint: p[2] || '—',
      allowedIps: p[3],
      lastHandshake: lastHs === 0 ? 'Never' : new Date(lastHs * 1000).toLocaleString(),
      secondsAgo: secAgo,
      isActive: secAgo !== null && secAgo < 180,
      rxBytes: parseInt(p[5]) || 0,
      txBytes: parseInt(p[6]) || 0,
    });
  }
  return { peers, status: 'on', listenPort: ifaceParts[2] || '55804' };
}

async function getSystemStats() {
  const [cpu, mem, disk, uptime, load] = await Promise.all([
    runCmd("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'"),
    runCmd("free -m | awk 'NR==2{printf \"%.1f %.0f %.0f\", $3*100/$2, $3, $2}'"),
    runCmd("df -h / | awk 'NR==2{print $5, $3, $2}'"),
    runCmd('uptime -p'),
    runCmd("cat /proc/loadavg | awk '{print $1, $2, $3}'"),
  ]);
  const memParts = mem.split(' ');
  const diskParts = disk.split(' ');
  return {
    cpuPercent: parseFloat(cpu) || 0,
    memPercent: parseFloat(memParts[0]) || 0,
    memUsed: memParts[1] || '0',
    memTotal: memParts[2] || '0',
    diskPercent: parseInt(diskParts[0]) || 0,
    diskUsed: diskParts[1] || '0',
    diskTotal: diskParts[2] || '0',
    uptime: uptime.replace('up ', ''),
    loadAvg: load,
  };
}

async function getNetworkStats() {
  const out = await runCmd("cat /proc/net/dev | grep -E 'ens5|wg0|eth0'");
  const stats = {};
  out.split('\n').forEach(line => {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 10) {
      const iface = parts[0].replace(':', '');
      stats[iface] = { rxBytes: parseInt(parts[1]) || 0, txBytes: parseInt(parts[9]) || 0 };
    }
  });
  let bwRx = 0, bwTx = 0;
  if (lastNetworkStats && stats.ens5) {
    bwRx = Math.max(0, (stats.ens5.rxBytes - lastNetworkStats.rxBytes) / 3);
    bwTx = Math.max(0, (stats.ens5.txBytes - lastNetworkStats.txBytes) / 3);
    if (bwRx > peakBandwidth.rx) peakBandwidth.rx = bwRx;
    if (bwTx > peakBandwidth.tx) peakBandwidth.tx = bwTx;
  }
  if (stats.ens5) lastNetworkStats = { ...stats.ens5 };
  return { ...stats, bandwidth: { rx: bwRx, tx: bwTx } };
}

async function getAllStats() {
  const [wg, system, network] = await Promise.all([getWgStats(), getSystemStats(), getNetworkStats()]);
  let peerRx = 0, peerTx = 0;
  wg.peers.forEach(p => { peerRx += p.rxBytes; peerTx += p.txBytes; });
  const point = {
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    rxBw: Math.round((network.bandwidth?.rx || 0) / 1024),
    txBw: Math.round((network.bandwidth?.tx || 0) / 1024),
    activePeers: wg.peers.filter(p => p.isActive).length,
    cpu: system.cpuPercent,
  };
  trafficHistory.push(point);
  if (trafficHistory.length > CONFIG.HISTORY_POINTS) trafficHistory.shift();
  return { wg, system, network, totalDataUsed: { rx: peerRx, tx: peerTx }, peakBandwidth, trafficHistory, timestamp: Date.now() };
}

app.get('/api/stats', requireAuth, async (req, res) => { res.json(await getAllStats()); });
app.post('/api/vpn/on', requireAuth, async (req, res) => { await runCmd('sudo systemctl start wg-quick@wg0'); res.json({ status: 'on' }); });
app.post('/api/vpn/off', requireAuth, async (req, res) => { await runCmd('sudo systemctl stop wg-quick@wg0'); res.json({ status: 'off' }); });
app.get('/api/vpn/status', requireAuth, async (req, res) => { const out = await runCmd('sudo systemctl is-active wg-quick@wg0'); res.json({ status: out === 'active' ? 'on' : 'off' }); });

io.on('connection', (socket) => {
  let interval = setInterval(async () => {
    try { socket.emit('stats', await getAllStats()); } catch(e) {}
  }, 3000);
  socket.on('disconnect', () => clearInterval(interval));
});

server.listen(CONFIG.PORT, '0.0.0.0', () => console.log(`VPN Monitor running on port ${CONFIG.PORT}`));
