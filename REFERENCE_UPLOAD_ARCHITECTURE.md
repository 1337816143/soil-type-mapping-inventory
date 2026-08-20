# 参考资料上传隔离约束

自 v1.1.6 起，参考资料上传与成果质控文件上传是两个独立通道。

- 参考文件页“管理员导入”只能调用 `openSoilReferenceUpload()`，不得调用 `openSoilAdminImport()`。
- `reference-upload.js` 不得依赖 `SoilAdminImport`、`SoilAdminAutoClassifier` 或 `adm-*` 质控字段。
- 参考资料仅根据文件名、ZIP 内部路径或文件夹相对路径识别参考资料目录；成果类型、批次、市、作业单位、任务单元识别规则不得进入该流程。
- 用户手动指定某个文件的归档目录后，异步目录刷新不得覆盖该选择；只有用户点击“重新自动识别”才可恢复自动匹配。
- 参考资料暂存仅使用 `.reference-upload` 和 `reference-upload-*`，后台仅由 `import-reference.yml` 归档，并且只能写入 `reference-files/third-soil-survey`。
- 质控文件继续使用既有质控上传及自动识别链路，两套状态、DOM、暂存分支和 Actions 工作流不得互相复用。
- 手机端参考资料上传窗口必须适配 `visualViewport`、安全区、常见竖屏宽度与低高度横屏，并保证关闭按钮和底部操作始终可见。
- 内置 GitHub 上传 Token 不得因维护参考资料上传而删除、置空或更换，除非项目所有者明确要求。
