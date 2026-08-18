import { copyFile, mkdir } from 'node:fs/promises'

const source = new URL(
  '../../employee-domain/fixtures/employees.mock.json',
  import.meta.url,
)
const destinationDirectory = new URL('../dist/data/', import.meta.url)
const destination = new URL('employees.mock.json', destinationDirectory)

await mkdir(destinationDirectory, { recursive: true })
await copyFile(source, destination)
