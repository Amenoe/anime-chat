import path from 'path'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import VueDevTools from 'vite-plugin-vue-devtools'
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 根据当前工作目录中的 `mode` 加载 .env 文件
  // 设置第三个参数为 '' 来加载所有环境变量，而不管是否有 `VITE_` 前缀。
  const env = loadEnv(mode, process.cwd())
  return {
    base: env.VITE_BASE_URL, //项目根路径
    server: {
      host: '0.0.0.0',
      port: 8012,
      proxy: {
        '/api': {
          target: env.VITE_SERVE_URL,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '/api'),
        },
      },
    },
    plugins: [
      vue(),
      VueDevTools(),
      AutoImport({
        imports: ['vue', 'vue-router'], // 自动导入vue和vue-router相关函数
        //自动引入ElementPlus相关函数和图标组件
        resolvers: [ElementPlusResolver()],
        dts: 'src/plugin/auto-import.d.ts', // 调整生成自动引入的文件位置
        // eslint报错解决
        eslintrc: {
          enabled: true, // Default `false` 开启生成配置文件，一次就行
          filepath: './.eslintrc-auto-import.json', // Default `./.eslintrc-auto-import.json`
          globalsPropValue: true, // Default `true`, (true | false | 'readonly' | 'readable' | 'writable' | 'writeable')
        },
      }),
      Components({
        //自动引入组件的位置，默认是src/components
        // dirs: ['src/components'],
        resolvers: [
          // 自动导入 Element Plus 组件
          ElementPlusResolver(),
        ],
        dts: 'src/plugin/components.d.ts',
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve('./src'),
        '@apis': path.resolve('./src/api'),
        '~styles': path.resolve('./src/assets/css'),
      },
    },
    css: {
      preprocessorOptions: {
        // 全局less配置
        less: {
          modifyVars: {
            hack: `true; @import (reference) "${path.resolve('src/assets/css/util.less')}";`,
          },
          javascriptEnabled: true,
        },
      },
    },
  }
})
