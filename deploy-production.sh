#!/bin/bash
# Complete deployment commands to run on production server
# 安全修复: 已移除 Service Role Key，管理后台仅使用 Anon Key + RPC 代理

set -e

echo "========================================="
echo "Starting Admin Panel Deployment"
echo "========================================="

# Step 1: Navigate to project directory
echo "Step 1: Checking project directory..."
cd /opt/luckymart-tj-admin
pwd

# Step 2: Backup current deployment
echo "Step 2: Creating backup..."
mkdir -p /opt/backups/admin
if [ -d "/var/www/tezbarakat.com/admin" ]; then
    tar -czf /opt/backups/admin/admin-backup-$(date +%Y%m%d-%H%M%S).tar.gz -C /var/www/tezbarakat.com/admin . 2>/dev/null || true
    echo "Backup created"
fi

# Step 3: Pull latest code
echo "Step 3: Pulling latest code..."
git fetch origin
git reset --hard origin/main
echo "Code updated"

# Step 4: Install dependencies
echo "Step 4: Installing dependencies..."
pnpm install
echo "Dependencies installed"

# Step 5: Create .env.production
# 安全修复: 仅包含 Anon Key，Service Role Key 已通过 RPC 代理架构移除
echo "Step 5: Creating .env.production..."
cat > .env.production << 'ENVEOF'
VITE_SUPABASE_URL=https://qcrcgpwlfouqslokwbzl.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjcmNncHdsZm91cXNsb2t3YnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MzMzMzcsImV4cCI6MjA4OTUwOTMzN30.KFR8C1O0BnGWvR6GSCCq8opP2EljMwwOQrtn8snXqM0
ENVEOF
echo ".env.production created"

# Step 6: Build
echo "Step 6: Building production bundle..."
pnpm build
echo "Build completed"

# Step 7: Security verification - ensure service_role_key is NOT in the build
echo "Step 7: Security verification..."
if grep -rq "service_role" dist/assets/*.js 2>/dev/null; then
    echo "✗ SECURITY CHECK FAILED - service_role key detected in build output!"
    echo "  The build contains service_role credentials which should NOT be exposed."
    echo "  Please check the source code and environment variables."
    exit 1
else
    echo "✓ Security check passed - no service_role key in build output"
fi

# Step 8: Deploy
echo "Step 8: Deploying to web directory..."
rm -rf /var/www/tezbarakat.com/admin/*
cp -r dist/* /var/www/tezbarakat.com/admin/
chown -R www-data:www-data /var/www/tezbarakat.com/admin
chmod -R 755 /var/www/tezbarakat.com/admin
echo "Files deployed"

# Step 9: Reload Nginx
echo "Step 9: Reloading Nginx..."
nginx -t && systemctl reload nginx
echo "Nginx reloaded"

echo ""
echo "========================================="
echo "✓ Deployment completed successfully!"
echo "========================================="
echo ""
echo "Admin URL: https://tezbarakat.com/admin/"
echo ""
echo "IMPORTANT: Clear your browser cache before testing!"
echo ""
