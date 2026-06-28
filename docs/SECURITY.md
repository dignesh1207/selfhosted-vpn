# Security Guide — CloudVPN

A complete reference for every security measure implemented in CloudVPN, why each one matters, and how to verify it's working.

---

## Security Layers Overview

```
Internet
    │
    ▼
[WireGuard Encryption]     ← ChaCha20 + Curve25519
    │
    ▼
[UFW Firewall]             ← Block all except needed ports
    │
    ▼
[Fail2Ban]                 ← Ban brute-force attackers
    │
    ▼
[SSH Key Authentication]   ← No passwords allowed
    │
    ▼
[Pi-hole DNS]              ← Block malware domains
    │
    ▼
Your Server
```

---

## 1. WireGuard Encryption

### What it does
Encrypts all traffic between your device and the server. Nobody can read your internet traffic in transit — not your ISP, not hackers on public WiFi.

### How strong is it?
Uses 4 cryptographic algorithms together:
- **ChaCha20** — encrypts data (military grade, 256-bit key)
- **Poly1305** — verifies data wasn't tampered with
- **Curve25519** — key exchange (NSA-resistant elliptic curve)
- **BLAKE2s** — hashing

To brute force one ChaCha20 key: 2^256 attempts needed. All computers on Earth combined would take longer than the age of the universe.

### Verify it's working
```bash
sudo wg show
# Should show interface: wg0 with listening port
```

### Why it's better than OpenVPN
- 4,000 lines of code vs 100,000 (fewer bugs possible)
- 3-4x faster
- Built into Linux kernel since 2020
- Reconnects instantly after network change

---

## 2. UFW Firewall

### What it does
Acts as a bouncer for your server. Every incoming connection is checked — if it's not explicitly allowed, it's dropped silently.

### Configuration
```bash
sudo ufw default deny incoming    # Block everything by default
sudo ufw default allow outgoing   # Allow all outgoing
sudo ufw allow 22/tcp             # SSH
sudo ufw allow 53/tcp             # Pi-hole DNS
sudo ufw allow 53/udp             # Pi-hole DNS
sudo ufw allow 80/tcp             # Pi-hole admin
sudo ufw allow 3000/tcp           # VPN API
sudo ufw allow 47823/tcp          # Dashboard (restricted to your IP)
sudo ufw allow 54855/udp          # WireGuard (Canada)
sudo ufw allow 55804/udp          # WireGuard (India)
```

### Restrict dashboard to your IP only
```bash
sudo ufw delete allow 47823/tcp
sudo ufw allow from YOUR_HOME_IP to any port 47823
```

### Verify it's working
```bash
sudo ufw status verbose
```

### What happens without it
Without UFW, every port on your server is accessible to anyone on the internet. Bots constantly scan all IP addresses looking for open ports. UFW stops them before they even reach your services.

---

## 3. Fail2Ban

### What it does
Monitors your SSH login logs. If an IP address fails to log in 3 times within 10 minutes, it gets permanently banned in UFW.

### Why permanent bans?
Default Fail2Ban bans last 15 minutes. Attackers just wait and try again. A permanent ban means one strike and they're out forever.

### Configuration
File: `/etc/fail2ban/jail.local`
```ini
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
findtime = 600
bantime = -1
```

`bantime = -1` means permanent.

### Install and configure
```bash
sudo apt install fail2ban -y
sudo nano /etc/fail2ban/jail.local
# Add the config above
sudo systemctl restart fail2ban
```

### Verify it's working
```bash
sudo fail2ban-client status sshd
# Shows: Currently failed, Total failed, Banned IP list
```

### Check how many attacks you've had
```bash
grep "Failed password" /var/log/auth.log | wc -l
```

### Manually ban an IP
```bash
sudo fail2ban-client set sshd banip IP_ADDRESS
```

### Unban an IP (if you lock yourself out)
```bash
sudo fail2ban-client set sshd unbanip YOUR_IP
# Or from AWS/GCP console using browser SSH
```

---

## 4. SSH Key Authentication

### What it does
Disables password-based SSH login entirely. Only someone with your private key file (`.pem`) can connect.

### Why it matters
Password brute-force attacks try thousands of passwords per second. A key file is mathematically impossible to brute-force — it's a 2048-4096 bit random number.

### Configuration
```bash
sudo nano /etc/ssh/sshd_config
```

Set these values:
```
PasswordAuthentication no
PermitRootLogin no
UseDNS no
```

```bash
sudo systemctl restart ssh
```

### Verify it's working
```bash
sudo grep "PasswordAuthentication" /etc/ssh/sshd_config
# Should show: PasswordAuthentication no
```

### What `UseDNS no` does
Without this, SSH tries to do a reverse DNS lookup on your IP before connecting. This causes a 5-30 second delay on every SSH connection. Setting it to `no` makes SSH instant.

