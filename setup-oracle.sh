#!/bin/bash
# ─────────────────────────────────────────────────────────���───────────────────
# ApplyAI — Oracle Cloud ARM setup script
# Run this once on a fresh Ubuntu 22.04 instance:
#   bash setup-oracle.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   ApplyAI — Oracle Cloud Setup       ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 1. System packages ────────────────────────────────────────────────────────
echo "▶ Installing system packages..."
sudo apt-get update -qq
sudo apt-get install -y -qq \
  curl wget git unzip \
  libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
  libpango-1.0-0 libcairo2 libasound2 libx11-6 libxcb1 libxext6 \
  fonts-liberation xdg-utils iptables-persistent netfilter-persistent \
  2>/dev/null

# ── 2. Node.js 20 ────────────────────────────────────────────────────────────��
if ! command -v node &>/dev/null; then
  echo "▶ Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - -qq
  sudo apt-get install -y nodejs 2>/dev/null
else
  echo "✓ Node.js $(node -v) already installed"
fi

# ── 3. PM2 ────────────────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  echo "▶ Installing PM2..."
  sudo npm install -g pm2 --silent
else
  echo "✓ PM2 already installed"
fi

# ── 4. App directory ──────────────────────────────────────────────────────────
APP_DIR="$HOME/applyai"
REPO="https://github.com/sumach9/job-automation.git"

if [ -d "$APP_DIR/.git" ]; then
  echo "▶ Pulling latest code..."
  cd "$APP_DIR" && git pull --quiet
else
  echo "▶ Cloning repository..."
  git clone --quiet "$REPO" "$APP_DIR"
  cd "$APP_DIR"
fi

cd "$APP_DIR"

# ── 5. .env setup ─────────────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  No .env found — creating from template"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  cp .env.example .env

  # Generate a random JWT secret
  JWT=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  sed -i "s|JWT_SECRET=.*|JWT_SECRET=$JWT|" .env

  echo ""
  echo "  ✏  Edit .env now with your credentials:"
  echo "     nano $APP_DIR/.env"
  echo ""
  echo "  Required fields:"
  echo "    ADMIN_PASSWORD   — your login password"
  echo "    LINKEDIN_EMAIL   — your LinkedIn email"
  echo "    LINKEDIN_PASSWORD — your LinkedIn password"
  echo "    APIFY_TOKEN      — job scraping (apify.com)"
  echo "    RESUME_PATH      — full path to your resume PDF"
  echo ""
  read -p "  Press Enter after editing .env to continue..." _
fi

# ── 6. npm install ────────────────────────────────────────────────────────────
echo "▶ Installing server dependencies..."
npm install --silent

# ── 7. Playwright Chromium ────────────────────────────────────────────────────
echo "▶ Installing Playwright Chromium (this takes ~2 min)..."
npx playwright install chromium --with-deps 2>/dev/null || true

# ── 8. Build React frontend ────────────────────────────────────────────────────
echo "▶ Building React dashboard..."
cd client && npm install --silent && npm run build --silent && cd ..

# ── 9. Create logs directory ──────────────────────────────────────────────────
mkdir -p logs

# ── 10. Firewall — open port 3004 ─────────────────────────────────────────────
echo "▶ Opening firewall port 3004..."
sudo iptables -C INPUT -p tcp --dport 3004 -j ACCEPT 2>/dev/null || \
  sudo iptables -I INPUT -p tcp --dport 3004 -j ACCEPT
sudo netfilter-persistent save 2>/dev/null || true

# ── 11. Start with PM2 ────────────────────────────────────────────────────────
echo "▶ Starting ApplyAI with PM2..."
pm2 delete applyai 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

# ── 12. PM2 startup (survive reboots) ─────────────────────────────────────────
echo ""
echo "▶ Configuring PM2 auto-start..."
echo ""
PM2_STARTUP=$(pm2 startup | grep "sudo" | tail -1)
if [ -n "$PM2_STARTUP" ]; then
  echo "  Run this command to enable auto-start on reboot:"
  echo ""
  echo "  $PM2_STARTUP"
  echo ""
fi

# ── Done ──────────────────────────────────────────────────────────────────────
PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_VM_IP")
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  ✅  ApplyAI is running!"
echo ""
echo "  Dashboard:  http://$PUBLIC_IP:3004"
echo "  Username:   admin"
echo "  Password:   (from your .env ADMIN_PASSWORD)"
echo ""
echo "  Useful commands:"
echo "    pm2 status          — check if running"
echo "    pm2 logs applyai    — live logs"
echo "    pm2 restart applyai — restart"
echo "    cd ~/applyai && git pull && pm2 restart applyai  — update"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
