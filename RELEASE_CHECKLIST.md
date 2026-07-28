# 发布检查清单

- [ ] `VERSION` 与页面版本一致。
- [ ] `CHANGELOG.md` 包含当前版本。
- [ ] 内置 GitHub Token 可从 `upload-config.js` 正常恢复。
- [ ] 整改答复上传不要求管理员密码。
- [ ] 上传成功提示包含“稍等3~5分钟刷新网站即可查看新上传的文件”。
- [ ] 已上传答复在原位置显示“查看”“替换”。
- [ ] 刷新页面后，真实仓库答复仍能恢复为“查看”“替换”。
- [ ] `node scripts/validate-upload-token.js` 通过。
- [ ] `node scripts/validate-reply-workflow.js` 通过。
- [ ] `node scripts/validate-project.js` 通过。
- [ ] GitHub Actions 检查通过后再合并和部署。
