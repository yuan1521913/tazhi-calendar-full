// 上线模式开关。全项目唯一来源，content.mjs 与 create-order.mjs 共用。
//
// 2026-10-11：腾讯云服务器停续费，暂停售卖，全站内容对所有人开放。
// 未复核的草稿也一并放出，但卡片自带的 draft / reviewStatus 标记保留，
// 前端仍按原样显示「已补写 · 待复核」。
//
// 恢复售卖时把 OPEN_TO_PUBLIC 改回 false：内容重新按权限裁剪，
// 下单接口同时恢复。
export const OPEN_TO_PUBLIC = true;
