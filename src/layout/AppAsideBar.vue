<template>
  <ul class="app-aside__bar">
    <li class="app-aside__bar-slider" :style="sliderStyle"></li>
    <li
      v-for="{ name, routeName, icon } in sideList"
      :key="routeName"
      class="app-aside__bar-item"
      :class="{ active: $route.name === routeName }"
    >
      <a
        class="app-aside__bar-link"
        :href="hrefOf(routeName)"
        @click="onNavClick($event, routeName)"
      >
        <Icon :name="icon" />
        <p>{{ name }}</p>
      </a>
    </li>
  </ul>
</template>

<script setup lang="ts">
import type { CSSProperties, PropType } from 'vue'
import { useLeaveRoomGuard } from '@/composables/useLeaveRoomGuard'

interface IRouteList {
  name: string
  routeName: string
  routePath: string
  icon: string
}

const props = defineProps({
  sideList: {
    type: Array as PropType<IRouteList[]>,
    default: () => [],
  },
})

const $route = useRoute()
const $router = useRouter()
const { guardLeaveRoom } = useLeaveRoomGuard()

/** a 标签真实 href：默认点击走 SPA，中键 / Cmd+点击可新开标签页 */
function hrefOf(routeName: string): string {
  return $router.resolve({ name: routeName }).href
}

async function onNavClick(e: MouseEvent, routeName: string) {
  // 中键 / Ctrl / Cmd / Shift 点击：交给浏览器新开标签页，不拦截
  if (e.button === 1 || e.metaKey || e.ctrlKey || e.shiftKey) return
  e.preventDefault()
  const ok = await guardLeaveRoom()
  if (!ok) return
  $router.push({ name: routeName })
}

const sliderStyle = computed(() => {
  const routeIndex = props.sideList.findIndex((item) => $route.fullPath.includes(item.routePath))
  return {
    transform: `translate(
          ${!~routeIndex ? -100 : 0}%,
          ${!~routeIndex ? 0 : routeIndex * 100}%
        )`,
  } as CSSProperties
})
</script>

<style lang="less" scoped>
.app-aside__bar {
  @fontSize: 16px;
  @liPadding: 26px;
  @liHeight: 48px;
  position: relative;
  font-size: @fontSize;
  user-select: none;
  &-slider {
    position: absolute;
    top: 0;
    left: 0;
    width: calc(@liPadding + @fontSize*2);
    height: @liHeight;
    background: var(--primary-color);
    z-index: -1;
    border-top-right-radius: 12px;
    border-bottom-right-radius: 12px;
    transition: all 0.25s;
  }
  &-item {
    width: 100%;
    height: @liHeight;
    padding: 0 @liPadding;
    box-sizing: border-box;
    cursor: pointer;
    color: var(--font-unactive-color);
    transition: all 0.25s;

    &.active {
      color: var(--font-color);
      i {
        color: #fff;
      }
    }
  }
  &-link {
    display: flex;
    align-items: center;
    width: 100%;
    height: 100%;
    text-decoration: none;
    color: inherit;

    &:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: -2px;
    }
    i {
      width: @fontSize;
      height: @fontSize;
      margin-right: @fontSize;
    }
    p {
      line-height: @fontSize;
      margin-left: 16px;
    }
  }
}
</style>
