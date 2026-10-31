import Icon from '@/components/Icon/Icon.vue'

// 全局组件定义，此项需配合volar插件使用
declare module 'vue' {
  export interface GlobalComponents {
    Icon: typeof Icon
  }
}
