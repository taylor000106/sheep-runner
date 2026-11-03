# 小羊快跑 · 文件结构审计报告

- 审计时间：2026-11-03 13:43 ~ 14:10（北京时间）
- 审计范围：`work-2026-10-27/` 全目录递归（含 `.bj-agents/`）
- 本轮性质：**只读审计**。未删除、未移动、未重命名任何既有文件；未修改 `js/game.js`、`index.html`、`css/style.css`、`tools/build.py`、任何素材与 `dist/sheep-runner.html`。
- 逐文件明细见同目录 CSV：`.bj-agents/data/audit/file_inventory.csv`（449 行，含每个文件的 SHA256 与分类理由）

---

## 0. 结论摘要

| 项目 | 数值 |
|---|---|
| 文件总数 / 目录总数 | **449 / 32**（其中 6 个为空目录） |
| 项目总体积 | **130.22 MB** |
| 正式运行 + 验收契约（KEEP） | **52 个文件，4.83 MB（3.7%）** |
| 历史过程文件（ARCHIVE） | 379 个，123.89 MB（95.1%） |
| 逐字节重复（DUPLICATE） | 13 个，1.48 MB（1.1%） |
| 无价值可删（CANDIDATE_DELETE） | 5 个，0.02 MB（0.0%） |
| 用途不明（UNKNOWN） | **0 个** |

三条最关键的判断：

1. **真正跑起来的只有 5 个文件**：`index.html`、`css/style.css`、`js/game.js`、`assets/sizes/256/sheep_run_sheet.png`、`assets/sizes/256/sheep_hit.png`。构建脚本只内嵌这 2 张图，已用「从源码重建 == 现有 dist 逐字节相同」实测证明。
2. **95% 的体积在 `.bj-agents/data/`**（113.65 MB），主体是 AI 原始出图候选（56.4 MB）和各轮验收截图（28.4 MB）。这些是过程资产，不是运行依赖，但删了就再也要不回来。
3. **发现 4 个"看起来是正式文件、实际已过期"的陷阱**：根目录 `sheep-runner.html`、`dist/sheep-frames-pack.zip`（内含修复前的旧 F4）、`assets/sheep_run_sheet_v1/v2*.png`、以及一份**已过时的根 README**（它仍在描述"内嵌 sheep.png"，与现在的构建逻辑不符）。逐个见第 6 节。

---

## 1. 文件清单与统计

### 1.1 目录体积分布

| 目录 | 文件数 | 占用 | 性质 |
|---|---|---|---|
| `.bj-agents/data` | 322 | 113.65 MB | 过程数据（截图/候选/备份） |
| `.`（根） | 4 | 4.47 MB | 2 个 zip + 旧单文件 + README |
| `dist` | 2 | 3.95 MB | 1 个交付 html + 1 个过期素材包 |
| `assets` | 6 | 3.05 MB | 640 母版 + 元数据 + 历史 640 版 |
| `assets/sizes` | 22 | 2.67 MB | 128/256/512 三档 |
| `assets/preview` | 5 | 1.08 MB | 播放器 + 3 个 GIF + 1 张总览 |
| `docs` | 2 | 0.66 MB | 受击审计文档 + 时间轴图 |
| `.bj-agents/scripts` | 77 | 0.34 MB | 72 脚本 + 5 个 .pyc |
| `assets/frames` | 5 | 0.23 MB | 256 单帧副本（与 sizes/256 重复） |
| `js` | 1 | 0.07 MB | game.js |
| `.bj-agents/notes` | 1 | 0.03 MB | 项目笔记 |
| `css` / `tools` | 2 | 0.01 MB | 样式 + 构建脚本 |
| **合计** | **449** | **130.22 MB** | |

空目录 6 个（疑似误建，无任何文件）：

```
work-2026-10-27/                      ← 项目内嵌套了同名目录
work-2026-10-27/.bj-agents/
work-2026-10-27/.bj-agents/data/
work-2026-10-27/.bj-agents/data/f4lab/
work-2026-10-27/assets/
work-2026-10-27/assets/preview/
```

