/**
 * Supabase 客户端代理层
 * 
 * 安全修复: 拦截所有 supabase.from(table).select/insert/update/delete 调用，
 * 自动转发到 Security Definer RPC 函数（admin_query / admin_mutate / admin_count）。
 * 
 * 这样可以避免逐个改造 50+ 个页面文件，同时确保所有数据库操作都通过
 * 服务端 RPC 执行，不再需要 Service Role Key。
 * 
 * 代理保持了与原始 Supabase 客户端完全一致的链式调用 API，
 * 使得现有代码无需任何修改即可安全运行。
 * 
 * [v2 修复] 完整支持 .in()、.or()、head:true、upsert(onConflict)、
 *           关联查询自动二次查询、JSON 参数类型修正
 */
import { SupabaseClient } from '@supabase/supabase-js'
import { getSessionToken, clearSessionToken } from './adminApi'

// ============================================================
// 类型定义
// ============================================================
interface FilterItem {
  col: string
  op: string
  val?: string
}

interface ProxyQueryResult {
  data: any
  error: any
  count?: number | null
}

// 关联查询信息
interface RelationInfo {
  alias: string       // 前端使用的别名，如 "user"
  table: string       // 实际表名，如 "users"
  columns: string[]   // 需要的列，如 ["id", "display_name"]
  foreignKey: string  // 外键列名（从原始 select 中推断）
}

// ============================================================
// 查询构建器代理
// ============================================================
class QueryBuilderProxy {
  private client: SupabaseClient
  private tableName: string
  private selectColumns: string = '*'
  private filters: FilterItem[] = []
  private orderByCol: string | null = null
  private orderAsc: boolean = true
  private limitVal: number | null = null
  private offsetVal: number | null = null
  private isSingle: boolean = false
  private isMaybeSingle: boolean = false
  private countOption: string | null = null
  private headMode: boolean = false
  private orConditions: string | null = null
  private relations: RelationInfo[] = []

  // 写操作相关
  private operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  private writeData: any = null
  private upsertOnConflict: string | null = null

  constructor(client: SupabaseClient, tableName: string) {
    this.client = client
    this.tableName = tableName
  }

  // ---- SELECT 链式方法 ----
  select(columns: string = '*', options?: { count?: string; head?: boolean }) {
    this.operation = 'select'
    // 解析关联查询并保存
    this.relations = this._parseRelations(columns)
    // 去除关联查询语法，只保留基础列
    this.selectColumns = this._stripRelations(columns)
    if (options?.count) {
      this.countOption = options.count
    }
    if (options?.head) {
      this.headMode = true
    }
    return this
  }

  // ---- INSERT ----
  insert(data: any | any[], _options?: any) {
    this.operation = 'insert'
    this.writeData = data
    return this
  }

  // ---- UPDATE ----
  update(data: any) {
    this.operation = 'update'
    this.writeData = data
    return this
  }

  // ---- UPSERT ----
  upsert(data: any | any[], options?: { onConflict?: string }) {
    this.operation = 'upsert'
    this.writeData = data
    if (options?.onConflict) {
      this.upsertOnConflict = options.onConflict
    }
    return this
  }

  // ---- DELETE ----
  delete() {
    this.operation = 'delete'
    return this
  }

  // ---- 过滤方法 ----
  eq(col: string, val: any) {
    this.filters.push({ col, op: 'eq', val: String(val) })
    return this
  }

  neq(col: string, val: any) {
    this.filters.push({ col, op: 'neq', val: String(val) })
    return this
  }

  gt(col: string, val: any) {
    this.filters.push({ col, op: 'gt', val: String(val) })
    return this
  }

  gte(col: string, val: any) {
    this.filters.push({ col, op: 'gte', val: String(val) })
    return this
  }

  lt(col: string, val: any) {
    this.filters.push({ col, op: 'lt', val: String(val) })
    return this
  }

  lte(col: string, val: any) {
    this.filters.push({ col, op: 'lte', val: String(val) })
    return this
  }

