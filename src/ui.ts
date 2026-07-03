import { getCurrentConversationId, runArchive } from './archive/run'
import type { ArchiveProgress, ArchiveSummary } from './archive/types'

const ROOT_ID = 'chatgpt-archive-root'

function summaryText(summary: ArchiveSummary): string {
    return [
        `Project ${summary.projects}`,
        `Project失败 ${summary.failedProjects}`,
        `Project待补 ${summary.incompleteProjects}`,
        `对话 ${summary.conversations}`,
        `完整 ${summary.completeConversations}`,
        `下载 ${summary.downloaded}`,
        `已存在 ${summary.existing}`,
        `失败附件 ${summary.failedAssets}`,
        `无法解析 ${summary.unresolvedAssets}`,
        `失败对话 ${summary.failedConversations}`,
    ].join(' · ')
}

export function mountUi(): void {
    if (document.getElementById(ROOT_ID)) return
    const root = document.createElement('div')
    root.id = ROOT_ID
    root.innerHTML = `
        <button class="cga-launch" type="button">Archive</button>
        <div class="cga-panel" hidden>
            <div class="cga-head">
                <strong>ChatGPT Archive</strong>
                <button class="cga-close" type="button" aria-label="关闭">×</button>
            </div>
            <p>选择父目录后，脚本会创建 ChatGPT/[账号]/…</p>
            <div class="cga-actions">
                <button class="cga-current" type="button">保存当前对话</button>
                <button class="cga-all" type="button">保存全部对话和 Projects</button>
                <button class="cga-cancel" type="button" hidden>取消</button>
            </div>
            <div class="cga-status">尚未开始</div>
            <progress class="cga-progress" max="1" value="0"></progress>
        </div>
    `
    document.body.append(root)

    const launch = root.querySelector<HTMLButtonElement>('.cga-launch')!
    const panel = root.querySelector<HTMLElement>('.cga-panel')!
    const close = root.querySelector<HTMLButtonElement>('.cga-close')!
    const current = root.querySelector<HTMLButtonElement>('.cga-current')!
    const all = root.querySelector<HTMLButtonElement>('.cga-all')!
    const cancel = root.querySelector<HTMLButtonElement>('.cga-cancel')!
    const status = root.querySelector<HTMLElement>('.cga-status')!
    const progress = root.querySelector<HTMLProgressElement>('.cga-progress')!
    let controller: AbortController | null = null

    const setRunning = (running: boolean) => {
        current.disabled = running || !getCurrentConversationId()
        all.disabled = running
        close.disabled = running
        cancel.hidden = !running
    }

    const update = (value: ArchiveProgress) => {
        const total = Math.max(value.total, 1)
        progress.max = total
        progress.value = value.current
        status.textContent = `${value.title}${value.detail ? ` — ${value.detail}` : ''}${value.total ? ` (${value.current}/${value.total})` : ''}`
    }

    const start = async (mode: 'current' | 'all') => {
        try {
            const folder = await window.showDirectoryPicker({ id: 'chatgpt-archive', mode: 'readwrite' })
            controller = new AbortController()
            setRunning(true)
            progress.value = 0
            status.textContent = '开始读取…'
            const summary = await runArchive({
                root: folder,
                mode,
                currentConversationId: getCurrentConversationId() ?? undefined,
                signal: controller.signal,
                onProgress: update,
            })
            status.textContent = summaryText(summary)
            root.classList.toggle(
                'cga-has-errors',
                summary.failedConversations > 0
                || summary.failedProjects > 0
                || summary.incompleteProjects > 0
                || summary.failedAssets > 0
                || summary.unresolvedAssets > 0,
            )
        }
        catch (error) {
            if ((error as { name?: string })?.name === 'AbortError') status.textContent = '已取消，已写入的文件保留'
            else status.textContent = `失败：${error instanceof Error ? error.message : String(error)}`
            root.classList.add('cga-has-errors')
        }
        finally {
            controller = null
            setRunning(false)
        }
    }

    launch.addEventListener('click', () => {
        panel.hidden = !panel.hidden
        current.disabled = !getCurrentConversationId()
    })
    close.addEventListener('click', () => { panel.hidden = true })
    current.addEventListener('click', () => { void start('current') })
    all.addEventListener('click', () => { void start('all') })
    cancel.addEventListener('click', () => controller?.abort())
    setRunning(false)
}
