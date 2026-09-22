import { defineStore } from 'pinia'
import { useLoginStore } from './login'

/** 侧边栏一项 */
export interface ISideItem {
  name: string
  routeName: string
  routePath: string
  icon: string
}

export const useRouteStore = defineStore('route', () => {
  const loginStore = useLoginStore()

  const baseList: ISideItem[] = [
    {
      name: '首页',
      routeName: 'Home',
      routePath: 'home',
      icon: 'HomeFilled',
    },
    {
      name: '搜索',
      routeName: 'Search',
      routePath: 'search',
      icon: 'Search',
    },
    {
      name: 'AI 助手',
      routeName: 'Ai',
      routePath: 'ai',
      icon: 'MagicStick',
    },
    {
      name: '个人中心',
      routeName: 'User',
      routePath: 'user',
      icon: 'UserFilled',
    },
  ]

  /**
   * 管理看板：**只对 `role === 'root'` 露出**。
   *
   * 这纯粹是体验层面的收敛（普通用户看不到，也就不会去点一个必然 403 的入口），
   * **不是安全边界** —— 真正的判定在后端 `TrackController.assertRoot`，
   * 直接敲 URL 访问照样 403。
   *
   * 注意 `role` 读的是登录态缓存：在库里授权 root 之后，需要重新登录
   * （或改一次昵称，那条路径会用响应刷新 userInfo）才能看到入口。
   */
  const ADMIN_ITEM: ISideItem = {
    name: '管理看板',
    routeName: 'Admin',
    routePath: 'admin',
    icon: 'DataAnalysis',
  }

  /** 必须是 computed：登录/登出会实时改变侧边栏，快照写法不会更新 */
  const routeList = computed<ISideItem[]>(() =>
    loginStore.userInfo?.role === 'root' ? [...baseList, ADMIN_ITEM] : baseList,
  )

  /** 仅用于路由切换方向（上下滑动过渡）的排序依据 */
  const getRoutePath = computed(() => routeList.value.map((r) => r.routePath))

  return { routeList, getRoutePath }
})