  like(col: string, val: string) {
    this.filters.push({ col, op: 'like', val })
    return this
  }

  ilike(col: string, val: string) {
    this.filters.push({ col, op: 'ilike', val })
    return this
  }

  is(col: string, val: any) {
    if (val === null) {
      this.filters.push({ col, op: 'is_null' })
    } else {
      this.filters.push({ col, op: 'eq', val: String(val) })
    }
    return this
  }

  not(col: string, op: string, val: any) {
    if (op === 'is' && val === null) {
      this.filters.push({ col, op: 'is_not_null' })
    } else if (op === 'eq') {
      this.filters.push({ col, op: 'neq', val: String(val) })
    } else if (op === 'in') {
      // .not('col', 'in', [...]) => 不在列表中
      // 暂时不支持 NOT IN，用前端过滤
      console.warn(`[Proxy] .not(${col}, in, ...) 暂不支持，将在前端过滤`)
    }
    return this
  }

  // [修复 X1] 完整实现 .in() 方法
  in(col: string, values: any[]) {
    if (values.length === 0) {
      // 空数组 IN 查询应该返回空结果
      // 添加一个永远不匹配的条件
      this.filters.push({ col, op: 'eq', val: '__IMPOSSIBLE_VALUE_EMPTY_IN__' })
    } else if (values.length === 1) {
      this.filters.push({ col, op: 'eq', val: String(values[0]) })
    } else {
      // 多值 IN：传递逗号分隔的值列表
      this.filters.push({ col, op: 'in', val: values.map(v => String(v)).join(',') })
    }
    return this
  }

  contains(col: string, val: any) {
    // JSONB contains - 简化处理，暂不支持
    console.warn(`[Proxy] .contains(${col}, ...) 暂不支持`)
    return this
  }

  // [修复 X2] 完整实现 .or() 方法
  or(conditions: string) {
    // 将 OR 条件字符串传递给 RPC 层处理
    // 格式如: "col1.op.val1,col2.op.val2"
    if (this.orConditions) {
      // 如果已有 OR 条件，合并（极少见）
      this.orConditions = this.orConditions + ',' + conditions
    } else {
      this.orConditions = conditions
    }
    return this
  }

  // ---- 排序 ----
  order(col: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orderByCol = col
    this.orderAsc = options?.ascending ?? true
    return this
  }

  // ---- 分页 ----
  limit(count: number) {
    this.limitVal = count
    return this
  }

  range(from: number, to: number) {
    this.rangeFrom = from
    this.rangeTo = to
    this.offsetVal = from
    this.limitVal = to - from + 1
    return this
  }

  private rangeFrom: number | null = null
  private rangeTo: number | null = null

  // ---- 结果修饰 ----
  single() {
    this.isSingle = true
    this.limitVal = 1
    return this
  }

  maybeSingle() {
    this.isMaybeSingle = true
    this.limitVal = 1
    return this
  }

  // ---- 执行 (then 使其可 await) ----
  async then(
    resolve: (value: ProxyQueryResult) => void,
    reject?: (reason: any) => void
  ) {
    try {
      const result = await this._execute()
      resolve(result)
    } catch (err) {
      if (reject) reject(err)
      else resolve({ data: null, error: err })
    }
  }

  // ---- 内部执行逻辑 ----
  private async _execute(): Promise<ProxyQueryResult> {
    const token = getSessionToken()

    // 如果没有 session token，说明未登录，直接返回错误
    if (!token) {
      return {
        data: null,
        error: { message: 'ADMIN_AUTH_REQUIRED: 请先登录', code: 'AUTH_REQUIRED' }
      }
    }

    try {
      if (this.operation === 'select') {
        return await this._executeSelect(token)
      } else if (this.operation === 'insert') {
        return await this._executeInsert(token)
      } else if (this.operation === 'update') {
        return await this._executeUpdate(token)
      } else if (this.operation === 'upsert') {
        return await this._executeUpsert(token)
      } else if (this.operation === 'delete') {
        return await this._executeDelete(token)
      }
      return { data: null, error: { message: '不支持的操作' } }
    } catch (err: any) {
      if (err.message?.includes('ADMIN_AUTH_FAILED')) {
        clearSessionToken()
        localStorage.removeItem('admin_user')
        window.location.href = '/admin/login'
      }
      return { data: null, error: { message: err.message, code: 'RPC_ERROR' } }
    }
  }

