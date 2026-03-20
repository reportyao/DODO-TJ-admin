#!/bin/bash
# 管理后台生产环境自动化部署脚本
# 用途：从GitHub拉取最新代码，构建并部署到生产环境
# 作者：Manus AI
# 日期：2026-01-21

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置变量
PROJECT_DIR="/root/projects/luckymart-tj-admin"
DEPLOY_DIR="/var/www/tezbarakat.com/admin"
BACKUP_DIR="/var/www/tezbarakat.com/admin.backups"
BRANCH="production"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}管理后台生产环境部署脚本${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 检查项目目录
if [ ! -d "$PROJECT_DIR" ]; then
    echo -e "${RED}错误: 项目目录不存在: $PROJECT_DIR${NC}"
    exit 1
fi

cd "$PROJECT_DIR"

# 1. 检查Git状态
echo -e "${YELLOW}[1/8] 检查Git状态...${NC}"
git status

# 2. 拉取最新代码
echo -e "${YELLOW}[2/8] 拉取最新代码...${NC}"
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

CURRENT_COMMIT=$(git rev-parse --short HEAD)
echo -e "${GREEN}当前提交: $CURRENT_COMMIT${NC}"

# 3. 使用生产环境变量
echo -e "${YELLOW}[3/8] 配置生产环境变量...${NC}"
if [ ! -f ".env.production" ]; then
    echo -e "${RED}错误: .env.production 文件不存在${NC}"
    exit 1
fi
cp .env.production .env
echo -e "${GREEN}已复制 .env.production 到 .env${NC}"

# 4. 安装依赖（如果需要）
echo -e "${YELLOW}[4/8] 检查依赖...${NC}"
if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
    echo "安装依赖..."
    npm install
else
    echo "依赖已是最新"
fi

# 5. 构建项目
echo -e "${YELLOW}[5/8] 构建项目...${NC}"
npm run build

# 检查构建是否成功
if [ ! -d "dist" ]; then
    echo -e "${RED}错误: 构建失败，dist目录不存在${NC}"
    exit 1
fi

# 6. 备份当前部署
echo -e "${YELLOW}[6/8] 备份当前部署...${NC}"
if [ -d "$DEPLOY_DIR" ]; then
    mkdir -p "$BACKUP_DIR"
    BACKUP_NAME="admin.backup.$(date +%Y%m%d%H%M%S)"
    mv "$DEPLOY_DIR" "$BACKUP_DIR/$BACKUP_NAME"
    echo -e "${GREEN}已备份到: $BACKUP_DIR/$BACKUP_NAME${NC}"
    
    # 只保留最近5个备份
    cd "$BACKUP_DIR"
    ls -t | tail -n +6 | xargs -r rm -rf
    cd "$PROJECT_DIR"
fi

# 7. 部署新构建
echo -e "${YELLOW}[7/8] 部署新构建...${NC}"
mkdir -p "$DEPLOY_DIR"
cp -r dist/* "$DEPLOY_DIR/"

# 8. 设置权限
echo -e "${YELLOW}[8/8] 设置文件权限...${NC}"
chown -R www-data:www-data "$DEPLOY_DIR"
chmod -R 755 "$DEPLOY_DIR"

# 验证部署
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}部署完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "部署信息："
echo "  - 提交版本: $CURRENT_COMMIT"
echo "  - 部署时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "  - 部署目录: $DEPLOY_DIR"
echo "  - 备份目录: $BACKUP_DIR"
echo ""
echo "部署文件："
ls -lh "$DEPLOY_DIR"
echo ""
echo -e "${YELLOW}请清除浏览器缓存后访问: https://tezbarakat.com/admin${NC}"
echo ""

# 验证构建文件
echo "验证构建配置..."
if grep -q "qcrcgpwlfouqslokwbzl" "$DEPLOY_DIR/assets/"*.js 2>/dev/null; then
    echo -e "${GREEN}✓ Supabase URL 正确${NC}"
else
    echo -e "${RED}✗ Supabase URL 错误${NC}"
fi

if grep -q "service_role" "$DEPLOY_DIR/assets/"*.js 2>/dev/null; then
    echo -e "${GREEN}✓ Service Role Key 已包含${NC}"
else
    echo -e "${YELLOW}⚠ Service Role Key 未找到（可能已被混淆）${NC}"
fi

echo ""
echo -e "${GREEN}部署成功完成！${NC}"
