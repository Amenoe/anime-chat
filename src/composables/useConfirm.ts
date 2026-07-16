import { reactive } from 'vue'

export type ConfirmOptions = {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  /** danger：确认按钮用危险色；默认 primary */
  type?: 'primary' | 'danger'
}

type ConfirmState = ConfirmOptions & {
  visible: boolean
  resolve: ((ok: boolean) => void) | null
}

const state = reactive<ConfirmState>({
  visible: false,
  title: '请确认',
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  type: 'primary',
  resolve: null,
})

/** 供 AppConfirmHost 绑定 UI */
export function useConfirmState() {
  return state
}

/**
 * 通用二次确认（Promise）
 * @example
 * const ok = await appConfirm({ message: '确认修改？' })
 * if (!ok) return
 */
export function appConfirm(options: ConfirmOptions | string): Promise<boolean> {
  const opts = typeof options === 'string' ? { message: options } : options
  return new Promise((resolve) => {
    // 若上一次未关闭，先以 false 收尾
    if (state.resolve) {
      state.resolve(false)
    }
    state.title = opts.title ?? '请确认'
    state.message = opts.message
    state.confirmText = opts.confirmText ?? '确定'
    state.cancelText = opts.cancelText ?? '取消'
    state.type = opts.type ?? 'primary'
    state.resolve = resolve
    state.visible = true
  })
}

export function resolveConfirm(ok: boolean) {
  state.visible = false
  const r = state.resolve
  state.resolve = null
  r?.(ok)
}
