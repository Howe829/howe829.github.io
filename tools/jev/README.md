# 话里有话 · Jev 表达分析

用于 Howe829/howe829.github.io 的独立静态页面，计划路径 `/tools/jev/`。两个工具一次请求返回：情绪/信息分类（含并存与信息不足），以及“不重 / 还好 / 很重”三档爹味评分。

## 本地运行

Node.js 22 或更新版本：

```sh
node dev-server.mjs
```

打开 http://127.0.0.1:8787。输入访客自己的 TypeSafe API Key 后会产生真实调用费用。密钥仅保存在页面内存，不写入 localStorage、文件或日志。刷新页面即清除。没有密钥时不会生成伪造分析结果。

```sh
node --test evaluation.test.mjs client.test.mjs
```

## 部署配置与维护步骤

1. 在选定的 Cloudflare 账户中部署 `wrangler.toml` 对应的 Worker。无须配置统一 TypeSafe 密钥，使用每位访客当次提供的 Bearer Key。
2. 将返回的 HTTPS Worker 地址加上 `/api/evaluate` 填入 `config.js` 的 `window.JEV_PROXY_URL`。
3. 公开页面只需 `index.html`、`style.css`、`app.mjs`、`client.mjs`、`evaluation.mjs`、`config.js`。放入 GitHub Pages 的 `/tools/jev/`，首页加入入口。
4. 用真实 Key 在最终 Pages 域名验证一次。若使用自定义域名，同时更新 Worker 的 `ALLOWED_ORIGINS`。

当前仓库是 Hexo 生成产物；下次全量生成可能覆盖手工新增页面及首页入口。长期维护应将静态页面放进 Hexo 源项目 `source/tools/jev/` 并配置 `skip_render: tools/jev/**`，在主题配置中维护菜单入口。此次未找到 Hexo 源项目。

## 数据与判断边界

- 浏览器 → 自有 Worker → 固定 TypeSafe API。Worker 会接触访客密钥和输入文本，因此访客必须信任代理运营者。
- TypeSafe 目前不允许该 GitHub Pages 域名直接跨域调用，不能仅靠静态前端隐藏或使用共享密钥解决。
- Worker 不主动记录请求和密钥，关闭 Worker observability；平台及 TypeSafe 的数据处理仍以其服务策略为准。
- 固定上游、模型与问题，限制输入体积和等待时间，错误不回显上游内容。Origin 白名单仅限制浏览器跨域，不是身份认证；非浏览器可以伪造 Origin。公开运营可按需要添加 Cloudflare 平台限流，控制 Worker 资源消耗。
- Score 是三档概率加权的 0–2 值，不是百分比；页面显示最大概率档位和各档概率，不把四舍五入后的分数当作档位。
- 不凭单句给人贴人格标签，不把情绪和信息设为互斥，也不将模型置信度说成准确率。

依据：https://docs.typesafe.ai/api 及 https://docs.typesafe.ai/introduction/quickstart 。

## 本次验证（2026-09-21）

- 基线：远程 master，`ad988d3f0607d15227a96bea5bca64ca8f530fa8`。独立克隆，未改动已有工作区。
- PASS：8 项 Node 功能测试；固定上游/问题、跨域白名单、密钥传递、异常和大请求处理。
- PASS：Wrangler 4.135.0 本地 dry-run 打包，未上传或部署。
- PASS：浏览器模拟响应验证双结果和 401 错误提示；390px 布局无横向溢出。模拟数据不是例句的真实 Jev 判断。
- UNVERIFIED：真实密钥端到端、Cloudflare 线上运行、最终 GitHub Pages 地址。
- 尚未推送、创建 PR 或上线。部署需另行确认。

## 连接问题排查更新

- 实测浏览器 → 本地代理 → Jev 通路可达，使用无效测试密钥得到上游 401。
- 修复前端将所有 TypeError 误归为断网的问题；现在分别显示输入格式、浏览器到代理、上游响应和结果解析错误。
- 支持粘贴带 Bearer 前缀的密钥，提交前识别中文、空格及不可见字符，不输出密钥。
- 11 项测试通过；浏览器验证非法密钥格式提示。用户原始失败尚未复现，仍需用户在页面输入真实密钥验证。

## 移动端更新

- 320px、390px 视口均无横向溢出，输入字体 17px，主按钮约 56px 高。
- 手机分析成功后自动滚动到结果，尊重减少动态效果设置；密钥输入关闭自动大写与自动纠正。
- 用户已授权部署；等待 Cloudflare 重新登录后发布代理并设置公开页面地址。

## 公开部署（2026-09-21）

用户已授权部署。代理：https://howard-jev-tools.lonely829.workers.dev/api/evaluate 。
页面：https://howe829.github.io/tools/jev/ 。
历史验证条目中的“尚未上线”指对应阶段，不代表最新状态。

公开验证：GitHub Pages 已可访问，浏览器经 Cloudflare 代理获得 Jev 401 测试响应，跨域链路正常；12 项功能测试通过。云端真实有效密钥评分与实体手机尚待用户验证。
本地预览始终使用本地代理，不受公开站点 Origin 白名单影响。
