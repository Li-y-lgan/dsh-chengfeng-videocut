# dsh-chengfeng-videocut

把 [chengfeng-videocut](https://github.com/Agentchengfeng/chengfeng-videocut) 的**中文口播剪辑技能**做成 DeepSeek Harness 技能插件。

源项目 `Agentchengfeng/chengfeng-videocut-skills`（Apache-2.0，GitHub ≈3130★）是一套给中文口播创作者的「本地剪辑工作台」插件：浏览器里的 Studio 对照视频+逐字稿审核剪切，Agent 通过 CLI 编排。本包把它的 7 个技能 + 协调脚本原样搬进 DSH，并接好 DSH 的技能注册与自检工具。

## 7 个技能

| 技能 | 作用 | 依赖 Runtime |
|---|---|---|
| `chengfeng-cut` | 剪口播：逐词转录→词典修字→五轮扫描口误/重复→删词账本 | ✅ |
| `chengfeng-subtitle` | 字幕 | ✅ |
| `chengfeng-export` | 导出成片（确认物理剪切+渲染+验收） | ✅ |
| `chengfeng-visual` | 画面/分镜动画（含 ian-xiaohei-svg-motion 风格） | ✅ |
| `chengfeng-report-bug` | 上报 Bug | ✅ |
| `chengfeng-check-updates` | 检查插件/Runtime 更新、就绪检查 | ✅ |
| `chengfeng-videocut-workbench` | 工作台级操作（move/trim/split/delete） | ⚠️ 需 Runtime 0.5.9+ |

## 目录结构

```
dsh-chengfeng-videocut/
  package.json           # dsh.bundle.patch → cordis.patch.yml
  cordis.patch.yml       # insert: chengfeng-videocut-skills
  lib/index.js           # 插件入口：name/inject/apply
  lib/skill-bundle.js    # 校验 + ctx.skills.register + 自检工具
  skills/<7 个技能>/SKILL.md   # 深度 1，DSH 可发现
  references/            # 插件根共享引用（业务合同/运行时合同/术语表）
  scripts/               # 协调脚本（videocut-cli / ensure-running / ensure-runtime ...）
  LICENSE   NOTICE.md    # Apache-2.0 归属
```

## 安装

```powershell
dsh plugin --profile web add file:E:<绝对路径>\dsh-chengfeng-videocut-0.1.0.tgz
# 或本地目录开发模式
dsh plugin --profile web add link:E:<绝对路径>\dsh-chengfeng-videocut
```

装完自检（只读，不改注册表）：

```powershell
dsh --profile web --dump-config   # 应出现 - id: chengfeng-videocut-skills
```

会话内也会出现 `chengfeng_videocut_health` 工具，返回 7 个技能的注册状态。

## ⚠️ 装完 ≠ 能跑：还需两样东西

技能本体是「驱动 Runtime 的说明书」，真正剪片靠一个独立的本地桌面 Runtime（Studio + CLI + 常驻服务 `127.0.0.1:5190`）。**本包不安装 Runtime。**

1. **缺 Runtime 本体**（本轮未装）：需要 Bun 1.2+、FFmpeg 6+、Node 20+，运行后 `chengfeng-videocut doctor`。装好后技能里的 `node scripts/videocut-cli.cjs ...` 命令才能落地。
2. **缺云端 ASR Key**：`chengfeng-cut` 的转录要求「当前环境已获准的云端 ASR」，没有即返回 `missing_cloud_transcription_adapter` —— 这是剪口播这条核心链的前置，key 只能由使用者自己配。
3. **上游版本缺口**：`chengfeng-videocut-workbench` 要求 Runtime **0.5.9+**，但作者当前公开最新版是 **0.4.11**；在补上 0.5.9 前该技能无法实际执行。

## 来源与许可

技能正文、`references/`、`scripts/`、`NOTICE.md` 均 vendored 自
[Agentchengfeng/chengfeng-videocut-skills](https://github.com/Agentchengfeng/chengfeng-videocut-skills)，Apache License 2.0。
`chengfeng-visual/animation-styles/ian-xiaohei-svg-motion` 内捆绑 GSAP 3.15.0，单独受 [GSAP Standard License](https://gsap.com/standard-license/) 约束，不适用 Apache-2.0。本包接线格式仿照 DeepSeek Harness 生态插件（dsh-remotion/dsh-hyperframes）的 skill-bundle 约定实现。

本插件与 chengfeng-videocut、HyperFrames、HeyGen、GSAP、GreenSock 均无隶属或官方背书关系。