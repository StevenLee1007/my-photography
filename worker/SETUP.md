# 摄影管理后台开通

管理页面：<https://stevenlee.uk/admin.html>

页面演示不会保存数据。正式功能需要在自己的 Cloudflare 账户完成以下配置；GitHub Pages 继续负责现有网站。

## 1. 开通 R2

在 Cloudflare 的 **Storage & databases → R2 → Overview** 开通服务，再创建 **Standard** 桶 `stevenlee-photos`。

本方案由 Worker 读取照片，桶保持私有即可。不需要开启 r2.dev、公开整个桶或配置 `img.stevenlee.uk`；已有网站图片暂时继续从 GitHub 读取。

## 2. 部署一次后台

电脑安装 Node.js（LTS），下载本仓库，在 `worker` 文件夹打开终端。执行：

```sh
npx wrangler@4 login
npx wrangler@4 deploy
npx wrangler@4 secret put ADMIN_PASSWORD
npx wrangler@4 secret put SESSION_SECRET
```

登录时选择管理 `stevenlee.uk` 的 Cloudflare 账户。`deploy` 会按 `wrangler.jsonc` 绑定 R2 桶、登录限流，并添加 `api.stevenlee.uk` 的 Worker 自定义域名。此域名不要预先创建 CNAME；根域名的 GitHub Pages 设置不用修改。

两次 `secret put` 会在终端分别提示输入：

- `ADMIN_PASSWORD`：自己设定的管理密码，至少 16 个字符。
- `SESSION_SECRET`：随机生成的至少 32 个字符的密钥，例如通过密码管理器生成 64 个随机字符。

密钥只保存在 Cloudflare Secret 中，不提交 GitHub，也不要发到聊天里。配置完成后访问管理页面，输入管理密码即可。密码修改会使已有会话失效。

## 3. 日常使用

1. 登录管理页面，现有四个相册会自动导入编辑器。
2. 创建相册、填写名称说明、选择首页展示位置及排版。
3. 上传 JPG / PNG / WebP，单张最多 10 MB。使用箭头排序，选择封面。
4. 点击 **保存并发布**。再打开或刷新公开网站，即可看到保存的内容。

首次保存会将现有相册清单写入 R2；原来的图片不需要重新上传。新相册自动出现在首页，可点开独立相册页面。Summer / Shantou 的原地址也会读取新内容。

## 数据与删除

- `private/gallery.json`：相册和照片顺序。只通过 API 返回，不公开桶列表。
- `photos/`：上传的照片。照片链接可以公开访问，未保存的照片不会出现在相册中。
- 删除照片或相册会在保存后移除网站展示。R2 原文件保留以便恢复，因此不会自动释放存储；需要彻底删除原文件时，在 R2 中确认后手动删除。
- 管理密码使用 HTTPS 与 HttpOnly 会话 Cookie；不把写入权限放在网页代码里。
- 多个页面同时编辑时，旧版本保存会被拒绝。请保留未保存的内容，再重新打开管理页面。
- 后台连接失败时，公开页面继续显示原静态内容。首次部署后务必验证实际上传和保存。

## 验证

部署后测试：登录 → 新建测试相册 → 上传一张照片 → 保存 → 在退出登录或另一台设备访问网站 → 修改顺序和封面 → 保存 → 删除测试相册 → 保存。

本地接口测试（模拟 R2，不产生云端数据）：

```sh
npm test
```

参考：[R2 Worker API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)、[Worker 自定义域名](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)、[Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)、[登录限流绑定](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)。
