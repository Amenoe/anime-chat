<template>
  <div class="app-container">
    <AppHeader></AppHeader>
    <aside class="app-container__aside" :class="{ hide: !asideVisible }">
      <!-- 切换按钮 -->
      <div
        class="switch"
        :title="asideVisible ? '隐藏' : '展开'"
        @click="asideVisible = !asideVisible"
      ></div>
      <!-- 侧边标题 -->
      <b v-show="asideVisible" class="animate__jello">{{ WEB_NAME }}</b>
      <AppAsideBar v-show="asideVisible" :side-list="sideList" />
    </aside>
    <main class="app-container__main">
      <AppRouter />
    </main>
  </div>
</template>

<script setup lang="ts">
import AppAsideBar from '@/layout/AppAsideBar.vue'
import AppRouter from '@/layout/AppRouter.vue'
import AppHeader from '@/layout/AppHeader.vue'
import { useRouteStore } from '@/stores/modules/route'
const WEB_NAME = import.meta.env.VITE_APP_TITLE
const routeStore = useRouteStore()
const sideList = routeStore.routeList

const asideVisible = ref(window.innerWidth > 768)

const onResize = () => {
  asideVisible.value = window.innerWidth > 768
}
onMounted(() => window.addEventListener('resize', onResize))
onUnmounted(() => window.removeEventListener('resize', onResize))
</script>
<style lang="less">
@import '~styles/app';
@import '~styles/common';
</style>
<style scoped lang="less">
@frameTop: 40px;
@slideDruation: 0.625s;

.app-container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  background: var(--bg-color);
  color: var(--font-color);
  &__aside {
    display: flex;
    flex-direction: column;
    width: 280px;
    height: calc(100% - @frameTop*2);
    background: var(--aside-bg-color);
    border-radius: var(--df-radius);
    padding-left: @frameTop;
    box-sizing: border-box;
    animation: slide-in @slideDruation forwards;
    transition: all 0.25s;
    &.hide {
      width: 80px;
    }
    & > b {
      display: flex;
      justify-content: center;
      align-items: center;
      width: 100%;
      aspect-ratio: 2/1;
      font-size: 30px;
      animation-duration: 1.25s;
      animation-delay: @slideDruation;
    }
    .switch {
      position: absolute;
      top: 0;
      right: 8px;
      bottom: 0;
      margin: auto 0;
      width: 20px;
      height: 100px;
      cursor: pointer;
      &::before {
        .mask(1,var(--font-color));
        right: 0;
        margin: 0 auto;
        width: 5px;
        height: 100%;
        border-radius: 20px;
        opacity: 0.6;
        transition: all 0.25s;
      }
      &:hover::before {
        opacity: 0.8;
      }
    }
    @keyframes slide-in {
      from {
        transform: translateX(-100%);
      }
      to {
        transform: translateX(-@frameTop);
      }
    }
  }
  &__main {
    margin-top: @frameTop;
    margin-bottom: @frameTop;
    box-sizing: border-box;
    height: calc(100% - @frameTop * 2);
    border-radius: var(--df-radius);
    flex: 1;
    overflow: hidden;
    position: relative;
    opacity: 0;
    animation: fade-in 1s @slideDruation forwards;
    @keyframes fade-in {
      to {
        opacity: 1;
      }
    }
  }
}

@media (max-width: 768px) {
  .app-container {
    &__aside {
      position: fixed;
      z-index: 100;
      left: 0;
      top: 0;
      height: 100%;
      border-radius: 0;
      &.hide {
        transform: translateX(-100%) !important;
        width: 280px;
      }
    }
    &__main {
      margin: 10px;
      height: calc(100% - 20px);
      border-radius: 12px;
    }
  }
}
</style>
