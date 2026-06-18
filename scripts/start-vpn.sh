#!/bin/bash
# ─────────────────────────────────────────────────────────────
# start-vpn.sh — Start India VPN SSH tunnel on Mac
# Usage: ./start-vpn.sh
# ─────────────────────────────────────────────────────────────

SERVER_IP="${SERVER_IP:-YOUR_EC2_IP}"
KEY_PATH="${KEY_PATH:-$HOME/Downloads/YOUR-KEY.pem}"
PROXY_PORT="${PROXY_PORT:-8888}"

# Kill any existing tunnel
pkill -f "ssh.*${PROXY_PORT}" 2>/dev/null

# Start new tunnel
ssh -i "$KEY_PATH" -D "$PROXY_PORT" -N -f ubuntu@"$SERVER_IP"

if [ $? -eq 0 ]; then
  echo "✅ VPN tunnel started on port $PROXY_PORT"
  echo "👉 Now click the power orb in the Chrome extension"
else
  echo "❌ Failed to start tunnel"
fi
