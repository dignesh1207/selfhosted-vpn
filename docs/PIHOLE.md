# Pi-hole — Complete Guide

Pi-hole is a network-wide ad blocker that works at the DNS level. Instead of blocking ads in your browser, it blocks the entire domain before any request is even made.

---

## How Pi-hole Works

Every website visit starts with a DNS lookup:

```
You type: youtube.com
Your device asks: "What is the IP of youtube.com?"
                          ↓
                    Pi-hole intercepts
                          ↓
         Is "youtube.com" in the blocklist?
              ↓ NO                  ↓ YES
    Forward to Cloudflare      Return nothing
    Get real IP back           Ad never loads
    Website loads ✅           Ad blocked 🚫
```

Pi-hole sits between your devices and the internet's DNS servers. It sees every domain request and blocks the bad ones.

---

## Installation

### Prerequisites
- Stop WireGuard first (prevents DNS issues during install):
```bash
sudo systemctl stop wg-quick@wg0
```

- Fix DNS temporarily:
```bash
echo "nameserver 1.1.1.1" | sudo tee /etc/resolv.conf
```

### Install
```bash
curl -sSL https://install.pi-hole.net | bash
# OR if curl fails:
wget -O /tmp/pi-hole.sh https://install.pi-hole.net
sudo bash /tmp/pi-hole.sh
```

### Installer answers

| Question | Answer | Why |
|---|---|---|
| Network interface | ens5 (AWS) or ens4 (GCP) | Main network interface, NOT wg0 |
| Upstream DNS | Cloudflare (DNSSEC) | Privacy + security |
| Blocklists | Yes (StevenBlack) | Good default list |
| Admin web interface | Yes | Gives you the dashboard |
| Query logging | Yes | So you can see what's blocked |
| Privacy mode | 0 — Show everything | Full visibility for personal use |

### After install — set password
```bash
sudo pihole setpassword
```

### Restart WireGuard
```bash
sudo systemctl start wg-quick@wg0
```

---

## Pointing WireGuard at Pi-hole

This is critical — without this step, Pi-hole does nothing for VPN users.

### Update server WireGuard config
```bash
sudo nano /etc/wireguard/wg0.conf
```
Add or change in `[Interface]` section:
```
DNS = 10.66.66.1
```

### Update all client configs
```bash
sudo sed -i 's/DNS = .*/DNS = 10.66.66.1/' ~/wg0-client-*.conf
```

`10.66.66.1` is the WireGuard server's IP on the tunnel network — Pi-hole listens there.

### Restart WireGuard
```bash
sudo systemctl restart wg-quick@wg0
```

### Re-generate QR codes for all devices
```bash
qrencode -t ansiutf8 < ~/wg0-client-myphone.conf
```
Scan on each device to update their DNS setting.

---

## Adding Better Blocklists

The default StevenBlack list (~82,000 domains) is good but not great for YouTube ads. Add these for better coverage:

### Via Pi-hole admin panel
1. Go to `http://YOUR_SERVER_IP/admin`
2. Navigate to **Group Management → Adlists**
3. Add each URL and click **Add**:

```
https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/pro.txt
https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/pro.plus.txt
```

### Update gravity (download new lists)
```bash
sudo pihole -g
```

This brings you from ~82,000 to ~554,000 blocked domains.

---

## Auto-update Blocklists

Blocklists go stale — YouTube and Spotify constantly update their ad domains. Set up weekly auto-updates:

```bash
sudo crontab -e
```

Add:
```
0 3 * * 0 pihole -g
```

This runs every Sunday at 3am UTC.

---

## Keep Pi-hole Enabled

Pi-hole can get disabled accidentally (easy to hit the Disable button in the admin panel). Add a check:

```bash
sudo crontab -e
```

Add:
```
*/30 * * * * pihole status | grep -q "blocking is disabled" && pihole enable
```

Checks every 30 minutes and re-enables if disabled.

---

## Admin Panel

Access at: `http://YOUR_SERVER_IP/admin`

### Key sections

| Section | What it shows |
|---|---|
| Dashboard | Total queries, % blocked, today's stats |
| Query Log | Every domain queried by every device |
| Adlists | Your blocklists |
| Domains | Custom allow/block rules |
| Settings | DNS upstream, privacy, logging |

### Viewing your browsing history

Go to **Query Log** and filter by your device's VPN IP (e.g. `10.66.66.4`). You'll see every domain your phone visited.

---

## What Pi-hole Can and Cannot Block

### ✅ Can block
- Google Ads, DoubleClick, Facebook Ads
- Tracking scripts (Google Analytics, Hotjar)
- Malware and phishing domains
- Telemetry and data collection
- Most website banner ads

### ❌ Cannot block
- YouTube in-stream ads (served from `youtube.com` itself)
- Spotify app ads (same domain as music)
- Ads inside apps that use HTTPS certificate pinning
- Full URLs — only domain names

### Why YouTube ads sometimes still show

YouTube serves ads from `googlevideo.com` and `youtube.com` — the same domains as actual video content. If Pi-hole blocks these, YouTube itself breaks. This is intentional on Google's part.

**Workarounds for YouTube:**
- Use YouTube in browser with uBlock Origin (most effective)
- Use YouTube ReVanced on Android (free, no root needed)
- YouTube Premium ($13.99/month)

---

## Open Ports Required

```bash
sudo ufw allow 53/tcp   # DNS (TCP)
sudo ufw allow 53/udp   # DNS (UDP)
sudo ufw allow 80/tcp   # Pi-hole admin panel
```

Also add these in your cloud firewall (AWS Security Group or GCP Firewall Rules).

---

## Troubleshooting

### Pi-hole not blocking ads
```bash
sudo pihole status
# If blocking is disabled:
sudo pihole enable
```

### DNS not resolving
```bash
nslookup google.com 10.66.66.1
# Should return Google's IP
```

### Pi-hole not starting
```bash
sudo systemctl status pihole-FTL
sudo systemctl restart pihole-FTL
```

### Check Pi-hole is listening on port 53
```bash
sudo ss -tulnp | grep :53
```

### Reset Pi-hole completely
```bash
pihole -r  # Repair
```
