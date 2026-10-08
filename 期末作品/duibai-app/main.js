import App from './App'
import { createSSRApp } from 'vue'

// uni-app Vue3 入口
export function createApp() {
	const app = createSSRApp(App)
	return {
		app
	}
}
