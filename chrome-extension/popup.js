const powerRing = document.getElementById('powerRing');
const powerLabel = document.getElementById('powerLabel');
const statusText = document.getElementById('statusText');
const statLoc = document.getElementById('statLoc');
const statIp = document.getElementById('statIp');
const statProxy = document.getElementById('statProxy');
const statWg = document.getElementById('statWg');
const gearBtn = document.getElementById('gearBtn');
const settingsPanel = document.getElementById('settingsPanel');
const inpIp = document.getElementById('inpIp');
const inpPort = document.getElementById('inpPort');
const inpKey = document.getElementById('inpKey');
const inpProxy = document.getElementById('inpProxy');
const saveBtn = document.getElementById('saveBtn');

let isConnected = false;

// Load config
chrome.storage.local.get(['vpnConfig'], (result) => {
  const c = result.vpnConfig || {};
  inpIp.value = c.ip || '';
  inpPort.value = c.port || '3000';
  inpKey.value = c.key || '';
  inpProxy.value = c.proxyPort || '8888';
  if (c.ip) { statIp.textContent = c.ip.slice(0, 12) + '…'; statIp.classList.add('active'); }
  if (!c.ip) openSettings();
  else checkStatus();
});

gearBtn.addEventListener('click', () => {
  settingsPanel.classList.toggle('open');
});

saveBtn.addEventListener('click', () => {
  const config = { ip: inpIp.value.trim(), port: inpPort.value.trim() || '3000', key: inpKey.value.trim(), proxyPort: inpProxy.value.trim() || '8888' };
  chrome.storage.local.set({ vpnConfig: config }, () => {
    statIp.textContent = config.ip.slice(0, 12) + '…';
    statIp.classList.add('active');
    settingsPanel.classList.remove('open');
    checkStatus();
  });
});

powerRing.addEventListener('click', async () => {
  if (powerRing.classList.contains('connecting')) return;
  setConnecting();
  try {
    if (isConnected) {
      await chrome.runtime.sendMessage({ action: 'disconnect' });
      setDisconnected();
    } else {
      await chrome.runtime.sendMessage({ action: 'connect' });
      setConnected();
    }
  } catch (e) { setError('Failed'); }
});

async function checkStatus() {
  try {
    const data = await chrome.runtime.sendMessage({ action: 'getStatus' });
    statWg.textContent = data.serverStatus === 'on' ? 'Running' : 'Stopped';
    statWg.classList.toggle('active', data.serverStatus === 'on');
    if (data.proxyActive) setConnected();
    else setDisconnected();
  } catch (e) { setDisconnected(); }
}

function setConnected() {
  isConnected = true;
  powerRing.className = 'power-ring connected';
  powerLabel.textContent = 'On';
  statusText.textContent = '🟢 Connected · Mumbai';
  statusText.className = 'status-text on';
  statLoc.textContent = 'Mumbai 🇮🇳';
  statLoc.classList.add('active');
  statProxy.textContent = 'Active';
  statProxy.classList.add('active');
}

function setDisconnected() {
  isConnected = false;
  powerRing.className = 'power-ring';
  powerLabel.textContent = 'Off';
  statusText.textContent = 'Tap to connect';
  statusText.className = 'status-text';
  statLoc.textContent = '—';
  statLoc.classList.remove('active');
  statProxy.textContent = 'Inactive';
  statProxy.classList.remove('active');
}

function setConnecting() {
  powerRing.className = 'power-ring connecting';
  powerLabel.textContent = '...';
  statusText.textContent = isConnected ? 'Disconnecting…' : 'Connecting…';
  statusText.className = 'status-text connecting';
}

function setError(msg) {
  isConnected = false;
  powerRing.className = 'power-ring';
  powerLabel.textContent = 'Off';
  statusText.textContent = '⚠️ ' + msg;
  statusText.className = 'status-text err';
}

function openSettings() { settingsPanel.classList.add('open'); }
