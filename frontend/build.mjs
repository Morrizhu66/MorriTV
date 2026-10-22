import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
await build({entryPoints:['script-app.tsx'],bundle:true,minify:true,jsx:'automatic',outfile:'../script-app.js',tsconfig:'tsconfig.json',define:{'process.env.NODE_ENV':'"production"'}});
execFileSync('node',['node_modules/@tailwindcss/cli/dist/index.mjs','-i','style.css','-o','../script-app.css','--minify'],{stdio:'inherit'});

await build({entryPoints:['canvas-orb.tsx'],bundle:true,minify:true,jsx:'automatic',outfile:'../canvas-orb.js',tsconfig:'tsconfig.json',define:{'process.env.NODE_ENV':'"production"'}});
