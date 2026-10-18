# ENA 登录／退出 API 构建修复

2026-10-19；本地实现与完整构建验证完成，未发布。

## 变更

Next 的 API route 模块只接受指定导出。原登录与退出 route 直接导出了处理器工厂及请求大小／限流常量，导致生产路由类型检查失败。

- `app/api/open-ena/login/route.ts` 和 `logout/route.ts` 现在只导出 `POST`、`runtime`、`dynamic`。
- 原处理器原样迁入 `lib/server/open-ena-login-route.ts`、`lib/server/open-ena-logout-route.ts`。除框架入口导入和配置留在 route 外，已核验服务模块与原实现逐字一致。
- route 中的处理器创建时机、默认依赖、退出后的 `revalidatePath` 调用保持原样。
- 认证测试及迁移测试仅更新模块位置；原断言与已有未提交修改保留。新增测试直接检查实际 route 模块导出，并调用生产适配器验证缺少 Origin 时的拒绝行为。

凭据校验、来源限制、请求体大小、限流、普通／一次性会话时效、HttpOnly/SameSite/Secure cookie、退出撤销、重放拒绝和缓存刷新逻辑均未更改。没有修改构建配置、跳过类型检查或放宽业务约束。

## 验证

- 回归红测：两个实际 route 导出契约在修复前失败；修复后通过。
- 认证相关测试：修复前 56/56，通过；修复后含新增测试 60/60，通过。覆盖来源限制、流式请求大小、限流、会话签名与轮换、一次性凭据、持久撤销、重放拒绝、store 失败关闭与本地化退出刷新。
- 完整 `npm run build`：在独立副本通过，退出码 0。没有替换项目构建脚本；使用 Next.js 16.3.8 默认 Turbopack，完成 jENA 构建、j-3dena 运行时与来源核验、全部 prebuild patch 检查、TypeScript、3,480/3,480 静态条目生成和优化。两个认证 API 均出现在最终路由清单。
- 构建产物本机验证：15 项通过，包括两个 API 的 GET 405、缺失／外站 Origin 403、无认证配置 503，登录非法媒体类型 400、超限请求 413，以及首页、About、繁中、阿拉伯语和登录页的 HTTP 200。拒绝响应不发会话 cookie，不重定向。
- 保留检查：起始记录的 249 个既有 dirty/untracked 文件中，246 个与修复无关的文件 SHA-256 未变。其余 3 个已有测试文件只修改模块位置；其既有内容和断言经逐字比较保留。
- `git diff --check` 通过。

验证副本不复制 `.env` 或凭据。生产模式服务只绑定本机，未配置真实账号和数据库；成功登录、退出撤销等逻辑由使用合成环境和可注入安全存储的运行测试验证，不代表生产账户／数据库已验收。

## 证据与协作

证据目录：`output/auth-route-build-20261019/`。

- `full-build.log`：完整构建输出。
- `auth-tests.log`：60 项测试结果。
- `served-smoke-results.json`：15 项构建产物请求结果。
- `preservation-result.json`：既有文件保留核对。
- `verified-source-sha256.json`：原工作区与构建副本一致的本次源文件指纹。
- `before/`：本次涉及文件的修改前内容。

已与 About 会话协调：本会话负责认证文件和构建；该会话独立复核 HomeAwareChrome 的 key 警告，本轮未修改共享布局。未提交、推送、部署或切换域名。本任务的本机生产预览在完成检查后关闭。
