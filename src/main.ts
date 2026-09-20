import { createApp } from 'vue'

import App from './App.vue'
import router from './router'
import pinia, { setupRouter } from './stores'
import { useTheme } from './composables/useTheme'

import * as ElementPlusIconsVue from '@element-plus/icons-vue'

// 挂载前同步主题：<html data-theme> 决定走哪套颜色令牌
useTheme().initTheme()

const app = createApp(App)
app.use(pinia)
setupRouter()
app.use(router)

// 注册所有图标（模板动态 <component :is="name"> 依赖全局注册）
for (const [key, component] of (Object as any).entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.mount('#app')
