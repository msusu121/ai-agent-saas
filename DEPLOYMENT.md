# Deployment Guide - Sales Agent SaaS

## Architecture Overview

```
┌─────────────────────────┐     ┌──────────────────────────┐
│   Frontend (cPanel)     │     │   Backend (Ubuntu VPS)    │
│   agent.akilimatic.com  │────▶│   apiagent.akilimatic.com │
│   - Static HTML/JS      │     │   - Express API on :4400  │
│   - Uploaded via cPanel │     │   - pm2 process manager   │
│   - Next.js export      │     │   - nginx reverse proxy   │
└─────────────────────────┘     │   - certbot HTTPS         │
                                │   - Docker: Postgres/Redis │
                                │   - Docker: MinIO         │
                                └──────────────────────────┘
```

---

## Part 1: Frontend Deployment to cPanel

### Prerequisites
- cPanel access for `agent.akilimatic.com`
- SSH/SFTP access or cPanel File Manager

### Step 1: Build the Frontend

**Option A: Automated build script**
```bash
npm run build:cpanel
```

**Option B: Manual build with correct env vars**
```bash
# Set production environment variables
export NEXT_PUBLIC_API_ORIGIN=https://apiagent.akilimatic.com
export WEB_ORIGIN=https://agent.akilimatic.com
export NODE_ENV=production
export CPANEL_STATIC_EXPORT=1

# Build
npx next build
```

### Step 2: Verify Build Output

Check the `out/` directory contains:
- `index.html`
- `_next/` (static assets)
- All page directories (login, leads, pipeline, etc.)
- `404.html`

### Step 3: Upload to cPanel

