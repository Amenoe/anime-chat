import { createApp } from 'vue'

import App from './App.vue'
import router from './router'
import pinia, { setupRouter } from './stores'
import { useTheme } from './composables/useTheme'
import { initTrack, vTrack } from './utils/track'

import * as ElementPlusIconsVue from '@element-plus/icons-vue'

/*
 * Element Plus 的**函数式 API** 样式必须手动引入。
 *
 * 组件里的 <ElButton> 等由 unplugin-vue-components 的 resolver 自动带样式，
 * 但 ElMessageBox / ElMessage 是 `ElMessageBox.confirm(...)` 这种**命令式调用**，
 * 不出现在模板里，resolver 扫不到 —— 实测这两者的 CSS 规则数为 0，
 * 表现为弹窗只剩文字浮在页面上、没有卡片背景、位置也不居中。
 *
 * 只补这两份，不引 dist/index.css，保持按需引入的体积优势。
 */
import 'element-plus/es/components/message-box/style/css'
import 'element-plus/es/components/message/style/css'

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
