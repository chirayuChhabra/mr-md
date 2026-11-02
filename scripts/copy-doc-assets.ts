import { cpSync, mkdirSync } from 'node:fs';
mkdirSync('mr-markdown-documentation/out/assets', { recursive: true });
cpSync('mr-markdown-documentation/assets/textures', 'mr-markdown-documentation/out/assets/textures', { recursive: true });
