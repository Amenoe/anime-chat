/**
 * 轻量弹幕引擎。
 *
 * <h2>为什么不用现成插件</h2>
 * 试过 `artplayer-plugin-danmuku`，但本仓的 pnpm store 版本（v10）与当前 pnpm（v11）
 * 冲突，装包要求重装整个 node_modules；需求本身也不复杂（滚动/顶部/底部三种），
 * 自己实现反而更可控：无额外依赖、能精确处理暂停与 seek。
 *
 * <h2>三个容易做错的点</h2>
 * 1. **暂停要冻结**：只停止发射是不够的，正在飞的那批也要停 —— 用
 *    `animation-play-state` 而不是 `animation: none`，后者会让元素瞬间跳回起点。
 * 2. **seek 要重置游标**：往回拖进度条时，游标必须回退，否则后面的弹幕永远不再出现。
 * 3. **轨道要错开**：同一时刻多条弹幕压在一行会糊成一片，按轨道轮转 + 最小间隔。
 */

export interface DanmakuItem {
  /** 出现时间（秒） */
  time: number
  /** 0=滚动 1=顶部 2=底部 */
  type: 0 | 1 | 2
  /** #rrggbb */
  color: string
  text: string
}

export interface DanmakuOptions {
  /** 滚动一条横穿屏幕的时长（秒），越大越慢 */
  duration?: number
  /** 字号（px） */
  fontSize?: number
  /** 同屏最多几条（防极端集刷屏） */
  maxOnScreen?: number
}

const DEFAULTS: Required<DanmakuOptions> = {
  duration: 9,
  fontSize: 22,
  maxOnScreen: 80,
}

/** 一条弹幕的存活记录，用于回收与轨道占用判断 */
interface LiveItem {
  el: HTMLElement
  track: number
  /** 该条彻底离开屏幕的时间点（视频时间，秒） */
  endsAt: number
}

export class DanmakuLayer {
  private readonly root: HTMLElement
  private readonly opts: Required<DanmakuOptions>
  private items: DanmakuItem[] = []
  /** 下一条待发射的下标 */
  private cursor = 0
  /** 上一帧的视频时间，用于判断 seek */
  private lastTime = 0
  /** 滚动轨道的下一次可用时间（视频时间） */
  private trackFreeAt: number[] = []
  private live: LiveItem[] = []
  private enabled = true
  private paused = false

  constructor(container: HTMLElement, options: DanmakuOptions = {}) {
    this.opts = { ...DEFAULTS, ...options }
    this.root = document.createElement('div')
    this.root.className = 'danmaku-layer'
    // 弹幕层必须完全透明于鼠标事件，否则播放器的进度条/控件点不到
    this.root.style.cssText =
      'position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:9;'
    container.appendChild(this.root)
  }

  /** 换集时整体替换 */
  setItems(items: DanmakuItem[]): void {
    this.items = [...items].sort((a, b) => a.time - b.time)
    this.reset(0)
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    this.root.style.display = enabled ? '' : 'none'
    if (!enabled) this.clear()
  }

  isEnabled(): boolean {
    return this.enabled
  }

  /** 播放/暂停时调用：冻结正在飞的弹幕，而不是清掉它们 */
  setPaused(paused: boolean): void {
    this.paused = paused
    for (const item of this.live) {
      item.el.style.animationPlayState = paused ? 'paused' : 'running'
    }
  }

