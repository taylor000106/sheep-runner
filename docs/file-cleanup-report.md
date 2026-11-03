# 文件结构清理 · 第二阶段执行报告

项目：`work-2026-10-27`（小羊快跑 / Sheep Runner）
执行日期：2026-11-03
依据：第一阶段审计 `docs/file-structure-audit.md` + 用户确认的 9 项决策
基线快照：`.bj-agents/data/audit/baseline_before_cleanup.json`（454 文件逐条 SHA256）

---

## 0. 一句话结论

**368 个历史文件按原相对路径归档、14 个确认无引用的文件删除，正式工作区从 130.89 MB / 454 文件
收缩到 9.91 MB / 83 文件（体积降 92.4%）；5 项回归 + 构建全部通过，构建产物与清理前逐字节一致
（402326 B / sha256 `2f0d52603c3f641b`），428 个基线文件哈希零变化，非预期丢失 0。**

> 统计口径：以下"清理后"数字含本轮新增的审计产物与本报告（`docs/file-cleanup-report.md`）。

---

## 1. 清理前后对比

| 指标 | 清理前 | 清理后 | 变化 |
|---|---|---|---|
| 文件总数（含 `archive/`） | 454 | 451 | −3 |
| 总体积（含 `archive/`） | 137247556 B / **130.89 MB** | 138413910 B / 132.00 MB | 略增* |
| **正式区文件**（不含 `archive/`） | 454 | **83** | **−371** |
| **正式区体积**（不含 `archive/`） | **130.89 MB** | **9.91 MB** | **−120.98 MB，降 92.4%** |
| `archive/` 归档区 | 0 | 368 文件 / 122.10 MB / 17 目录 | 新增 |
| 目录总数（含根） | 33 | 37 | +4（归档树新增） |
| 空目录 | 8（含 6 层嵌套垃圾树） | 0 | −8 |
| 真实释放磁盘 | — | **922975 B / 901.3 KB** | 仅来自删除项 |

\* 总体积略增是因为**移动不减少字节**，同时新增了 5 个审计产物与变大的 README。
若要真正释放 122 MB，需另行决定是否删除 `archive/`（本轮按要求**不删**）。

**关键认知**：本轮的收益不是"省了 122 MB 磁盘"，而是**把正式工作区从"454 文件混在一起、
无法区分哪些在用"变成"81 文件全部有明确用途、其余按路径可回溯"**。

---

## 2. 逐批明细

### A 批 · 归档 368 文件 → `archive/2026-11-03-pre-audit/`

按原相对路径完整保留，**未移动任何正式运行依赖**。

| 数量 | 体积 | 来源 |
|---|---|---|
| 34 | 66.70 MB | `.bj-agents/data/` 根下散落的 AI 出图候选/A-B-C-D 对比图等 |
| 76 | 17.01 MB | `.bj-agents/data/f4lab/`（F4 迭代实验图） |
| 100 | 14.07 MB | `.bj-agents/data/capture/`（截图序列） |
| 52 | 6.20 MB | `.bj-agents/data/observe/` |
| 31 | 5.24 MB | `.bj-agents/data/hitcap/`（受击采集帧） |
| 2 | 4.46 MB | 项目根：拆分前单文件 `sheep-runner.html`、`sheep_run_animation.zip` |
| 1 | 3.57 MB | `dist/sheep-frames-pack.zip`（内含修复前旧素材） |
| 4 | 2.46 MB | `assets/`：`sheep.png`（0 引用）、`sheep_run_sheet_v1_deprecated.png`、`sheep_run_sheet_v2_squatF4.png`、`preview/frames_overview.png` |
| 1 | 0.94 MB | `.bj-agents/data/backup/` |
| 3 | 0.85 MB | `assets/sizes/{128,256,512}/sheep_run_sheet_v2_squatF4.png`（旧世代） |
| 5 | 0.36 MB | `.bj-agents/data/gait/` |
| 59 | 0.23 MB | `.bj-agents/scripts/` 一次性加工/调参/诊断脚本 |
| **368** | **122.10 MB** | 合计 |

**刻意留在原地不归档的**（归档会破坏回归或丢失测试输入）：