**Method 1: cPanel File Manager**
1. Log in to cPanel at `agent.akilimatic.com/cpanel`
2. Open **File Manager**
3. Navigate to `public_html`
4. **Delete** any existing files (if first deployment)
5. Upload all files from `out/` directory to `public_html/`
6. Ensure `.htaccess` is uploaded (it's in `out/`)

**Method 2: FTP/SFTP**
1. Connect via FileZilla or similar
2. Host: `agent.akilimatic.com`
3. Upload `out/*` → `public_html/`

**Method 3: Rsync via SSH**
```bash
rsync -avz --delete out/ user@agent.akilimatic.com:/home/user/public_html/
```

### Step 4: Verify Frontend

1. Visit `https://agent.akilimatic.com`
2. Check that the app loads correctly
3. Verify API calls work (check browser console for errors)

### Troubleshooting
- **Blank page**: Check `.htaccess` exists in `public_html`
- **API errors**: Verify `NEXT_PUBLIC_API_ORIGIN` is set to `https://apiagent.akilimatic.com`
- **404 on refresh**: `.htaccess` should handle Next.js routing

---

## Part 2: Backend Deployment to Ubuntu (apiagent.akilimatic.com)

### Prerequisites
- Ubuntu server (22.04+ recommended)
- SSH root/sudo access
- Domain `apiagent.akilimatic.com` pointing to server IP
- Git repository URL

### Quick Deploy Script

Run the automated deployment:
```bash
chmod +x scripts/deploy-backend-ubuntu.sh
./scripts/deploy-backend-ubuntu.sh
```

### Manual Step-by-Step Deployment

#### Step 1: Install System Dependencies
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git nginx certbot python3-certbot-nginx nodejs npm docker.io docker-compose-plugin
sudo usermod -aG docker $USER
sudo systemctl enable docker
sudo systemctl start docker
```

#### Step 2: Clone Repository
```bash
mkdir -p /opt/sales-agent-api
cd /opt/sales-agent-api
git clone <YOUR_REPO_URL> .
git pull origin main
```

#### Step 3: Start Docker Infrastructure
```bash
cd /opt/sales-agent-api
sudo docker compose up -d
sudo docker compose ps  # Verify all services running
```

Services started:
- **PostgreSQL** on port 35432
- **Redis** on port 36379
- **MinIO** on ports 39000 (API) / 39001 (console)

#### Step 4: Install Node.js 22
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version  # Should be v22.x
```

#### Step 5: Build Backend
```bash
cd /opt/sales-agent-api/server
npm install
npm run build
```

Verify build:
```bash
ls dist/  # Should contain index.js, app.js, config/, lib/, routes/, etc.
```

#### Step 6: Database Migration & Seed
```bash
cd /opt/sales-agent-api/server
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
```

#### Step 7: Create Production .env
```bash
cat > .env << 'EOF'
POSTGRES_DB=sales_agent
POSTGRES_USER=sales_agent
POSTGRES_PASSWORD=<generate-strong-password>
POSTGRES_PORT=35432
REDIS_PASSWORD=<generate-strong-password>
REDIS_PORT=36379
MINIO_ROOT_USER=salesagentadmin
MINIO_ROOT_PASSWORD=<generate-strong-password>
MINIO_API_PORT=39000
MINIO_CONSOLE_PORT=39001
NODE_ENV=production
API_PORT=4400
WEB_ORIGIN=https://agent.akilimatic.com
NEXT_PUBLIC_API_ORIGIN=https://apiagent.akilimatic.com
DATABASE_URL=postgresql://sales_agent:<password>@127.0.0.1:35432/sales_agent?schema=public
REDIS_URL=redis://:<password>@127.0.0.1:36379
MINIO_ENDPOINT=localhost
MINIO_PORT=39000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=salesagentadmin
MINIO_SECRET_KEY=<password>
MINIO_BUCKET=sales-agent-private
JWT_ACCESS_SECRET=<64-hex-characters>
CREDENTIAL_ENCRYPTION_KEY=<64-hex-characters>
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL_DAYS=30
COOKIE_SECURE=true
TRUST_PROXY=true
EOF
```

Generate secrets:
```bash
openssl rand -hex 32  # For JWT_ACCESS_SECRET
openssl rand -hex 32  # For CREDENTIAL_ENCRYPTION_KEY
```

#### Step 8: Start with PM2

```bash
# Install PM2 globally
npm install -g pm2

# Create log directory
mkdir -p logs

# Start the main API
pm2 start dist/index.js --name "sales-api" --instances max --exp-backoff-restart-delay --no-daemon

# Start the BullMQ worker
pm2 start dist/workers/index.js --name "sales-worker" --no-daemon

# Or use the ecosystem config:
pm2 start ecosystem.config.js --env production

# Save PM2 config
pm2 save

# Setup auto-start on boot
pm2 startup systemd
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp /home/$USER
```

PM2 useful commands:
```bash
pm2 status              # Check all processes
pm2 logs sales-api      # Follow API logs
pm2 logs sales-worker   # Follow worker logs
pm2 restart sales-api   # Restart API
pm2 restart sales-worker # Restart worker
pm2 stop sales-api      # Stop API
pm2 delete sales-api    # Remove from PM2
```

#### Step 9: Configure Nginx Reverse Proxy

Copy the SSL config:
```bash
sudo cp nginx-apiagent-ssl.conf /etc/nginx/sites-available/apiagent
```

For initial HTTP-only setup, use:
```bash
sudo cp nginx-apiagent.conf /etc/nginx/sites-available/apiagent
```

Enable the site:
```bash
sudo ln -sf /etc/nginx/sites-available/apiagent /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

#### Step 10: SSL with Certbot

```bash
sudo certbot --nginx -d apiagent.akilimatic.com \
  --non-interactive \
  --agree-tos \
  -m admin@apiagent.akilimatic.com
```

Auto-renewal (certbot usually sets this up automatically):
```bash
sudo certbot renew --dry-run  # Test renewal
sudo systemctl status certbot.timer  # Check auto-renewal
```

#### Step 11: Verify Deployment

```bash
# Check API health
curl https://apiagent.akilimatic.com/health/live
# Expected: {"status":"ok"}

curl https://apiagent.akilimatic.com/health/ready
# Expected: {"status":"ready","services":{"postgres":"ok","redis":"ok"}}

# Check PM2 status
pm2 status

# Check Nginx
sudo systemctl status nginx

# Check Docker
sudo docker compose ps
```

---

## Part 3: Post-Deployment Checklist

### Frontend (cPanel)
- [ ] `https://agent.akilimatic.com` loads without errors
- [ ] API calls return correct responses
- [ ] Login works with demo credentials (`hasan@akilimatic.demo` / `DemoPass!2026`)
- [ ] All pages accessible and functional

### Backend (Ubuntu)
- [ ] `pm2 status` shows both `sales-api` and `sales-worker` as online
- [ ] `curl https://apiagent.akilimatic.com/health/live` returns `{"status":"ok"}`
- [ ] `curl https://apiagent.akilimatic.com/health/ready` returns `{"status":"ready","services":{"postgres":"ok","redis":"ok"}}`
- [ ] Nginx serves HTTPS with valid certificate (padlock icon)
- [ ] Certbot auto-renewal is configured
- [ ] PM2 restarts on server reboot
- [ ] Docker containers restart on reboot: `sudo docker update --restart=always` for each container

### Security
- [ ] `.env` file permissions are restricted (`chmod 600`)
- [ ] `.env` is NOT in version control
- [ ] Firewall allows only ports 80, 443, and SSH
- [ ] `COOKIE_SECURE=true` is set
- [ ] `TRUST_PROXY=true` is set for nginx

---

## Part 4: Environment Variables Reference

| Variable | Development | Production | Notes |
|----------|------------|------------|-------|
| `NODE_ENV` | development | production | |
| `API_PORT` | 4400 | 4400 | |
| `WEB_ORIGIN` | http://localhost:3000 | https://agent.akilimatic.com | Frontend domain |
| `NEXT_PUBLIC_API_ORIGIN` | (empty) | https://apiagent.akilimatic.com | Used by frontend to call API |
| `DATABASE_URL` | localhost:35432 | localhost:35432 (Docker) | |
| `REDIS_URL` | localhost:36379 | localhost:36379 (Docker) | |
| `COOKIE_SECURE` | false | true | Required for HTTPS |
| `TRUST_PROXY` | false | true | Required for nginx |

---

## Part 5: Updating Deployment

### Update Backend
```bash
cd /opt/sales-agent-api
git pull origin main
cd server
npm run build
pm2 restart sales-api
pm2 restart sales-worker
```

### Update Frontend
```bash
# Build locally
export NEXT_PUBLIC_API_ORIGIN=https://apiagent.akilimatic.com
npm run build:cpanel

# Upload out/ directory to cPanel public_html
# (Same process as initial deployment)
```

### Rollback
```bash
# Backend
cd /opt/sales-agent-api
git revert HEAD
cd server
npm run build
pm2 restart sales-api

# Frontend
# Re-upload previous build from backup
```

---

## Part 6: Monitoring & Maintenance

### Daily Checks
```bash
# Check PM2 status
pm2 status

# Check API logs (last 100 lines)
pm2 logs sales-api --lines 100

# Check Docker services
sudo docker compose ps

# Check disk space
df -h

# Check memory usage
free -h
```

### Log Locations
- PM2 logs: `/opt/sales-agent-api/server/logs/`
- Nginx logs: `/var/log/nginx/apiagent-*.log`
- Docker logs: `sudo docker compose logs`

### Restart Services
```bash
# Restart everything
pm2 restart all
sudo systemctl restart nginx
sudo docker compose restart

# Full restart after server reboot
sudo reboot
# Then verify all services are up
```

### Docker Auto-Restart
```bash
sudo docker update --restart=always postgres sales-agent-redis minio
```

---

## Files Created by This Guide

| File | Purpose |
|------|---------|
| `scripts/deploy-frontend-cpanel.mjs` | Frontend build script for cPanel |
| `scripts/deploy-backend-ubuntu.sh` | Automated backend deployment script |
| `server/ecosystem.config.js` | PM2 process configuration |
| `server/nginx-apiagent.conf` | Nginx config (HTTP) |
| `server/nginx-apiagent-ssl.conf` | Nginx config (HTTPS + SSL) |
| `.env` (server) | Production environment variables |
