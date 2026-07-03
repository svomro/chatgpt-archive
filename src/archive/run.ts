import {
    fetchAllConversationRecords,
    fetchConversation,
    fetchProjects,
    getAccountProfile,
} from '../chatgpt/api'
import type { ConversationRecord, ProjectRecord, RawConversation } from '../chatgpt/types'
import { discoverAssets, discoverProjectAssets } from './discover'
import { downloadAsset, mapConcurrent } from './download'
import {
    conversationFolderName,
    conversationId,
    projectFolderName,
    safeName,
    timestampLabel,
} from './naming'
import type {
    ArchiveProgress,
    ArchiveSummary,
    AttachmentManifest,
} from './types'
import { directory, writeJson } from './writer'

const MANIFEST_VERSION = 1
const ATTACHMENT_CONCURRENCY = 2

export interface ArchiveOptions {
    root: FileSystemDirectoryHandle
    mode: 'current' | 'all'
    currentConversationId?: string
    signal: AbortSignal
    onProgress?: (progress: ArchiveProgress) => void
}

function projectIdOf(conversation: RawConversation): string | null {
    const value = conversation.gizmo_id ?? conversation.conversation_template_id
    return typeof value === 'string' && value ? value : null
}

function projectForConversation(
    conversation: RawConversation,
    listedProject: ProjectRecord | null,
    projects: ProjectRecord[],
): ProjectRecord | null {
    if (listedProject) return listedProject
    const projectId = projectIdOf(conversation)
    if (!projectId) return null
    return projects.find(project => project.id === projectId) ?? {
        id: projectId,
        name: projectId,
        description: '',
        raw: { id: projectId, source: 'conversation.gizmo_id' },
    }
}

async function conversationDirectory(
    accountFolder: FileSystemDirectoryHandle,
    conversation: RawConversation,
    project: ProjectRecord | null,
): Promise<FileSystemDirectoryHandle> {
    if (!project) return directory(accountFolder, [conversationFolderName(conversation)])
    const projectFolder = await directory(accountFolder, [projectFolderName(project)])
    await writeJson(projectFolder, 'project.json', project.raw)
    return directory(projectFolder, [conversationFolderName(conversation)])
}

function createManifest(
    ownerId: string,
    entries: AttachmentManifest['assets'],
    coverageWarnings: string[] = [],
): AttachmentManifest {
    const downloaded = entries.filter(entry => entry.status === 'downloaded').length
    const existing = entries.filter(entry => entry.status === 'existing').length
    const failed = entries.filter(entry => entry.status === 'failed').length
    const unresolved = entries.filter(entry => entry.status === 'unresolved').length
    return {
        version: MANIFEST_VERSION,
        generatedAt: new Date().toISOString(),
        conversationId: ownerId,
        expected: entries.length,
        downloaded,
        existing,
        failed,
        unresolved,
        complete: failed === 0 && unresolved === 0 && coverageWarnings.length === 0,
        coverageWarnings,
        assets: entries,
    }
}

function currentConversationId(): string | null {
    return location.pathname.match(/^\/(?:c|g\/[^/]+\/c)\/([A-Za-z0-9-]+)/)?.[1] ?? null
}

export function getCurrentConversationId(): string | null {
    return currentConversationId()
}

