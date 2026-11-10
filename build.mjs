import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const out = await build({ entryPoints: ['src/main.ts'], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false,
  // GW_SERVER=wss://your-host/ws npm run build  bakes in where the online relay lives.
  define: { __GW_SERVER__: JSON.stringify(process.env.GW_SERVER ?? '') } });
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', readFileSync('index.template.html', 'utf8').replace('/*__BUNDLE__*/', () => js));
console.log('built dist/index.html', js.length, 'bytes of JS');
