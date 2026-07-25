# Cloudflare Worker 上传服务配置

网页端已经改为通过 Cloudflare Worker 上传文件。最终用户不需要输入 GitHub Token，也不需要登录 GitHub。

## 一次性配置

### 1. 撤销旧 Token

此前曾出现在网页源码中的 GitHub Token 必须先在 GitHub 中撤销，不要继续使用。

### 2. 创建新的 GitHub fine-grained personal access token

只授权以下范围：

- Repository access：仅 `1337816143/soil-type-mapping-inventory`
- Repository permissions：`Contents` → `Read and write`
- 建议设置合理的过期时间，并在到期前更换

### 3. 创建 Cloudflare API Token

在 Cloudflare 中创建 API Token，账户权限至少包含：

- Account → Workers Scripts → Edit

记录 Cloudflare Account ID。

### 4. 添加 GitHub Actions Secrets

进入仓库：

`Settings → Secrets and variables → Actions → New repository secret`

添加以下三个 Secret：

| Secret 名称 | 内容 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |
| `GITHUB_UPLOAD_TOKEN` | 第 2 步新建的 GitHub fine-grained token |

Secret 只保存在 GitHub Actions 与 Cloudflare Worker 中，不会写入网页源码。

### 5. 执行部署

进入：

`Actions → Deploy upload Worker → Run workflow`

工作流会自动完成：

1. 部署 Worker；
2. 将 GitHub Token 加密保存为 Worker Secret；
3. 获取 Worker 的 `workers.dev` 地址；
4. 自动更新 `upload-config.js`；
5. 重新部署 GitHub Pages。

完成后，用户仍然只需点击上传、选择文件、确认上传。

## 当前限制

- 文件类型：PDF、Word、Excel、ZIP、RAR
- 单个文件最大：20 MB
- 只允许从 `https://1337816143.github.io` 发起浏览器上传请求
- 上传文件写入仓库的 `replies/` 目录

## 本地检查

```bash
cd worker
npm install
npm run check
```
