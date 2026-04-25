/**
 * PM2 生态系统配置文件
 *
 * 使用方式：
 *   pm2 start ecosystem.config.cjs
 *   pm2 logs dodo-batch-listing
 *   pm2 stop dodo-batch-listing
 *   pm2 restart dodo-batch-listing
 *   pm2 monit                          # 实时监控
 *
 * 首次部署前请确保 logs 目录存在：
 *   mkdir -p logs
 */
module.exports = {
  apps: [
    {
      name: 'dodo-batch-listing',
      script: 'processor.mjs',
      cwd: __dirname,
      // Node.js 22+ 原生支持 ESM，不需要 --experimental-modules
      env: {
        NODE_ENV: 'production',
      },
      // 日志配置
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      merge_logs: true,
      // 重启策略
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
      // 内存限制（超过自动重启）
      max_memory_restart: '500M',
      // 监听文件变化自动重启（生产环境关闭）
      watch: false,
    },
  ],
};
