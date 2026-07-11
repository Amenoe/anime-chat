<template>
  <ul class="app-aside__bar">
    <li class="app-aside__bar-slider" :style="sliderStyle"></li>
    <li
      v-for="{ name, routeName, icon } in sideList"
      :key="routeName"
      class="app-aside__bar-item"
      :class="{ active: $route.name === routeName }"
      @click="$router.push({ name: routeName })"
    >
      <Icon :name="icon" />
      <p>{{ name }}</p>
    </li>
  </ul>
</template>

<script setup lang="ts">
import type { CSSProperties, PropType } from 'vue'

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
    display: flex;
    align-items: center;
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
