import { copyFile, mkdir } from 'node:fs/promises'

await mkdir('dist', { recursive: true })
await copyFile(
    'tools/live-stream/chatgpt-stream-recorder.user.js',
    'dist/chatgpt-live-stream.user.js',
)
