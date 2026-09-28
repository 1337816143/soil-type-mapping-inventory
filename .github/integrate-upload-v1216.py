from pathlib import Path
r=Path('.')
p=r/'scripts/validate-auto-import-classifier.js';s=p.read_text();needle='// End-to-end mapping checks use the real embedded lists and actual Actions writer.'
assert needle in s;s=s.replace(needle,"require('child_process').execFileSync(process.execPath,['scripts/validate-upload-recognition.js'],{stdio:'inherit'});\n\n"+needle);p.write_text(s)
p=r/'scripts/test-assignment-index.py';s=p.read_text();needle="if extra.exists():fixtures+=json.loads(extra.read_text())";assert needle in s;s=s.replace(needle,needle+"\nrecognition=ROOT/'test-artifacts/upload-recognition-manifests.json'\nif recognition.exists():fixtures+=json.loads(recognition.read_text())");p.write_text(s)
p=r/'scripts/test-workspace-browser.py';s=p.read_text();needle='            assignment_ui=runpy.run_path'
assert needle in s;s=s.replace(needle,"            recognition_ui=runpy.run_path(str(ROOT/'scripts/check-upload-recognition-ui.py'))['check_upload_recognition_ui'](page,OUT,engine)\n            (OUT/(engine+'-upload-recognition-ui.json')).write_text(json.dumps(recognition_ui,ensure_ascii=False,indent=2))\n"+needle);p.write_text(s)
p=r/'scripts/test-live-workspace.py';s=p.read_text();needle="        tabs=page.locator('header .tabs .tab').all_text_contents()"
block='''        page.evaluate("openSoilAdminImport({kind:'quality',dataKey:'reports'})")
        report['uploadRecognition']=page.evaluate(r"""()=>{
          const C=SoilAdminAutoClassifier,before=JSON.stringify(SoilTaskUnitLists);
          const names=['元氏县_总体、工作、数据报告-河北湛泸软件开发有限公司_2026年第二次第1批.pdf','黄骅市_土壤属性制图_河北玛恩农业科技有限公司_2026年第三次第1批.pdf'];
          const items=names.map(name=>({file:new File(['read-only fixture'],name,{type:'application/pdf'}),path:name,sourcePath:name}));
          const metas=items.map(i=>C.applyItemMetadata(i));
          if(metas[0].dataKeys.join()!=='reports'||!metas[0].assignment.complete||items[0].unit!=='河北湛泸软件开发有限公司')throw Error('Screenshot report classification');
          if(metas[1].dataKeys.join()!=='soilAttr'||!metas[1].assignment.complete||items[1].batch!=='2026年第三次第1批')throw Error('Screenshot attribute classification');
          if(!C.qualityContentError(items[0],metas[0]))throw Error('Missing separate content confirmation');
          SoilAdminImport.normalizePreparedFiles(items);SoilAdminImport.renderPreview();
          if(document.querySelectorAll('#adm-list .rk').length!==2)throw Error('Missing per-file category controls');
          if(JSON.stringify(SoilTaskUnitLists)!==before)throw Error('Roster changed');
          return {status:'passed',mode:'memory-only; no upload',keys:metas.map(m=>m.dataKeys),thirdRound:items[1].batch,contentConfirmationRequired:true};
        }""")
        page.locator('#soilAdminImport .adm-close').click()
'''
assert needle in s;s=s.replace(needle,block+needle);p.write_text(s)
p=r/'CHANGELOG.md';s=p.read_text();s=s.replace('# Changelog\n','# Changelog\n\n## v1.2.16 — 2026-09-28\n\n- 修复“总体、工作、数据报告”文件名未写质控意见时，成果类型空缺、人工已填归属仍无法上传的问题。类别识别与文件内容确认分开，未注明意见的报告类文件须明确确认其为质控意见；明确报告原件和参考资料继续拦截。\n- 补充“土壤属性制图/图件”“土壤类型制图/图件”命名兼容，严格区分属性图与类型图，保留年份、质控轮次及反馈批次。\n- 每条文件新增成果类型选择；错误只列真正缺失的字段，人工选择、单位来源和通讯录差异保护保留。上传前统一校验，归属不全不再先联网后失败。\n- 加入截图原文件名、16份批量意见、真实点击预处理/鉴权/模拟传输、内容确认取消/重新选文件、逐条人工修正与实际归档索引的回归测试。原通讯录、报告、索引和凭证未改。\n',1);p.write_text(s)
p=r/'MAINTENANCE_RULES.md';p.write_text(p.read_text()+'''\n\n## v1.2.16 上传归属与内容确认\n\n- 成果类别识别与文件是否为质控意见分开：不能只因报告类文件名省略“质控意见”而丢掉类别和已填归属；仅在质控入口内进行临时类别识别，上传前须单独确认内容，明确报告原件/参考资料继续阻止。\n- 内容确认仅绑定当前File对象和当前归属、批次，不写入持久授权；换文件或归属改变需重新确认，上传清单生成再次校验，不以文件名声明为内容真实性证明。\n- 每条文件提供成果类型项，不靠隐藏的全局下拉框猜配；只提示真正未填写的字段。属性制图不得匹配成类型图，年度/轮次不得丢失。\n- 修复必须覆盖实际上传点击链和模拟暂存字节、清单及原Actions索引写入，不能只测试按钮存在或错误密码。所有测试禁止生产数据写入。\n''')
p=r/'docs/QUALITY_UPLOAD_NAMING.md';p.write_text(p.read_text()+'''\n\n## v1.2.16 上传校验\n\n“总体、工作、数据报告”合并质控意见可写为`元氏县_总体、工作、数据报告_质控意见_2026年第二次第1批.pdf`。名称省略“质控意见”时，质控入口保留类别与归属识别，但开始上传前必须逐份核对并确认内容为质控意见，不是报告原件；取消不丢失所选文件。明确标示报告原件或参考资料的文件不能通过该确认导入。\n\n“土壤属性制图/图件”归土壤属性图，“土壤类型制图/图件”归土壤类型图。不确定的文件在每条文件右侧选择成果类型；不修改单位通讯录。\n''')
