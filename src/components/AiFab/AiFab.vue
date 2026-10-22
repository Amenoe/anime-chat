<template>
  <!--
    全屏播放页（/room）不显示：它会挡在视频和弹幕上，而放映室里最忌讳遮挡。
    已经在 /ai 页时也不显示 —— 那本来就是完整助手，再叠一个气泡纯属干扰。
  -->
  <button
    v-if="!hidden"
    v-track="'ai.fab.open'"
    class="ai-fab"
    :class="{ 'ai-fab--pop': popping }"
    aria-label="打开番剧助手"
    @click="onOpenFab"
    @animationend="finishPop"
  >
    <img class="ai-fab__img" :src="whaleImg" alt="" draggable="false" />
  </button>

  <el-drawer
    v-model="open"
    direction="rtl"
    :size="drawerSize"
    :with-header="false"
    :append-to-body="true"
    class="ai-fab-drawer"
  >
    <div class="panel">
      <header class="panel__head">
        <div class="panel__title">
          <el-icon><MagicStick /></el-icon>
          <span>番剧助手</span>
        </div>
        <div class="panel__tools">
          <el-tooltip content="新对话" placement="bottom">
            <el-button
              v-track="'ai.fab.new'"
              :icon="Plus"
              circle
              text
              :disabled="store.streaming"
              @click="store.newConversation()"
            />
          </el-tooltip>
          <el-tooltip content="在完整页面打开" placement="bottom">
            <el-button v-track="'ai.fab.expand'" :icon="FullScreen" circle text @click="onExpand" />
          </el-tooltip>
          <el-button :icon="Close" circle text aria-label="收起" @click="open = false" />
        </div>
      </header>

      <!-- 未登录：只给引导，不发任何 /api/ai/* 请求 -->
      <div v-if="!isLogin" class="panel__gate">
        <el-icon :size="34" class="panel__gate-icon"><Key /></el-icon>
        <p class="panel__gate-title">登录后即可使用番剧助手</p>
        <p class="panel__gate-desc">对话记录与推荐卡片会保存在你的账号下。</p>
        <el-button type="primary" @click="openLogin">立即登录</el-button>
      </div>

      <template v-else>
        <div ref="scrollRef" class="panel__body">
          <div v-if="!store.messages.length" class="panel__welcome">
            <p class="panel__welcome-title">想问点什么？</p>
            <div class="panel__chips">
              <button
                v-for="s in suggestions"
                :key="s"
                v-track="{ event: 'ai.suggest.click', props: { text: s, from: 'fab' } }"
                class="panel__chip"
                @click="sendText(s)"
              >
                {{ s }}
              </button>
            </div>
          </div>
          <AiMessageItem v-for="m in store.messages" :key="m.id" :message="m" />
        </div>

        <footer class="panel__composer">
          <el-input
            v-model="draft"
            type="textarea"
            :rows="2"
            resize="none"
            maxlength="2000"
            :disabled="store.streaming"
            placeholder="Enter 发送，Shift+Enter 换行"
            @keydown.enter="onEnter"
          />
          <el-button
            v-if="store.streaming"
            v-track="'ai.stop'"
            :icon="VideoPause"
            @click="store.stop()"
          >
            停止
          </el-button>
          <el-button
            v-else
            v-track="'ai.send.click'"
            type="primary"
            :icon="Promotion"
            :disabled="!draft.trim()"
            @click="onSend"
          >
            发送
          </el-button>
        </footer>
      </template>
    </div>

    <LoginDialog ref="loginRef" />
  </el-drawer>
</template>

<script setup lang="ts">
import {
  Close,
  FullScreen,
  Key,
  MagicStick,
  Plus,
  Promotion,
  VideoPause,
} from '@element-plus/icons-vue'
import whaleImg from '@/assets/images/whale.png'
import pressSound from '@/assets/audio/press.mp3'
import AiMessageItem from '@/views/ai/components/AiMessageItem.vue'
import LoginDialog from '@/components/Login/LoginDialog.vue'
import { useAiStore } from '@/stores/modules/ai'
import { useLoginStore } from '@/stores/modules/login'

/**
 * 全局 AI 悬浮气泡：任意页面都能快速问一句。
 *
 * 设计取舍：
 * - **与会话共享同一个 `ai` store**，不是独立实例。好处是从气泡里问的内容，
 *   切到 /ai 后还在同一条对话里；代价是 `streaming` 等状态也共享 ——
 *   所以关闭抽屉时**不中断生成**（用户可能想让它继续写完）。
 * - 抽屉里**不做会话列表**。它的定位是「快速问一句」，翻历史去 /ai。
 * - 未登录只渲染引导，**不发任何 /api/ai/* 请求**（与 /ai 页同一套门禁策略，
 *   避免登录态缺失时白打一次 401 并弹「请重新登录」）。
 */
