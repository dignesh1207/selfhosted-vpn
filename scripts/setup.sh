#!/bin/bash
# ─────────────────────────────────────────────────────────────
# India VPN — Server Setup Script
# Run this on a fresh Ubuntu EC2 instance in ap-south-1 (Mumbai)
# ─────────────────────────────────────────────────────────────

set -e

echo "🇮🇳 India VPN Setup Starting..."

# ── 1. Update system ─────────────────────────────────────────
echo "📦 Updating packages..."
sudo apt update -y

# ── 2. Install WireGuard ─────────────────────────────────────
echo "🔒 Installing WireGuard..."
curl -O https://raw.githubusercontent.com/angristan/wireguard-install/master/wireguard-install.sh
chmod +x wireguard-install.sh
# Run manually: sudo ./wireguard-install.sh
echo "⚠️  Run 'sudo ./wireguard-install.sh' manually next"

# ── 3. Enable IP forwarding ──────────────────────────────────
echo "🌐 Enabling IP forwarding..."
sudo sysctl -w net.ipv4.ip_forward=1
echo "net.ipv4.ip_forward=1" | sudo tee /etc/sysctl.conf
sudo iptables -t nat -A POSTROUTING -o ens5 -j MASQUERADE
sudo iptables -A FORWARD -i wg0 -j ACCEPT
sudo iptables -A FORWARD -o wg0 -j ACCEPT
sudo apt install iptables-persistent -y
sudo netfilter-persistent save

# ── 4. Install Node.js ───────────────────────────────────────
echo "📦 Installing Node.js..."
sudo apt install nodejs npm -y

# ── 5. Install Dante SOCKS5 proxy ───────────────────────────
echo "🔀 Installing Dante SOCKS5 proxy..."
sudo apt install dante-server -y
sudo bash -c 'cat > /etc/danted.conf << EOF
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
EOF'
sudo systemctl restart danted
sudo systemctl enable danted

# ── 6. Setup VPN API ────────────────────────────────────────
echo "⚡ Setting up VPN API..."
mkdir -p ~/vpn-api
cp vpn-api.js ~/vpn-api/server.js
cd ~/vpn-api
npm init -y
npm install express dotenv

# ── 7. Setup Monitor ────────────────────────────────────────
echo "📊 Setting up Monitor..."
mkdir -p ~/vpn-monitor/public
cp monitor.js ~/vpn-monitor/
npm install express socket.io dotenv

# ── 8. Install PM2 ──────────────────────────────────────────
echo "🔄 Installing PM2..."
sudo npm install -g pm2
cd ~/vpn-api && pm2 start server.js --name vpn-api
cd ~/vpn-monitor && pm2 start monitor.js --name vpn-monitor
pm2 startup
pm2 save

echo ""
echo "✅ Setup complete!"
echo ""
echo "⚠️  IMPORTANT: Create a .env file in both ~/vpn-api and ~/vpn-monitor:"
echo "   API_KEY=your-secret-key"
echo "   DASHBOARD_PASSWORD=your-dashboard-password"
echo ""
echo "🔒 Open these ports in AWS Security Group:"
echo "   22   (TCP) - SSH"
echo "   3000 (TCP) - VPN API"
echo "   4000 (TCP) - Monitor Dashboard"
echo "   8888 (TCP) - SOCKS5 Proxy"
echo "   55804 (UDP) - WireGuard"
