# 安全说明

## 不要提交的内容

- `.env`、`.env.*`（`.env.example` 除外）
- 管理后台令牌（`ADMIN_TOKEN`）
- 云服务密钥（CloudBase / Netlify / Vercel / 数据库连接串）
- 微信、支付宝等收款码图片
- 真实订单、用户备注、解锁码等运行数据

## 报告问题

如果你在本仓库发现密钥泄露、隐私数据或安全问题，请不要公开披露细节。请使用仓库 **Security** 页面的 **Report a vulnerability** 私下报告；如果该入口尚未启用，可先提交一个不含漏洞细节的 Issue，请维护者提供私下联系方式。

## 部署前检查

1. 确认 `git status` 里没有 `.env`、`*.key`、收款码等文件。
2. 确认 `git log --all --name-only` 中没有历史密钥；如有，先轮换密钥再推送。
3. 线上环境变量只配置在平台侧（Netlify / Vercel / CloudBase），不要写进代码。

## 已知依赖风险

本项目保留可选的 CloudBase RDB 适配。`npm audit` 目前会通过
`@cloudbase/node-sdk` 报告其传递依赖 `axios` 的高危公告。公开阅读版不会调用
CloudBase RDB；只有在配置 `TCB_ENV_ID` 等 CloudBase 环境时才会进入该路径。
正式部署并启用 CloudBase 存储前，请先评估升级、替换或隔离该适配层。