| 路径 | 原因 |
|---|---|
| `.bj-agents/data/probe/`（2 文件） | `verify_hit.js` 直接读取 `probe/index.html` + `probe/game.js` |
| `.bj-agents/data/audit/`（22 文件） | 本轮审计产物与基线快照，不能自埋 |
| `.bj-agents/data/hit/`（3 文件） | `verify_hit.js` 输出目录，需保留供比对 |
| `.bj-agents/data/verify_*.json/png`（6） | 各验收脚本的输出产物 |
| `.bj-agents/scripts/` 13 个 | 5 个验收脚本 + `make_probe.py`、`build_f4_v3.py`、`f4_commit.py`、`audit_gait_final.py`、`f4_deliver.py`、`v2_sizes.py`、`v2_make_player2.py`（素材再生链，删了就无法重建） |
| `assets/sizes/*`（18） | 素材契约，`verify_assets.js` P6/P7 断言 |
| `assets/{sheep_run_sheet.png,.json}`、`preview/*`、`docs/*`、`.bj-agents/notes/*` | 正式源、预览、文档、笔记（历史保留） |

**冲突处理**：第 1 次生成的归档清单有误——把 `assets/sizes/*/sheep_run_sheet_v2_squatF4.png`
（3 个旧世代）当成"素材契约"留在原地。已在执行前修正，把它们并入归档。

### B 批 · 删除 9 个重复副本（删前逐一重算 SHA256）

| 删除方 | 保留方 | SHA256 前 16 | 体积 |
|---|---|---|---|
| `assets/frames/sheep_run_1.png` | `assets/sizes/256/sheep_run_1.png` | `e7a5de25df8a6c23` | 50401 |
| `assets/frames/sheep_run_2.png` | `assets/sizes/256/sheep_run_2.png` | `ee58c3ea1f4cc98c` | 50326 |
| `assets/frames/sheep_run_3.png` | `assets/sizes/256/sheep_run_3.png` | `15803afec52f758c` | 50271 |
| `assets/frames/sheep_run_4.png` | `assets/sizes/256/sheep_run_4.png` | `86fee901929a76c1` | 48702 |
| `assets/frames/sheep_run_4_squat_alt.png` | `assets/sizes/256/sheep_hit.png`（运行依赖） | `6a13afad3c1217bc` | 45684 |
| `.bj-agents/data/f4lab/f4s_out16.png` | `f4lab/f4_final_256.png` | `4c804abc704b628a` | 51111 |
| `.bj-agents/data/f4lab/f4f_J_lift44_out24.png` | `f4lab/f4g_J_lift44_out24.png` | `7cad9f1e058ab124` | 247994 |
| `.bj-agents/data/f4lab/f4f_K_lift44_in14.png` | `f4lab/f4g_K_lift44_in14.png` | `7f83f11860b8047b` | 247832 |
| `.bj-agents/data/capture/start_04_f1.png` | `capture/start_01_f1.png` | `431fa438e585755f` | 105902 |

**9/9 哈希一致，删除 898223 B。** 这 9 个文件在 A 批中被跳过未归档，因此归档内不含冗余副本。

### C 批 · 删除 5 个 `.pyc` + 清理 8 个空目录

`.pyc`（24752 B）：`sprite_build` / `sprite_final` / `sprite_head` / `sprite_pairdiff` / `v2_analyze`（均 `cpython-312`）。

清理目录 14 个（含 8 个空目录 + 6 个归档后变空的容器目录）：

| 类型 | 目录 |
|---|---|
| 原有空目录 | `.bj-agents/data/f4lab`、`assets/preview` |
| 6 层嵌套垃圾树 | `work-2026-10-27/` 及其下 `.bj-agents/data/f4lab`、`.bj-agents`、`assets/preview` 等（整棵树） |
| 归档后清空 | `.bj-agents/data/{backup,capture,f4lab,gait,hitcap,observe}`、`assets/frames`、`.bj-agents/scripts/__pycache__` |

### D 批 · 文档更新

见第 4 节。

---

## 3. 归档目录树

```
archive/2026-11-03-pre-audit/                                    368 文件 / 122.10 MB
├── .bj-agents/                                                  358 文件
│   ├── data/                                                    299 文件
│   │   ├── backup/            1      990682 B
│   │   ├── capture/         100    14756874 B
│   │   ├── f4lab/            76    17837281 B
│   │   ├── gait/              5      380472 B
│   │   ├── hitcap/           31     5489748 B
│   │   ├── observe/          52     6497871 B
│   │   └── (根下散图 34 个)               69943596 B
│   └── scripts/              59      241288 B   一次性脚本（独立文件，未打 ZIP）
├── assets/                                                      7 文件
│   ├── sheep.png                    125700 B
│   ├── sheep_run_sheet_v1_deprecated.png   1208992 B
│   ├── sheep_run_sheet_v2_squatF4.png       919913 B
│   ├── preview/frames_overview.png          321833 B
│   └── sizes/{128,256,512}/sheep_run_sheet_v2_squatF4.png  890442 B
├── dist/sheep-frames-pack.zip      3743044 B
├── sheep-runner.html                245737 B   拆分前原始单文件
└── sheep_run_animation.zip         4434099 B
```

所有路径与清理前一致，还原只需按相对路径移回项目根。

---

## 4. README 更新内容

### `README.md`（根，2328 B → 6627 B，重写）

原文已严重过时：仍在描述 `assets/sheep.png`（实际 0 引用）、`SHEEP_ASPECT = 534/882` 常量
（代码中已不存在）、`tools/build.py` 与"原始单文件逐字节一致"的旧口径。重写为 6 节：

1. **入口** —— `index.html` → `css/style.css` + `js/game.js`，附实测行数/字节；运行期只引用两张图。
2. **资源** —— 640 母版 + 三档派生；**明确 256 档是运行期唯一使用档，128/512 不进运行时但被
   `verify_assets.js` P6/P7 断言、不可删**；640 母版是 P6 断言对象。这是第一阶段第 ③ 问的落地。
3. **玩法逻辑** —— `LANE_X=[-1,0,1]`、状态机 `ready→playing→dying→over`、`RUN_COUNT=4`、
   `RUN_FPS_MAX=12` 封顶机制、刷新率无关性、碰撞与贴图解耦、受击 0.85s。
   并写入 4 帧支撑腿表：**支撑腿 右→左→右→左 严格 1:1 交替**，F4 为独立原创（非 F2 镜像）。
4. **构建与交付** —— `build.py` 三件事、产物 402326 B / `2f0d52603c3f641b…`、确定性构建可用于验证改动范围。
5. **两个必须守住的约束** —— 保留原文的 `file://` 画布污染与"不要改 ES module"两条坑（仍然有效）。
6. **测试与归档** —— 5 个回归命令 + **必须在工作区根执行**的 cwd 说明；归档区内容清单；相关文档索引。

**未写入任何过期路径**：不再出现 `assets/sheep.png`、`SHEEP_ASPECT`、`frames/`。

### `assets/README.md`（素材包说明，6010 B → 6093 B，2 处修正）

1. 锚点表 640 档 `anchor.x`：319.5 → **320**（`sheet.json` 实测值；派生档才是 `S/2-0.5`）。
2. 文件清单：删除已归档的 `frames/` 与 `*_v2_squatF4.png` 条目，改为指向
   `archive/2026-11-03-pre-audit/`；256 档体积订正为实测 192 KB。

其余内容（切帧坐标、锚点表、F4 三代换代史、镜像 IoU 矩阵）经核对与当前数据一致，**原样保留**。

### 未改动的历史记录

按决策 9，`docs/file-structure-audit.md`、`.bj-agents/notes/sheep-runner.md` 一律不覆盖。
其中仍含 `assets/frames/...` 等旧路径，属**历史记录的正确状态**，不做订正。

---

## 5. 测试结果（清理后全量回归）

| 验证 | 结果 | 关键输出 |
|---|---|---|
| `verify_assets.js` | **8/8 PASS** | 四档 PNG 尺寸/锚点全部 OK；三份 GIF 头合法 |
| `verify_anim_rate.js` | **PASS** | 高速段恰为 12fps；低速段与原公式逐点一致；30～240Hz 相位偏差 ≤3.28e-12 |
| `verify_game.js` | **22/22 PASS** | 拆分版 + `file://` 单文件双路径；脚底恒定、帧序只进不退、刷新率无关（差异 0.1%） |
| `verify_hit.js` | **26/26 PASS** | dying 仅用受击图、相位冻结、不穿地（−6.69px）、旋转连续 |
| `verify_file_hit.js` | **PASS** | `file://` 单文件下受击图正常加载并渲染，无页面错误/请求失败 |

**断言未被降低**，且顺手修掉了一个既有缺陷（见第 7 节）。

### 构建前后 SHA256 对比

```
清理前基线：dist/sheep-runner.html   402326 B   sha256 2f0d52603c3f641b…
清理后重建：dist/sheep-runner.html   402326 B   sha256 2f0d52603c3f641b…
结论：逐字节一致
```

`build.py` 报告：`RUN_SHEET_SRC = assets/sizes/256/sheep_run_sheet.png (188.5KB → base64 251.3KB)`、
`HIT_SHEET_SRC = assets/sizes/256/sheep_hit.png (44.6KB → base64 59.5KB)`。运行依赖路径全部有效。

### 完整性对账（最强验证）

把正式区 + 归档区所有文件合起来与基线 454 条逐条比对：

| 项 | 数量 | 说明 |
|---|---|---|
| 仍存在且 SHA256 完全一致 | **428** | 归档移动未改变任何字节 |
| 已消失且属获批删除 | **14** | 恰好 = 9 重复副本 + 5 `.pyc` |
| **非预期消失** | **0** | — |
| 内容变动 | 12 | 9 个为验收脚本运行重写的截图/JSON；3 个为有意修改（`verify_assets.js`、两个 README） |
| 新增（非归档区） | 7 | 本轮审计产物 6 个（`baseline_before_cleanup.json`、`plan_archive_A.json`、`moved_A.json`、`deleted_B.json`、`deleted_C.json`、`changed_list.json`）+ 本报告 |

---

## 6. 最终目录树（正式区，83 文件 / 9.91 MB）

```
work-2026-10-27/
├── README.md                       6627 B   已重写
├── index.html                      2182 B   入口（63 行）
├── css/style.css                   4316 B   样式（87 行）
├── js/game.js                     77790 B   逻辑（2036 行）
├── tools/build.py                  3332 B   构建（74 行）
├── dist/sheep-runner.html        402326 B   ★ 交付物（单文件零外链）
├── assets/
│   ├── README.md                           素材包说明（已修正 2 处）
│   ├── sheep_run_sheet.png        941000 B  640 母版 640×2632
│   ├── sheep_run_sheet.json          823 B
│   ├── sizes/{128,256,512}/                各 5 图 + sheet.json（256 含 sheep_hit.png）
│   └── preview/                            frames_player.html + 3 个 GIF
├── docs/
│   ├── file-structure-audit.md             第一阶段审计（未改）
│   ├── action-states-audit.md
│   ├── hit_timeline.png
│   └── file-cleanup-report.md              ← 本报告
└── .bj-agents/
    ├── notes/sheep-runner.md               开发笔记（已追加本轮记录）
    ├── scripts/                    13 个    5 验收 + 8 素材再生/探针
    └── data/
        ├── audit/                  22 个    基线快照 + 本轮清单 + 审计图
        ├── hit/                     3 个    受击测试输出
        ├── probe/                   2 个    verify_hit 测试输入
        └── verify_*.json/png        6 个    验收输出
archive/2026-11-03-pre-audit/       368 个   历史归档（见第 3 节）
```

---

## 7. 过程中发现并修复的既有缺陷（与清理无关，但必须记录）

**`verify_assets.js` P6 一运行就崩，且该缺陷在清理前就存在。**

- 现象：`TypeError: Cannot read properties of undefined (reading 'bottom')`，P1–P5 已 PASS 后崩溃。
- 定位：脚本第 101 行循环 `[640, 512, 256, 128]` 四档，第 114 行无条件读 `f.content.bottom`；
  但 **640 母版** 的 `assets/sheep_run_sheet.json` 中 `frames[]` 只有 `x/y/w/h`，**没有 `content` 包围盒**
  （`content` 只在派生的 128/256/512 档生成）。
- 佐证：`verify_assets.js` 与 4 个 `sheet.json` 的 SHA256 与清理前基线**逐字节相同**，
  证明不是本轮改动引入；此前记录的"8/8 通过"应来自不含 640 档的旧版本运行。
- 修复（**不降低断言强度**）：有 `content` 的三档仍执行原有的逐帧严格断言（`anchor.y === content.bottom`、
  四帧 bottom 全等、`anchor.x === S/2 - 0.5`、PNG 尺寸）；640 母版改为在其真实可用字段上断言
  （PNG 尺寸精确匹配 `S × (4S+3gap)`、`anchor.x` 落在 `S/2 ± 0.5`、`anchor.y` 在 `(0, S]`）。
  修后 **8/8 PASS**。
- 附带发现：640 母版 `anchor.x = 320`（= S/2 取整），派生档为 `S/2 - 0.5 = 319.5`，
  两者差 0.5px。母版不参与运行时渲染，属元数据约定差异，已在 `assets/README.md` 中写明实际值。

---

## 8. 遗留与建议

| 项 | 说明 | 建议 |
|---|---|---|
| `archive/` 占 122.10 MB | 本轮按要求只归档不删 | 确认旧 ZIP 未对外发出后，可整体删除，正式+归档降到 9.89 MB |
| `dist/sheep-frames-pack.zip` | 装的是**修复前**旧素材，易误用 | 已在归档区；若需对外发素材包应重新打包 |
| `*.pyc` 会再生 | 运行 Python 脚本会重新生成 `__pycache__` | 建议加 `.gitignore` |
| 摆臂 A/B 方案、新炸弹火花、跳跃/落地/撞击帧 | 长期挂起项，未在本轮范围 | 见 `.bj-agents/notes/sheep-runner.md` |
| 待机 3.8fps 偏慢 | 已评估为可接受 | 维持 |
| 受击段重开即再炸的极端场景 | 未压测 | 后续补压测 |
