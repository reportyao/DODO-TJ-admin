/**
 * 管理后台操作审计日志工具
 * 
 * 提供统一的日志记录接口，将管理员的关键操作记录到 admin_audit_logs 表。
 * 
 * 使用方式：
 *   import { auditLog } from '@/lib/auditLogger';
 *   await auditLog(supabase, { adminId, action, targetType, targetId, ... });
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface AuditLogParams {
  /** 管理员 ID */
  adminId: string;
  /** 操作类型，如 APPROVE_DEPOSIT, REJECT_WITHDRAWAL, CREATE_PRODUCT 等 */
  action: string;
  /** 操作目标类型，如 deposit_request, withdrawal_request, product 等 */
  targetType?: string;
  /** 操作目标 ID */
  targetId?: string;
  /** 操作前的数据快照 */
  oldData?: Record<string, any>;
  /** 操作后的数据快照 */
  newData?: Record<string, any>;
  /** 操作的详细上下文信息 */
  details?: Record<string, any>;
  /** 日志来源，默认 admin_ui */
  source?: 'admin_ui' | 'edge_function' | 'rpc' | 'manual';
  /** 操作状态，默认 success */
  status?: 'success' | 'failed' | 'error';
  /** 错误信息 */
  errorMessage?: string;
  /** 操作耗时（毫秒） */
  durationMs?: number;
}

/**
 * 记录管理员操作审计日志
 * 
 * 该函数为 fire-and-forget 模式，日志写入失败不会影响主业务流程。
 */
export async function auditLog(
  supabase: SupabaseClient,
  params: AuditLogParams
): Promise<void> {
  try {
    const { error } = await supabase
      .from('admin_audit_logs')
      .insert({
        admin_id: params.adminId,
        action: params.action,
        target_type: params.targetType || null,
        target_id: params.targetId || null,
        old_data: params.oldData || null,
        new_data: params.newData || null,
        details: params.details || null,
        source: params.source || 'admin_ui',
        status: params.status || 'success',
        error_message: params.errorMessage || null,
        duration_ms: params.durationMs || null,
      });

    if (error) {
      console.error('[AuditLog] Failed to write audit log:', error.message);
    }
  } catch (err) {
    // 日志写入失败不应影响主业务
    console.error('[AuditLog] Exception while writing audit log:', err);
  }
}

/**
 * 创建一个带计时功能的审计日志记录器
 * 
 * 使用方式：
 *   const timer = createAuditTimer(supabase, { adminId, action, ... });
 *   // ... 执行操作 ...
 *   await timer.success({ newData: result });
 *   // 或
 *   await timer.fail(errorMessage);
 */
export function createAuditTimer(
  supabase: SupabaseClient,
  baseParams: Omit<AuditLogParams, 'status' | 'errorMessage' | 'durationMs'>
) {
  const startTime = Date.now();

  return {
    /** 记录操作成功 */
    async success(extra?: Partial<AuditLogParams>): Promise<void> {
      await auditLog(supabase, {
        ...baseParams,
        ...extra,
        status: 'success',
        durationMs: Date.now() - startTime,
      });
    },

    /** 记录操作失败 */
    async fail(errorMessage: string, extra?: Partial<AuditLogParams>): Promise<void> {
      await auditLog(supabase, {
        ...baseParams,
        ...extra,
        status: 'failed',
        errorMessage,
        durationMs: Date.now() - startTime,
      });
    },
  };
}
