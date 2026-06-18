const express = require('express');
const { exec } = require('child_process');

// Load .env if present
try { require('dotenv').config(); } catch(e) {}

const app = express();

// API key loaded from environment — never hardcoded
const API_KEY = process.env.API_KEY || 'changeme';

if (API_KEY === 'changeme') {
  console.warn('⚠️  WARNING: Set API_KEY in your .env file!');
}

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'x-api-key, Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use((req, res, next) => {
  if (req.headers['x-api-key'] !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

app.post('/vpn/on', (req, res) => {
  exec('sudo systemctl start wg-quick@wg0', (err) => {
    res.json({ status: err ? 'error' : 'on' });
  });
});

app.post('/vpn/off', (req, res) => {
  exec('sudo systemctl stop wg-quick@wg0', (err) => {
    res.json({ status: err ? 'error' : 'off' });
  });
});

app.get('/vpn/status', (req, res) => {
  exec('sudo systemctl is-active wg-quick@wg0', (err, stdout) => {
    res.json({ status: stdout.trim() === 'active' ? 'on' : 'off' });
  });
});

const PORT = parseInt(process.env.API_PORT) || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`VPN API running on port ${PORT}`);
});
