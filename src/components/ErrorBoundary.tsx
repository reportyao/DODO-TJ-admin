import { Component, ReactNode, ErrorInfo } from 'react'
import { logger } from '@/lib/logger'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  isRecovering: boolean
}

const CHUNK_RELOAD_FLAG = 'dodo_admin_chunk_reload_attempted'

function isDynamicImportError(error: Error | null): boolean {
  if (!error) {
    return false
  }

  const message = `${error.name} ${error.message}`.toLowerCase()

  return [
    'failed to fetch dynamically imported module',
    'importing a module script failed',
    'chunkloaderror',
    'loading chunk',
    'module script',
  ].some((keyword) => message.includes(keyword))
}

function tryRecoverDynamicImportError(error: Error | null): boolean {
  if (typeof window === 'undefined' || !isDynamicImportError(error)) {
    return false
  }

  const hasRetried = window.sessionStorage.getItem(CHUNK_RELOAD_FLAG) === '1'

  if (hasRetried) {
    window.sessionStorage.removeItem(CHUNK_RELOAD_FLAG)
    return false
  }

  window.sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1')
  window.location.reload()
  return true
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, isRecovering: false }
  }

  static getDerivedStateFromError(error: Error): State {
    const isRecovering = tryRecoverDynamicImportError(error)

    return {
      hasError: true,
      error,
      isRecovering,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('Error caught by boundary:', { error, errorInfo })
  }

  handleReload = () => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(CHUNK_RELOAD_FLAG)
      window.location.reload()
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.state.isRecovering && isDynamicImportError(this.state.error)) {
        return (
          <div className="error-boundary p-4 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg shadow-lg">
            <h1 className="text-xl font-bold mb-2">正在恢复应用</h1>
            <p className="mb-2">检测到页面资源已更新，系统正在自动刷新以获取最新版本。</p>
            <p className="text-sm text-blue-600">如果页面没有自动恢复，请稍后手动刷新一次。</p>
          </div>
        )
      }

      return (
        <div className="error-boundary p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg shadow-lg">
          <h1 className="text-xl font-bold mb-2">应用出错了</h1>
          <p className="mb-4">我们很抱歉，应用发生了一个错误。</p>
          <p className="text-sm font-mono mb-4">{this.state.error?.message}</p>
          <button
            onClick={this.handleReload}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            刷新页面
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
