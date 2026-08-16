import { ApiError, fetchFileResponse, resolveFileDownload } from '../chatgpt/api'
import { assetFileName } from './naming'
import type { AssetManifestEntry, DiscoveredAsset } from './types'
import {
    existingFile,
    existingFileByMarkers,
    sha256,
    writeBlob,
    writeResponse,
} from './writer'

const MAX_ATTEMPTS = 5
const MAX_HASH_BYTES = 64 * 1024 * 1024

class PermanentAssetError extends Error {}

function sleep(milliseconds: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        const timer = window.setTimeout(resolve, milliseconds)
        signal.addEventListener('abort', () => {
            window.clearTimeout(timer)
            reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
        }, { once: true })
    })
}

function dataUrlBlob(dataUrl: string): Blob {
    const match = dataUrl.match(/^data:([^;,]+);base64,([\s\S]+)$/i)
    if (!match) throw new Error('Unsupported inline data URL')
    const binary = atob(match[2].replace(/\s/g, ''))
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return new Blob([bytes], { type: match[1] })
}

interface ResolvedAsset {
    blob: Blob | null
    urls: string[]
    name: string | null
    mimeType: string | null
    expectedSize: number | null
}

async function resolveAsset(asset: DiscoveredAsset, signal: AbortSignal): Promise<ResolvedAsset> {
    if (asset.inlineDataUrl) {
        const blob = dataUrlBlob(asset.inlineDataUrl)
        return { blob, urls: [], name: asset.names[0] ?? null, mimeType: blob.type || null, expectedSize: blob.size }
    }

    if (asset.fileId) {
        const response = await resolveFileDownload(asset.fileId, signal)
        if (response.status === 'success') {
            return {
                blob: null,
                urls: [response.download_url, ...asset.directUrls],
                name: response.file_name,
                mimeType: response.mime_type,
                expectedSize: response.file_size_bytes,
            }
        }
        if (asset.directUrls.length === 0) {
            throw new PermanentAssetError(`${response.error_code}: ${response.error_message ?? 'file resolver rejected the ID'}`)
        }
    }

    if (asset.directUrls.length > 0) {
        return {
            blob: null,
            urls: asset.directUrls,
            name: asset.names[0] ?? null,
            mimeType: asset.mimeTypes[0] ?? null,
            expectedSize: asset.expectedSizes[0] ?? null,
        }
    }

    throw new Error(asset.sandboxPaths.length
        ? `No downloadable file ID for ${asset.sandboxPaths.join(', ')}`
        : 'No downloadable first-party file reference')
}

async function writeResolvedAsset(
    resolved: ResolvedAsset,
    folder: FileSystemDirectoryHandle,
    name: string,
    signal: AbortSignal,
): Promise<File> {
    if (resolved.blob) {
        await writeBlob(folder, name, resolved.blob)
        const file = await existingFile(folder, name)
        if (!file) throw new Error('Attachment disappeared after writing')
        return file
    }
    let lastError: unknown
    for (const url of resolved.urls) {
        try {
            let response = await fetchFileResponse(url, signal)
            const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
            const isInterpreterDescriptor = url.includes('/interpreter/download?')
            if (isInterpreterDescriptor) {
                const descriptor = await response.clone().json().catch(() => null) as {
                    status?: string
                    download_url?: string
                    error_code?: string
                    error_message?: string | null
                } | null
                if (descriptor?.status === 'success' && descriptor.download_url) {
                    // The authenticated descriptor is trusted to point at the
                    // requested artifact; HTML is a valid Interpreter output.
                    response = await fetchFileResponse(descriptor.download_url, signal, true)
                }
                else if (contentType.includes('json')) {
                    throw new Error(
                        descriptor?.error_message
                            || descriptor?.error_code
                            || 'Interpreter download endpoint returned JSON without a download URL',
                    )
                }
            }
            return await writeResponse(folder, name, response)
        }
        catch (error) {
            lastError = error
        }
    }
    throw lastError ?? new Error('No usable download URL')
}

async function manifestHash(file: Blob): Promise<string | null> {
    return file.size <= MAX_HASH_BYTES ? sha256(file) : null
}

async function isUsableExistingFile(file: File, expectedSize: number | null): Promise<boolean> {
    if (file.size <= 0) return false
    if (expectedSize != null && file.size !== expectedSize) return false
    if (!file.name.toLowerCase().endsWith('.html') || file.size > 16 * 1024) return true

    const text = (await file.text()).trimStart()
    if (!text.startsWith('{')) return true
    try {
        const payload = JSON.parse(text) as { status?: string; download_url?: string }
        return !(payload.status === 'success' && typeof payload.download_url === 'string')
    }
    catch {
        return true
    }
}