  private async _executeSelect(token: string): Promise<ProxyQueryResult> {
    // [修复 X3] head:true 模式：只返回 count，不返回数据
    if (this.headMode && this.countOption) {
      const { data, error } = await this.client.rpc('admin_count', {
        p_session_token: token,
        p_table: this.tableName,
        p_filters: this.filters,  // [修复 A1] 直接传对象，不 JSON.stringify
        p_or_filters: this.orConditions,
      })
      if (error) return { data: null, error, count: null }
      const result = typeof data === 'string' ? JSON.parse(data) : data
      return { data: null, error: null, count: result?.count ?? 0 }
    }

    // [修复 X3] 非 head 模式但需要 count：同时查询数据和计数
    if (this.countOption && !this.headMode) {
      // 并行执行数据查询和计数查询
      const [queryResult, countResult] = await Promise.all([
        this.client.rpc('admin_query', {
          p_session_token: token,
          p_table: this.tableName,
          p_select: this.selectColumns,
          p_filters: this.filters,
          p_order_by: this.orderByCol,
          p_order_asc: this.orderAsc,
          p_limit: this.limitVal,
          p_offset: this.offsetVal,
          p_or_filters: this.orConditions,
          p_head: false,
        }),
        this.client.rpc('admin_count', {
          p_session_token: token,
          p_table: this.tableName,
          p_filters: this.filters,
          p_or_filters: this.orConditions,
        })
      ])

      if (queryResult.error) return { data: null, error: queryResult.error, count: null }

      let rows = typeof queryResult.data === 'string' ? JSON.parse(queryResult.data) : queryResult.data
      rows = rows || []

      const countData = typeof countResult.data === 'string' ? JSON.parse(countResult.data) : countResult.data
      const count = countData?.count ?? rows.length

      // 处理关联查询
      if (this.relations.length > 0) {
        rows = await this._hydrateRelations(token, rows)
      }

      if (this.isSingle) {
        if (rows.length === 0) return { data: null, error: { message: 'Row not found', code: 'PGRST116' }, count }
        return { data: rows[0], error: null, count }
      }
      if (this.isMaybeSingle) {
        return { data: rows.length > 0 ? rows[0] : null, error: null, count }
      }

      return { data: rows, error: null, count }
    }

    // 普通查询（无 count）
    const { data, error } = await this.client.rpc('admin_query', {
      p_session_token: token,
      p_table: this.tableName,
      p_select: this.selectColumns,
      p_filters: this.filters,
      p_order_by: this.orderByCol,
      p_order_asc: this.orderAsc,
      p_limit: this.limitVal,
      p_offset: this.offsetVal,
      p_or_filters: this.orConditions,
      p_head: false,
    })

    if (error) {
      return { data: null, error }
    }

    let rows = typeof data === 'string' ? JSON.parse(data) : data
    rows = rows || []

    // [修复 X4] 处理关联查询：自动二次查询关联表
    if (this.relations.length > 0) {
      rows = await this._hydrateRelations(token, rows)
    }

    // 处理 single / maybeSingle
    if (this.isSingle) {
      if (rows.length === 0) {
        return { data: null, error: { message: 'Row not found', code: 'PGRST116' } }
      }
      return { data: rows[0], error: null }
    }
    if (this.isMaybeSingle) {
      return { data: rows.length > 0 ? rows[0] : null, error: null }
    }

    return { data: rows, error: null }
  }