defineOptions({ name: 'AiFab' })

const store = useAiStore()
const loginStore = useLoginStore()
const route = useRoute()
const router = useRouter()

const open = ref(false)
/** 播放一次弹性回弹；由 animationend 复位，避免重复点击时动画不重放 */
const popping = ref(false)
/** 音频元素只创建一次：每次点击 new Audio() 会带来看不见的加载与内存开销 */
const pressAudio = ref<HTMLAudioElement | null>(null)
const draft = ref('')
const scrollRef = ref<HTMLElement>()
const loginRef = ref<InstanceType<typeof LoginDialog>>()

const isLogin = computed(() => loginStore.token !== '')
const isMobile = ref(false)

/** 路由名在这个名单里就不显示气泡 */
const hidden = computed(() => ['Ai', 'Room'].includes(String(route.name)))

const drawerSize = computed(() => (isMobile.value ? '100%' : '420px'))

const suggestions = [
  '推荐几部高分科幻番',
  '2026 年 10 月有什么新番',
  '想不起来名字，主角是红发剑士',
]

function syncMobile() {
  isMobile.value = window.innerWidth <= 768
}

onMounted(() => {
  syncMobile()
  window.addEventListener('resize', syncMobile)
  pressAudio.value = new Audio(pressSound)
  pressAudio.value.volume = 0.45
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncMobile)
  if (openTimer !== undefined) window.clearTimeout(openTimer)
})

// 新内容到达就贴底。用 post flush 等 DOM 更新完再算高度，否则拿到的是旧 scrollHeight
watch(
  () => store.messages.map((m) => m.content.length + (m.tool_results?.length || 0)).join(','),
  () => {
    void nextTick(() => {
      const el = scrollRef.value
      if (el) el.scrollTop = el.scrollHeight
    })
  },
  { flush: 'post' },
)

// 抽屉打开时若还没拉过会话，补一次；已登录才发请求
watch(open, (visible) => {
  if (visible && isLogin.value && !store.conversations.length && !store.conversationsLoading) {
    void store.fetchConversations()
  }
})

function sendText(text: string) {
  const content = text.trim()
  if (!content || store.streaming) return
  void store.send(content)
}

function onSend() {
  const text = draft.value
  draft.value = ''
  sendText(text)
}

function onEnter(e: KeyboardEvent) {
  if (e.shiftKey) return
  e.preventDefault()
  if (!store.streaming && draft.value.trim()) onSend()
}

/** 与 CSS 里 fab-pop 的 0.46s 对齐，多留 80ms 给动画事件派发 */
const POP_MS = 460
let openTimer: number | undefined

/**
 * 动画播完**之后**再打开抽屉。
 *
 * 之前是「点击立刻 open、同时播动画」，结果动画刚起手就被抽屉遮罩盖住，等于白做。
 * 现在打开动作挪到 animationend。
 */
function finishPop() {
  if (openTimer !== undefined) {
    window.clearTimeout(openTimer)
    openTimer = undefined
  }
  popping.value = false
  open.value = true
}

/**
 * 按下立绘：播一声「呀」，做完弹性回弹再弹抽屉。
 *
 * 音效**绝不阻断主流程** —— 浏览器可能因自动播放策略拒绝，或被系统静音，
 * 这些都不该让抽屉打不开。
 */
function onOpenFab() {
  // 动画期间忽略连点：否则第二次点击会让抽屉在动画中途打开，回弹也来不及播完
  if (popping.value) return

  const audio = pressAudio.value
  if (audio) {
    try {
      audio.currentTime = 0
      void audio.play().catch(() => undefined)
    } catch {
      /* 静默：音效是锦上添花 */
    }
  }

  // 系统开了「减少动态效果」时 CSS 会禁用动画，animationend 永远不会来 —— 直接打开
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    open.value = true
    return
  }

  popping.value = true
  // 兜底：动画被中断或元素重渲染导致 animationend 丢失时，不能让用户点了没反应
  openTimer = window.setTimeout(finishPop, POP_MS + 80)
}

function onExpand() {
  open.value = false
  void router.push('/ai')
}

function openLogin() {
  if (loginRef.value) loginRef.value.dialogVisible = true
}
</script>

