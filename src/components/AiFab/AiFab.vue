<template>
  <!--
    全屏播放页（/room）不显示：它会挡在视频和弹幕上，而放映室里最忌讳遮挡。
    已经在 /ai 页时也不显示 —— 那本来就是完整助手，再叠一个气泡纯属干扰。
  -->
  <button
    v-if="!hidden"
    v-track="'ai.fab.open'"
    class="ai-fab"
    :aria-label="open ? '收起番剧助手' : '打开番剧助手'"
    @click="open = true"
  >
    <el-icon :size="22"><ChatDotRound /></el-icon>
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
  ChatDotRound,
  Close,
  FullScreen,
  Key,
  MagicStick,
  Plus,
  Promotion,
  VideoPause,
} from '@element-plus/icons-vue'
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
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncMobile)
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

function onExpand() {
  open.value = false
  void router.push('/ai')
}

function openLogin() {
  if (loginRef.value) loginRef.value.dialogVisible = true
}
</script>

<style scoped lang="less">
.ai-fab {
  position: fixed;
  right: 24px;
  bottom: 28px;
  z-index: 1800;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  padding: 0;
  color: #fff;
  cursor: pointer;
  background: var(--primary-color);
  border: 0;
  border-radius: 50%;
  box-shadow: 0 6px 18px rgb(0 0 0 / 22%);
  transition: transform 0.18s ease, box-shadow 0.18s ease;

  &:hover {
    transform: translateY(-2px);
    // 与全站卡片一致的 hover 光晕
    box-shadow: 0 8px 22px rgb(104 198 189 / 45%);
  }

  &:active {
    transform: translateY(0);
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
