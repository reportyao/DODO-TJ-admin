#!/bin/bash
# Admin Panel Deployment Script for Production Server
# This script should be run on the production server (47.82.73.79)
# 安全修复: 已移除 Service Role Key，管理后台仅使用 Anon Key + RPC 代理

set -e  # Exit on error

echo "========================================="
echo "DODO Admin Panel Deployment"
echo "========================================="

# Configuration
PROJECT_DIR="/opt/luckymart-tj-admin"
DEPLOY_DIR="/var/www/tezbarakat.com/admin"
BACKUP_DIR="/opt/backups/admin"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Step 1: Creating backup...${NC}"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/admin-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
if [ -d "$DEPLOY_DIR" ]; then
    tar -czf "$BACKUP_FILE" -C "$DEPLOY_DIR" . 2>/dev/null || true
    echo -e "${GREEN}✓ Backup created: $BACKUP_FILE${NC}"
else
    echo -e "${YELLOW}! No existing deployment to backup${NC}"
fi

echo -e "${YELLOW}Step 2: Pulling latest code from GitHub...${NC}"
cd "$PROJECT_DIR"
git fetch origin
git reset --hard origin/main
echo -e "${GREEN}✓ Code updated${NC}"

echo -e "${YELLOW}Step 3: Installing dependencies...${NC}"
pnpm install
echo -e "${GREEN}✓ Dependencies installed${NC}"

# 安全修复: 仅包含 Anon Key，Service Role Key 已通过 RPC 代理架构移除
echo -e "${YELLOW}Step 4: Creating .env.production file...${NC}"
cat > .env.production << 'EOF'
VITE_SUPABASE_URL=https://qcrcgpwlfouqslokwbzl.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjcmNncHdsZm91cXNsb2t3YnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MzMzMzcsImV4cCI6MjA4OTUwOTMzN30.KFR8C1O0BnGWvR6GSCCq8opP2EljMwwOQrtn8snXqM0
EOF
echo -e "${GREEN}✓ Environment variables configured${NC}"

echo -e "${YELLOW}Step 5: Building production bundle...${NC}"
pnpm build
echo -e "${GREEN}✓ Build completed${NC}"

# 安全检查: 确保构建产物中不包含 service_role 密钥
echo -e "${YELLOW}Step 6: Security verification...${NC}"
if grep -rq "service_role" dist/assets/*.js 2>/dev/null; then
    echo -e "${RED}✗ SECURITY CHECK FAILED - service_role key detected in build output!${NC}"
    echo -e "${RED}  The build contains service_role credentials which should NOT be exposed.${NC}"
    echo -e "${RED}  Please check the source code and environment variables.${NC}"
    exit 1
else
    echo -e "${GREEN}✓ Security check passed - no service_role key in build output${NC}"
fi

echo -e "${YELLOW}Step 7: Deploying to web directory...${NC}"
mkdir -p "$DEPLOY_DIR"
find "$DEPLOY_DIR" -maxdepth 1 -type f -delete
find "$DEPLOY_DIR" -maxdepth 1 -mindepth 1 -type d ! -name assets -exec rm -rf {} +
cp -r dist/* "$DEPLOY_DIR"/
echo -e "${GREEN}✓ Files deployed to $DEPLOY_DIR${NC}"

echo -e "${YELLOW}Step 8: Setting permissions...${NC}"
chown -R www-data:www-data "$DEPLOY_DIR"
chmod -R 755 "$DEPLOY_DIR"
echo -e "${GREEN}✓ Permissions set${NC}"

echo -e "${YELLOW}Step 9: Reloading Nginx...${NC}"
nginx -t && systemctl reload nginx
echo -e "${GREEN}✓ Nginx reloaded${NC}"

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}✓ Deployment completed successfully!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo -e "Admin panel URL: ${GREEN}https://tezbarakat.com/admin/${NC}"
echo ""
echo -e "Backup location: ${YELLOW}$BACKUP_FILE${NC}"
echo ""
echo -e "${YELLOW}IMPORTANT: Clear your browser cache before testing!${NC}"
echo ""
