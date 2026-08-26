# Steven Lee Photography Portfolio

诗帝文的个人摄影作品集网站。

## 文件结构

- `index.html`：网站页面与作品内容
- `css/style.css`：视觉样式和响应式布局
- `js/main.js`：灯箱预览交互
- `images/`：摄影作品原图

## 日常更新照片

1. 将新照片上传到 `images/` 目录，建议使用英文小写文件名，例如 `guangzhou-night-01.jpg`。
2. 在 `index.html` 对应作品区域复制一段 `<article>` 或 `<figure>`。
3. 将图片地址改为 `images/新文件名.jpg`，并填写准确的 `alt` 描述。
4. 提交到 `main` 分支后，GitHub Pages 会自动更新。

## 维护建议

- 网页图片建议控制在单张 500 KB 以内，以提升加载速度。
- 上传前将长边压缩到约 2000–2560 px，保存为高质量 JPG 或 WebP。
- 不要使用空格和中文文件名，避免路径兼容问题。
