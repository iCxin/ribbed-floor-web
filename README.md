<div align="right"><sub><code>iCxin / ribbed-floor-web</code></sub></div>

# 肋形楼盖辅助设计系统 · 纯前端版

> 把 C++ 计算内核完整移植到浏览器：打开网页即可完成内力分析、规范验算与配筋优化。
> The ribbed-floor slab design kernel, ported to TypeScript and running entirely in the browser.

| | |
|:--|:--|
| **状态** | 活跃维护 |
| **栈** | `TypeScript` · `React 19` · `Vite 7` · `Tailwind CSS 4` |
| **平台** | 浏览器（桌面 / 移动） |
| **许可** | [MIT](LICENSE) |

---

## 01 · 这是什么

与[嵌入式 / 桌面版（C++）](https://github.com/iCxin/ribbed-floor-design-system)共用同一套算法与二进制协议：参数经 0xAA55 协议帧（CRC16）送入流水线，依次完成 **参数解析 → ACM 板弯单元 FEM → 规范配筋优化 → 结果帧封装 → 本地存档**。计算依据 SL 191-2008 / GB 50010-2010。

无需服务器、无需安装，也没有后端请求：全部计算在页面内完成。

> 输出为辅助计算结果，用于实际工程设计前须经注册结构工程师复核。

## 02 · 功能

- **设计计算**：强度等级 C20~C80、单向 / 双向板、几何与荷载参数 → 完整设计报告，含弯矩包络、挠度 / 裂缝验算、四部位配筋方案、用钢量、上下行协议帧十六进制。
- **计算书导出**：完整计算过程（工程概况 → 计算模型 → 荷载组合 → 内力分析 → 挠度 / 裂缝验算逐步算式 → 分部位配筋计算 → 构造检查 → 结论），每一步给出公式与代入数值，一键"打印 / 导出 PDF"。
- **内核自检**：页面内置 17 项断言，覆盖 CRC16 / CRC32 / MD5 黄金向量、帧协议自反性、FEM 与 Timoshenko 简支板解析解对比、承载力公式往返、端到端流水线。
- **设计记录**：localStorage 存档（最近 50 条循环覆盖），可一键载入重算。
- **协议帧工具**：粘贴十六进制参数帧直接走解析流水线，与硬件接口等价路径。
- **响应式布局**：桌面双栏 / 移动单栏自适应，页签横向滚动，数据卡随视口收缩，计算完成后自动滚动至结果区。
- **亮 / 暗双主题**：shadcn/ui 风格（zinc 色板），跟随系统并持久化。

## 03 · 本地开发

安装依赖：
```bash
npm install
```

开发服务器（http://localhost:5173）：
```bash
npm run dev
```

构建，产物输出至 `dist/`：
```bash
npm run build
```

预览构建产物：
```bash
npm run preview
```

## 04 · 部署到 EdgeOne Pages

一键部署入口：[edgeone.ai/deploy](https://edgeone.ai/deploy?repo=https://github.com/iCxin/ribbed-floor-web)，或按下述手动流程操作。

1. 登录 [EdgeOne Pages 控制台](https://console.cloud.tencent.com/edgeone/pages)，选择 **创建项目 → 从 Git 仓库导入**，授权并选择本仓库。
2. 框架预设选择 **Vite**；仓库内 `edgeone.json` 已声明构建设置，通常自动填充：

| 配置项 | 值 |
|:--|:--|
| 安装命令 | `npm install` |
| 构建命令 | `npm run build` |
| 输出目录 | `dist` |
| Node 版本 | 22 |

3. 点击 **立即创建**，约 1 分钟后获得 `*.edgeone.app` 域名；后续 push 自动触发重新部署。

## 05 · 计算内核（src/kernel）

| 文件 | 内容 | 对应 C++ 版 |
|:--|:--|:--|
| `protocol.ts` | CRC16-XMODEM / CRC32、组帧解帧、参数 / 结果载荷编解码（含 4bit 直径编码、定点数） | `protocol.cpp` `result_pack.cpp` |
| `fem.ts` | ACM 四节点薄板弯单元：12 项多项式基形函数数值求逆、2×2 高斯积分、Cholesky 求解、内力包络 | `struct_calc.cpp` |
| `concrete.ts` | 材料库（C20~C80）、钢筋规格（D8~D25）、σs / 裂缝宽度 / 抗弯承载力公式 | `struct_calc.cpp` `rebar_optim.cpp` |
| `optimizer.ts` | 约束优化：K≥1.2 承载力 + 裂缝 ≤0.3mm + 最小配筋率，规格匹配与回溯保护 | `rebar_optim.cpp` |
| `pipeline.ts` | 全流水线：参数校验 → 组帧 → 分析 → 优化 → 结果帧 | `system_controller.cpp` |
| `md5.ts` | RFC 1321 MD5（设计记录哈希索引） | `data_storage.cpp` |
| `selftest.ts` | 17 项内核自检 | `main.cpp --selftest` |
| `history.ts` | localStorage 设计记录（循环覆盖） | `data_storage.cpp` |

## 06 · 许可

MIT，见 [LICENSE](LICENSE)。

---

<div align="right"><sub>从像素到混凝土 · <a href="https://github.com/iCxin">iCxin</a></sub></div>
