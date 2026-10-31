import { createPinia } from 'pinia'
import { useLoginStore } from './modules/login'
import { useHomeStore } from './modules/home'

const pinia = createPinia()
pinia.use(({ store }) => {
  const initState = JSON.parse(JSON.stringify(store.$state))
  store.$reset = () => {
    store.$state = initState
  }
})

export function setupRouter() {
  useLoginStore().loadLocalLogin()
  useHomeStore().loadAnimeData()
}

export default pinia
