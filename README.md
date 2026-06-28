# ☁️ CloudVPN — Self-Hosted Multi-Location VPN

A completely free, self-hosted VPN built on AWS EC2 and Google Cloud using WireGuard, with a professional control center dashboard, Chrome extension, and Pi-hole ad blocking.

![Stars](https://img.shields.io/github/stars/dignesh1207/selfhosted-vpn?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)
![WireGuard](https://img.shields.io/badge/VPN-WireGuard-purple?style=flat-square)
![Pi-hole](https://img.shields.io/badge/DNS-Pi--hole-red?style=flat-square)

---

## ✨ Features

- **WireGuard VPN** — ChaCha20 encryption, faster than OpenVPN
- **Multi-location** — India (AWS Mumbai) + Canada (GCP Montreal)
- **Control Center Dashboard** — real-time server monitoring, start/stop control, bandwidth charts
- **Chrome Extension** — one-click location switcher for browser VPN
- **Pi-hole DNS Blocking** — 554,000+ ad/malware domains blocked
- **Security hardened** — UFW firewall, Fail2Ban, SSH key-only, auto-updates
- **Device management** — rename and track all connected devices
- **Completely free** — Canada server free forever, India free 12 months

---

## 🏗️ Architecture

```
Your Device (Mac/iPhone/Android)
       │
       ├── WireGuard App → Encrypted tunnel → VPN Server → Internet
       │
       └── Chrome Extension → SSH Tunnel (SOCKS5) → VPN Server → Internet

VPN Servers:
┌─────────────────────┐    ┌─────────────────────┐
│  AWS EC2 Mumbai     │    │  GCP Montreal        │
│  WireGuard :55804   │    │  WireGuard :54855    │
│  VPN API    :3000   │    │  VPN API    :3000    │
│  Monitor    :4000   │    │  Dashboard  :47823   │
│  Pi-hole    :53/80  │    │  Pi-hole    :53/80   │
└─────────────────────┘    └─────────────────────┘
```

---

## 🚀 Quick Start

### Step 1 — Launch Cloud Servers

**India (AWS EC2):**
- Region: ap-south-1 (Mumbai)
- Instance: t3.micro (free tier)
- OS: Ubuntu 22.04+ LTS

**Canada (Google Cloud):**
- Region: northamerica-northeast1 (Montreal)
- Machine: e2-micro (always free)
- OS: Ubuntu 22.04 LTS

### Step 2 — Install WireGuard

Run on each server:
```bash
curl -O https://raw.githubusercontent.com/angristan/wireguard-install/master/wireguard-install.sh
chmod +x wireguard-install.sh
sudo ./wireguard-install.sh
```

### Step 3 — Security Hardening

```bash
bash scripts/setup-security.sh YOUR_WG_PORT
```

### Step 4 — Install Pi-hole (Ad Blocking)

```bash
sudo systemctl stop wg-quick@wg0
curl -sSL https://install.pi-hole.net | bash
sudo systemctl start wg-quick@wg0
```

Point WireGuard DNS at Pi-hole:
```bash
sudo sed -i 's/DNS = .*/DNS = 10.66.66.1/' /etc/wireguard/wg0.conf
sudo systemctl restart wg-quick@wg0
```

### Step 5 — Deploy Control Center Dashboard

```bash
mkdir -p ~/vpn-dashboard/public
cd ~/vpn-dashboard
# Upload unified-monitor.js from dashboard/ folder
# Upload index.html from dashboard/public/ folder
cp servers.json.example servers.json
# Edit servers.json with your server IPs and API keys
nano servers.json
cp .env.example .env
nano .env  # Set your dashboard password
npm install express socket.io node-fetch@2 dotenv
pm2 start unified-monitor.js --name control-center
pm2 save
```

### Step 6 — Install Chrome Extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer Mode**
3. Click **Load unpacked** → select `chrome-extension/` folder
4. Configure server IPs in extension settings

---

## 📊 Dashboard

The control center runs on port 47823 and includes:

| Section | Features |
|---|---|
| Dashboard | Server status, active peers, total traffic, overview |
| Servers | Start/Stop control, CPU/RAM/disk, bandwidth sparklines |
| Devices | All connected devices with rename, data usage, status |
| Bandwidth | Live chart, usage vs free tier limits |
| Ad Blocking | Pi-hole stats, blocked/allowed domains |
| Security | Failed logins, banned IPs, security checklist |
| Event Log | Real-time event stream |

**Accessing the dashboard:**
```
http://YOUR_SERVER_IP:47823
```

For HTTPS, use Cloudflare Tunnel:
```bash
cloudflared tunnel --url http://localhost:47823
```

---

## 🔒 Security

| Feature | Implementation |
|---|---|
| VPN encryption | WireGuard ChaCha20 + Curve25519 |
| DNS leak protection | Pi-hole + Cloudflare DNSSEC |
| Firewall | UFW — default deny, only needed ports open |
| Brute force protection | Fail2Ban — permanent bans after 3 attempts |
| SSH hardening | Key-only auth, root login disabled, UseDNS no |
| Auto updates | unattended-upgrades enabled |
| Ad/malware blocking | Pi-hole with 554K+ domain blocklist |
| Dashboard auth | Rate-limited, session tokens, IP restricted |

---

## 💻 Chrome Extension

The Chrome extension (Manifest V3) lets you switch VPN locations with one click.

**Setup:**
```bash
# Start SSH tunnels on your Mac
bash scripts/start-tunnels.sh

# Stop tunnels
bash scripts/stop-tunnels.sh
```

---

## 📱 Mobile Setup (WireGuard App)

1. Install **WireGuard** from App Store / Play Store
2. On server: `sudo ./wireguard-install.sh` → Add new client
3. Show QR: `qrencode -t ansiutf8 < ~/wg0-client-NAME.conf`
4. Scan QR in WireGuard app

**Important:** Make sure client config has:
```
DNS = 10.66.66.1
Endpoint = YOUR_PUBLIC_IP:WG_PORT
```

---

## 💰 Cost

| Resource | Cost |
|---|---|
| Canada (GCP e2-micro) | **Free forever** |
| India (AWS t3.micro) | **Free 12 months**, ~$9/mo after |
| Pi-hole | Free (open source) |
| WireGuard | Free (open source) |

---

## 🛠️ Useful Commands

```bash
# WireGuard
sudo wg show                        # Show connected peers
sudo systemctl start wg-quick@wg0   # Start VPN
sudo systemctl stop wg-quick@wg0    # Stop VPN
sudo ./wireguard-install.sh         # Add new client

# PM2
pm2 list                            # Show running services
pm2 logs control-center             # View dashboard logs
pm2 restart control-center          # Restart dashboard

# Pi-hole
sudo pihole status                  # Check if blocking is enabled
sudo pihole enable                  # Enable blocking
sudo pihole -g                      # Update blocklists

# Security
sudo ufw status                     # Firewall status
sudo fail2ban-client status sshd    # Fail2Ban status
grep "Failed password" /var/log/auth.log | wc -l  # Hack attempts

# Find Cloudflare tunnel URL
cat ~/.pm2/logs/cloudflared-error.log | grep trycloudflare | tail -1
```

---

## 📁 Project Structure

```
cloudvpn/
├── chrome-extension/       # Chrome Manifest V3 extension
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.js
│   └── background.js
├── dashboard/              # Control center dashboard
│   ├── unified-monitor.js  # Backend (Node.js + Socket.io)
│   ├── public/
│   │   └── index.html      # Frontend (vanilla JS)
│   ├── servers.json.example
│   └── .env.example
├── scripts/                # Setup and utility scripts
│   ├── setup-server.sh     # Fresh server setup
│   ├── setup-security.sh   # Security hardening
│   ├── start-tunnels.sh    # Start SSH tunnels (Mac)
│   └── stop-tunnels.sh     # Stop SSH tunnels (Mac)
├── docs/                   # Detailed documentation
│   ├── PIHOLE.md
│   └── SECURITY.md
├── .gitignore
└── README.md
```

---

## ⚠️ Security Warning

**NEVER commit these files to GitHub:**
- `*.pem` — SSH private keys
- `*.conf` — WireGuard client configs (contain private keys)
- `.env` — Dashboard password
- `peer-names.json` — Device names and IPs

These are all in `.gitignore` by default.

---

## 📝 License

MIT — free for personal use.

---

Built by [Dignesh Solanki](https://github.com/dignesh1207) · University of Windsor · 2026