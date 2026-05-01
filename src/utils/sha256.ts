/**
 * 标准 SHA-256 哈希工具
 *
 * 使用浏览器内置的 Web Crypto API（`crypto.subtle.digest('SHA-256', ...)`）
 * 计算 SHA-256，输出 64 位小写十六进制字符串。
 *
 * 输出与以下实现完全一致：
 *   - Node.js  `crypto.createHash('sha256').update(s).digest('hex')`
 *   - Python   `hashlib.sha256(s.encode('utf-8')).hexdigest()`
 *   - Postgres `encode(digest(s, 'sha256'), 'hex')`
 *
 * 修复说明：
 *   旧实现是手写的纯 JS SHA-256，存在 UTF-8 编码不完整、
 *   常量数组状态污染等多个 bug，导致计算结果与标准 SHA-256 不一致，
 *   从而管理后台登录时前端算出的 hash 与数据库中的 hash 不匹配，
 *   `admin_login` RPC 抛出 LOGIN_FAILED（HTTP 401）。
 *
 * 现统一改为浏览器原生 Web Crypto API 实现，并保留同步签名 `sha256(message)`
 * 以兼容旧调用点（内部使用同步包装会抛错指引迁移），新代码请使用异步版本
 * `sha256Async(message)`。
 *
 * 注意：Web Crypto API 仅在 secure context（HTTPS / localhost）下可用，
 * 部署到 HTTPS 站点（如 admin.dodo.tj）时无任何兼容性问题。
 */

/**
 * 异步计算字符串的 SHA-256，返回 64 位小写十六进制字符串。
 *
 * 推荐所有新代码使用此异步函数。
 *
 * @example
 * const hash = await sha256Async('admin123@')
 * // => 'ddfa08f04ffbedd937ce079026ead9826c0f4572feee5e45ff2a66d058c0c9d5'
 */
export async function sha256Async(message: string): Promise<string> {
  if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
    throw new Error(
      'SHA-256 计算失败：当前环境不支持 Web Crypto API，请使用 HTTPS 或现代浏览器访问。'
    );
  }
  const data = new TextEncoder().encode(message);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * @deprecated 旧的同步签名仅为兼容历史代码而保留，内部已无法同步实现标准 SHA-256。
 *
 * 直接调用此函数会抛出错误，请改用 `sha256Async`。
 *
 * 历史原因：
 *   旧版本使用了一段手写的、有 bug 的纯 JS SHA-256 同步实现，
 *   计算结果与标准 SHA-256 不一致，已被替换为 Web Crypto 异步标准实现。
 */
export function sha256(_message: string): string {
  throw new Error(
    'sha256() 同步调用已废弃，请改用 `await sha256Async(...)`。'
  );
}

export default sha256Async;
