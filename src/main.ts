import './style.css'
import { mountUi } from './ui'

mountUi()

// ChatGPT occasionally replaces the sidebar. Restore and redock our button
// beside the profile actions when that happens.
window.setInterval(mountUi, 1500)
