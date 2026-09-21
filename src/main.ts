import { createApp } from 'vue'

import App from './App.vue'
import router from './router'
import pinia, { setupRouter } from './stores'
import { useTheme } from './composables/useTheme'
import { initTrack, vTrack } from './utils/track'

import * as ElementPlusIconsVue from '@element-plus/icons-vue'

// 挂载前同步主题：<html data-theme> 决定走哪套颜色令牌
useTheme().initTheme()

const app = createApp(App)
app.use(pinia)
setupRouter()
app.use(router)

// 埋点：v-track 自定义指令 + 关闭页面时补发队列（用法见 utils/track.ts 顶部注释）
app.directive('track', vTrack)
initTrack()

// 注册所有图标（模板动态 <component :is="name"> 依赖全局注册）
for (const [key, component] of (Object as any).entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.mount('#app')
