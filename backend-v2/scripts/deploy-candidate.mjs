// Maintainer-side opt-in deployment. NEVER run this on page load or in a browser.
// Secrets are read from protected environment variables, not from upload-config.js.
import {mkdtemp,writeFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const dir=dirname(fileURLToPath(import.meta.url)),config=join(dir,'../wrangler.jsonc');
const required=['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','GITHUB_UPLOAD_TOKEN','SOIL_ADMIN_PASSWORD'];
const missing=required.filter(k=>!String(process.env[k]||'').trim());
if(missing.length){console.error('缺少维护端配置：'+missing.join('、')+'。未进行部署，线上未改变。');process.exit(2);}
await access(join(dir,'../src/directory.mjs'));
const temp=await mkdtemp(join(tmpdir(),'soil-backend-secret-'));
try{
 const secrets=join(temp,'worker-secrets.json');
 await writeFile(secrets,JSON.stringify({GITHUB_UPLOAD_TOKEN:process.env.GITHUB_UPLOAD_TOKEN,SOIL_ADMIN_PASSWORD:process.env.SOIL_ADMIN_PASSWORD,SESSION_SECRET:process.env.SESSION_SECRET||randomBytes(32).toString('hex')}),{mode:0o600});
 const result=spawnSync(process.platform==='win32'?'npx.cmd':'npx',['--yes','wrangler@4','deploy','--config',config,'--secrets-file',secrets],{stdio:'inherit',env:process.env,shell:false});
 if(result.error)throw Error('无法启动部署工具');
 if(result.status!==0)process.exitCode=result.status||1;
 else console.log('候选后台已部署，写入默认关闭；线上前端未切换。请先执行实际后台验收。');
}finally{await rm(temp,{recursive:true,force:true});}
