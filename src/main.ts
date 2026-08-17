import { createApp } from 'vue'

import App from './App.vue'
import router from './router'
import pinia, { setupRouter } from './stores'

import * as ElementPlusIconsVue from '@element-plus/icons-vue'

const app = createApp(App)
app.use(pinia)
setupRouter()
app.use(router)

// 注册所有图标（模板动态 <component :is="name"> 依赖全局注册）
for (const [key, component] of (Object as any).entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.mount('#app')
