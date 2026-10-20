# 国家抽查材料挂载约定

国家抽查是现有导航末尾的独立专栏。内部按现站八个专题排列，区县仅作为材料归属和筛选项；不接入原成果收缴统计、管理员上传及答复流程。

## 初始状态

`data/national-inspection.json` 当前 `batches` 和 `materials` 均为空。页面成功读取后显示 0 个文件、0 个批次。不得为占位创建批次、假文件或链接，也不得从原质控区自动复制材料。读取失败须显示错误，而非当作空清单。

## 后续增量挂载

仅接到明确的真实材料后，保存文件至 `national-inspection-files/` 下，保留原文件名及历史批次，再向 JSON 清单增量加入记录。先确认所有文件真实存在且已在约定公开范围内，再发布清单。不要覆盖旧批次材料或复用其 ID 指代另一材料。

- `schemaVersion` 固定为 `1`。
- `batches` 每项包含稳定且唯一的 `id` 与界面显示用 `label`。仅在已有材料关联时创建，不按专题或区县猜造批次。
- `materials` 每项包含 `id`、`topicId`、`countyId`、`cityId`、`materialType`、`batchId`、`path`、`name`。
- `id` 为永久材料关系 ID。单份物理文件明确关联多个区县/专题时可有多个关系 ID，但共用同一个 `path`，批量下载按路径去重。
- `topicId` 顺序固定：`soilType`、`soilAttr`、`farmland`、`degradation`、`specialty`、`agriSuitability`、`landUse`、`reports`，名称完全沿用现站。
- `countyId` / `cityId`：`jinzhou` / `shijiazhuang`（石家庄晋州）、`shexian` / `handan`（邯郸涉县）、`ningjin` / `xingtai`（邢台宁晋）、`bazhou` / `langfang`（廊坊霸州）。
- `materialType` 只能是 `quality`（质控材料）或 `scoring`（评分材料），不能根据“评分”等关键词隐式改变其他元数据。
- `batchId` 必须引用 `batches` 中已登记 ID，历史批次始终保留。
- `path` 必须是 `national-inspection-files/` 开头的真实仓库相对路径；不允许外链、绝对路径、反斜杠、路径穿越、URL 编码、查询参数或片段。`name` 必须与路径最后一段的原文件名一致。
- 支持 PDF、Word、Excel、PowerPoint、ZIP、TXT、CSV、PNG、JPEG、WebP。普通文件按钮始终先打开站内预览，格式无法直接渲染时仍先进入文件页，由用户选择下载。

## 验证

运行 `node scripts/test-national-inspection.js`，校验结构、筛选、多个真实批次、关联去重、安全路径、真实文件存在性、空态与加载契约。DOM 回归另运行 `node scripts/test-national-inspection-dom.js`。现有项目校验与预览、公开批量下载、手机弹窗回归不可删减。测试样例只存在测试内存，不进入发布清单。

发布必须同时包含模块、样式、清单和真实新增文件；部署工作流的 sparse checkout 及必需文件检查须覆盖该独立目录。不得借此引入新账号、凭据或后台权限。