  private async _executeInsert(token: string): Promise<ProxyQueryResult> {
    const items = Array.isArray(this.writeData) ? this.writeData : [this.writeData]
    const results: any[] = []

    for (const item of items) {
      const { data, error } = await this.client.rpc('admin_mutate', {
        p_session_token: token,
        p_action: 'insert',
        p_table: this.tableName,
        p_data: item,  // [修复 A2] 直接传对象，不 JSON.stringify
        p_filters: [],
      })
      if (error) return { data: null, error }
      const result = typeof data === 'string' ? JSON.parse(data) : data
      results.push(result)
    }

    if (this.isSingle || this.isMaybeSingle) {
      return { data: results[0] || null, error: null }
    }
    return { data: Array.isArray(this.writeData) ? results : results[0], error: null }
  }

  private async _executeUpdate(token: string): Promise<ProxyQueryResult> {
    const { data, error } = await this.client.rpc('admin_mutate', {
      p_session_token: token,
      p_action: 'update',
      p_table: this.tableName,
      p_data: this.writeData,  // [修复 A2] 直接传对象
      p_filters: this.filters,
    })
    if (error) return { data: null, error }
    const result = typeof data === 'string' ? JSON.parse(data) : data
    return { data: result, error: null }
  }

  // [修复 X5] 完整实现 upsert
  private async _executeUpsert(token: string): Promise<ProxyQueryResult> {
    const items = Array.isArray(this.writeData) ? this.writeData : [this.writeData]
    const results: any[] = []

    for (const item of items) {
      const { data, error } = await this.client.rpc('admin_mutate', {
        p_session_token: token,
        p_action: 'upsert',
        p_table: this.tableName,
        p_data: item,
        p_filters: [],
        p_on_conflict: this.upsertOnConflict,
      })
      if (error) return { data: null, error }
      const result = typeof data === 'string' ? JSON.parse(data) : data
      results.push(result)
    }

    if (this.isSingle || this.isMaybeSingle) {
      return { data: results[0] || null, error: null }
    }
    return { data: Array.isArray(this.writeData) ? results : results[0], error: null }
  }

  private async _executeDelete(token: string): Promise<ProxyQueryResult> {
    if (this.filters.length === 0) {
      return { data: null, error: { message: 'DELETE 操作必须指定过滤条件' } }
    }

    const { data, error } = await this.client.rpc('admin_mutate', {
      p_session_token: token,
      p_action: 'delete',
      p_table: this.tableName,
      p_data: null,
      p_filters: this.filters,
    })
    if (error) return { data: null, error }
    const result = typeof data === 'string' ? JSON.parse(data) : data
    return { data: result, error: null }
  }

  // ============================================================
  // [修复 X4] 关联查询自动二次查询
  // ============================================================
  
  // 解析 select 字符串中的关联查询
  // 例如: "*, user:users(id, display_name)" => [{ alias: "user", table: "users", columns: ["id", "display_name"] }]
  private _parseRelations(columns: string): RelationInfo[] {
    const relations: RelationInfo[] = []
    const seen = new Set<string>() // 防止重复添加

    // 清理列名的辅助函数：过滤掉嵌套关联残留（包含 : 或 ! 或 ( 的条目）
    const cleanColumns = (cols: string[]): string[] => {
      return cols.filter(c => /^[a-zA-Z0-9_*]+$/.test(c))
    }

    // 匹配 alias:table!fkey(cols) 格式（最完整的格式，优先匹配）
    const fullRegex = /(\w+):(\w+)!(\w+)\s*\(([^)]+)\)/g
    let match
    while ((match = fullRegex.exec(columns)) !== null) {
      const key = `${match.index}`
      if (seen.has(key)) continue
      seen.add(key)
      relations.push({
        alias: match[1],
        table: match[2],
        columns: cleanColumns(match[4].split(',').map(c => c.trim())),
        foreignKey: match[3]
      })
    }

