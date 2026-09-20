<template>
  <div id="ai" class="page">
    <div class="ai-placeholder">
      <img class="ai-placeholder__image" :src="empty" alt="" />

      <h1 class="ai-placeholder__title">AI 助手 · 开发中</h1>
      <p class="ai-placeholder__desc">这里将替换原来的「时间表」页面，提供一个对话式的番剧助手。</p>

      <ul class="ai-placeholder__features">
        <li v-for="feature in features" :key="feature.title" class="ai-placeholder__card">
          <span class="ai-placeholder__card-title">{{ feature.title }}</span>
          <span class="ai-placeholder__card-desc">{{ feature.desc }}</span>
        </li>
      </ul>

      <p class="ai-placeholder__note">每日放送仍可在首页查看；本页能力待后端 AI 模块就绪后接入。</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import empty from '@/assets/images/empty.png'

const features = [
  { title: '推荐番剧', desc: '结合追番记录与最近播放，推荐合口味的作品' },
  { title: '寻找番剧', desc: '用自然语言描述条件，检索并定位到具体条目' },
]
</script>

<style scoped lang="less">
@import '~styles/page';

#ai {
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
}

.ai-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 560px;
  padding: 40px 0;

  &__image {
    width: 160px;
    opacity: 0.7;
  }

  &__title {
    margin: 16px 0 8px;
    font-size: 22px;
    font-weight: 600;
    color: var(--font-color);
  }

  &__desc {
    margin: 0;
    font-size: 14px;
    text-align: center;
    color: var(--font-unactive-color);
  }

  &__features {
    display: flex;
    gap: 16px;
    margin: 28px 0 0;
    padding: 0;
    list-style: none;
  }

  &__card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
    padding: 16px;
    border-radius: 12px;
    background: var(--aside-bg-color);
    border-left: 4px solid var(--primary-color);
    transition: box-shadow 0.25s;

    &:hover {
      box-shadow: 0 0 12px rgba(104, 198, 189, 0.15);
    }
  }

  &__card-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--font-color);
  }

  &__card-desc {
    font-size: 13px;
    line-height: 1.6;
    color: var(--font-unactive-color);
  }

  &__note {
    margin: 24px 0 0;
    font-size: 12px;
    color: var(--font-unactive-color);
  }
}

@media (max-width: 768px) {
  .ai-placeholder {
    &__features {
      flex-direction: column;
    }
  }
}
</style>
