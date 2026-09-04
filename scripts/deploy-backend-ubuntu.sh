#!/bin/bash
set -e

# ============================================================
# Sales Agent SaaS - Backend Deployment Script for Ubuntu
# Target: apiagent.akilimatic.com
# ============================================================

APP_DIR="/opt/sales-agent-api"
SERVICE_USER="ubuntu"
DOMAIN="apiagent.akilimatic.com"

echo "=========================================="
echo " Sales Agent SaaS - Backend Deployment"
echo " Target: $DOMAIN"
echo "=========================================="

# ---- Step 1: Update system ----
echo "📦 Step 1: Updating system packages..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git nginx certbot python3-certbot-nginx nodejs npm docker.io docker-compose-plugin

# ---- Step 2: Install Docker & add user ----
echo "🐳 Step 2: Setting up Docker..."
sudo usermod -aG docker $SERVICE_USER
sudo systemctl enable docker
sudo systemctl start docker

# ---- Step 3: Clone or pull the repo ----
echo "📥 Step 3: Setting up application directory..."
sudo mkdir -p $APP_DIR
sudo chown $SERVICE_USER:$SERVICE_USER $APP_DIR
cd $APP_DIR

if [ ! -d ".git" ]; then
  echo "Cloning repository..."
  git clone <YOUR_GIT_REPO_URL> .
else
  echo "Pulling latest changes..."
  git pull origin main
fi

# ---- Step 4: Set up Docker infrastructure (Postgres, Redis, MinIO) ----
echo "🐳 Step 4: Starting Docker infrastructure..."
cd $APP_DIR
sudo docker compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10
until curl -s http://localhost:35432 > /dev/null 2>&1; do sleep 2; done
until redis-cli -h localhost -p 36379 ping > /dev/null 2>&1; do sleep 2; done
echo "✅ All Docker services are ready!"

# ---- Step 5: Install Node.js if not present ----
echo "📦 Step 5: Installing Node.js..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt install -y nodejs
fi

# ---- Step 6: Backend dependencies and build ----
echo "🔨 Step 6: Building backend..."
cd $APP_DIR/server
npm install
npm run build

# ---- Step 7: Database setup ----
echo "🗄️  Step 7: Setting up database..."
cd $APP_DIR/server
npx prisma generate
npx prisma migrate deploy
npx prisma db seed

# ---- Step 8: Create production .env ----
echo "⚙️  Step 8: Creating production .env..."
cd $APP_DIR/server
cat > .env << PRODUCTION_EOF
# Docker infrastructure
POSTGRES_DB=sales_agent
POSTGRES_USER=sales_agent
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_PORT=35432
REDIS_PASSWORD=${REDIS_PASSWORD}
REDIS_PORT=36379
MINIO_ROOT_USER=salesagentadmin
MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}
MINIO_API_PORT=39000
MINIO_CONSOLE_PORT=39001

# Local Express API
NODE_ENV=production
API_PORT=4400
WEB_ORIGIN=https://agent.akilimatic.com
NEXT_PUBLIC_API_ORIGIN=https://apiagent.akilimatic.com
DATABASE_URL=postgresql://sales_agent:${POSTGRES_PASSWORD}@127.0.0.1:35432/sales_agent?schema=public
REDIS_URL=redis://:${REDIS_PASSWORD}@127.0.0.1:36379
MINIO_ENDPOINT=localhost
MINIO_PORT=39000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=salesagentadmin
MINIO_SECRET_KEY=${MINIO_ROOT_PASSWORD}
MINIO_BUCKET=sales-agent-private

# Secrets - regenerate these!
JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
CREDENTIAL_ENCRYPTION_KEY=${CREDENTIAL_ENCRYPTION_KEY}
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL_DAYS=30
COOKIE_SECURE=true
TRUST_PROXY=true
PRODUCTION_EOF

sudo chown $SERVICE_USER:$SERVICE_USER .env

# ---- Step 9: PM2 setup ----
echo "🔄 Step 9: Setting up PM2..."
cd $APP_DIR/server
npm install -g pm2

# Kill any existing process
pm2 delete sales-api || true

# Start the API with pm2
pm2 start dist/index.js --name "sales-api" --instances max --exp-backoff-restart-delay --no-daemon

# Save PM2 process list
pm2 save

# Setup PM2 to start on boot
pm2 startup systemd -u $SERVICE_USER --hp /home/$SERVICE_USER
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $SERVICE_USER --hp /home/$SERVICE_USER

# ---- Step 10: Nginx reverse proxy ----
echo "🌐 Step 10: Configuring Nginx reverse proxy..."
cat > /tmp/apiagent.conf << 'NGINX_EOF'
server {
    listen 80;
    server_name apiagent.akilimatic.com;

    location / {
        proxy_pass http://127.0.0.1:4400;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-ID $request_id;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location /health/live {
        proxy_pass http://127.0.0.1:4400/health/live;
        proxy_set_header Host $host;
    }

    location /health/ready {
        proxy_pass http://127.0.0.1:4400/health/ready;
        proxy_set_header Host $host;
    }

    location /api/v1 {
        proxy_pass http://127.0.0.1:4400/api/v1;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-ID $request_id;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
NGINX_EOF

sudo cp /tmp/apiagent.conf /etc/nginx/sites-available/apiagent
sudo ln -sf /etc/nginx/sites-available/apiagent /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

# ---- Step 11: Certbot for HTTPS ----
echo "🔒 Step 11: Setting up SSL with Certbot..."
sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m admin@$DOMAIN || {
  echo "⚠️  Certbot failed - try manual setup:"
  echo "   sudo certbot --nginx -d $DOMAIN"
}

# ---- Step 12: Verify deployment ----
echo ""
echo "=========================================="
echo " ✅ Deployment Complete!"
echo "=========================================="
echo ""
echo "Backend API: https://apiagent.akilimatic.com"
echo "Health check: https://apiagent.akilimatic.com/health/live"
echo ""
echo "Useful commands:"
echo "  pm2 logs sales-api          - View logs"
echo "  pm2 restart sales-api       - Restart service"
echo "  pm2 status                  - Check status"
echo "  sudo systemctl status nginx  - Check nginx"
echo "  sudo docker compose ps      - Check Docker services"
echo ""
