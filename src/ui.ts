import { runArchive } from './archive/run'
import type { ArchiveProgress, ArchiveSummary } from './archive/types'
import {
    excludeProjectConversations,
    sortConversationRecords,
} from './archive/catalog'
import type {
    ConversationSortDirection,
    ConversationSortField,
} from './archive/catalog'
import { fetchConversationPage, fetchProjects } from './chatgpt/api'
import type {
    ArchiveCatalog,
    ConversationRecord,
    ProjectRecord,
} from './chatgpt/types'

const ROOT_ID = 'chatgpt-archive-root'
const ARCHIVED_SOURCE = 'archived'

interface SourceState {
    records: ConversationRecord[]
    nextOffset: number
    nextCursor: string | number | null
    total: number | null
    hasMore: boolean
    loaded: boolean
}

function dockPoint(): { container: HTMLElement; rightAction: HTMLElement } | null {
    const profiles = document.querySelectorAll<HTMLElement>(
        '[data-testid="accounts-profile-button"], '
        + '[role="button"][aria-label*="个人资料"], '
        + '[role="button"][aria-label*="profile" i]',
    )
    for (const profile of profiles) {
        const rightAction = profile.querySelector<HTMLElement>('[data-trailing-button]')
            ?? profile.querySelector<HTMLElement>(
                'button[aria-label="下载应用"], button[aria-label="Download app"]',
            )
        if (rightAction?.parentElement) {
            return { container: rightAction.parentElement, rightAction }
        }
    }
    return null
}

function dockUi(root: HTMLElement): void {
    const point = dockPoint()
    if (!point) {
        root.dataset.docked = 'false'
        return
    }

    if (root.parentElement !== point.container || root.nextElementSibling !== point.rightAction) {
        point.container.insertBefore(root, point.rightAction)
    }
    root.dataset.docked = 'true'
}

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

