/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_TELEGRAM_BOT_USERNAME?: string
  readonly VITE_TELEGRAM_BOT_TOKEN?: string
  readonly VITE_SENTRY_DSN?: string
  readonly VITE_API_BASE_URL?: string
  readonly VITE_API_TIMEOUT?: string
  readonly VITE_BUILD_MODE?: string
  readonly VITE_ENABLE_DEBUG_MODE?: string
  readonly VITE_LOG_LEVEL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const __APP_VERSION__: string