<style scoped lang="less">
/*
 * 不做成圆形头像：这里是一个**透明立绘**（像桌面挂件那样立在页面角上），
 * 所以没有背景、没有边框、没有圆角，投影用 drop-shadow 沿人物轮廓走而不是方形阴影。
 *
 * 位移用独立的 translate、缩放用独立的 scale —— 这样 hover 的抬升与点击回弹
 * 可以同时生效，不会因为都在 transform 里而互相覆盖（动画期间 hover 位移被吃掉）。
 */
.ai-fab {
  position: fixed;
  right: 16px;
  bottom: 4px;
  z-index: 1800;
  width: 128px;
  height: 128px;
  padding: 0;
  cursor: pointer;
  background: transparent;
  border: 0;
  // 触摸端消除点击延迟与双击缩放，否则手机上按下去会有明显的「不跟手」
  touch-action: manipulation;
  translate: 0 0;
  scale: 1;
  filter: drop-shadow(0 8px 14px rgb(0 0 0 / 35%));
  transition: translate 0.22s ease, scale 0.22s ease, filter 0.22s ease;

  &:hover {
    translate: 0 -5px;
    scale: 1.04;
    filter: drop-shadow(0 16px 24px rgb(104 198 189 / 45%));
  }

  // 按下即时缩小（松开后由 --pop 做过冲回弹）
  &:active {
    scale: 0.9;
    transition: scale 0.08s ease;
  }

  &__img {
    display: block;
    width: 100%;
    height: 100%;
    // ⚠️ 全局 `assets/css` 里有 `#app img { object-fit: cover }`，
    // 是 ID 选择器，优先级压过任何 class 规则 —— 不加 !important 这里永远不生效。
    // 立绘必须完整显示、不能被裁切，所以显式提权。
    object-fit: contain !important;
    user-select: none;
    // 点击必须落在 button 上，否则 v-track 与 click 都拿不到
    pointer-events: none;
  }
}

/*
 * 弹性回弹：按下 → 过冲 → 回落。
 * 关键帧比单纯 transition 更像「果冻」，配合带过冲的 cubic-bezier 再补一层惯性。
 */
@keyframes fab-pop {
  0% {
    transform: scale(1);
  }
  28% {
    transform: scale(0.86);
  }
  60% {
    transform: scale(1.1);
  }
  82% {
    transform: scale(0.96);
  }
  100% {
    transform: scale(1);
  }
}

.ai-fab--pop {
  animation: fab-pop 0.46s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/*
 * 小屏适配：立绘缩小并贴近角落。
 * 128px 在手机上会占掉右下角相当一块可点区域，而那里的内容（卡片、播放控件）
 * 本来就更挤 —— 宁可让它小一点，也别挡住用户要点的东西。
 */
@media (max-width: 768px) {
  .ai-fab {
    right: 10px;
    bottom: 8px;
    width: 96px;
    height: 96px;
  }
}

@media (max-width: 480px) {
  .ai-fab {
    right: 8px;
    bottom: 6px;
    width: 80px;
    height: 80px;
  }
}

// 尊重系统的「减少动态效果」设置
@media (prefers-reduced-motion: reduce) {
  .ai-fab--pop {
    animation: none;
  }

  .ai-fab {
    transition: none;
  }
}

.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: var(--font-color);

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--aside-bg-color);
  }

  &__title {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 15px;
    font-weight: 600;
    color: var(--primary-color);
  }

  &__tools {
    display: flex;
    gap: 2px;
    align-items: center;
  }

  &__gate {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 10px;
    align-items: center;
    justify-content: center;
    padding: 24px;
    text-align: center;
  }

  &__gate-icon {
    color: var(--primary-color);
  }

  &__gate-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }

  &__gate-desc {
    margin: 0;
    font-size: 13px;
    color: var(--font-unactive-color);
  }

  &__body {
    flex: 1;
    padding: 16px;
    overflow-y: auto;
  }

  &__welcome {
    padding: 8px 0 16px;
  }

  &__welcome-title {
    margin: 0 0 10px;
    font-size: 14px;
    color: var(--font-unactive-color);
  }

  &__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__chip {
    padding: 6px 12px;
    font-size: 13px;
    color: var(--font-color);
    cursor: pointer;
    background: var(--aside-bg-color);
    border: 1px solid transparent;
    border-radius: 14px;
    transition: border-color 0.18s ease;

    &:hover {
      border-color: var(--primary-color);
    }
  }

  &__composer {
    display: flex;
    gap: 8px;
    align-items: flex-end;
    padding: 12px 16px 16px;
    border-top: 1px solid var(--aside-bg-color);
  }
}
</style>
