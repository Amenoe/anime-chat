<template>
  <div id="ai" class="page ai-page">
    <!--
      未登录：整页只放登录引导，**不渲染对话区**。
      与个人中心同款做法（`User.vue` 的 `v-if="isLogin"`）：
      一是后端 AI 接口本来就要求 JWT，渲染出来只会白挨 401 并把界面刷成错误态；
      二是对话历史属于隐私，没有「先看看再说」的合理形态。
    -->
    <div v-if="!isLogin" class="ai-gate">
      <el-icon class="ai-gate__icon"><MagicStick /></el-icon>
      <h2 class="ai-gate__title">登录后使用 AI 助手</h2>
      <p class="ai-gate__desc">AI 助手会读取你的对话历史，并计入每日对话配额，所以需要先登录。</p>
      <p class="ai-gate__hint">不登录也可以用「搜索」和首页浏览找番</p>
      <el-button type="primary" size="large" :icon="Key" @click="openLogin"> 立即登录 </el-button>
    </div>

    <template v-else>
      <!-- 左：会话列表 -->
      <aside class="ai-aside" :class="{ 'ai-aside--open': asideOpen }">
        <div class="ai-aside__head">
          <span class="ai-aside__title">对话</span>
          <el-button v-track="'ai.conversation.new'" size="small" :icon="Plus" text @click="onNew">
            新对话
          </el-button>
        </div>

        <div v-loading="store.conversationsLoading" class="ai-aside__list">
          <div
            v-for="item in store.conversations"
            :key="item.id"
            v-track="{ event: 'ai.conversation.open', props: { title: item.title } }"
            class="ai-aside__item"
            :class="{ active: item.id === store.activeId }"
            @click="onOpen(item.id)"
          >
            <span class="ai-aside__item-title">{{ item.title || '未命名对话' }}</span>
            <el-icon class="ai-aside__item-del" @click.stop="onRemove(item.id)">
              <Delete />
            </el-icon>
          </div>

          <p
            v-if="!store.conversationsLoading && !store.conversations.length"
            class="ai-aside__empty"
          >
            还没有对话记录
          </p>
        </div>
      </aside>

      <!-- 右：对话区 -->
      <section class="ai-main">
        <header class="ai-main__head">
          <el-button class="ai-main__toggle" :icon="Menu" text @click="asideOpen = !asideOpen" />
          <span class="ai-main__title">AI 助手</span>
          <span class="ai-main__hint">推荐 / 寻找番剧</span>
        </header>

        <el-alert
          v-if="store.errorMsg"
          class="ai-main__alert"
          type="warning"
          :closable="true"
          show-icon
          :title="store.errorMsg"
          @close="store.clearError()"
        />

        <div ref="scrollRef" v-loading="store.historyLoading" class="ai-main__scroll">
          <!-- 空态：给出可点的示例，降低第一次使用门槛 -->
          <!-- `.view` = 曝光埋点：欢迎区进入视口时上报，用于衡量「有多少人真正打开了对话页」 -->
          <div
            v-if="!store.messages.length && !store.historyLoading"
            v-track.view="'ai.welcome.view'"
            class="ai-welcome"
          >
            <el-icon class="ai-welcome__icon"><MagicStick /></el-icon>
            <h2 class="ai-welcome__title">番剧助手</h2>
            <p class="ai-welcome__desc">
              我可以帮你找番、推荐番。推荐结果里的卡片都来自 Bangumi 实时检索，点击可进详情页。
            </p>
            <div class="ai-welcome__chips">
              <button
                v-for="s in suggestions"
                :key="s"
                v-track="{ event: 'ai.suggest.click', props: { text: s } }"
                class="ai-chip"
                @click="onSuggest(s)"
              >
                {{ s }}
              </button>
            </div>
          </div>

          <AiMessageItem v-for="m in store.messages" :key="m.id" :message="m" />
        </div>

        <footer class="ai-main__composer">
          <el-input
            v-model="draft"
            type="textarea"
            :rows="2"
            resize="none"
            maxlength="2000"
            show-word-limit
            :disabled="store.streaming"
            placeholder="问问看，比如「推荐几部高分科幻番」；Enter 发送，Shift+Enter 换行"
            @keydown.enter="onEnter"
          />
          <div class="ai-main__actions">
            <el-button
              v-if="store.streaming"
              v-track="'ai.stop'"
              :icon="VideoPause"
              @click="store.stop()"
            >
              停止生成
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
          </div>
        </footer>
      </section>
    </template>

    <!-- 未登录引导里的「立即登录」用；登录成功后由 isLogin 的 watch 接管后续加载 -->
    <LoginDialog ref="loginRef" @go-register="showRegisterDialog" />
    <RegisterDialog ref="registerRef" />
  </div>
</template>

<script setup lang="ts">
import { Delete, Key, MagicStick, Menu, Plus, Promotion, VideoPause } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import AiMessageItem from './components/AiMessageItem.vue'
import LoginDialog from '@/components/Login/LoginDialog.vue'
import RegisterDialog from '@/components/Login/RegisterDialog.vue'
import { useAiStore } from '@/stores/modules/ai'
import { useLoginStore } from '@/stores/modules/login'

defineOptions({ name: 'Ai' })

const store = useAiStore()
const loginStore = useLoginStore()
const draft = ref('')
const asideOpen = ref(false)
const scrollRef = ref<HTMLElement>()

const isLogin = computed(() => loginStore.token !== '')

const loginRef = ref<InstanceType<typeof LoginDialog>>()
const registerRef = ref<InstanceType<typeof RegisterDialog>>()

function openLogin() {
  if (loginRef.value) loginRef.value.dialogVisible = true
}

