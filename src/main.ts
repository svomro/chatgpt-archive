import './style.css'
import { mountUi } from './ui'

mountUi()

// ChatGPT occasionally replaces large parts of the page. Restore only our
// isolated mount point if that happens; no page DOM is used for the archive.
window.setInterval(mountUi, 1500)
