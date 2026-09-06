import { cp, mkdir, rm } from 'node:fs/promises';

const output = new URL('../out/', import.meta.url);
const source = new URL('../public/', import.meta.url);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });
