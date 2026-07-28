# 版本迭代规则

本项目从 `v1.0.5` 起，所有代码或功能修改均同步更新版本号和 `CHANGELOG.md`。

- `patch`：单个问题修复、单项界面调整、单项数据规则修改。
- `minor`：一次加入多项相关功能，或对一个模块进行较大改造。
- `major`：存在不兼容变更、整体架构重构或大范围功能升级。

常规修改默认执行：

```bash
node scripts/bump-version.js patch
```

较大更新分别使用 `minor` 或 `major`。脚本会同步更新 `VERSION`、页面显示版本和主要资源缓存版本；提交前还需在 `CHANGELOG.md` 顶部写明修改内容。