function showRegisterDialog() {
  if (registerRef.value) registerRef.value.dialogVisible = true
}

const suggestions = [
  '推荐几部高分科幻番',
  '2023 年有什么好看的动画',
  '帮我找《命运石之门》',
  '想不起来名字，主角是红发剑士，结局很虐',
]

onMounted(() => {
  // 未登录时不发请求：后端必然 401，白白触发一次 token 刷新尝试 + 「请重新登录」弹窗
  if (!isLogin.value) return
  void store.fetchConversations()
})

/**
 * 登录态变化时同步数据。
 *
 * - 登录成功：拉会话列表（原来只在 onMounted 拉一次，走登录引导进来就永远是空的）
 * - 登出：`reset()` 清空，否则同一个标签页换账号后能看到**上一个人的会话**
 */
watch(isLogin, (logged) => {
  if (logged) {
    void store.fetchConversations()
  } else {
    store.reset()
  }
})

/** 新内容到达就贴底。用 post flush 等 DOM 更新完再滚，否则算出来的高度是旧的 */
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

function onSend() {
  const text = draft.value
  draft.value = ''
  void store.send(text)
}

/** Enter 发送，Shift+Enter 换行 */
function onEnter(e: KeyboardEvent) {
  if (e.shiftKey) return
  e.preventDefault()
  if (!store.streaming && draft.value.trim()) onSend()
}

function onSuggest(text: string) {
  void store.send(text)
}

function onNew() {
  store.newConversation()
  asideOpen.value = false
}

function onOpen(id: string) {
  void store.openConversation(id)
  asideOpen.value = false
}

async function onRemove(id: string) {
  try {
    await ElMessageBox.confirm('删除后该对话的记录与卡片将无法恢复，确认删除？', '删除对话', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await store.removeConversation(id)
    ElMessage.success('已删除')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '删除失败')
  }
}
</script>

<style scoped lang="less">
@import '~styles/page';

.ai-page {
  display: flex;
  gap: 16px;
  padding: 16px 24px;
  // .page 自带上下透明边框与 padding，这里覆写为左右布局
  overflow: hidden;
}

/* ── 未登录引导 ───────────────────────────────── */
.ai-gate {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-align: center;
  padding: 24px;

  &__icon {
    font-size: 56px;
    color: var(--primary-color);
    opacity: 0.85;
  }

  &__title {
    margin: 4px 0 0;
    font-size: 20px;
    color: var(--font-color);
  }

  &__desc {
    margin: 0;
    max-width: 420px;
    font-size: 13px;
    line-height: 1.7;
    color: var(--font-unactive-color);
  }

  &__hint {
    margin: 0 0 10px;
    font-size: 12px;
    color: var(--font-unactive-color);
    opacity: 0.7;
  }
}

/* ── 左：会话列表 ─────────────────────────────── */
.ai-aside {
  flex: 0 0 220px;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  background: var(--aside-bg-color);
  overflow: hidden;

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  &__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--font-color);
  }

  &__list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    margin-bottom: 4px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    color: var(--font-unactive-color);
    transition: background 0.2s;

    &:hover {
      background: rgba(104, 198, 189, 0.1);
      color: var(--font-color);
    }

    &.active {
      background: rgba(104, 198, 189, 0.16);
      color: var(--font-color);
    }
  }

  &__item-title {
    flex: 1;
    min-width: 0;
    .p-truncate(1);
  }

  &__item-del {
    opacity: 0;
    transition: opacity 0.2s;
  }

  &__item:hover &__item-del {
    opacity: 0.7;
  }

  &__empty {
    margin: 24px 0;
    text-align: center;
    font-size: 12px;
    color: var(--font-unactive-color);
  }
}

/* ── 右：对话区 ───────────────────────────────── */
.ai-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  background: var(--aside-bg-color);
  overflow: hidden;

  &__head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  &__toggle {
    display: none;
  }

  &__title {
    font-size: 15px;
    font-weight: 600;
    color: var(--font-color);
  }

  &__hint {
    font-size: 12px;
    color: var(--font-unactive-color);
  }

  &__alert {
    margin: 8px 16px 0;
  }

  &__scroll {
    flex: 1;
    overflow-y: auto;
    padding: 8px 16px 16px;
  }

  &__composer {
    padding: 12px 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 8px;
  }
}

/* ── 空态 ─────────────────────────────────────── */
.ai-welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 16px;

  &__icon {
    font-size: 40px;
    color: var(--primary-color);
  }

  &__title {
    margin: 12px 0 6px;
    font-size: 20px;
    font-weight: 600;
    color: var(--font-color);
  }

  &__desc {
    max-width: 460px;
    margin: 0;
    font-size: 13px;
    line-height: 1.7;
    text-align: center;
    color: var(--font-unactive-color);
  }

  &__chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    margin-top: 20px;
  }
}

.ai-chip {
  padding: 6px 12px;
  border-radius: 16px;
  font-size: 13px;
  color: var(--font-color);
  background: transparent;
  border: 1px solid rgba(104, 198, 189, 0.45);
  cursor: pointer;
  transition: all 0.25s;

  &:hover {
    background: rgba(104, 198, 189, 0.14);
    box-shadow: 0 0 12px rgba(104, 198, 189, 0.15);
  }
}

/* ── 窄屏：会话列表改为抽屉 ───────────────────── */
@media (max-width: 768px) {
  .ai-page {
    padding: 12px;
  }

  .ai-aside {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 10;
    transform: translateX(-100%);
    transition: transform 0.25s;

    &--open {
      transform: translateX(0);
    }
  }

  .ai-main__toggle {
    display: inline-flex;
  }
}
</style>
