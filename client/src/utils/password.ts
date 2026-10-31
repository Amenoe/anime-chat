/**
 * 密码安全规则：≥6 位，须同时包含英文字母与数字（可含中文等其它字符）
 * 注册 / 修改密码共用
 */
export const PASSWORD_HINT = '至少 6 位，须包含英文字母和数字'

export function isStrongPassword(value: string): boolean {
  if (!value || value.length < 6) return false
  const hasLetter = /[A-Za-z]/.test(value)
  const hasDigit = /\d/.test(value)
  return hasLetter && hasDigit
}

/** Element Plus 表单校验器；optional=true 时允许空（修改资料不改密） */
export function passwordRule(optional = false) {
  return {
    validator: (_rule: unknown, value: string, callback: (err?: Error) => void) => {
      const v = (value || '').trim()
      if (!v) {
        if (optional) {
          callback()
          return
        }
        callback(new Error('请输入密码'))
        return
      }
      if (!isStrongPassword(v)) {
        callback(new Error(PASSWORD_HINT))
        return
      }
      callback()
    },
    trigger: 'blur' as const,
  }
}
