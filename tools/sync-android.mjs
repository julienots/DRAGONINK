// Copie le build web (dist/) dans les assets de l'application Android.
import { cpSync, rmSync, existsSync, mkdirSync } from 'node:fs';
const src = new URL('../dist/', import.meta.url).pathname;
const dst = new URL('../android/app/src/main/assets/www/', import.meta.url).pathname;
if (!existsSync(src + 'index.html')) { console.error('dist/ introuvable : lance `npm run build` d’abord'); process.exit(1); }
rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true });
console.log('Assets web copiés vers', dst);
