import request from '@/common/request'
import type { Option } from 'artplayer-plugin-danmuku'

/**
 * 需要跨设备记忆的弹幕偏好字段。
 *
 * 只挑**用户能改的展示偏好**：danmuku（弹幕数据）每次播放动态生成，
 * emitter / mount 是播放器集成方式，都不该跟着账号走。
 */
export const PERSISTED_KEYS = [
  'visible',
  'speed',
  'opacity',
  'fontSize',
  'margin',
  'mode',
  'color',
  'antiOverlap',
] as const

export type DanmakuSettings = Partial<Pick<Option, (typeof PERSISTED_KEYS)[number]>>

/** 读取当前账号的弹幕偏好；从未设置过返回空对象 */
export function getDanmakuSettings() {
  return request.get<DanmakuSettings>({
    url: '/user/danmaku-settings',
  })
}

/**
 * 保存弹幕偏好（**合并**语义）。
 *
 * 只提交改动过的字段：服务端按字段合并，避免换设备时把别处的设置冲掉。
 */
export function saveDanmakuSettings(data: DanmakuSettings) {
  return request.patch<DanmakuSettings>({
    url: '/user/danmaku-settings',
    data,
  })
}
