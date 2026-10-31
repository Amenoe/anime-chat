/* eslint-disable */
/// <reference types="vite/client" />

//环境变量的类型提示
interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string
  readonly VITE_BASE_URL: string
  readonly VITE_BASE_API: string
  readonly VITE_TIME_OUT: number
}
