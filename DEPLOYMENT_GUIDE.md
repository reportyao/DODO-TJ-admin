# 管理后台部署指南

## 概述

本文档描述了管理后台的部署流程、环境配置和常见问题解决方案。

## 环境配置

### 服务器信息

**正式服务器**
- IP: 47.82.73.79
- 域名: tezbarakat.com
- 管理后台URL: https://tezbarakat.com/admin
- 项目路径: `/root/projects/luckymart-tj-admin`
- 部署路径: `/var/www/tezbarakat.com/admin`

**测试服务器**
- IP: 47.82.78.182
- 域名: test.tezbarakat.com
- 管理后台URL: https://test.tezbarakat.com/admin
- 项目路径: `/root/projects/luckymart-tj-admin`
- 部署路径: `/var/www/test.tezbarakat.com/admin`

### 环境变量文件

项目包含以下环境变量文件：

- `.env.example` - 环境变量模板（提交到Git）
- `.env.production` - 生产环境配置（提交到Git，不包含敏感信息）
- `.env.test` - 测试环境配置（提交到Git）
- `.env` - 当前使用的配置（不提交到Git）
- `.env.backup` - 环境变量备份（不提交到Git）

**重要**: 构建前必须将对应环境的配置文件复制为`.env`：
```bash
# 生产环境
cp .env.production .env

# 测试环境
cp .env.test .env
```

### 环境变量说明

```bash
# Supabase配置
VITE_SUPABASE_URL=https://qcrcgpwlfouqslokwbzl.supabase.co
VITE_SUPABASE_ANON_KEY=<匿名密钥>
VITE_SUPABASE_SERVICE_ROLE_KEY=<服务角色密钥>

# 管理后台配置
VITE_ADMIN_API_URL=https://tezbarakat.com/admin/api
VITE_APP_TITLE=LuckyMart Admin Dashboard
```

## 部署流程

### 方式一：自动化部署脚本（推荐）

使用提供的自动化部署脚本：

```bash
# 上传脚本到服务器
scp deploy-admin-production-auto.sh root@47.82.73.79:/root/scripts/

# SSH登录服务器
ssh root@47.82.73.79

# 添加执行权限
chmod +x /root/scripts/deploy-admin-production-auto.sh

# 执行部署
/root/scripts/deploy-admin-production-auto.sh
```

脚本会自动完成以下步骤：
1. 拉取最新代码
2. 配置环境变量
3. 安装依赖
4. 构建项目
5. 备份当前部署
6. 部署新构建
7. 设置文件权限
8. 验证部署

### 方式二：手动部署

#### 1. 连接服务器

```bash
ssh root@47.82.73.79
```

#### 2. 进入项目目录

```bash
cd /root/projects/luckymart-tj-admin
```

#### 3. 拉取最新代码

```bash
git fetch origin
git checkout production
git pull origin production
```

#### 4. 配置环境变量

```bash
cp .env.production .env
```

#### 5. 安装依赖（如果需要）

```bash
npm install
```

#### 6. 构建项目

```bash
npm run build
```

#### 7. 备份当前部署

```bash
mkdir -p /var/www/tezbarakat.com/admin.backups
mv /var/www/tezbarakat.com/admin /var/www/tezbarakat.com/admin.backups/admin.backup.$(date +%Y%m%d%H%M%S)
```

#### 8. 部署新构建

```bash
mkdir -p /var/www/tezbarakat.com/admin
cp -r dist/* /var/www/tezbarakat.com/admin/
```

#### 9. 设置权限

```bash
chown -R www-data:www-data /var/www/tezbarakat.com/admin
chmod -R 755 /var/www/tezbarakat.com/admin
```

#### 10. 验证部署

```bash
ls -lh /var/www/tezbarakat.com/admin
```

## 构建验证

部署后验证构建配置是否正确：

```bash
# 检查Supabase URL
grep -q "qcrcgpwlfouqslokwbzl" /var/www/tezbarakat.com/admin/assets/*.js && echo "✓ Correct Supabase URL" || echo "✗ Wrong Supabase URL"

# 检查Service Role Key
grep -q "service_role" /var/www/tezbarakat.com/admin/assets/*.js && echo "✓ Service role key included" || echo "✗ Service role key missing"
```

