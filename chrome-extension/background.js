// Background service worker
// Server config is loaded from chrome.storage — never hardcoded

async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['vpnConfig'], (result) => {
      resolve(result.vpnConfig || { ip: '', port: '3000', key: '', proxyPort: '8888' });
    });
  });
}

async function callAPI(path, method = 'GET') {
  const config = await getConfig();
  if (!config.ip) return { status: 'error', message: 'No server configured' };
  const url = `http://${config.ip}:${config.port}${path}`;
  try {
    const res = await fetch(url, {
      method,
      headers: { 'x-api-key': config.key }
    });
    return await res.json();
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

async function enableProxy() {
  const config = await getConfig();
  const proxyConfig = {
    mode: "fixed_servers",
    rules: {
      singleProxy: {
        scheme: "socks5",
        host: "127.0.0.1",
        port: parseInt(config.proxyPort) || 8888
      },
      bypassList: []
    }
  };
  return new Promise((resolve) => {
    chrome.proxy.settings.set({ value: proxyConfig, scope: 'regular' }, () => resolve(true));
  });
}

async function disableProxy() {
  return new Promise((resolve) => {
    chrome.proxy.settings.set({ value: { mode: "direct" }, scope: 'regular' }, () => resolve(true));
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'connect') {
    (async () => {
      await callAPI('/vpn/on', 'POST');
      await enableProxy();
      chrome.storage.local.set({ vpnState: 'connected' });
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message.action === 'disconnect') {
    (async () => {
      await disableProxy();
      chrome.storage.local.set({ vpnState: 'disconnected' });
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message.action === 'getStatus') {
    (async () => {
      const data = await callAPI('/vpn/status');
      const stored = await new Promise(r => chrome.storage.local.get(['vpnState'], r));
      sendResponse({
        serverStatus: data.status,
        proxyActive: stored.vpnState === 'connected'
      });
    })();
    return true;
  }
});