### CRITICAL: Test before closing your session
Always open a new SSH session to test your key works BEFORE closing the current one. If you lock yourself out:
- AWS: Use EC2 Instance Connect in the console
- GCP: Use the browser SSH button in Compute Engine

---

## 5. Automatic Security Updates

### What it does
Automatically downloads and installs security patches for the operating system without you needing to do anything.

### Why it matters
New vulnerabilities are discovered constantly. Unpatched servers are the most common way servers get compromised. Auto-updates keep your attack surface minimal.

### Enable it
```bash
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure unattended-upgrades
# Select Yes
```

### Verify it's working
```bash
cat /etc/apt/apt.conf.d/20auto-upgrades
# Should show: APT::Periodic::Unattended-Upgrade "1";
```

---

## 6. Pi-hole DNS Security

### What it does
Blocks DNS queries to known malware, phishing, and tracking domains. If your device tries to contact a malware domain, Pi-hole returns nothing — the connection never happens.

### Why DNS-level blocking is powerful
Most malware, ransomware, and trackers need to contact remote servers to function. If they can't resolve the domain, they can't work. Pi-hole blocks ~554,000 known malicious domains.

### Verify it's working
```bash
sudo pihole status
# Should show: [✓] Pi-hole blocking is enabled

# Test blocking
nslookup doubleclick.net 10.66.66.1
# Should return no answer (blocked)

nslookup google.com 10.66.66.1
# Should return Google's IP (allowed)
```

---

## 7. Dashboard Security

### Password protection
The dashboard requires a password. Failed attempts are rate-limited — 5 failures = 15 minute lockout.

### Session tokens
After login, a random 32-byte token is issued. Sessions expire after 1 hour.

### IP restriction
Only your home IP can reach the dashboard port:
```bash
sudo ufw allow from YOUR_HOME_IP to any port 47823
```

### HTTPS via Cloudflare Tunnel
```bash
cloudflared tunnel --url http://localhost:47823
```
Gives you HTTPS without exposing the port directly.

---

## 8. What Your ISP Can See

| Data | Without VPN | With VPN |
|---|---|---|
| Websites you visit | ✅ Fully visible | ❌ Hidden |
| Search queries | ✅ Fully visible | ❌ Hidden |
| Apps you use | ✅ Visible | ❌ Hidden |
| That you use a VPN | N/A | ✅ They see AWS/GCP connection |
| VPN content | N/A | ❌ Encrypted, unreadable |
| Data amount | ✅ Visible | ✅ Amount visible, not content |

Bell Canada (or any ISP) can see you're connected to an AWS/GCP server and how much data you transfer. They cannot read what's inside — it's encrypted with ChaCha20.

---

## 9. Security Checklist

Run these to verify your full security posture:

```bash
# 1. WireGuard running?
sudo systemctl is-active wg-quick@wg0

# 2. Pi-hole blocking?
sudo pihole status | grep -i blocking

# 3. UFW active?
sudo ufw status | head -5

# 4. Fail2Ban running?
sudo fail2ban-client status sshd

# 5. SSH password auth disabled?
sudo grep "PasswordAuthentication" /etc/ssh/sshd_config

# 6. Auto updates enabled?
cat /etc/apt/apt.conf.d/20auto-upgrades

# 7. Check for successful intrusions (should be empty)
grep "Accepted password" /var/log/auth.log

# 8. How many attack attempts?
grep "Failed password" /var/log/auth.log | wc -l

# 9. Currently banned IPs?
sudo fail2ban-client status sshd | grep "Banned IP"

# 10. Disk space (keep under 85%)
df -h /
```

---

## 10. If You Think You've Been Hacked

### Signs of compromise
- Unknown processes running: `ps aux | grep -v root`
- Unknown users: `cat /etc/passwd | grep -v nologin`
- Unusual cron jobs: `sudo crontab -l`
- High CPU when idle: `top`
- Unknown SSH logins: `last | head -20`

### Immediate response
```bash
# Check who's logged in right now
who
w

# Check recent logins
last | head -20

# Check running processes
ps aux --sort=-%cpu | head -20

# Check open network connections
sudo ss -tulnp

# Check for unknown cron jobs
crontab -l
sudo crontab -l
```

### If compromised
1. Take a snapshot of the server (AWS/GCP console)
2. Block all inbound traffic in cloud firewall
3. Launch a new server from scratch
4. Rotate all API keys and passwords
5. Generate new WireGuard keys for all clients

---

## 11. Regular Maintenance Schedule

| Frequency | Task |
|---|---|
| Weekly (auto) | Pi-hole blocklist update |
| Monthly | Check for banned IPs: `sudo fail2ban-client status sshd` |
| Monthly | Check disk usage: `df -h` |
| Monthly | Review SSH attempts: `grep "Failed password" /var/log/auth.log \| wc -l` |
| Quarterly | Rotate WireGuard keys for extra security |
| Annually | Review open ports and disable unused ones |
