<template>
  <div class="ai-msg" :class="[`ai-msg--${message.role}`, { 'ai-msg--failed': message.failed }]">
    <div class="ai-msg__avatar">
      <!-- 用户侧同步登录头像；助手侧保持固定图标 -->
      <el-avatar v-if="message.role === 'user'" :size="32" :src="userAvatar" />
      <el-icon v-else><MagicStick /></el-icon>
    </div>

    <div class="ai-msg__main">
      <!-- 用户消息是纯文本，不走 Markdown（避免用户输入的符号被当格式解析） -->
      <div v-if="message.role === 'user'" class="ai-msg__bubble">{{ message.content }}</div>

      <template v-else>
        <div v-if="message.content" class="ai-msg__markdown" v-html="renderedContent" />
        <!-- 首字到达前显示「正在思考」，避免一片空白让人以为卡住 -->
        <div v-else-if="message.pending" class="ai-msg__thinking">
          <span class="ai-msg__dot" />
          <span class="ai-msg__dot" />
          <span class="ai-msg__dot" />
          <span class="ai-msg__thinking-text">正在思考…</span>
        </div>

        <!--
          只展示**回答里真正推荐的那几部**（模型被要求带上 id），而不是工具的全部候选。
          工具可能一次取回 20 条供模型按标签筛选，全铺出来会变成一堵卡片墙、
          把文字回答挤出视口，而且与回答内容对不上 —— 实测踩到。超出的仍折起来。
        -->
        <div v-if="recommendedCards.length" class="ai-msg__cards">
          <AiAnimeCard v-for="card in visibleCards" :key="card.id" :card="card" />
        </div>
        <button
          v-if="hiddenCount > 0 || expanded"
          class="ai-msg__more"
          @click="expanded = !expanded"
        >
          {{ expanded ? '收起' : `还有 ${hiddenCount} 部，展开看看` }}
        </button>

        <span v-if="message.pending && message.content" class="ai-msg__caret" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { MagicStick } from '@element-plus/icons-vue'
import type { PropType } from 'vue'
import { renderMarkdown } from '@/utils/markdown'
import { resolveAvatarUrl } from '@/utils/avatar'
import { useLoginStore } from '@/stores/modules/login'
import AiAnimeCard from './AiAnimeCard.vue'
import type { IAiChatMessage } from '@/stores/modules/ai'

const props = defineProps({
  message: {
    type: Object as PropType<IAiChatMessage>,
    required: true,
  },
})

const loginStore = useLoginStore()
const userAvatar = computed(() => resolveAvatarUrl(loginStore.userInfo?.avatar))

/** 折叠时最多展示几张卡片 */
const COLLAPSED_LIMIT = 6

/**
 * 从回答文本里抽出提到的 subject id。
 *
 * 模型被要求「提到的番剧必须带上工具返回的 id」，实测它会写成
 * `（id 501963）` / `（id 501963，评分 8.0）` 这类形式。
 * 之所以靠解析而不是让模型再调一个「提交推荐」工具：省一轮往返与 token，
 * 而且 id 本来就已经写在回答里了。
 */
function extractMentionedIds(text: string): number[] {
  const ids: number[] = []
  const re = /\bid\s*[:：]?\s*(\d{2,})/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1])
    if (Number.isSafeInteger(n) && !ids.includes(n)) ids.push(n)
  }
  return ids
}

/**
 * 回答里真正推荐的番剧卡片。
 *
 * 关键：**只从工具返回的池子里按 id 挑**，所以模型即便编了 id 也变不出卡片 ——
 * 「模型不产生番剧事实」这条原则在这里兜住。
 * 一个 id 都没提（例如模型只做泛泛介绍）时退回展示候选池，避免什么都不显示。
 */
const recommendedCards = computed(() => {
  const pool = props.message.tool_results ?? []
  if (!pool.length) return []
  const ids = extractMentionedIds(props.message.content)
  if (!ids.length) return pool
  const byId = new Map(pool.map((c) => [String(c.id), c]))
  const picked = ids
    .map((id) => byId.get(String(id)))
    .filter((c): c is (typeof pool)[number] => !!c)
  return picked.length ? picked : pool
})

const expanded = ref(false)
const visibleCards = computed(() =>
  expanded.value ? recommendedCards.value : recommendedCards.value.slice(0, COLLAPSED_LIMIT),
)
const hiddenCount = computed(() => Math.max(0, recommendedCards.value.length - COLLAPSED_LIMIT))

/** 流式过程中每来一个增量都会重算；markdown-it 很快，这里不做节流 */
const renderedContent = computed(() =>
  props.message.role === 'assistant' ? renderMarkdown(props.message.content) : '',
)
</script>

<style scoped lang="less">
.ai-msg {
  display: flex;
  gap: 10px;
  padding: 12px 0;

  &--user {
    flex-direction: row-reverse;

    // 用户侧是 el-avatar（图片），不需要底色圆底
    .ai-msg__avatar {
      background: transparent;
    }

    .ai-msg__main {
      align-items: flex-end;
    }
  }

  &__avatar {
    flex: 0 0 32px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--aside-bg-color);
    color: var(--font-color);
    font-size: 16px;
  }

  &__main {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    max-width: 100%;
  }

  &__bubble {
    max-width: 560px;
    padding: 8px 12px;
    border-radius: 10px;
    background: var(--primary-color);
    color: var(--on-primary, #1e1d2b);
    font-size: 14px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }

  // Markdown 内容：间距收紧一点，贴近聊天气泡而不是文档
  &__markdown {
    font-size: 14px;
    line-height: 1.7;
    color: var(--font-color);
    word-break: break-word;

    :deep(p) {
      margin: 0 0 8px;
    }
    :deep(p:last-child) {
      margin-bottom: 0;
    }
    :deep(ul),
    :deep(ol) {
      margin: 4px 0 8px;
      padding-left: 20px;
    }
    :deep(li) {
      margin: 2px 0;
    }
    :deep(code) {
      padding: 1px 4px;
      border-radius: 4px;
      background: var(--aside-bg-color);
      font-size: 13px;
    }
    :deep(pre) {
      margin: 8px 0;
      padding: 10px;
      border-radius: 8px;
      background: var(--aside-bg-color);
      overflow-x: auto;
    }
    :deep(pre code) {
      padding: 0;
      background: none;
    }
    :deep(a) {
      color: var(--primary-color);
    }
    :deep(strong) {
      color: var(--primary-color);
    }
    :deep(blockquote) {
      margin: 8px 0;
      padding-left: 10px;
      border-left: 3px solid var(--primary-color);
      color: var(--font-unactive-color);
    }
  }

  &__cards {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__more {
    align-self: flex-start;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 12px;
    color: var(--primary-color);
    background: transparent;
    border: 1px dashed rgba(104, 198, 189, 0.5);
    cursor: pointer;
    transition: background 0.2s;

    &:hover {
      background: rgba(104, 198, 189, 0.12);
    }
  }

  &__thinking {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    color: var(--font-unactive-color);
  }

  &__thinking-text {
    margin-left: 4px;
  }

  &__dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--primary-color);
    animation: ai-dot 1.2s infinite ease-in-out;

    &:nth-child(2) {
      animation-delay: 0.15s;
    }
    &:nth-child(3) {
      animation-delay: 0.3s;
    }
  }

  &__caret {
    display: inline-block;
    width: 6px;
    height: 14px;
    vertical-align: text-bottom;
    background: var(--primary-color);
    animation: ai-caret 1s steps(2) infinite;
  }

  &--failed {
    .ai-msg__markdown {
      color: var(--el-color-danger);
    }
  }
}

@keyframes ai-dot {
  0%,
  60%,
  100% {
    opacity: 0.3;
    transform: translateY(0);
  }
  30% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

@keyframes ai-caret {
  0%,
  50% {
    opacity: 1;
  }
  50.01%,
  100% {
    opacity: 0;
  }
}
</style>
