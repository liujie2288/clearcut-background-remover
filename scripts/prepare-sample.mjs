import { readFile, writeFile } from 'node:fs/promises';

const source = new URL('../public/sample-person-v2.png.base64', import.meta.url);
const destinations = [
  new URL('../public/sample-person-v2.png', import.meta.url),
  new URL('../public/sample-person.png', import.meta.url),
];

const image = Buffer.from((await readFile(source, 'utf8')).trim(), 'base64');

await Promise.all(destinations.map((destination) => writeFile(destination, image)));
