/**
 * 昵称规则（与后端 `server/src/user/nickname.ts` 保持同一套）。
 *
 * 昵称是展示名，只挡真正会出问题的输入：1–20 个字符（按 Unicode 码点算，
 * 一个 emoji 算 1 个）、不能有换行/制表等控制字符，首尾空白会被裁掉。
 * 空格、中英文、标点、颜文字、emoji 都可以用。
 */
export const NICKNAME_MAX_LENGTH = 20

export const NICKNAME_HINT = `昵称需为 1-${NICKNAME_MAX_LENGTH} 个字符，不能包含换行等控制字符`

/** 控制字符 + Unicode 行/段分隔符 */
const CONTROL_CHARS = /[\u0000-\u001f\u007f\u2028\u2029]/

export function normalizeNickname(value: string): string {
  return (value ?? '').trim()
}

export function isValidNickname(value: string): boolean {
  const v = normalizeNickname(value)
  if (!v) return false
  if ([...v].length > NICKNAME_MAX_LENGTH) return false
  return !CONTROL_CHARS.test(v)
}

/** Element Plus 表单校验器；「必填」由表单自己的 required 规则负责 */
export function nicknameRule() {
  return {
    validator: (_rule: unknown, value: string, callback: (err?: Error) => void) => {
      const v = normalizeNickname(value)
      if (!v) {
        callback()
        return
      }
      if (!isValidNickname(v)) {
        callback(new Error(NICKNAME_HINT))
        return
      }
      callback()
    },
    trigger: 'blur' as const,
  }
}
