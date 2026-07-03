interface FileSystemHandlePermissionDescriptor {
    mode?: 'read' | 'readwrite'
}

interface FileSystemFileHandle {
    readonly kind: 'file'
    readonly name: string
    getFile(): Promise<File>
    createWritable(): Promise<FileSystemWritableFileStream>
    queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
    requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
}

interface FileSystemDirectoryHandle {
    readonly kind: 'directory'
    readonly name: string
    getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>
    getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>
    queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
    requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
}

interface FileSystemWritableFileStream extends WritableStream {
    write(data: Blob | BufferSource | string): Promise<void>
    close(): Promise<void>
}

interface Window {
    showDirectoryPicker(options?: { id?: string; mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>
    __remixContext?: any
    __NEXT_DATA__?: any
}
