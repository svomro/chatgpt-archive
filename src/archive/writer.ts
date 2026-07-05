export async function directory(
    root: FileSystemDirectoryHandle,
    parts: string[],
): Promise<FileSystemDirectoryHandle> {
    let current = root
    for (const part of parts) {
        current = await current.getDirectoryHandle(part, { create: true })
    }
    return current
}

export async function writeBlob(
    folder: FileSystemDirectoryHandle,
    name: string,
    blob: Blob,
): Promise<void> {
    const handle = await folder.getFileHandle(name, { create: true })
    const writable = await handle.createWritable()
    try {
        await writable.write(blob)
    }
    finally {
        await writable.close()
    }
}

export async function writeResponse(
    folder: FileSystemDirectoryHandle,
    name: string,
    response: Response,
): Promise<File> {
    const handle = await folder.getFileHandle(name, { create: true })
    const writable = await handle.createWritable()
    if (response.body && typeof (writable as WritableStream).getWriter === 'function') {
        await response.body.pipeTo(writable)
    }
    else {
        try {
            await writable.write(await response.blob())
        }
        finally {
            await writable.close()
        }
    }
    return handle.getFile()
}

export async function writeText(
    folder: FileSystemDirectoryHandle,
    name: string,
    content: string,
    type = 'text/plain;charset=utf-8',
): Promise<void> {
    await writeBlob(folder, name, new Blob([content], { type }))
}

export async function writeJson(
    folder: FileSystemDirectoryHandle,
    name: string,
    value: unknown,
): Promise<void> {
    await writeText(folder, name, JSON.stringify(value, null, 2), 'application/json;charset=utf-8')
}

export async function existingFile(
    folder: FileSystemDirectoryHandle,
    name: string,
): Promise<File | null> {
    try {
        const handle = await folder.getFileHandle(name, { create: false })
        return handle.getFile()
    }
    catch (error) {
        if (error instanceof DOMException && error.name === 'NotFoundError') return null
        if ((error as { name?: string })?.name === 'NotFoundError') return null
        throw error
    }
}

export async function existingFileByMarkers(
    folder: FileSystemDirectoryHandle,
    markers: string[],
): Promise<File | null> {
    const entries = (folder as FileSystemDirectoryHandle & {
        entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>
    }).entries?.()
    if (!entries) return null

    const tokens = [...new Set(markers.filter(Boolean))].map(marker => `[${marker}]`)
    if (!tokens.length) return null

    const matches: File[] = []
    for await (const [name, handle] of entries) {
        if (handle.kind !== 'file' || !tokens.some(token => name.includes(token))) continue
        matches.push(await (handle as FileSystemFileHandle).getFile())
    }
    if (matches.length > 1) {
        throw new Error(`Multiple local files match attachment markers: ${markers.join(', ')}`)
    }
    return matches[0] ?? null
}

export async function sha256(blob: Blob): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
    return [...new Uint8Array(digest)]
        .map(value => value.toString(16).padStart(2, '0'))
        .join('')
}