function conversationDate(value: number | string | undefined, full = false): string {
    if (value == null) return '—'
    const date = new Date(typeof value === 'number' ? value * 1000 : value)
    if (Number.isNaN(date.getTime())) return '—'
    if (full) return date.toLocaleString()
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

export function mountUi(): void {
    const existing = document.getElementById(ROOT_ID)
    if (existing) {
        dockUi(existing)
        return
    }
    const root = document.createElement('div')
    root.id = ROOT_ID
    root.dataset.docked = 'false'
    root.innerHTML = `
        <button class="cga-launch" type="button" aria-label="导出" data-tooltip="导出">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" fill="currentColor" stroke="currentColor" stroke-width="0.24" stroke-linejoin="round" paint-order="stroke fill" fill-rule="evenodd" clip-rule="evenodd" width="18" height="18" aria-hidden="true">
                <path d="M5.1 11.401c.827 0 1.498.671 1.498 1.499v1.95c0 .828-.67 1.499-1.498 1.499H3.15A1.5 1.5 0 0 1 1.65 14.85V12.9A1.5 1.5 0 0 1 3.15 11.4zm-1.95 1.197a.3.3 0 0 0-.302.302v1.95c0 .166.135.301.302.302H5.1a.3.3 0 0 0 .301-.302V12.9a.3.3 0 0 0-.301-.302z"/><path d="M7.2 1.651A2.4 2.4 0 0 1 9.598 4.05v4.351h4.352a2.4 2.4 0 0 1 2.398 2.399v3.15a2.4 2.4 0 0 1-2.398 2.399H10.8A2.4 2.4 0 0 1 8.4 13.95V9.599H4.05A2.4 2.4 0 0 1 1.65 7.2V4.05A2.4 2.4 0 0 1 4.05 1.651zM9.598 13.95c0 .664.538 1.201 1.202 1.202h3.15c.663 0 1.201-.538 1.201-1.202V10.8c0-.664-.538-1.201-1.201-1.201H9.598zM4.05 2.849c-.664 0-1.202.538-1.202 1.201V7.2c0 .663.538 1.201 1.202 1.201H8.4V4.05c0-.664-.538-1.201-1.201-1.201z"/><path d="M14.85 1.651a1.5 1.5 0 0 1 1.5 1.499V5.1a1.5 1.5 0 0 1-1.5 1.499H12.9A1.5 1.5 0 0 1 11.402 5.1V3.15c0-.828.67-1.499 1.498-1.499zM12.9 2.85a.3.3 0 0 0-.301.301V5.1c0 .167.135.302.301.302h1.95a.3.3 0 0 0 .302-.302V3.15a.3.3 0 0 0-.301-.301z"/>
            </svg>
        </button>
        <div class="cga-panel" hidden>
            <div class="cga-head">
                <strong>ChatGPT Archive</strong>
                <button class="cga-close" type="button" aria-label="关闭">×</button>
            </div>
            <div class="cga-toolbar">
                <select class="cga-source" aria-label="对话来源">
                    <option value="personal">全部对话</option>
                    <option value="archived">归档对话</option>
                </select>
                <span class="cga-source-loading" role="status" hidden><span class="cga-spinner" aria-hidden="true"></span>加载中</span>
                <input class="cga-search" type="search" placeholder="搜索已加载对话" aria-label="搜索已加载对话">
                <button class="cga-refresh" type="button">刷新</button>
            </div>
            <div class="cga-selection-toolbar">
                <label><input class="cga-select-all" type="checkbox"> 全选当前列表</label>
                <span class="cga-selected-count">已选 0</span>
            </div>
            <div class="cga-list-header" aria-label="对话排序">
                <span aria-hidden="true"></span>
                <button class="cga-sort" type="button" data-sort="title">标题 ↕</button>
                <button class="cga-sort" type="button" data-sort="create_time">创建 ↕</button>
                <button class="cga-sort cga-sort-active" type="button" data-sort="update_time">更新 ↓</button>
            </div>
            <div class="cga-selection-list"><p class="cga-list-message">打开后加载第一页对话</p></div>
            <button class="cga-load-more" type="button" hidden>加载更多</button>
            <div class="cga-actions">
                <button class="cga-export" type="button">导出所选</button>
                <button class="cga-cancel" type="button" hidden>取消</button>
            </div>
            <div class="cga-status" role="status" aria-live="polite">尚未开始</div>
            <progress class="cga-progress" max="1" value="0"></progress>
        </div>
    `
    document.body.append(root)
    dockUi(root)

    for (const eventName of ['click', 'pointerdown', 'keydown']) {
        root.addEventListener(eventName, event => { event.stopPropagation() })
    }

    const launch = root.querySelector<HTMLButtonElement>('.cga-launch')!
    const panel = root.querySelector<HTMLElement>('.cga-panel')!
    const close = root.querySelector<HTMLButtonElement>('.cga-close')!
    const source = root.querySelector<HTMLSelectElement>('.cga-source')!
    const sourceLoading = root.querySelector<HTMLElement>('.cga-source-loading')!
    const search = root.querySelector<HTMLInputElement>('.cga-search')!
    const selectAll = root.querySelector<HTMLInputElement>('.cga-select-all')!
    const selectedCount = root.querySelector<HTMLElement>('.cga-selected-count')!
    const sortButtons = [...root.querySelectorAll<HTMLButtonElement>('.cga-sort')]
    const refresh = root.querySelector<HTMLButtonElement>('.cga-refresh')!
    const selectionList = root.querySelector<HTMLElement>('.cga-selection-list')!
    const loadMore = root.querySelector<HTMLButtonElement>('.cga-load-more')!
    const exportSelected = root.querySelector<HTMLButtonElement>('.cga-export')!
    const cancel = root.querySelector<HTMLButtonElement>('.cga-cancel')!
    const status = root.querySelector<HTMLElement>('.cga-status')!
    const progress = root.querySelector<HTMLProgressElement>('.cga-progress')!
    let controller: AbortController | null = null
    let listController: AbortController | null = null
    let projects: ProjectRecord[] = []
    let sourcesLoaded = false
    let running = false
    let loading = false
    let sortField: ConversationSortField = 'update_time'
    let sortDirection: ConversationSortDirection = 'desc'
    const selectedIds = new Set<string>()
    const sourceStates = new Map<string, SourceState>()
    const recordsById = new Map<string, ConversationRecord>()

    const setStatusTone = (tone: 'neutral' | 'success' | 'warning' | 'error') => {
        root.classList.toggle('cga-tone-success', tone === 'success')
        root.classList.toggle('cga-tone-warning', tone === 'warning')
        root.classList.toggle('cga-tone-error', tone === 'error')
    }

    const projectForSource = (key: string): ProjectRecord | null => {
        if (!key.startsWith('project:')) return null
        const id = key.slice('project:'.length)
        return projects.find(project => project.id === id) ?? null
    }

    const emptySourceState = (): SourceState => ({
        records: [],
        nextOffset: 0,
        nextCursor: 0,
        total: null,
        hasMore: false,
        loaded: false,
    })

    const currentSourceState = (): SourceState | null => sourceStates.get(source.value) ?? null

    const updateSortButtons = () => {
        const labels: Record<ConversationSortField, string> = {
            title: '标题',
            create_time: '创建',
            update_time: '更新',
        }
        for (const button of sortButtons) {
            const field = button.dataset.sort as ConversationSortField
            const active = field === sortField
            button.classList.toggle('cga-sort-active', active)
            button.textContent = `${labels[field]} ${active ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}`
            button.setAttribute('aria-pressed', String(active))
            button.disabled = running || loading
        }
    }

    const updateSelectionState = () => {
        const conversationChecks = [...selectionList.querySelectorAll<HTMLInputElement>('.cga-conversation-check')]
        const currentSelected = conversationChecks.filter(input => selectedIds.has(input.value)).length
        selectedCount.textContent = `已选 ${selectedIds.size} · 当前 ${currentSelected} / ${conversationChecks.length}`
        selectAll.checked = conversationChecks.length > 0 && currentSelected === conversationChecks.length
        selectAll.indeterminate = currentSelected > 0 && currentSelected < conversationChecks.length
        selectAll.disabled = running || loading || conversationChecks.length === 0
        source.disabled = running || loading
        sourceLoading.hidden = !loading
        search.disabled = running
        refresh.disabled = running || loading
        loadMore.disabled = running || loading
        for (const input of conversationChecks) input.disabled = running || loading
        exportSelected.disabled = running || selectedIds.size === 0
        updateSortButtons()
    }

    const setRunning = (value: boolean) => {
        running = value
        close.disabled = value
        cancel.hidden = !value
        updateSelectionState()
    }

    const setListMessage = (message: string, error = false) => {
        const paragraph = document.createElement('p')
        paragraph.className = `cga-list-message${error ? ' cga-list-error' : ''}`
        paragraph.textContent = message
        selectionList.replaceChildren(paragraph)
    }

    const renderSource = (preserveScroll = false) => {
        const previousScrollTop = preserveScroll ? selectionList.scrollTop : 0
        const restoreScroll = () => {
            if (preserveScroll) selectionList.scrollTop = previousScrollTop
        }
        const state = currentSourceState()
        const query = search.value.trim().toLocaleLowerCase()
        const records = sortConversationRecords(
            (state?.records ?? []).filter(record => !query
                || record.item.title.toLocaleLowerCase().includes(query)),
            sortField,
            sortDirection,
        )
        const remaining = state?.total == null ? null : Math.max(state.total - state.nextOffset, 0)
        loadMore.hidden = !state?.hasMore
        loadMore.textContent = loading
            ? '正在加载…'
            : remaining == null ? '加载更多' : `加载更多 · 剩余 ${remaining}`
        selectionList.replaceChildren()
        if (loading && !state?.records.length) {
            setListMessage('正在加载第一页对话…')
            updateSelectionState()
            restoreScroll()
            return
        }
        if (!records.length) {
            setListMessage(query ? '已加载的对话中没有匹配项' : '这个来源没有对话')
            updateSelectionState()
            restoreScroll()
            return
        }

        for (const record of records) {
            const row = document.createElement('label')
            row.className = 'cga-conversation'
            const checkbox = document.createElement('input')
            checkbox.type = 'checkbox'
            checkbox.className = 'cga-conversation-check'
            checkbox.value = record.item.id
            checkbox.checked = selectedIds.has(record.item.id)

            const title = document.createElement('span')
            title.className = 'cga-conversation-title'
            title.textContent = record.item.title || '未命名对话'
            title.title = title.textContent
            const created = document.createElement('time')
            created.className = `cga-conversation-date${sortField === 'create_time' ? ' cga-date-active' : ''}`
            created.textContent = conversationDate(record.item.create_time)
            created.title = `创建：${conversationDate(record.item.create_time, true)}`
            const updated = document.createElement('time')
            updated.className = `cga-conversation-date${sortField === 'update_time' ? ' cga-date-active' : ''}`
            updated.textContent = conversationDate(record.item.update_time)
            updated.title = `更新：${conversationDate(record.item.update_time, true)}`
            row.append(checkbox, title, created, updated)
            selectionList.append(row)

            checkbox.addEventListener('change', () => {
                if (checkbox.checked) selectedIds.add(checkbox.value)
                else selectedIds.delete(checkbox.value)
                updateSelectionState()
            })
        }
        updateSelectionState()
        restoreScroll()
    }

    const loadPage = async (reset: boolean) => {
        listController?.abort()
        const request = new AbortController()
        listController = request
        const sourceKey = source.value
        const project = projectForSource(sourceKey)
        const state = reset ? emptySourceState() : (sourceStates.get(sourceKey) ?? emptySourceState())
        if (reset) sourceStates.set(sourceKey, state)
        loading = true
        setStatusTone('neutral')
        status.textContent = reset ? '正在读取第一页对话…' : '正在加载更多对话…'
        if (reset) renderSource()
        else {
            loadMore.textContent = '正在加载…'
            updateSelectionState()
        }
        try {
            const page = await fetchConversationPage(project?.id ?? null, request.signal, {
                archived: sourceKey === ARCHIVED_SOURCE,
                offset: state.nextOffset,
                cursor: state.nextCursor,
            })
            if (request.signal.aborted) return
            const byId = new Map(state.records.map(record => [record.item.id, record]))
            const visibleItems = page.items
            for (const item of visibleItems) {
                const record = { item, project }
                byId.set(item.id, record)
                recordsById.set(item.id, record)
            }
            state.records = [...byId.values()]
            state.nextOffset = page.nextOffset
            state.nextCursor = page.nextCursor
            state.total = page.total
            state.hasMore = page.hasMore
            state.loaded = true
            status.textContent = sourceKey === 'personal' && page.total != null
                ? `全部对话 ${state.records.length} 个 · 已扫描 ${state.nextOffset} / ${page.total}`
                : page.total == null
                ? `已加载 ${state.records.length} 个对话`
                : `已加载 ${state.records.length} / ${page.total} 个对话`
        }
        catch (error) {
            if (request.signal.aborted) return
            status.textContent = '对话列表加载失败'
            setStatusTone('error')
            if (!state.records.length) {
                setListMessage(`加载失败：${error instanceof Error ? error.message : String(error)}`, true)
            }
        }
        finally {
            if (listController === request) {
                listController = null
                loading = false
                renderSource(!reset)
            }
        }
    }

    const renderProjectOptions = () => {
        for (const option of [...source.querySelectorAll('option[data-project]')]) option.remove()
        for (const project of projects) {
            const option = document.createElement('option')
            option.value = `project:${project.id}`
            option.dataset.project = 'true'
            option.textContent = `Project · ${project.name}`
            source.append(option)
        }
    }

    const initializeSources = async () => {
        if (sourcesLoaded) {
            const state = currentSourceState()
            if (state?.loaded) renderSource()
            else await loadPage(true)
            return
        }
        listController?.abort()
        const request = new AbortController()
        listController = request
        loading = true
        setStatusTone('neutral')
        setListMessage('正在加载 Project 列表…')
        status.textContent = '正在读取 Project…'
        updateSelectionState()
        try {
            projects = await fetchProjects(request.signal)
            if (request.signal.aborted) return
            sourcesLoaded = true
            renderProjectOptions()
        }
        catch (error) {
            if (request.signal.aborted) return
            setListMessage(`加载失败：${error instanceof Error ? error.message : String(error)}`, true)
            status.textContent = 'Project 列表加载失败'
            setStatusTone('error')
            return
        }
        finally {
            if (listController === request) {
                listController = null
                loading = false
                updateSelectionState()
            }
        }
        await loadPage(true)
    }

    const update = (value: ArchiveProgress) => {
        const total = Math.max(value.total, 1)
        progress.max = total
        progress.value = value.current
        status.textContent = `${value.title}${value.detail ? ` — ${value.detail}` : ''}${value.total ? ` (${value.current}/${value.total})` : ''}`
    }

    const start = async () => {
        if (selectedIds.size === 0) return
        const records = [...selectedIds]
            .map(id => recordsById.get(id))
            .filter((record): record is ConversationRecord => record != null)
        if (records.length !== selectedIds.size) {
            status.textContent = '部分勾选项已失效，请刷新列表后重选'
            setStatusTone('error')
            return
        }
        const catalog: ArchiveCatalog = { projects, records }
        try {
            const folder = await window.showDirectoryPicker({ id: 'chatgpt-archive', mode: 'readwrite' })
            controller = new AbortController()
            setRunning(true)
            setStatusTone('neutral')
            progress.value = 0
            status.textContent = '开始读取…'
            const summary = await runArchive({
                root: folder,
                mode: 'selected',
                selectedConversationIds: [...selectedIds],
                catalog,
                signal: controller.signal,
                onProgress: update,
            })
            status.textContent = summaryText(summary)
            const hasErrors = summary.failedConversations > 0
                || summary.failedProjects > 0
                || summary.failedAssets > 0
                || summary.unresolvedAssets > 0
            setStatusTone(hasErrors
                ? 'error'
                : summary.incompleteProjects > 0 ? 'warning' : 'success')
        }
        catch (error) {
            if ((error as { name?: string })?.name === 'AbortError') {
                status.textContent = '已取消，已写入的文件保留'
                setStatusTone('warning')
            }
            else {
                status.textContent = `失败：${error instanceof Error ? error.message : String(error)}`
                setStatusTone('error')
            }
        }
        finally {
            controller = null
            setRunning(false)
        }
    }

    launch.addEventListener('click', () => {
        const opening = panel.hidden
        panel.hidden = !opening
        if (opening) void initializeSources()
    })
    close.addEventListener('click', () => { panel.hidden = true })
    for (const button of sortButtons) {
        button.addEventListener('click', () => {
            const field = button.dataset.sort as ConversationSortField
            if (field === sortField) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'
            }
            else {
                sortField = field
                sortDirection = field === 'title' ? 'asc' : 'desc'
            }
            renderSource()
        })
    }
    source.addEventListener('change', () => {
        search.value = ''
        const state = currentSourceState()
        if (state?.loaded) renderSource()
        else void loadPage(true)
    })
    search.addEventListener('input', () => { renderSource() })
    refresh.addEventListener('click', () => {
        if (sourcesLoaded) void loadPage(true)
        else void initializeSources()
    })
    loadMore.addEventListener('click', () => { void loadPage(false) })
    selectAll.addEventListener('change', () => {
        for (const input of selectionList.querySelectorAll<HTMLInputElement>('.cga-conversation-check')) {
            input.checked = selectAll.checked
            if (selectAll.checked) selectedIds.add(input.value)
            else selectedIds.delete(input.value)
        }
        updateSelectionState()
    })
    exportSelected.addEventListener('click', () => { void start() })
    cancel.addEventListener('click', () => controller?.abort())
    setRunning(false)
}