### 1.2 文件类型分布

| 扩展名 | 文件数 | 占用 | 占比 |
|---|---|---|---|
| `.png` | 341 | 120.32 MB | 92.4% |
| `.zip` | 2 | 7.80 MB | 6.0% |
| `.html` | 5 | 0.96 MB | 0.7% |
| `.gif` | 4 | 0.55 MB | 0.4% |
| `.js` | 15 | 0.25 MB | 0.2% |
| `.py` | 60 | 0.21 MB | 0.2% |
| `.md` / `.json` / `.pyc` / `.css` | 22 | 0.11 MB | 0.1% |

PNG 占到 92.4%，是全部体积问题的根源：**脚本和代码一共只有 0.5 MB，素材与截图 128.7 MB。**

### 1.3 逐字节重复（SHA256）

共 9 组、13 个重复文件，**可回收 0.86 MB**。详见第 7 节表格。

### 1.4 相似但内容不同（同角色、不同世代）

这些**不是重复**，是同一素材的历史世代，必须靠 SHA256 + 内容比对区分，不能凭文件名猜：

640×640/帧 母版共 4 个世代：

| 文件 | 字节 | SHA256(前16) | 世代 |
|---|---|---|---|
| `assets/sheep_run_sheet_v1_deprecated.png` | 1208992 | `33e6e0447f465e0a` | 最早 4 帧竖排 |
| `assets/sheep_run_sheet_v2_squatF4.png` | 919913 | `7733401a3bc5fb78` | F4=并腿蹲姿 |
| `.bj-agents/data/backup/sheep_run_sheet.before_f4fix.png` | 990682 | `6b1a6fb1fae3b7d7` | F4=F2 精确镜像（本轮修复前） |
| **`assets/sheep_run_sheet.png`（现行）** | **941000** | **`ee58de7f0fefb470`** | **F4=独立姿态（当前）** |

实测确认：backup 的 F4 与现行母版 F2 的水平镜像 **IoU = 1.0000**（精确镜像），与现行 F4 的 IoU = 0.8386。即 backup 确实是"本轮修复前"的状态，是有效回滚点。

三档缩放副本也各有一份 `_v2_squatF4` 旧档（128/256/512 共 3 个，188040 / 59997 / 642405 字节），与现行同名文件不同。

实例化对比（实测）：

| 文件 | 字节 | SHA256(前16) | 说明 |
|---|---|---|---|
| `dist/sheep-runner.html` | 402326 | `2f0d52603c3f641b` | 现行构建（含受击图 + 新 F4） |
| `sheep-runner.html`（根） | 245737 | `8e933f6f906abc6b` | 10-27 拆分前原始单文件 |
| `sheep_run_animation.zip` | 4434099 | — | v2 时代分发包（内 640 母版=919913） |
| `dist/sheep-frames-pack.zip` | 3743044 | — | 分发包（内 640 母版=990682，**=修复前**） |

### 1.5 无引用 / 疑似废弃

判定方式：全工作区 97 个文本文件（`.py/.js/.html/.json/.md/.css`）逐个搜路径字面量，再与代码引用、构建记录、验收脚本三方交叉。结果见第 3、5 节。

---

## 2. 正式运行依赖（实测，不靠文件名推测）

### 2.1 证据链

**证据一 · 构建脚本硬引用**（`tools/build.py`，73 行）

```
读 index.html / css/style.css / js/game.js
再按 IMG_VARS = ['RUN_SHEET_SRC', 'HIT_SHEET_SRC'] 解析 game.js 里的路径字面量
  → assets/sizes/256/sheep_run_sheet.png
  → assets/sizes/256/sheep_hit.png
把它们 base64 内嵌，输出单文件
退出码非 0 表示资源缺失或仍有外链残留
```

**证据二 · 运行时代码引用**（`js/game.js`）

