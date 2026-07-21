<template>
  <router-view v-slot="{ Component }">
    <transition :name="transition">
      <keep-alive include="Search">
        <component :is="Component" />
      </keep-alive>
    </transition>
  </router-view>
</template>

<script setup lang="ts">
import { useRouteStore } from '@/stores/modules/route'
import { useRoute } from 'vue-router'
const route = useRoute()
const routeStore = useRouteStore()
const routePaths = routeStore.getRoutePath
const transition = ref('')
watch(
  () => route.fullPath,
  (toName, fromName) => {
    toName = String(toName)
    fromName = String(fromName)
    const toDepth = routePaths.findIndex((path) => toName.includes(path))
    const fromDepth = routePaths.findIndex((path) => fromName.includes(path))
    if (fromDepth === -1 || toDepth === -1) {
      transition.value = ''
    } else {
      transition.value = toDepth > fromDepth ? 'flod-up' : 'flod-down'
    }
  },
)
</script>

<style scoped lang="less">
@RouteDelay: 0.25s;
/* absolute 过渡时必须撑满 main，否则内容按 intrinsic 宽度挤在左侧再展开 */
.base {
  position: absolute !important;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}
.flod-up {
  &-enter-active {
    .base();
    animation: flod-up-in @RouteDelay;
  }
  &-leave-active {
    .base();
    animation: flod-up-out @RouteDelay;
  }
}

.flod-down {
  &-enter-active {
    .base();
    animation: flod-down-in @RouteDelay;
  }
  &-leave-active {
    .base();
    animation: flod-down-out @RouteDelay;
  }
}

@keyframes flod-up-in {
  from {
    transform: translate3d(0, 100%, 0);
  }

  to {
    transform: translate3d(0, 0, 0);
  }
}

@keyframes flod-up-out {
  from {
    transform: translate3d(0, 0, 0);
  }

  to {
    transform: translate3d(0, -100%, 0);
  }
}

@keyframes flod-down-in {
  from {
    transform: translate3d(0, -100%, 0);
  }

  to {
    transform: translate3d(0, 0, 0);
  }
}

@keyframes flod-down-out {
  from {
    transform: translate3d(0, 0, 0);
  }

  to {
    transform: translate3d(0, 100%, 0);
  }
}
</style>