  /** seek 后重置：清空在飞的，并把游标定位到目标时间附近 */
  reset(currentTime: number): void {
    this.clear()
    this.lastTime = currentTime
    // 二分找第一条 time >= currentTime 的弹幕
    let lo = 0
    let hi = this.items.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (this.items[mid].time < currentTime) lo = mid + 1
      else hi = mid
    }
    this.cursor = lo
    this.trackFreeAt = []
  }

  /** 由 video 的 timeupdate 驱动 */
  update(currentTime: number): void {
    if (!this.enabled) return

    // 往回跳（seek 回退）或跳跃过大（快进）都重置，否则会漏发/错发
    const delta = currentTime - this.lastTime
    if (delta < 0 || delta > 2) {
      this.reset(currentTime)
      return
    }
    this.lastTime = currentTime
    if (this.paused) return

    this.recycle(currentTime)

    // 发射到期的弹幕；上限防止一次补太多
    let emitted = 0
    while (this.cursor < this.items.length && this.items[this.cursor].time <= currentTime) {
      if (emitted++ > 20) break
      this.emit(this.items[this.cursor++], currentTime)
    }
  }

  /** 清掉在飞的弹幕 */
  clear(): void {
    for (const item of this.live) item.el.remove()
    this.live = []
    this.root.innerHTML = ''
  }

  destroy(): void {
    this.clear()
    this.root.remove()
  }

  private recycle(currentTime: number): void {
    if (!this.live.length) return
    const alive: LiveItem[] = []
    for (const item of this.live) {
      // 留 1 秒余量，避免动画还没走完就被移除造成闪一下
      if (currentTime > item.endsAt + 1) item.el.remove()
      else alive.push(item)
    }
    this.live = alive
  }

  private trackCount(): number {
    const h = this.root.clientHeight || 360
    return Math.max(1, Math.min(8, Math.floor(h / (this.opts.fontSize * 1.7))))
  }

  /**
   * 分配轨道：优先找空闲的；都占用时选最早空出来的。
   * 这样高密度集也不会全压在一行。
   */
  private pickTrack(currentTime: number): number {
    const count = this.trackCount()
    if (this.trackFreeAt.length !== count) this.trackFreeAt = new Array(count).fill(0)
    let best = 0
    for (let i = 0; i < count; i++) {
      if (this.trackFreeAt[i] <= currentTime) return i
      if (this.trackFreeAt[i] < this.trackFreeAt[best]) best = i
    }
    return best
  }

  private emit(item: DanmakuItem, currentTime: number): void {
    if (this.live.length >= this.opts.maxOnScreen) return

    const el = document.createElement('div')
    el.className = `danmaku-item danmaku-item--${item.type}`
    el.textContent = item.text
    el.style.color = item.color || '#fff'
    el.style.fontSize = `${this.opts.fontSize}px`

    const track = this.pickTrack(currentTime)
    const lineHeight = this.opts.fontSize * 1.7

    if (item.type === 0) {
      // 滚动：从右边界外进入，到左边界外消失
      el.style.top = `${track * lineHeight + 6}px`
      el.style.right = '0'
      el.style.transform = 'translateX(100%)'
      el.style.animation = `danmaku-scroll ${this.opts.duration}s linear forwards`
      el.style.animationPlayState = this.paused ? 'paused' : 'running'
      // 轨道占用到这条完全离开为止
      this.trackFreeAt[track] = currentTime + this.opts.duration * 0.35
    } else if (item.type === 1) {
      // 顶部：固定 3 秒，居中
      el.style.top = `${track * lineHeight + 6}px`
      el.style.left = '50%'
      el.style.transform = 'translateX(-50%)'
      el.style.animation = 'danmaku-static 3s linear forwards'
      el.style.animationPlayState = this.paused ? 'paused' : 'running'
      this.trackFreeAt[track] = currentTime + 0.5
    } else {
      // 底部
      el.style.bottom = `${track * lineHeight + 6}px`
      el.style.left = '50%'
      el.style.transform = 'translateX(-50%)'
      el.style.animation = 'danmaku-static 3s linear forwards'
      el.style.animationPlayState = this.paused ? 'paused' : 'running'
      this.trackFreeAt[track] = currentTime + 0.5
    }

    this.root.appendChild(el)
    this.live.push({
      el,
      track,
      endsAt: currentTime + (item.type === 0 ? this.opts.duration : 3),
    })
  }
}
