# 她知 · 制度日历（365 天公开完整版）

一年 365 天，每天一张制度卡片：历史、宪法、法律、政策、组织、参与、行动。
不是法条汇编，而是把“这件事归谁管、我能做什么、下一步找谁”讲清楚。

本仓库公开全部 365 天卡片，打开即可阅读，不设付费、解锁码或登录门槛。

其中：

- 第 1-49 天已完成人工复核；
- 第 50-365 天为已补写资料稿，卡片会明确标注“已补写 · 待复核”；
- 待复核内容属于资料整理与制度科普，不构成法律意见。

## 快速开始

```bash
npm install
npm run dev
```

打开 <http://127.0.0.1:4173>。

### 修改端口

Windows PowerShell：

```powershell
$env:PORT=4174
npm run dev
```

Linux / macOS：

```bash
PORT=4174 npm run dev
```

`PORT=4174 npm run dev` 是 Linux/macOS 的环境变量写法，不能直接在 Windows
PowerShell 中使用。PowerShell 需要先执行 `$env:PORT=4174`，再运行 `npm run dev`。

## 目录结构

```text
public/            前端页面、样式与脚本
netlify/functions/ 内容接口
api/               Vercel 函数入口与完整卡片数据
lib/               周维度与存储适配
scripts/           本地开发服务器
```

## 数据说明

- `api/_data.js` 包含第 1-365 天全部卡片。
- 已复核和未复核状态由每条记录的 `reviewStatus`、`draft` 字段保留。
- 页面不会因为未复核而隐藏内容，但会在卡片上显示复核状态。
- 仓库不包含真实收款码、支付密钥或生产订单数据。

## 授权

代码以 [MIT](LICENSE) 许可开源。

卡片文案、标题、问题、行动提示、卡片数据及其他原创内容采用
[仅限公开查看的内容授权](CONTENT-LICENSE.md)，不属于 MIT 授权范围。

未经书面许可，不得转载、再发布、改编、翻译、制作衍生产品或用于商业用途。
“她知”名称、印章、标志与视觉识别均保留所有权利。

公开仓库意味着任何访问者都能看到源码与内容；GitHub 平台自身的浏览和
Fork 机制仍受 GitHub 服务条款约束。本授权禁止在平台之外复制、转载或商用。

## 第三方组件

- [html2canvas 1.4.1](https://html2canvas.hertzen.com/)（分享长图，从 CDN 加载）
- [gif.js 0.2.0](https://github.com/jnordberg/gif.js)（卡片翻转 GIF）

两者均以 MIT 许可证发布。完整版权与许可文本见
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 安全

不要提交 `.env`、密钥、收款码或真实订单数据。详见 [SECURITY.md](SECURITY.md)。
