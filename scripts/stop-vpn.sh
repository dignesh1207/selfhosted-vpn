#!/bin/bash
# ─────────────────────────────────────────────────────────────
# stop-vpn.sh — Stop India VPN SSH tunnel on Mac
# Usage: ./stop-vpn.sh
# ─────────────────────────────────────────────────────────────

PROXY_PORT="${PROXY_PORT:-8888}"

pkill -f "ssh.*${PROXY_PORT}" 2>/dev/null

if [ $? -eq 0 ]; then
  echo "✅ VPN tunnel stopped"
  echo "👉 Also click the power orb in the Chrome extension to disconnect"
else
  echo "ℹ️  No tunnel was running"
fi
