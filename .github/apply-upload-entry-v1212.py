from pathlib import Path
import re,subprocess
assert Path('VERSION').read_text().strip()=='v1.2.11'
protected={n:Path(n).read_bytes() for n in ['task-unit-mappings.js','upload-auth-reply-batch.js','reference-upload.js','admin-quality-ui.js']}
master=re.search(r'var masterList = \[[\s\S]*?\n\];',Path('index.html').read_text()).group()
def edit(path,old,new):
 p=Path(path);s=p.read_text();assert old in s,(path,old[:80]);p.write_text(s.replace(old,new))
subprocess.run(['git','mv','admin-input-guard.js','assets/admin-input-guard.js'],check=True)
edit('page-enhancements.js','  var modules = [',"  var modules = [\n    {name:'管理员输入兼容', src:'./assets/admin-input-guard.js?v=1.2.11'},")
edit('scripts/bump-version.js',"  'glass-navigation.js',","  'assets/admin-input-guard.js',\n  'glass-navigation.js',")
edit('pptx-auto-split.js','b.click();delete b.dataset.splitV2','b.click();')
edit('pptx-auto-split.js',"async function prepare(){var J=await load(),fs=selected();if(!fs.length)return{files:[],splits:[]};var zip=fs.length==1&&/\\.zip$/i.test(fs[0].path||fs[0].file.name),z=null,big=[],out=[],sum=[];","async function prepare(){var fs=selected();if(!fs.length)return{files:[],splits:[]};var zip=fs.length==1&&/\\.zip$/i.test(fs[0].path||fs[0].file.name),needsZip=zip||fs.some(function(x){return /\\.pptx$/i.test(x.path)&&x.file.size>MAX;}),J=needsZip?await load():null,z=null,big=[],out=[],sum=[];")
edit('pptx-auto-split.js',"document.addEventListener('click',function(e){","function invalidatePrepared(){var b=document.getElementById('adm-ok');if(b)delete b.dataset.splitV2;}\ndocument.addEventListener('change',function(e){if(e.target&&/^(adm-files|adm-folder|adm-zip-mobile)$/.test(e.target.id))invalidatePrepared();},true);\ndocument.addEventListener('click',function(e){")
edit('pptx-auto-split.js',"if(!b||b.dataset.splitV2=='1'||busy)return;","if(!b)return;if(busy){e.preventDefault();e.stopImmediatePropagation();return;}if(b.dataset.splitV2=='1')return;")
edit('hybrid-staged-upload.js',"    if (!button || button.dataset.splitV2 !== '1' || busy) return;","    if (!button) return;\n    if (busy || (Q() && Q().state && Q().state.busy)) { event.preventDefault(); event.stopImmediatePropagation(); return; }\n    if (button.dataset.splitV2 !== '1') return;")
edit('hybrid-staged-upload.js','    startHybridUpload();','    delete button.dataset.splitV2;\n    startHybridUpload();')
edit('admin-import-v2.js','function install(){css();rebuild();',"function install(){css();if(!Q.__v2UiInstalled||!document.getElementById('soilAdminImport')){rebuild();Q.__v2UiInstalled=true;}")
p=Path('CHANGELOG.md');p.write_text(p.read_text().replace('# Changelog\n','# Changelog\n\n## v1.2.12 — 2026-09-26\n\n- 修复文件预处理模拟点击后过早清除完成标记的问题；由真正上传入口消费标记，避免正确密码通过校验后仍反复预处理。\n- 延迟初始化不再重建正在使用的导入弹窗；数字密码输入兼容首尾空白、全角数字和零宽字符，原密码及鉴权逻辑不变。\n- 普通PDF/Word不再无条件加载ZIP组件；预处理和上传忙碌时阻止重复点击回落旧上传入口。\n- 本次不修改凭证验证、错误分类及原通讯录；网络误报凭证失效的独立改进尚未纳入本发布。\n',1))
subprocess.run(['node','scripts/bump-version.js','patch'],check=True)
assert all(Path(n).read_bytes()==v for n,v in protected.items())
assert master==re.search(r'var masterList = \[[\s\S]*?\n\];',Path('index.html').read_text()).group()
print('UI-only patch applied; authentication source and directories unchanged')