function baseManifest(asset: DiscoveredAsset): AssetManifestEntry {
    return {
        key: asset.key,
        fileId: asset.fileId,
        aliases: asset.aliases,
        localFile: null,
        status: 'unresolved',
        mimeType: null,
        expectedSize: asset.expectedSizes[0] ?? null,
        actualSize: null,
        sha256: null,
        attempts: 0,
        error: null,
        reason: asset.referenceOnlyReason,
        references: asset.references,
    }
}

export async function downloadAsset(
    asset: DiscoveredAsset,
    folder: FileSystemDirectoryHandle,
    signal: AbortSignal,
): Promise<AssetManifestEntry> {
    const manifest = baseManifest(asset)

    // Attachment IDs identify saved snapshots. Check a local copy carrying the
    // same stable ID before applying reference-only or calling the remote resolver.
    // This preserves resumability when the remote download route has expired.
    const hintedName = assetFileName(
        asset,
        asset.names[0] ?? null,
        asset.mimeTypes[0] ?? null,
    )
    const hintedExisting = await existingFile(folder, hintedName)
        ?? await existingFileByMarkers(folder, asset.aliases)
    const hintedSize = asset.expectedSizes[0] ?? null
    if (hintedExisting && await isUsableExistingFile(hintedExisting, hintedSize)) {
        manifest.localFile = hintedExisting.name
        manifest.status = 'existing'
        manifest.mimeType = hintedExisting.type || asset.mimeTypes[0] || null
        manifest.expectedSize = hintedSize
        manifest.actualSize = hintedExisting.size
        manifest.sha256 = await manifestHash(hintedExisting)
        return manifest
    }

    if (asset.referenceOnly) {
        manifest.status = 'reference-only'
        return manifest
    }

    if (!asset.fileId && !asset.inlineDataUrl && asset.directUrls.length === 0) {
        manifest.error = asset.sandboxPaths.length
            ? `Unresolved sandbox path: ${asset.sandboxPaths.join(', ')}`
            : 'No resolver supported this reference'
        return manifest
    }

    let lastError: unknown
    let lastErrorPermanent = false
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        signal.throwIfAborted()
        manifest.attempts = attempt
        try {
            const resolved = await resolveAsset(asset, signal)
            const name = assetFileName(asset, resolved.name, resolved.mimeType)
            const existing = await existingFile(folder, name)
            if (existing && await isUsableExistingFile(existing, resolved.expectedSize)) {
                manifest.localFile = name
                manifest.status = 'existing'
                manifest.mimeType = existing.type || resolved.mimeType
                manifest.expectedSize = resolved.expectedSize
                manifest.actualSize = existing.size
                manifest.sha256 = await manifestHash(existing)
                return manifest
            }

            const file = await writeResolvedAsset(resolved, folder, name, signal)
            if (resolved.expectedSize != null && file.size !== resolved.expectedSize) {
                throw new Error(`Size mismatch: expected ${resolved.expectedSize}, received ${file.size}`)
            }
            manifest.localFile = name
            manifest.status = 'downloaded'
            manifest.mimeType = resolved.mimeType || file.type || null
            manifest.expectedSize = resolved.expectedSize
            manifest.actualSize = file.size
            manifest.sha256 = await manifestHash(file)
            return manifest
        }
        catch (error) {
            lastError = error
            if (signal.aborted) throw error
            // 403/404/410 and PermanentAssetError mean the server told us the
            // asset is not fetchable; there is nothing further the script can
            // do, so surface these as `unavailable` instead of a retryable
            // failure. Everything else counts as a real transport/handling
            // problem worth retrying.
            const permanent = error instanceof PermanentAssetError
                || (error instanceof ApiError
                    && (error.status === 403 || error.status === 404 || error.status === 410))
            lastErrorPermanent = permanent
            const retryable = !permanent && (
                !(error instanceof ApiError)
                || error.status === 408
                || error.status === 429
                || error.status >= 500
            )
            if (!retryable) break
            if (attempt < MAX_ATTEMPTS) {
                const wait = error instanceof ApiError && error.retryAfterMs > 0
                    ? error.retryAfterMs
                    : Math.min(1000 * 2 ** (attempt - 1), 15_000)
                await sleep(wait, signal)
            }
        }
    }

    manifest.status = lastErrorPermanent ? 'unavailable' : 'failed'
    manifest.error = lastError instanceof Error ? lastError.message : String(lastError)
    return manifest
}

export async function mapConcurrent<T, R>(
    values: T[],
    limit: number,
    worker: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(values.length)
    let nextIndex = 0
    const runners = Array.from({ length: Math.min(limit, values.length) }, async () => {
        while (nextIndex < values.length) {
            const index = nextIndex
            nextIndex += 1
            results[index] = await worker(values[index], index)
        }
    })
    await Promise.all(runners)
    return results
}