```js
// :1556
var RUN_SHEET_SRC = 'assets/sizes/256/sheep_run_sheet.png';
// :1589
var HIT_SHEET_SRC = 'assets/sizes/256/sheep_hit.png';
```

`js/game.js` 全文搜索 `.png/.json/.gif/assets/` 只有这两处路径字面量，无其它资源加载。

**证据三 · 端到端重建实测**（本次审计执行）

```
python tools/build.py .bj-agents/data/audit/build_check.html
  → RUN_SHEET_SRC = assets/sizes/256/sheep_run_sheet.png (188.5KB -> base64 251.3KB)
  → HIT_SHEET_SRC = assets/sizes/256/sheep_hit.png     (44.6KB -> base64 59.5KB)
  → 402326 B  sha256=2f0d52603c3f641b
与 dist/sheep-runner.html 逐字节相同：True
```

这一步同时证明两件事：依赖集合就是上面 5 个文件；`dist/sheep-runner.html` 本轮未被改动。

### 2.2 依赖关系图

```
index.html ──┬─→ css/style.css ────────────────────────────┐
             └─→ js/game.js ───┬─→ assets/sizes/256/sheep_run_sheet.png ─┐
                               └─→ assets/sizes/256/sheep_hit.png ──────┤
                                                                        │
tools/build.py ─────────────────────────────────────────────────────────┴─→ dist/sheep-runner.html
                                                                             (402326 B, 零外链)

验收契约（不参与构建，但删了会挂测试）：
  verify_assets.js  → assets/ + sizes/{128,256,512}/ 的 sheet.png + sheet.json + sheep_run_1~4.png
                    → assets/preview/frames_player.html、run_{8,10,12}fps.gif
  verify_game.js    → dist/sheep-runner.html
  verify_hit.js     → assets/sizes/256/sheep_hit.png
  verify_anim_rate.js / verify_file_hit.js → 同上
  make_probe.py     → 生成 .bj-agents/data/probe/{game.js,index.html}（无头测试共用输入）
```

### 2.3 四个指定问题的答案

**Q1. F1～F4 当前真正使用的是哪套素材？**

`assets/sizes/256/sheep_run_sheet.png`（192989 B，SHA256 `ac73a1cd…`，256×1024，4 帧紧凑排列 gap=0）。
它是 `assets/sheep_run_sheet.png`（640×2632，gap=24）经 LANCZOS 缩放而来，实测四帧与母版缩放的差异仅 16~29 像素（取整误差）。
`dist/sheep-runner.html` 内嵌的就是这一张的 base64。

**Q2. `sheep_hit.png` 是否仍被构建流程引用？**

**是。** 三重确认：`js/game.js:1589` 声明 → `tools/build.py` 的 `IMG_VARS` 名单 → 构建日志明确打印 `HIT_SHEET_SRC = assets/sizes/256/sheep_hit.png (44.6KB -> base64 59.5KB)`。**不能删。**

**Q3. 128/256/512 三套素材分别是否有实际用途？**

| 档位 | 运行时/构建 | 验收测试 | 结论 |
|---|---|---|---|
| 128 | ✗ | ✓ `verify_assets` P6（sheet+json）、P7（单帧） | 属"验收契约资产"，非运行依赖 |
| **256** | **✓ 唯一运行档** | ✓ P6、P7 | 正式源，**必须保留** |
| 512 | ✗ | ✓ P6、P7 | 同上，供高分辨率分发/放大截图用 |

结论：**256 是唯一运行档；128/512 没有代码引用，但被 `verify_assets.js` 断言，属于"删了会让 8/8 变 6/8"的契约文件**，不建议当垃圾清掉。若确要精简，正确做法是**同步删测试断言**，而不是只删文件。

顺带纠正一条历史结论：此前记录的"512 档 F1/F3 与 640 母版不同源（差 86633 px）"**在当前版本已不存在**——本轮 `f4_commit.py` 重生成过全部三档。本次实测四档全部与母版缩放一致（512 档最大 190 px、256 档最大 29 px、128 档最大 108 px 的取整差异，无系统性错位）。

**Q4. 哪些是历史版本、哪些是正式源文件？**

| 角色 | 文件 |
|---|---|
| 正式源文件（可编辑的正本） | `index.html`、`css/style.css`、`js/game.js`、`tools/build.py` |
| 素材正本（母版） | `assets/sheep_run_sheet.png` + `assets/sheep_run_sheet.json` |
| 素材派生（由母版缩放，可重建） | `assets/sizes/{128,256,512}/sheep_run_sheet.png`、同名 `sheet.json`、`sheep_run_1~4.png` |
| 独立素材（不从母版派生） | `assets/sizes/256/sheep_hit.png`（受击蹲伏单帧） |
| 交付产物 | `dist/sheep-runner.html` |
| 历史版本 | 4 个 640 世代中的前 3 个、3 个 `_v2_squatF4` 缩放档、根 `sheep-runner.html`、2 个 zip |

---

## 3. 文件分类清单

分类口径：`KEEP` 正式需要 ｜ `ARCHIVE` 有历史价值但不必放在日常目录 ｜ `DUPLICATE` 与他文件逐字节相同 ｜ `CANDIDATE_DELETE` 确认无引用无独立价值 ｜ `UNKNOWN` 用途不明（本轮 **0 个**）。

> 完整 449 行明细见 `.bj-agents/data/audit/file_inventory.csv`。下表按组归类，组内文件规则一致。

### 3.1 KEEP（52 个，4.83 MB）

| 组 | 文件 | 理由 |
|---|---|---|
| 源码 | `index.html`、`css/style.css`、`js/game.js`、`tools/build.py` | 构建入口，改这 4 个才叫改游戏 |
| 交付 | `dist/sheep-runner.html` | 唯一分发产物 |
| 素材母版 | `assets/sheep_run_sheet.png`、`assets/sheep_run_sheet.json` | 640 正本，所有缩放档的来源 |
| 运行素材 | `assets/sizes/256/sheep_run_sheet.png`、`assets/sizes/256/sheep_hit.png` | 被内嵌进 dist |
| 缩放档（契约） | `sizes/{128,256,512}/sheep_run_sheet.png` + `sheet.json` + `sheep_run_1~4.png`（共 18 个） | `verify_assets` P6/P7 断言 |
| 预览 | `assets/preview/frames_player.html`、`run_{8,10,12}fps.gif` | P1~P5、P8 断言；同时也是给人看的效果入口 |
| 文档 | `README.md`、`assets/README.md`、`docs/action-states-audit.md`、`docs/hit_timeline.png` | 项目与素材说明、受击项验收证据 |
| 测试链路 | `scripts/verify_{assets,anim_rate,game,hit,file_hit,player}.js`、`make_probe.py` | 现行 6 项验收 + 探针生成器 |
| 素材重建链路 | `scripts/build_f4_v3.py`、`f4_commit.py`、`audit_gait_final.py`、`f4_deliver.py`、`v2_sizes.py`、`v2_make_player2.py` | 能一字不差重建当前素材与预览的脚本，属"可复现性"的一部分 |
| 测试输入 | `.bj-agents/data/probe/game.js`、`probe/index.html` | 7 个脚本共用（可 `make_probe.py` 重建） |
| 测试结果 | `.bj-agents/data/verify_assets.json`、`verify_result.json` | 最近一次全绿的原始记录 |
| 笔记 | `.bj-agents/notes/sheep-runner.md` | 项目唯一决策留痕 |

### 3.2 ARCHIVE（379 个，123.89 MB）

| 组 | 位置 | 数量/体积 | 为什么归档而不是删 |
|---|---|---|---|
| AI 原始出图候选 | `.bj-agents/data/{cand_A~D, v2_E~H, A_sheet~D_sheet, B_strip_labeled, v2_G_strip, v2_H_strip}.png` | 20 个 / 56.44 MB | **不可再生的生成源**。现行 4 帧源自 `v2_H.png`（`v2_final.py` 读取），删了就无法复现"这 4 帧怎么来的" |
| 合成/对比图 | `.bj-agents/data/{compare_*, final_*, mirror_check, size_compare, preview_run_*, player_shot}.png` | 8 个 / 8.04 MB | 早期选型证据（A/B/C/D 方案对比） |
| F4 重绘实验 | `.bj-agents/data/f4lab/`（79 个） | 16.34 MB | 含被否决的旋转法/逐行形变候选、Z1~Z5 扫描、连通性证据。**否决理由的证据就在这里**，正是防"后人重走弯路"的材料 |
| 验收截图 | `.bj-agents/data/{capture, hitcap, observe, audit, gait, hit}/` | 226 个 / 28.39 MB | 每轮验收的原始帧，全部可由脚本重跑（capture_run.js / capture_hit.js / observe_run.js / audit_states.js / analyze_gait.py） |
| 640 母版历史版 | `assets/sheep_run_sheet_v1_deprecated.png`、`_v2_squatF4.png` | 2 个 / 2.09 MB | 世代对照 |
| 旧缩放档 | `sizes/{128,256,512}/sheep_run_sheet_v2_squatF4.png` | 3 个 / 0.9 MB | 同上 |
| 早期贴图 | `assets/sheep.png` | 1 / 0.12 MB | 动画化之前的单帧贴图；`game.js` 已无 `SHEEP_ASPECT`/`sheep.png` 引用 |
| 单帧副本 | `assets/frames/sheep_run_1~4.png`、`sheep_run_4_squat_alt.png` | 5 / 0.23 MB | 其中 4 个与 `sizes/256` 重复（见 DUPLICATE）；`squat_alt` 是受击姿势来源 |
| 预览总览 | `assets/preview/frames_overview.png` | 1 / 0.31 MB | 无脚本引用，但 README 的"先看效果"提到过播放器 |
| 旧单文件 | 根 `sheep-runner.html` | 1 / 0.24 MB | 拆分前原始件；README 明确写"留作对照，可以不删" |
| 分发快照 | `sheep_run_animation.zip`、`dist/sheep-frames-pack.zip` | 2 / 7.80 MB | 历史对外交付包，**内含过期素材**（见 6.2） |
| 一次性脚本 | `.bj-agents/scripts/` 中 60 个（`sprite_*`、`build_f4*`、`f4_compare*`、`f4_sweep*`、`v2_eval`、`analyze_gait` 等） | 60 / 0.29 MB | 结论已并入笔记；出图脚本本体很小，留着成本极低 |
| 备份 | `.bj-agents/data/backup/sheep_run_sheet.before_f4fix.png` | 1 / 0.94 MB | **唯一回滚点**（已验证 = 镜像版 F4） |

### 3.3 DUPLICATE（13 个，1.48 MB）

见第 7 节。（其中 `assets/frames/` 的 5 个是"目录冗余"，其余是实验过程内的重复截图/候选）

### 3.4 CANDIDATE_DELETE（5 个，0.02 MB）

| 文件 | 理由 |
|---|---|
| `.bj-agents/scripts/__pycache__/*.pyc`（5 个） | Python 字节码缓存，随时重建，无任何价值 |

### 3.5 UNKNOWN（0 个）

无。

### 3.6 需要人工确认的"灰区"（不是 UNKNOWN，但建议你拍板）

| 文件 | 我的倾向 | 需要你确认的点 |
|---|---|---|
| `assets/preview/frames_overview.png` | ARCHIVE | 无引用，但可能是给外部看的成品图 |
| `docs/hit_timeline.png`（683 KB） | KEEP | 是 `docs/action-states-audit.md` 的配图，删了文档断图 |
| 根 `README.md` | KEEP 但**必须改写** | 内容已过时（见 6.1），留着会误导 |
| `.bj-agents/scripts/` 里 60 个一次性脚本 | ARCHIVE | 是否整体打包成一个 `scripts-history.zip` 从目录里移走 |
| 2 个 zip | ARCHIVE | 是否需要保留对外交付记录 |

---

## 4. 可以归档的目录及原因

| 目录 | 体积 | 归档理由 |
|---|---|---|
| `.bj-agents/data/f4lab/` | 17.53 MB | F4 重绘已定稿验收。79 个文件全是候选图与目视对比图，**结论已固化在笔记第十节与 `assets/README.md`**，日常不再需要 |
| `.bj-agents/data/capture/` | 14.17 MB | 101 张实拍帧 + 3 张胶片。`capture_run.js` 可一键重跑 |
| `.bj-agents/data/observe/` | 6.20 MB | 状态观测截图，`observe_run.js` 可重跑 |
| `.bj-agents/data/hitcap/` | 5.24 MB | 受击时间轴抓帧，`capture_hit.js` 可重跑 |
| `.bj-agents/data/` 根下 20 个大件 | 66.71 MB | AI 原始出图候选（不可再生，务必先确保归档到位再考虑清理） |
| `assets/frames/` | 0.23 MB | 与 `assets/sizes/256/` 逐字节重复的目录（唯一非重复项 `squat_alt` 也与 `sheep_hit.png` 相同） |
| 根 `sheep-runner.html` + 2 个 zip | 8.04 MB | 历史交付快照 |

**归档建议方式**：不要直接删，整体移到 `archive/2026-11-03-pre-audit/` 下保持原相对路径，或打成 `archive-2026-11-03.zip`。这样任何一份"验收证据"都还能翻出来，但工作目录只剩正式文件。

---

## 5. 可以删除的重复文件及 SHA256 证明

共 9 组 18 个文件，其中 **9 个可删、回收 0.86 MB**（每组保留 1 份）。

| SHA256（前16） | 字节 | 保留 | 可删 |
|---|---|---|---|
| `e7a5de25df8a6c23` | 50401 | `assets/sizes/256/sheep_run_1.png` | `assets/frames/sheep_run_1.png` |
| `ee58c3ea1f4cc98c` | 50326 | `assets/sizes/256/sheep_run_2.png` | `assets/frames/sheep_run_2.png` |
| `15803afec52f758c` | 50271 | `assets/sizes/256/sheep_run_3.png` | `assets/frames/sheep_run_3.png` |
| `86fee901929a76c1` | 48702 | `assets/sizes/256/sheep_run_4.png` | `assets/frames/sheep_run_4.png` |
| `6a13afad3c1217bc` | 45684 | `assets/sizes/256/sheep_hit.png`（运行依赖） | `assets/frames/sheep_run_4_squat_alt.png` |
| `4c804abc704b628a` | 51111 | `f4lab/f4_final_256.png` | `f4lab/f4s_out16.png` |
| `7cad9f1e058ab124` | 247994 | `f4lab/f4g_J_lift44_out24.png` | `f4lab/f4f_J_lift44_out24.png` |
| `7f83f11860b8047b` | 247832 | `f4lab/f4g_K_lift44_in14.png` | `f4lab/f4f_K_lift44_in14.png` |
| `431fa438e585755f` | 105902 | `capture/start_01_f1.png` | `capture/start_04_f1.png` |

验证方法：`hashlib.sha256(open(f,'rb').read()).hexdigest()`，449 个文件全量计算后分组，`len(group)>1` 即为重复。上表 9 组的手工复核结论是"字节完全相同"，不是"看起来一样"。

特别提示：`sheep_hit.png` 与 `frames/sheep_run_4_squat_alt.png` 同源（都是那个并腿蹲姿，`assets/README.md:100` 有交代）。**要删的是 `frames/` 那份，运行时依赖的那份不能动。**

另有 5 个 `.pyc`（`__pycache__`）可直接删，共 0.02 MB，不影响任何东西。

---

## 6. 审计中发现的 4 个真实问题（不是分类问题，是内容问题）

### 6.1 根 `README.md` 已过时

它写着：

> `assets/sheep.png` 小羊贴图（534×882，125KB，原来是内嵌 base64）
> 打包脚本做四件事：CSS 塞回、JS 塞回、**`assets/sheep.png` 转成 base64 内嵌**、剥掉头部注释

但现在的 `tools/build.py` 内嵌的是 `RUN_SHEET_SRC` + `HIT_SHEET_SRC` 两张图，`js/game.js` 里**根本不存在** `sheep.png` / `SHEEP_ASPECT`（全文搜索 0 命中）。README 描述的构建行为与现实不一致，会误导下一个接手的人。

### 6.2 `dist/sheep-frames-pack.zip` 里装的是修复前的旧素材

该包 10:09 生成，内含 `assets/sheep_run_sheet.png` = 990682 B，SHA256 `6b1a6fb1fae3b7d7`，**与 `.bj-agents/data/backup/` 里"修复前母版"完全相同**。也就是说这个分发包里打包的是 F4 = F2 镜像那一版。若曾对外发出过此包，收件人拿到的是步态 3:1 不均的旧版。

### 6.3 6 个空目录（`work-2026-10-27/work-2026-10-27/…`）

项目里嵌套了一个同名空目录树（6 层，0 文件），应是某次脚本 `os.makedirs` 用了错误的相对前缀留下的。不影响运行，但会让"递归扫描"这类操作把路径算歪。

### 6.4 上一轮"512 档遗留问题"实际已解决

此前笔记记录"512 档 F1/F3 与 640 缩放来源不一致（差 86633 px），属历史遗留"。本次实测四档全部与母版 LANCZOS 一致（最大偏差 190 px，纯取整），**该遗留项应关闭**。我会同步更正笔记。

---

## 7. 体积占比与精简后预估

### 7.1 现状

| 类别 | 体积 | 占比 |
|---|---|---|
| AI 原始出图候选 | 56.44 MB | 43.3% |
| 验收截图（capture/observe/hitcap/audit/gait/hit） | 28.39 MB | 21.8% |
| F4 重绘实验 | 17.53 MB | 13.5% |
| 分发包（2 个 zip） | 7.80 MB | 6.0% |
| 合成/对比图 | 8.04 MB | 6.2% |
| 正式代码 + 素材 + 文档 + 预览 | 11.08 MB | 8.5% |
| 备份/其余 | 0.94 MB | 0.7% |

### 7.2 二阶段清理后的预估

| 方案 | 工作目录体积 | 说明 |
|---|---|---|
| 仅删 `__pycache__` + 5 个重复单帧 | 129.36 MB | 最小动作，几乎不省 |
| **推荐：归档全部 ARCHIVE + 删 DUPLICATE + 删 pyc** | **≈ 4.77 MB** | 工作目录只留正式文件；历史进 `archive/` |
| 激进：在推荐基础上再删 ARCHIVE 中"可重跑"的验收截图（28.4 MB） | ≈ 4.77 MB（归档内减 28.4） | 截图都能重跑，但需接受"验收证据不再随手可得" |

我建议走**推荐方案**：工作目录从 130 MB 降到约 4.8 MB（-96%），同时 `archive/` 里 116 MB 按原路径保留，随时可回查。

---

## 8. 推荐的精简后目录结构

```
work-2026-10-27/
├── README.md                      ← 需按实际构建逻辑改写（见 6.1）
├── index.html
├── css/style.css
├── js/game.js
├── tools/build.py
├── assets/
│   ├── README.md
│   ├── sheep_run_sheet.png        640 母版（正本）
│   ├── sheep_run_sheet.json
│   ├── sizes/
│   │   ├── 128/  sheet.png + sheep_run_1~4.png + sheet.json
│   │   ├── 256/  sheet.png + sheep_run_1~4.png + sheep_hit.png + sheet.json   ← 运行档
│   │   └── 512/  sheet.png + sheep_run_1~4.png + sheet.json
│   └── preview/
│       ├── frames_player.html
│       └── run_{8,10,12}fps.gif
├── dist/
│   └── sheep-runner.html          唯一交付产物
├── docs/
│   ├── action-states-audit.md
│   ├── hit_timeline.png
│   └── file-structure-audit.md    ← 本报告
└── .bj-agents/                    工具目录（按约定保留）
    ├── notes/sheep-runner.md
    ├── scripts/                   6 个 verify_* + make_probe.py + 6 个素材重建脚本
    └── data/
        ├── probe/                 测试共用探针
        ├── audit/                 本报告 + inventory CSV
        └── verify_*.json          最近一次验收记录

archive/2026-11-03-pre-audit/      ← 新增，保持原相对路径
├── assets/{frames, sheep.png, sheep_run_sheet_v1_deprecated.png, _v2_squatF4.png, preview/frames_overview.png}
├── assets/sizes/*/sheep_run_sheet_v2_squatF4.png
├── sheep-runner.html
├── sheep_run_animation.zip
├── dist/sheep-frames-pack.zip
└── .bj-agents/{data/其余全部, scripts/60 个一次性脚本}
```

---

## 9. 第二阶段建议执行顺序（等你批准，本轮不做）

按风险从低到高，每批可独立回滚：

| 批次 | 动作 | 影响 | 风险 |
|---|---|---|---|
| 1 | 删 `__pycache__` + 9 组重复中的 9 个副本 | 无 | 极低 |
| 2 | 删 5 个空目录（`work-2026-10-27/work-2026-10-27/…`） | 无 | 极低 |
| 3 | 归档 `.bj-agents/data/` 除 `probe/ audit/ verify_*.json` 外全部 | 验收截图需重跑才能看 | 低（脚本可重建） |
| 4 | 归档 `assets/frames/`、`sheep.png`、`_v1/_v2*` 系列、`frames_overview.png` | 无（无引用） | 低 |
| 5 | 归档根 `sheep-runner.html` + 2 个 zip | 失去历史交付快照 | 中（建议先确认是否已对外发出） |
| 6 | 归档 60 个一次性脚本 | 无法重跑旧实验 | 中（`f4lab` 证据链会断开，建议与 6 一起打成一个 zip） |
| 7 | 改写根 `README.md` 使之符合当前构建逻辑 | 无 | 低 |

每批次执行后建议重跑一次 6 项验收（`verify_assets` / `verify_anim_rate` / `verify_game` / `verify_hit` / `verify_file_hit` / `verify_player`），确保仍是全绿，再进下一批。

**不建议做**：删 128/512 档（会让 `verify_assets` 从 8/8 掉到 6/8）；删 `sheep_hit.png`（运行依赖）；删 AI 原始出图候选（不可再生）。

---

## 10. 本轮无改动证明

| 检查项 | 结果 |
|---|---|
| 删除 / 移动 / 重命名 | **0 次** |
| `js/game.js`（77790 B，11-03 11:32） | 未改动 |
| `index.html`、`css/style.css`、`tools/build.py` | 未改动 |
| `tools/build.py` 重建产物 vs `dist/sheep-runner.html` | **逐字节相同**（402326 B，`2f0d52603c3f641b`），证明 dist 未被改 |
| 所有素材文件 | mtime 与扫描前一致 |
| 测试结果完整性 | `verify_assets.json` / `verify_result.json` 保持 13:30 原样，未覆盖 |

本轮**新增**的文件（审计副产物，未触碰任何既有文件）：

| 文件 | 用途 | 建议 |
|---|---|---|
| `docs/file-structure-audit.md` | 本报告 | 保留 |
| `.bj-agents/data/audit/scan.json` | 449 文件的 path/size/sha256/mtime 原始快照 | 保留（下次审计对比用） |
| `.bj-agents/data/audit/classified.json` | 分类结果 | 保留 |
| `.bj-agents/data/audit/file_inventory.csv` | 逐文件清单（含分类理由），可直接给 Excel | 保留 |
| `.bj-agents/data/audit/build_check.html` | 依赖验证用的重建副本，与 dist 逐字节相同 | 可删（已验证完） |
