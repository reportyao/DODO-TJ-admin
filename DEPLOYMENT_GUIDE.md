# 管理后台部署指南

## 概述

本文档描述了管理后台的部署流程、环境配置和常见问题解决方案。

> **安全架构说明**：管理后台已完成安全重构，前端仅使用 Anon Key，所有需要提权的数据库操作通过 Security Definer RPC 函数（`admin_query`、`admin_mutate`、`admin_count` 等）在服务端执行。Service Role Key 不再暴露在前端代码中。

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
# Supabase配置（仅需 Anon Key）
VITE_SUPABASE_URL=https://qcrcgpwlfouqslokwbzl.supabase.co
VITE_SUPABASE_ANON_KEY=<匿名密钥>

# 管理后台配置
VITE_ADMIN_API_URL=https://tezbarakat.com/admin/api
VITE_APP_TITLE=DODO Admin Dashboard
```

> **注意**：环境变量中不应包含 `VITE_SUPABASE_SERVICE_ROLE_KEY`。管理后台通过 RPC 代理架构（`supabaseProxy.ts`）实现提权操作，前端无需也不应持有 Service Role Key。

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
5. **安全检查**（确保构建产物中不包含 service_role 密钥）
6. 备份当前部署
7. 部署新构建
8. 设置文件权限
9. 验证部署

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

#### 7. 安全检查

```bash
# 确保构建产物中不包含 service_role 密钥
if grep -rq "service_role" dist/assets/*.js 2>/dev/null; then
    echo "✗ 安全检查失败 - 检测到 service_role 密钥！"
    exit 1
else
    echo "✓ 安全检查通过"
fi
```

#### 8. 备份当前部署

```bash
mkdir -p /var/www/tezbarakat.com/admin.backups
mv /var/www/tezbarakat.com/admin /var/www/tezbarakat.com/admin.backups/admin.backup.$(date +%Y%m%d%H%M%S)
```

#### 9. 部署新构建

```bash
mkdir -p /var/www/tezbarakat.com/admin
cp -r dist/* /var/www/tezbarakat.com/admin/
```

#### 10. 设置权限

```bash
chown -R www-data:www-data /var/www/tezbarakat.com/admin
chmod -R 755 /var/www/tezbarakat.com/admin
```

#### 11. 验证部署

```bash
ls -lh /var/www/tezbarakat.com/admin
```

## 构建验证

部署后验证构建配置是否正确：

```bash
# 检查Supabase URL
grep -q "qcrcgpwlfouqslokwbzl" /var/www/tezbarakat.com/admin/assets/*.js && echo "✓ Supabase URL 正确" || echo "✗ Supabase URL 错误"

# 安全检查：确保 service_role 密钥未被包含在构建产物中
if grep -rq "service_role" /var/www/tezbarakat.com/admin/assets/*.js 2>/dev/null; then
    echo "✗ 安全警告：检测到 service_role 密钥！请立即重新部署！"
else
    echo "✓ 安全检查通过 - 未包含 service_role 密钥"
fi
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
- Anon Key 未正确注入到构建文件中
- 管理员会话已过期，需要重新登录
- 浏览器缓存了旧版本

**解决方案**：
1. 确认使用了正确的环境变量文件（`.env.production`）
2. 重新构建和部署
3. 在管理后台重新登录
4. 清除浏览器缓存（Ctrl+Shift+R）

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

## 安全架构

### 当前架构（RPC 代理模式）

管理后台已完成安全重构，采用以下架构：

1. **前端仅使用 Anon Key**：前端代码中不包含任何高权限密钥
2. **RPC 代理层**：通过 `supabaseProxy.ts` 拦截所有数据库操作，自动转发到 Security Definer RPC 函数
3. **服务端会话认证**：管理员通过 `admin_login` RPC 函数登录，获取 `session_token`，后续所有操作通过 session_token 验证身份和权限
4. **Security Definer 函数**：`admin_query`、`admin_mutate`、`admin_count` 等函数以 postgres 权限执行，但在函数内部验证会话有效性和权限

### 安全保障措施

1. **构建时安全检查**：部署脚本会自动检查构建产物，如果检测到 `service_role` 字符串则中止部署
2. **会话过期机制**：管理员会话有有效期限制，过期后需要重新登录
3. **登录失败锁定**：连续多次登录失败后，账户会被临时锁定
4. **审计日志**：所有管理操作都会记录到 `admin_audit_logs` 表中

## 性能优化

### 构建优化

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

### 2026-04-01
- **安全架构重构**：移除前端 Service Role Key 依赖
- 引入 RPC 代理层（supabaseProxy.ts）
- 部署脚本增加安全检查（检测 service_role 密钥泄露）
- 更新部署文档，反映新安全架构

### 2026-01-21
- 修复401未授权错误
- 创建自动化部署脚本
- 完善部署文档

### 2026-01-13
- 添加生产环境部署脚本

### 2026-01-10
- 初始部署
