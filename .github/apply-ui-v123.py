from pathlib import Path
import re, subprocess
assert Path('VERSION').read_text().strip() == 'v1.2.2', 'Unexpected baseline; do not overwrite a newer release'
config_before = Path('upload-config.js').read_text()
token_before = re.search(r'var tokenCodes = \[[^\]]+\]', config_before).group()

def replace(path, old, new):
    p=Path(path); s=p.read_text(); assert old in s,(path,old); p.write_text(s.replace(old,new))

p=Path('glass-interface.css'); p.write_text(p.read_text()+Path('.github/ui-polish.css').read_text())
replace('page-enhancements.js',"{name:'工作记录', src:'./work-records.js?v=1.2.2'}", "{name:'工作记录', src:'./work-records.js?v=1.2.2'},\n    {name:'玻璃导航与界面细节', src:'./glass-navigation.js?v=1.2.2'}")
replace('scripts/bump-version.js',"  'batch-policy.js',", "  'glass-navigation.js',\n  'batch-policy.js',")
for name in ['index.html','page-enhancements-core.js','soil-type-mapping-inventory.html']:
    replace(name,'./assets/logo.jpg','./assets/cau-logo-transparent.png')
p=Path('page-enhancements-core.js')
s=p.read_text().replace('.footer-brand.cau img{height:56px;max-height:56px}', '.footer-brand.cau img{height:44px;max-height:44px}').replace('.footer-brand.cau img{height:68px;max-height:68px}', '.footer-brand.cau img{height:56px;max-height:56px}').replace("var cauHeight = mobile ? '56px' : '68px';", "var cauHeight = mobile ? '44px' : '56px';")
p.write_text(s)
replace('.github/workflows/deploy.yml','            glass-interface.css\n','            glass-interface.css\n            glass-navigation.js\n')
replace('.github/workflows/deploy.yml','            glass-interface.css work-records.css','            glass-navigation.js assets/cau-logo-transparent.png glass-interface.css work-records.css')
replace('.github/workflows/deploy.yml','          node --check batch-policy.js','          node --check glass-navigation.js\n          node --check batch-policy.js')
replace('.github/workflows/security-audit.yml','          node --check upload-config.js','          node --check glass-navigation.js\n          node --check upload-config.js')
replace('scripts/validate-project.js',"const orderedScripts = [", "if (!loader.includes(`glass-navigation.js?v=${bareVersion}`)) fail('玻璃导航缓存版本未更新');\nif (loader.indexOf('glass-navigation.js') < loader.indexOf('work-records.js')) fail('玻璃导航应在原标签完成安装后加载');\nif (!read('index.html').includes('./assets/cau-logo-transparent.png') || !fs.existsSync('assets/cau-logo-transparent.png')) fail('缺少透明 CAU 标识');\n\nconst orderedScripts = [")
p=Path('scripts/test-workspace-browser.py');s=p.read_text()
marker="            page.locator('[data-tab=\"workRecords\"]').click();expect(page.locator('#wr-new')).to_be_visible()"
assert marker in s
s=s.replace(marker,"            import runpy\n            visual=runpy.run_path(str(ROOT/'scripts/glass-ui-checks.py'))['check_glass_ui'](page,OUT,engine)\n            (OUT/(engine+'-glass-report.json')).write_text(json.dumps(visual,ensure_ascii=False,indent=2))\n"+marker,1)
p.write_text(s)
replace('.github/workflows/workspace-live-check.yml','            scripts/test-live-workspace.py','            scripts/test-live-workspace.py\n            scripts/glass-ui-checks.py')
replace('scripts/test-live-workspace.py',"        report['tabs']=tabs;report['checks'].append('deployed version and all original tabs')", "        report['tabs']=tabs;report['checks'].append('deployed version and all original tabs')\n        import runpy\n        report['glassUI']=runpy.run_path(str(ROOT/'scripts/glass-ui-checks.py'))['check_glass_ui'](page,OUT,'live')")
p=Path('MAINTENANCE_RULES.md');p.write_text(p.read_text()+'''\n## v1.2.3 界面维护约束\n\n- 导航仅移动原节点，不克隆或重建既有标签，保留其事件处理与所有功能入口。\n- 导航滚动只作用于标签栏，不带动整页；保留方向键、Home/End、轻量显示与减少动态效果支持。\n- 中国农业大学页脚使用从原 JPG 去白底得到的透明 PNG，保留原始标识文字及图形；原 JPG 不删除，不使用 AI 重绘。\n- 通用玻璃样式不得抹平主要操作、危险操作、禁用状态及合并区/市级的视觉区别。\n''')
p=Path('CHANGELOG.md');p.write_text(p.read_text().replace('# Changelog\n','# Changelog\n\n## v1.2.3 — 2026-09-19\n\n- 顶部改为标题/显示设置与分段导航两层，强化独立按钮边界、选中态和触控反馈，保留全部原节点与功能入口。\n- 标签栏窄屏提供左右导航按钮与提示，当前标签自动进入可视区域；支持方向键、Home/End 和可访问性状态同步。\n- 从现有中国农业大学 JPG 标识生成透明 PNG，去除白底和冗余外边距，不重绘文字/图形，原 JPG 保留。\n- 统一进度区圆角和工具按钮；保留主要/危险/禁用状态，修正合并区与市级按钮的玻璃主题颜色层级。\n- 加入六种宽度、全部九个标签、键盘导航、透明标识像素、轻量模式和减少动态效果的 Chromium/WebKit 与线上只读检查。\n- 不修改质控数据、工作记录数据、原始附件、整改答复逻辑及内置凭证内容。\n',1))
subprocess.run(['node','scripts/bump-version.js','patch'],check=True)
assert token_before == re.search(r'var tokenCodes = \[[^\]]+\]', Path('upload-config.js').read_text()).group(), 'Embedded credential changed'
allowed={'glass-interface.css','page-enhancements.js','scripts/bump-version.js','index.html','page-enhancements-core.js','soil-type-mapping-inventory.html','.github/workflows/deploy.yml','.github/workflows/security-audit.yml','scripts/validate-project.js','scripts/test-workspace-browser.py','.github/workflows/workspace-live-check.yml','scripts/test-live-workspace.py','MAINTENANCE_RULES.md','CHANGELOG.md','VERSION','app-release-ui.js','app-version-guard.js','upload-config.js'}
changed=set(subprocess.check_output(['git','diff','--name-only']).decode().splitlines())
assert changed<=allowed, changed-allowed
print('Exact UI integration complete; credential and business-data boundaries preserved')