export async function runArchive(options: ArchiveOptions): Promise<ArchiveSummary> {
    const { signal, onProgress } = options
    signal.throwIfAborted()
    onProgress?.({ phase: 'listing', current: 0, total: 0, title: '读取账号', detail: '' })

    const [account, projects] = await Promise.all([
        getAccountProfile(),
        fetchProjects(signal),
    ])
    const providerFolder = await directory(options.root, ['ChatGPT'])
    const accountFolder = await directory(providerFolder, [`[${safeName(account.email, 'unknown-account')}]`])
    await writeJson(accountFolder, 'account.json', {
        ...account,
        archivedAt: new Date().toISOString(),
        projects: projects.map(project => ({ id: project.id, name: project.name, description: project.description })),
    })

    let records: ConversationRecord[]
    if (options.mode === 'current') {
        const id = options.currentConversationId ?? currentConversationId()
        if (!id) throw new Error('当前页面没有对话 ID')
        records = [{
            item: { id, title: id, create_time: 0 },
            project: null,
        }]
    }
    else {
        records = await fetchAllConversationRecords(projects, signal)
    }

    const summary: ArchiveSummary = {
        projects: 0,
        failedProjects: 0,
        incompleteProjects: 0,
        conversations: records.length,
        completeConversations: 0,
        failedConversations: 0,
        downloaded: 0,
        existing: 0,
        failedAssets: 0,
        unresolvedAssets: 0,
        errors: [],
    }

    const archivedProjectIds = new Set<string>()
    const archiveProject = async (project: ProjectRecord, projectIndex: number, total: number) => {
        if (archivedProjectIds.has(project.id)) return
        archivedProjectIds.add(project.id)
        summary.projects += 1
        signal.throwIfAborted()
        try {
            const projectFolder = await directory(accountFolder, [projectFolderName(project)])
            await writeJson(projectFolder, 'project.json', project.raw)
            const projectAssets = discoverProjectAssets(project)
            const entries = await mapConcurrent(projectAssets, ATTACHMENT_CONCURRENCY, async (asset, assetIndex) => {
                onProgress?.({
                    phase: 'attachments',
                    current: projectIndex + 1,
                    total,
                    title: `Project: ${project.name}`,
                    detail: `来源文件 ${assetIndex + 1}/${projectAssets.length}`,
                })
                return downloadAsset(asset, projectFolder, signal)
            })
            const manifest = createManifest(`project:${project.id}`, entries, [
                'Project Sources has not been independently enumerated; this manifest covers only file references present in the Project sidebar response.',
            ])
            await writeJson(projectFolder, 'project-attachments-manifest.json', manifest)
            summary.downloaded += manifest.downloaded
            summary.existing += manifest.existing
            summary.failedAssets += manifest.failed
            summary.unresolvedAssets += manifest.unresolved
            if (manifest.failed > 0 || manifest.unresolved > 0) summary.failedProjects += 1
            else if (manifest.coverageWarnings.length > 0) summary.incompleteProjects += 1
        }
        catch (error) {
            if (signal.aborted) throw error
            summary.failedProjects += 1
            summary.errors.push({
                conversationId: `project:${project.id}`,
                title: project.name,
                error: error instanceof Error ? error.message : String(error),
            })
        }
    }

    if (options.mode === 'all') {
        for (let projectIndex = 0; projectIndex < projects.length; projectIndex += 1) {
            await archiveProject(projects[projectIndex], projectIndex, projects.length)
        }
    }

    for (let index = 0; index < records.length; index += 1) {
        signal.throwIfAborted()
        const record = records[index]
        onProgress?.({
            phase: 'conversation',
            current: index + 1,
            total: records.length,
            title: record.item.title || record.item.id,
            detail: '下载原始 JSON',
        })

        try {
            const conversation = await fetchConversation(record.item.id, signal)
            const project = projectForConversation(conversation, record.project, projects)
            if (project) await archiveProject(project, 0, 1)
            const folder = await conversationDirectory(accountFolder, conversation, project)
            const historyName = `history-${timestampLabel(conversation.update_time ?? conversation.create_time)}.json`
            await writeJson(folder, historyName, conversation)

            const assets = discoverAssets(conversation)
            let completedAssets = 0
            const entries = await mapConcurrent(assets, ATTACHMENT_CONCURRENCY, async (asset) => {
                const entry = await downloadAsset(asset, folder, signal)
                completedAssets += 1
                onProgress?.({
                    phase: 'attachments',
                    current: index + 1,
                    total: records.length,
                    title: String(conversation.title ?? record.item.title ?? record.item.id),
                    detail: `附件 ${completedAssets}/${assets.length}: ${entry.localFile ?? asset.fileId ?? asset.key}`,
                })
                return entry
            })
            const manifest = createManifest(conversationId(conversation), entries)
            await writeJson(folder, 'attachments-manifest.json', manifest)

            summary.downloaded += manifest.downloaded
            summary.existing += manifest.existing
            summary.failedAssets += manifest.failed
            summary.unresolvedAssets += manifest.unresolved
            if (manifest.complete) summary.completeConversations += 1
            else summary.failedConversations += 1
        }
        catch (error) {
            if (signal.aborted) throw error
            summary.failedConversations += 1
            summary.errors.push({
                conversationId: record.item.id,
                title: record.item.title,
                error: error instanceof Error ? error.message : String(error),
            })
        }

        await writeJson(accountFolder, '_archive-state.json', {
            updatedAt: new Date().toISOString(),
            processed: index + 1,
            total: records.length,
            summary,
        })
    }

    onProgress?.({
        phase: 'done',
        current: records.length,
        total: records.length,
        title: '完成',
        detail: summary.failedConversations === 0
            && summary.failedProjects === 0
            && summary.incompleteProjects === 0
            && summary.failedAssets === 0
            && summary.unresolvedAssets === 0
            ? '所有附件均已保存'
            : '存在失败或无法解析的附件',
    })
    return summary
}