## 回滚操作

如果新部署出现问题，可以快速回滚到之前的版本：

```bash
# 查看可用的备份
ls -lh /var/www/tezbarakat.com/admin.backups/

# 回滚到指定备份
rm -rf /var/www/tezbarakat.com/admin
cp -r /var/www/tezbarakat.com/admin.backups/admin.backup.YYYYMMDDHHMMSS /var/www/tezbarakat.com/admin

# 设置权限
chown -R www-data:www-data /var/www/tezbarakat.com/admin
chmod -R 755 /var/www/tezbarakat.com/admin
```

## 常见问题

### 1. 401未授权错误

**症状**：访问管理后台时出现401错误，无法加载数据

**原因**：
- 构建时使用了错误的环境变量
- Service Role Key未正确注入到构建文件中
- 浏览器缓存了旧版本

**解决方案**：
1. 确认使用了正确的环境变量文件（`.env.production`）
2. 重新构建和部署
3. 清除浏览器缓存（Ctrl+Shift+R）

### 2. 构建失败

**症状**：`npm run build`执行失败

**原因**：
- 依赖版本不兼容
- 内存不足
- TypeScript类型错误

**解决方案**：
```bash
# 清理缓存
rm -rf node_modules package-lock.json
npm install

# 增加Node.js内存限制
NODE_OPTIONS=--max-old-space-size=4096 npm run build

# 检查TypeScript错误
npm run type-check
```

### 3. 权限问题

**症状**：访问管理后台时出现403 Forbidden错误

**原因**：文件权限设置不正确

**解决方案**：
```bash
chown -R www-data:www-data /var/www/tezbarakat.com/admin
chmod -R 755 /var/www/tezbarakat.com/admin
```

### 4. 环境变量未生效

**症状**：部署后仍然连接到错误的Supabase实例

**原因**：
- 构建时未使用正确的`.env`文件
- Vite缓存问题

**解决方案**：
```bash
# 清理Vite缓存
rm -rf node_modules/.vite

# 确保使用正确的环境变量
cp .env.production .env

# 重新构建
npm run build
```

## 分支管理

项目使用以下分支策略：

- `main` - 开发主分支，包含最新的开发功能
- `production` - 生产环境分支，只包含经过测试的稳定代码

**部署流程**：
1. 开发在`main`分支进行
2. 测试通过后合并到`production`分支
3. 从`production`分支部署到生产服务器

## 监控和日志

### Nginx访问日志

```bash
tail -f /var/log/nginx/access.log | grep admin
```

### Nginx错误日志

```bash
tail -f /var/log/nginx/error.log
```

### 浏览器控制台

打开浏览器开发者工具（F12），查看：
- Console标签：JavaScript错误
- Network标签：API请求状态

## 安全性注意事项

### 当前架构的安全风险

管理后台在前端直接使用`service_role_key`，存在以下风险：

1. **密钥暴露**：任何人都可以通过查看源代码获取密钥
2. **权限过大**：service_role_key拥有数据库完全访问权限
3. **无法撤销**：密钥泄露后需要重新生成

### 缓解措施

1. **限制IP访问**：在Nginx配置中限制管理后台只能从特定IP访问
2. **定期轮换密钥**：定期在Supabase控制台重新生成密钥
3. **监控异常访问**：配置日志监控，及时发现异常访问

### 推荐的改进方案

1. **使用Supabase Auth + RLS**：为管理员创建Auth账户，配置RLS策略
2. **后端API代理**：创建后端服务，前端通过API访问数据
3. **Edge Functions**：将敏感操作封装为Edge Functions

## 性能优化

### 构建优化

当前构建产物较大（916KB），建议优化：

```javascript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom'],
          'ui': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
          'supabase': ['@supabase/supabase-js']
        }
      }
    }
  }
})
```

### CDN加速

考虑使用CDN加速静态资源：
- 将构建产物上传到CDN
- 配置Nginx反向代理

## 联系方式

如有问题，请联系：
- 项目负责人：[联系方式]
- 技术支持：[联系方式]

## 更新日志

### 2026-01-21
- 修复401未授权错误
- 创建自动化部署脚本
- 完善部署文档

### 2026-01-13
- 添加生产环境部署脚本

### 2026-01-10
- 初始部署