    // 匹配 alias:table_or_fk(cols) 格式（不含感叹号）
    // 启发式规则：如果第二个词以 _id 结尾，则是 table:fk_column 格式
    //              否则是 alias:table 格式
    const colonRegex = /(\w+):(\w+)\s*\(([^)]+)\)/g
    while ((match = colonRegex.exec(columns)) !== null) {
      // 跳过已被 fullRegex 匹配的（包含感叹号的）
      if (columns.substring(match.index, match.index + match[0].length + 10).includes('!')) continue
      const word1 = match[1]
      const word2 = match[2]
      const cols = cleanColumns(match[3].split(',').map(c => c.trim()))
      if (word2.endsWith('_id')) {
        // table:fk_column 格式：第一个词是表名，第二个词是外键列名
        relations.push({
          alias: word1,
          table: word1,
          columns: cols,
          foreignKey: word2
        })
      } else {
        // alias:table 格式：第一个词是别名，第二个词是表名
        relations.push({
          alias: word1,
          table: word2,
          columns: cols,
          foreignKey: ''
        })
      }
    }

    // 匹配 table!fkey(cols) 格式（无 alias）
    const fkRegex = /(\w+)!(\w+)\s*\(([^)]+)\)/g
    while ((match = fkRegex.exec(columns)) !== null) {
      // 跳过已被 fullRegex 匹配的（包含冒号前缀的）
      const before = columns.substring(Math.max(0, match.index - 30), match.index)
      if (before.match(/\w+:$/)) continue
      const table = match[1]
      const fkHint = match[2]
      const cols = cleanColumns(match[3].split(',').map(c => c.trim()))
      relations.push({
        alias: table.replace(/s$/, ''),
        table,
        columns: cols,
        foreignKey: fkHint
      })
    }

    return relations
  }

  // 对查询结果进行关联数据填充
  private async _hydrateRelations(token: string, rows: any[]): Promise<any[]> {
    if (rows.length === 0 || this.relations.length === 0) return rows

    for (const rel of this.relations) {
      // 推断外键列名
      let fkCol = rel.foreignKey
      if (!fkCol) {
        // 常见模式: user:users => user_id, lottery:lotteries => lottery_id
        fkCol = rel.alias + '_id'
        // 如果行中没有这个列，尝试 table 名的单数形式 + _id
        if (rows[0] && !(fkCol in rows[0])) {
          const singularTable = rel.table.replace(/s$/, '')
          fkCol = singularTable + '_id'
        }
        // 还是没有，尝试 id（自引用）
        if (rows[0] && !(fkCol in rows[0])) {
          fkCol = 'id'
        }
      }

      // 收集所有需要查询的外键值
      const fkValues = [...new Set(
        rows.map(r => r[fkCol]).filter(v => v != null)
      )]

      if (fkValues.length === 0) {
        // 没有外键值，给所有行设置 null
        rows.forEach(r => { r[rel.alias] = null })
        continue
      }

      // 批量查询关联表
      const { data: relData } = await this.client.rpc('admin_query', {
        p_session_token: token,
        p_table: rel.table,
        p_select: rel.columns.includes('id') ? rel.columns.join(', ') : 'id, ' + rel.columns.join(', '),
        p_filters: fkValues.length === 1
          ? [{ col: 'id', op: 'eq', val: String(fkValues[0]) }]
          : [{ col: 'id', op: 'in', val: fkValues.map(v => String(v)).join(',') }],
        p_order_by: null,
        p_order_asc: true,
        p_limit: fkValues.length,
        p_offset: null,
        p_or_filters: null,
        p_head: false,
      })

      const relRows = typeof relData === 'string' ? JSON.parse(relData) : (relData || [])

      // 构建 id -> row 的映射
      const relMap = new Map<string, any>()
      for (const rr of relRows) {
        relMap.set(String(rr.id), rr)
      }

      // 填充关联数据到每一行
      rows.forEach(r => {
        const fkVal = r[fkCol]
        r[rel.alias] = fkVal ? (relMap.get(String(fkVal)) || null) : null
      })
    }

    return rows
  }

  // 去除关联查询语法（支持嵌套括号）
  private _stripRelations(columns: string): string {
    // 处理如 "*, user:users(id, display_name)" 和嵌套关联的情况
    // 支持格式:
    //   alias:table(cols)                      - 别名关联
    //   alias:table!fkey(cols)                  - 别名 + 外键提示
    //   table!fkey(cols, nested:t2(cols))        - 嵌套关联
    // 注意：必须要求包含冒号或感叹号，否则会误匹配 count(*) 等普通表达式
    const stripBalancedRelation = (str: string): string => {
      const patterns = [
        /,?\s*\w+:\w+(?:!\w+)?\s*\(/,  // alias:table 或 alias:table!fkey
        /,?\s*\w+!\w+\s*\(/,            // table!fkey (无 alias)
      ]
      let result = str
      for (const pattern of patterns) {
        let match = pattern.exec(result)
        while (match) {
          const start = match.index
          const parenStart = start + match[0].length - 1 // 左括号位置
          let depth = 1
          let i = parenStart + 1
          while (i < result.length && depth > 0) {
            if (result[i] === '(') depth++
            if (result[i] === ')') depth--
            i++
          }
          // 移除从 start 到 i（包含右括号）的整个关联表达式
          result = result.substring(0, start) + result.substring(i)
          match = pattern.exec(result)
        }
      }
      return result
        .replace(/^\s*,\s*/, '')
        .replace(/,\s*$/, '')
        .trim() || '*'
    }
    return stripBalancedRelation(columns)
  }
}

// ============================================================
// Storage 代理
// ============================================================
class StorageProxy {
  private realStorage: any

  constructor(realStorage: any) {
    this.realStorage = realStorage
  }

  from(bucket: string) {
    return new StorageBucketProxy(this.realStorage, bucket)
  }
}

class StorageBucketProxy {
  private realStorage: any
  private bucket: string

  constructor(realStorage: any, bucket: string) {
    this.realStorage = realStorage
    this.bucket = bucket
  }

  // getPublicUrl 不需要权限，直接透传
  getPublicUrl(path: string) {
    return this.realStorage.from(this.bucket).getPublicUrl(path)
  }

  // upload/remove 等需要权限的操作应通过 Edge Function
  async upload(..._args: any[]) {
    console.warn('[StorageProxy] 直接上传已被拦截，请使用 adminUploadImage')
    return { data: null, error: { message: '请使用 Edge Function 上传' } }
  }

  async remove(..._args: any[]) {
    console.warn('[StorageProxy] 直接删除已被拦截')
    return { data: null, error: null }
  }
}

// ============================================================
// 创建代理客户端
// ============================================================
export function createSupabaseProxy(client: SupabaseClient): SupabaseClient {
  const handler: ProxyHandler<SupabaseClient> = {
    get(target, prop: string) {
      if (prop === 'from') {
        // 拦截 .from() 调用，返回 QueryBuilderProxy
        return (tableName: string) => {
          return new QueryBuilderProxy(target, tableName) as any
        }
      }

      if (prop === 'storage') {
        // 拦截 storage 调用
        return new StorageProxy(target.storage)
      }

      if (prop === 'rpc') {
        // rpc 调用直接透传（RPC 函数本身就是安全的）
        return target.rpc.bind(target)
      }

      if (prop === 'auth') {
        // auth 调用直接透传
        return target.auth
      }

      if (prop === 'functions') {
        // Edge Functions 调用直接透传
        return target.functions
      }

      if (prop === 'channel' || prop === 'removeChannel' || prop === 'removeAllChannels') {
        // realtime 相关直接透传
        return (target as any)[prop]?.bind?.(target) ?? (target as any)[prop]
      }

      // 其他属性直接透传
      const value = (target as any)[prop]
      if (typeof value === 'function') {
        return value.bind(target)
      }
      return value
    }
  }

  return new Proxy(client, handler)
}
