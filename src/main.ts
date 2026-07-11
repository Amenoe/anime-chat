import { createApp } from 'vue'

import App from './App.vue'
import router from './router'
import pinia, { setupRouter } from './stores'

import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'

const app = createApp(App)
app.use(pinia)
setupRouter()
app.use(router)

//注册所有图标
for (const [key, component] of (Object as any).entries(ElementPlusIconsVue)) {
  app.component(key, component)
}
//element国际化
app.use(ElementPlus, {
  locale: zhCn,
})

app.mount('#app')
