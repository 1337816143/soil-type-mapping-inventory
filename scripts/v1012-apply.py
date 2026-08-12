from pathlib import Path


def replace(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'patch anchor not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

# hybrid-staged-upload.js: use classifier metadata per file instead of one manually selected result type.
replace('hybrid-staged-upload.js',
"  function R() { return window.SoilQualityFileRouting; }\n  function token() { return String(window.SOIL_GITHUB_UPLOAD_TOKEN || '').trim(); }",
"  function R() { return window.SoilQualityFileRouting; }\n  function C() { return window.SoilAdminAutoClassifier; }\n  function token() { return String(window.SOIL_GITHUB_UPLOAD_TOKEN || '').trim(); }")

replace('hybrid-staged-upload.js',
"  function sharedInspection(item) {\n    var router = R();\n    if (!router || !item || !item.file || !router.isSharedReport(item.file.name)) return null;\n    var inspection = router.inspectFile(item.file.name, router.coveredKeys);",
"  function itemMetadata(item) {\n    var classifier = C();\n    if (item && item.autoMeta) return item.autoMeta;\n    if (classifier && typeof classifier.applyItemMetadata === 'function') return classifier.applyItemMetadata(item);\n    return null;\n  }\n\n  function itemDataKeys(item, fallback) {\n    var meta = itemMetadata(item);\n    var keys = meta && Array.isArray(meta.dataKeys) ? meta.dataKeys.filter(Boolean) : [];\n    if (!keys.length && fallback) keys = [fallback];\n    return keys;\n  }\n\n  function safeSegment(value) {\n    return String(value || '').replace(/[\\\\/:*?\"<>|\\u0000-\\u001f]/g, '_').trim();\n  }\n\n  function qualityRoot() {\n    var a = A();\n    var select = document.getElementById('adm-directory');\n    var root = select && select.value ? select.value : 'data/质控意见反馈_管理员导入';\n    var extra = document.getElementById('adm-new-directory');\n    if (extra && extra.value.trim()) root += '/' + extra.value.trim();\n    return a.clean(root);\n  }\n\n  function automaticQualityPath(item, dataKeys) {\n    var q = Q();\n    var a = A();\n    if (!item || !item.file) return q.destinationFor(item);\n    if (dataKeys.length !== 1) {\n      return a.clean(qualityRoot() + '/多成果共享质控/' + safeSegment(item.batch || '管理员导入') + '/' + safeSegment(item.file.name));\n    }\n    var label = q.types()[dataKeys[0]] || dataKeys[0];\n    return a.clean([qualityRoot(), label, item.batch || '未分批', item.city || '未分类市', item.unit || '未分类单位', item.district || '未分类任务单元', item.path].join('/'));\n  }\n\n  function sharedInspection(item, dataKeys) {\n    var router = R();\n    if (!router || !item || !item.file || !router.isSharedReport(item.file.name)) return null;\n    var inspection = router.inspectFile(item.file.name, dataKeys && dataKeys.length ? dataKeys : router.coveredKeys);")

replace('hybrid-staged-upload.js',
"    var router = R();\n    var kind = document.getElementById('adm-kind').value;\n    var dataKey = document.getElementById('adm-data-key').value;",
"    var router = R();\n    var classifier = C();\n    var selection = classifier && typeof classifier.selectionMetadata === 'function' ? classifier.selectionMetadata(files) : null;\n    if (selection && selection.kind === 'mixed') throw new Error('一次导入中同时包含质控意见和参考资料，请分两次选择；其余信息均可自动匹配。');\n    var detectedKind = selection && (selection.kind === 'quality' || selection.kind === 'reference') ? selection.kind : '';\n    var kind = detectedKind || document.getElementById('adm-kind').value;\n    var dataKey = document.getElementById('adm-data-key').value;")

replace('hybrid-staged-upload.js',
"        var shared = kind === 'quality' ? sharedInspection(item) : null;\n        var targetPath = shared && router ?\n          uniquePath(router.sharedStoragePath(item.file.name, item.batch || '管理员导入'), used) :\n          uniquePath(q.destinationFor(item), used);\n        var record = {",
"        var meta = itemMetadata(item);\n        var dataKeys = kind === 'quality' ? itemDataKeys(item, dataKey) : [];\n        var shared = kind === 'quality' ? sharedInspection(item, dataKeys) : null;\n        var targetPath = shared && router ?\n          uniquePath(router.sharedStoragePath(item.file.name, item.batch || '管理员导入'), used) :\n          uniquePath(kind === 'quality' && meta && meta.dataKeys && meta.dataKeys.length ? automaticQualityPath(item, dataKeys) : q.destinationFor(item), used);\n        var record = {")

replace('hybrid-staged-upload.js',
"          storage: item.file.size <= SINGLE_BLOB_LIMIT ? 'whole' : 'chunked'\n        };",
"          storage: item.file.size <= SINGLE_BLOB_LIMIT ? 'whole' : 'chunked'\n        };\n        if (meta && meta.catalogExact && meta.expectedSha256) {\n          record.expectedSha256 = String(meta.expectedSha256).toLowerCase();\n          record.expectedSize = Number(meta.expectedSize || item.file.size);\n        }")

replace('hybrid-staged-upload.js',
"              dataKey: dataKey,\n              city: item.city || '',",
"              dataKey: dataKeys[0] || dataKey,\n              dataKeys: dataKeys.slice(),\n              city: item.city || '',")

replace('hybrid-staged-upload.js',
"    var kind = document.getElementById('adm-kind').value;\n    if (kind === 'quality') {\n      var incomplete = files.filter(function (item) {\n        return !isSharedItem(item) && (!item.city || !item.unit || !item.district);\n      });",
"    var classifier = C();\n    var selection = classifier && typeof classifier.selectionMetadata === 'function' ? classifier.selectionMetadata(files) : null;\n    if (selection && selection.kind === 'mixed') {\n      progress('一次导入中同时包含质控意见和参考资料，请分两次选择；成果类型、批次和任务单元仍会自动匹配。', 0);\n      return;\n    }\n    var kind = selection && (selection.kind === 'quality' || selection.kind === 'reference') ? selection.kind : document.getElementById('adm-kind').value;\n    if (kind === 'quality') {\n      var fallbackDataKey = document.getElementById('adm-data-key').value;\n      var incomplete = files.filter(function (item) {\n        return !isSharedItem(item) && (!itemDataKeys(item, fallbackDataKey).length || !item.city || !item.unit || !item.district);\n      });")

replace('hybrid-staged-upload.js',
"        files.forEach(function (item) { if (isSharedItem(item)) sharedInspection(item); });",
"        files.forEach(function (item) { if (isSharedItem(item)) sharedInspection(item, itemDataKeys(item, fallbackDataKey)); });")

replace('hybrid-staged-upload.js',
"        var sharedCount = manifest.files.filter(function (item) { return item.quality && item.quality.shared; }).length;\n        if (sharedCount) {\n          progress('已识别 ' + sharedCount + ' 份北部共享质控报告：每份文件只上传一次，并自动关联文件名中的全部任务单元。', 4);\n        }",
"        var sharedCount = manifest.files.filter(function (item) { return item.quality && item.quality.shared; }).length;\n        var autoTypedCount = manifest.files.filter(function (item) { return item.quality && Array.isArray(item.quality.dataKeys) && item.quality.dataKeys.length; }).length;\n        if (sharedCount) {\n          progress('已识别 ' + sharedCount + ' 份北部共享质控报告：每份文件只上传一次，并自动关联地区、成果类型和批次。', 4);\n        } else if (kind === 'quality' && autoTypedCount) {\n          progress('已自动识别 ' + autoTypedCount + ' 份质控文件的成果类型、批次和任务单元，无需手动指定。', 4);\n        }")

replace('hybrid-staged-upload.js',
"    var text = '39 MiB 及以下文件整文件上传，不分块；超过 39 MiB 的文件按每块 39 MiB 暂存。北部“多个地区第三次全国土壤普查成果质控报告”会按文件名自动关联全部地区，仓库只保存一份原文件。';",
"    var text = '导入时自动识别导入类型、成果类型、批次和任务单元；只有无法识别的项目才需要人工调整。39 MiB 及以下整文件上传，超过39 MiB按块暂存；北部共享报告始终只保存一份原文件。';")

# Actions: validate pre-associated northern file bytes by SHA-256 and index multiple result types without duplicating physical files.
replace('.github/workflows/import-chunked.yml',
"          import json\n          import shutil\n          from pathlib import Path, PurePosixPath",
"          import hashlib\n          import json\n          import shutil\n          from pathlib import Path, PurePosixPath")

replace('.github/workflows/import-chunked.yml',
"              if actual != int(item.get('size') or -1):\n                  raise SystemExit(f'文件大小校验失败：{item.get(\"originalName\") or index}')\n              if actual >= 100 * 1024 * 1024:",
"              if actual != int(item.get('size') or -1):\n                  raise SystemExit(f'文件大小校验失败：{item.get(\"originalName\") or index}')\n              expected_size = int(item.get('expectedSize') or 0)\n              if expected_size and actual != expected_size:\n                  raise SystemExit(f'登记表文件大小不匹配：{item.get(\"originalName\") or index}')\n              expected_sha = str(item.get('expectedSha256') or '').strip().lower()\n              if expected_sha:\n                  actual_sha = hashlib.sha256(output.read_bytes()).hexdigest()\n                  if actual_sha != expected_sha:\n                      raise SystemExit(f'登记表 SHA-256 校验失败：{item.get(\"originalName\") or index}')\n              if actual >= 100 * 1024 * 1024:")

old = """                  if quality.get('shared'):\n                      data_keys = [str(x) for x in (quality.get('dataKeys') or []) if str(x)]\n                      targets = [str(x) for x in (quality.get('targets') or []) if str(x)]\n                      if not data_keys or not targets:\n                          raise SystemExit(f'共享质控报告缺少 dataKeys/targets：{final_path}')\n                      common.update({\n                          'sharedSource': True,\n                          'dataKeys': data_keys,\n                          'targets': targets\n                      })\n                  else:\n                      common.update({\n                          'dataKey': str(quality.get('dataKey') or ''),\n                          'city': str(quality.get('city') or ''),\n                          'unit': str(quality.get('unit') or ''),\n                          'district': str(quality.get('district') or '')\n                      })\n                  quality_records.append(common)"""
new = """                  data_keys = [str(x) for x in (quality.get('dataKeys') or []) if str(x)]\n                  if not data_keys and str(quality.get('dataKey') or ''):\n                      data_keys = [str(quality.get('dataKey'))]\n                  if quality.get('shared'):\n                      targets = [str(x) for x in (quality.get('targets') or []) if str(x)]\n                      if not data_keys or not targets:\n                          raise SystemExit(f'共享质控报告缺少 dataKeys/targets：{final_path}')\n                      common.update({\n                          'sharedSource': True,\n                          'dataKeys': data_keys,\n                          'targets': targets\n                      })\n                      quality_records.append(common)\n                  else:\n                      if not data_keys:\n                          raise SystemExit(f'质控文件未识别成果类型：{final_path}')\n                      for data_key in data_keys:\n                          row = dict(common)\n                          row.update({\n                              'dataKey': data_key,\n                              'city': str(quality.get('city') or ''),\n                              'unit': str(quality.get('unit') or ''),\n                              'district': str(quality.get('district') or '')\n                          })\n                          quality_records.append(row)"""
replace('.github/workflows/import-chunked.yml', old, new)

# Mark the 28-document package as an authoritative pre-associated import registry.
replace('data/north-quality-feedback-package.json',
'  "storageRule": "每份原始质控报告只保存1份；通过targets/dataKeys关联多个任务单元和成果类型。",\n  "documents": [',
'  "storageRule": "每份原始质控报告只保存1份；通过targets/dataKeys关联多个任务单元和成果类型。",\n  "associationStatus": "pre-associated",\n  "associationRule": "filename+size+sha256",\n  "importDefaults": {"kind":"quality","batch":"第一轮","autoTargets":true,"autoDataKeys":true},\n  "documents": [')

# Version bump helper must keep the auto-classifier cache key current in later releases.
replace('scripts/bump-version.js',
"  'admin-import-v2-bridge.js',\n  'north-quality-upload-adapter.js',",
"  'admin-import-v2-bridge.js',\n  'admin-auto-classifier.js',\n  'north-quality-upload-adapter.js',")

print('v1.0.12 structural patches applied')
