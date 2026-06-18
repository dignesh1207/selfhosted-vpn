# ☁️ CloudVPN — Self-Hosted VPN on AWS

A free, self-hosted VPN using AWS EC2, WireGuard, a Chrome extension, and a real-time monitoring dashboard. Works with **any AWS region** — India, Canada, UK, US, Singapore, and more.

![AWS](https://img.shields.io/badge/AWS-EC2-orange)
![WireGuard](https://img.shields.io/badge/VPN-WireGuard-blue)
![Chrome](https://img.shields.io/badge/Chrome-Extension-green)
![Free](https://img.shields.io/badge/Cost-Free%2012mo-brightgreen)

---

## ⚠️ Security — Read Before Pushing to GitHub

**NEVER commit these files:**
- `*.pem` — SSH private key
- `*.conf` — WireGuard config files
- `.env` — environment variables with secrets
- `peer-names.json` — contains your device IPs

**Always use `.env` for secrets:**
```bash
cp .env.example .env
# Edit .env with your actual values
```

---

## 🌍 Supported AWS Regions

| Location | Region Code |
|---|---|
| 🇮🇳 Mumbai, India | ap-south-1 |
| 🇨🇦 Montreal, Canada | ca-central-1 |
| 🇬🇧 London, UK | eu-west-2 |
| 🇺🇸 New York, US | us-east-1 |
| 🇸🇬 Singapore | ap-southeast-1 |
| 🇩🇪 Frankfurt, Germany | eu-central-1 |
| 🇦🇺 Sydney, Australia | ap-southeast-2 |

---

## 🏗️ Project Structure

```
selfhosted-vpn/
├── chrome-extension/        # Chrome extension
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.js
│   └── background.js
├── vpn-monitor/             # Server-side code
│   ├── monitor.js           # Dashboard server (port 4000)
│   ├── vpn-api.js           # VPN control API (port 3000)
│   └── public/
│       └── index.html       # Dashboard UI
├── scripts/
│   ├── setup.sh             # EC2 setup script
│   ├── start-vpn.sh         # Mac: start SSH tunnel
│   └── stop-vpn.sh          # Mac: stop SSH tunnel
├── .env.example             # Environment variable template
├── .gitignore               # Protects sensitive files
└── README.md
```

---

## 🚀 Setup Guide

### Step 1 — Launch EC2 Instance

1. Go to [AWS Console](https://console.aws.amazon.com)
2. Switch to your preferred region (e.g. ap-south-1 for India)
3. Launch EC2 instance:
   - AMI: **Ubuntu 22.04+ LTS** (free tier eligible)
   - Type: **t3.micro** (free tier eligible)
   - Create key pair → download `.pem` file
4. Security group inbound rules:

| Port | Protocol | Purpose |
|---|---|---|
| 22 | TCP | SSH |
| 3000 | TCP | VPN API |
| 4000 | TCP | Monitor Dashboard |
| 8888 | TCP | SOCKS5 Proxy |
| 51820 | UDP | WireGuard (default) |

5. Assign an **Elastic IP** so your server IP never changes

### Step 2 — Install WireGuard on Server

```bash
ssh -i ~/Downloads/YOUR-KEY.pem ubuntu@YOUR_SERVER_IP

sudo apt update
curl -O https://raw.githubusercontent.com/angristan/wireguard-install/master/wireguard-install.sh
chmod +x wireguard-install.sh
sudo ./wireguard-install.sh
# Enter your PUBLIC IP when asked
# Press Enter for all other defaults
# Name your first client e.g. "mylaptop"
```

### Step 3 — Enable IP Forwarding

```bash
sudo sysctl -w net.ipv4.ip_forward=1
echo "net.ipv4.ip_forward=1" | sudo tee /etc/sysctl.conf
sudo iptables -t nat -A POSTROUTING -o ens5 -j MASQUERADE
sudo iptables -A FORWARD -i wg0 -j ACCEPT
sudo iptables -A FORWARD -o wg0 -j ACCEPT
sudo apt install iptables-persistent -y
sudo netfilter-persistent save
```

### Step 4 — Install Dante SOCKS5 Proxy

```bash
sudo apt install dante-server -y
sudo bash -c 'cat > /etc/danted.conf << DEOF
logoutput: syslog
internal: 0.0.0.0 port = 8888
external: ens5
clientmethod: none
socksmethod: none

client pass {
    from: 0.0.0.0/0 to: 0.0.0.0/0
}

socks pass {
    from: 0.0.0.0/0 to: 0.0.0.0/0
}
DEOF'
sudo systemctl restart danted
sudo systemctl enable danted
```

### Step 5 — Deploy VPN API and Monitor

```bash
# Create .env
cat > ~/.env << ENVEOF
API_KEY=your-secret-key-here
DASHBOARD_PASSWORD=your-dashboard-password
ENVEOF

# VPN API
mkdir ~/vpn-api && cd ~/vpn-api
# Upload vpn-api.js here as server.js
npm init -y && npm install express dotenv
cp ~/.env .env

# Monitor
mkdir -p ~/vpn-monitor/public && cd ~/vpn-monitor
# Upload monitor.js and public/index.html
npm init -y && npm install express socket.io dotenv
cp ~/.env .env

# Start with PM2
sudo npm install -g pm2
pm2 start ~/vpn-api/server.js --name vpn-api
pm2 start ~/vpn-monitor/monitor.js --name vpn-monitor
pm2 startup && pm2 save
```

### Step 6 — Load Chrome Extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer Mode**
3. Click **Load unpacked** → select `chrome-extension/` folder
4. Click extension icon → enter your server details:
   - Server IP: your EC2 public IP
   - API Port: 3000
   - API Key: your API key from `.env`
   - Proxy Port: 8888

### Step 7 — Access Dashboard

Open: `http://YOUR_SERVER_IP:4000`

---

## 💻 Daily Usage

### Chrome VPN (browser only)

**Start:**
```bash
./scripts/start-vpn.sh
```
Then click the power orb in the Chrome extension.

**Stop:**
```bash
./scripts/stop-vpn.sh
```

### Full Device VPN (WireGuard app)
- Download **WireGuard** from Mac App Store / iOS / Android
- Import your `.conf` file or scan QR code
- Toggle Activate

---

## 📊 Dashboard Features

- 🔒 Password protected with rate limiting
- 📊 Real-time bandwidth chart
- 👥 Connected peers with editable device names
- ⚡ Server CPU, memory, disk usage
- 🔄 WireGuard start/stop button
- 📋 Live event log

---

## 🆓 AWS Free Tier

| Resource | Free Allowance |
|---|---|
| EC2 t3.micro | 750 hrs/month (12 months) |
| Outbound data | 100 GB/month |
| Inbound data | Unlimited |

**After 12 months:** ~$8-10/month per server

---

## 🔒 Security

- WireGuard encryption (state-of-the-art)
- API key authentication
- Dashboard login with session tokens
- Rate limiting (5 attempts → 15 min lockout)
- All secrets in `.env` (never in code)

---

## 🛠️ Useful Commands

```bash
# Check WireGuard status
sudo systemctl status wg-quick@wg0
sudo wg show

# PM2 process manager
pm2 list
pm2 logs vpn-api
pm2 logs vpn-monitor
pm2 restart all

# Add new VPN client
sudo ./wireguard-install.sh
```

---

## 🏛️ Architecture

```
Your Device
     │
     ├── Chrome Extension + SSH Tunnel (:8888)
     │        └── Routes Chrome traffic through VPN server
     │
     └── WireGuard App
              └── Routes ALL device traffic through VPN server
                       │
                  AWS EC2 (your chosen region)
                  ├── WireGuard Server
                  ├── VPN API (:3000)
                  ├── Monitor Dashboard (:4000)
                  └── Dante SOCKS5 (:8888)
                       │
                  Internet (server's IP and location)
```

---

## 📝 License

MIT — free for personal use.

---

## 🔐 DNS Leak Protection

Add this to your WireGuard client config (`[Interface]` section) on each device:

```
DNS = 1.1.1.1, 1.0.0.1
```

This forces all DNS queries through Cloudflare instead of your ISP, preventing DNS leaks. Test at [dnsleaktest.com](https://dnsleaktest.com) — should show only Cloudflare servers.
