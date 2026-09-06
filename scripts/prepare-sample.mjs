import { readFile, writeFile } from 'node:fs/promises';

const source = new URL('../public/sample-person-v2.png.base64', import.meta.url);
const destination = new URL('../public/sample-person-v2.png', import.meta.url);

await writeFile(destination, Buffer.from((await readFile(source, 'utf8')).trim(), 'base64'));
