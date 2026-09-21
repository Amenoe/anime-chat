<template>
  <div class="ai-msg" :class="[`ai-msg--${message.role}`, { 'ai-msg--failed': message.failed }]">
    <div class="ai-msg__avatar">
      <el-icon>
        <UserFilled v-if="message.role === 'user'" />
        <MagicStick v-else />
      </el-icon>
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

        <div v-if="message.tool_results?.length" class="ai-msg__cards">
          <AiAnimeCard v-for="card in message.tool_results" :key="card.id" :card="card" />
        </div>

        <span v-if="message.pending && message.content" class="ai-msg__caret" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { MagicStick, UserFilled } from '@element-plus/icons-vue'
import type { PropType } from 'vue'
import { renderMarkdown } from '@/utils/markdown'
import AiAnimeCard from './AiAnimeCard.vue'
import type { IAiChatMessage } from '@/stores/modules/ai'

const props = defineProps({
  message: {
    type: Object as PropType<IAiChatMessage>,
    required: true,
  },
})

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

    .ai-msg__avatar {
      background: var(--primary-color);
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
