import { createApp } from 'vue'
import { registerBuiltinMaterials } from '@schema-forge/materials'
import '@schema-forge/renderer-vue/style.css'
import './styles/home.css'
import App from './App.vue'

registerBuiltinMaterials()

createApp(App).mount('#app')
