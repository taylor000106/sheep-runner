# 稳定版本基线 · 2026-11-03

> 本文件记录「羊羊跑酷 / Sheep Runner」当前封版状态，用于日后核对代码、素材与世界是否被意外改动。
> 生成时间：2026-11-03 14:03（北京时间）。**本轮只做记录，未修改任何游戏逻辑、动画与素材。**

---

## 0. 基线身份

| 项 | 值 |
|---|---|
| 正式交付物 | `dist/sheep-runner.html` |
| 交付物大小 | **402326 B** |
| 交付物 SHA256 | **`2f0d52603c3f641b88dc71116b58a5308391e1dbc783828eeade8e9b0afe7248`** |
| 正式区规模 | 83 文件 / 9.91 MB（不含 `archive/`） |
| 历史归档 | `archive/2026-11-03-pre-audit/`，368 文件 / 122.10 MB |
| 形态 | 单文件 HTML，零外链，双击即玩（`file://` 可用） |

---

## 1. 当前功能状态

### 玩法

- 三车道伪 3D 跑酷（Canvas 2D），**操作只有左右变道，没有跳跃**。
- 车道常量 `LANE_X = [-1, 0, 1]`；变道为插值过渡，变道过程中带侧倾。
- 状态机 `ready → playing → dying → over`。撞到炸弹进入 `dying`，`dying` 结束后进 `over` 并弹出结算。
- 碰撞判定与贴图解耦：碰撞用逻辑坐标，与当前播放到第几帧无关。

### 跑步动画

- 4 帧循环，竖排 sprite sheet，**F1→F2→F3→F4** 循环播放。
- **支撑腿序列：右 → 左 → 右 → 左（严格 1:1 交替）**。
- F4 为**当前重绘版**，独立原创姿态，非任何帧的镜像。
  - `IoU(F4, mirror(F2)) = 0.8385`（重绘前为 1.0000 精确镜像）
  - 仍与 `mirror(F1)=0.7436`、`mirror(F3)=0.7734` 不构成镜像
- F1/F3 仍近似镜像：`IoU(F1, mirror(F3)) = 0.9498`（源自早期母版，已验收接受）。
- 四帧无重复帧、无缺帧：相邻帧 `1-IoU` = 0.217 / 0.271 / 0.268 / 0.219。

### 受击 / 死亡姿势

- **独立素材** `assets/sizes/256/sheep_hit.png`（256×256），不是跑步四帧中的任何一帧。
- `dying` 阶段只绘制受击图（跑步图绘制 0 次），跑步相位冻结。
- 绕锚点旋转 0.0147 → 0.2453 rad，抬升连续、不穿地、不跳位。
- 受击时长 `G.dying = 0.85`（游戏时间秒）。

### 已验收的稳定性结论

| 结论 | 依据 |
|---|---|
| 动画速度与显示器刷新率无关 | 30/60/75/120/144/165/240Hz 及抖动 dt，相位偏差 ≤ 3.28e-12 |
| 脚底不漂移、角色不拉伸 | 绘制目标矩形全程恒定；`verify_game` A6/A14 |
| 帧序只进不退、不跳帧 | 正常帧率下步长恒为 1 |
| `file://` 双击可玩 | 单文件零外链；`verify_game` C1–C5、`verify_file_hit` |

---

## 2. 动画参数

以下数值均为 `js/game.js` 中的实际常量/公式，**非文档估算**。

| 参数 | 值 | 说明 |
|---|---|---|
| `RUN_FRAME` | `256` | 单帧边长 |
| `RUN_COUNT` | `4` | 循环帧数 |
| `RUN_FPS_MAX` | `12` | **高速段帧率上限，硬顶 12fps** |
| `RUN_W_MAX` | `RUN_FPS_MAX * Math.PI / 2`（≈18.8496 rad/s） | 相位角速度上限 |
| `RUN_REF_CONTENT` | `223.5` | 参考内容高度，用于全局缩放归一 |
| `animPhaseRate(speed)` | `w = 6 + speed * 0.55`，超 `RUN_W_MAX` 则取 `RUN_W_MAX` | 相位角速度 |
| `animFrameOf(ph)` | `floor(ph / 2π * RUN_COUNT) % RUN_COUNT` | 相位 → 帧号 |
| 封顶起点 | `speed ≈ 23.36` | 低于此速度与原公式逐点一致 |

**帧率随速度变化**（`RUN_COUNT=4`，fps = w / (2π) × 4）：

| speed | 0 | 5 | 11 | 15 | 20 | 23.36 | 30 | 40.5 |
|---|---|---|---|---|---|---|---|---|
| fps | 3.82 | 5.57 | 7.67 | 9.07 | 10.82 | **12** | **12** | **12** |

低速段（speed ≤ 23.36）与改造前公式完全一致；高速段统一封顶 12fps。
建议预览帧率 8~12fps，游戏内由上式动态决定。

### 受击动画参数

| 参数 | 值 |
|---|---|
| `HIT_SHEET_SRC` | `assets/sizes/256/sheep_hit.png` |
| `G.dying` | `0.85` 秒（游戏时间） |
| `HIT_DIP_MAX_DX` | `81.5` |
| `HIT_DIP_MAX_UP` | `195` |
| `HIT_DIP_N` | `48`（LUT 采样数） |
| `HIT_DIP_MAXTH` | `0.30` rad |

---

## 3. 资源路径

### 运行期实际引用（仅 2 张，均由 `js/game.js` 以相对路径加载）

| 常量 | 路径 | 大小 | 用途 |
|---|---|---|---|
| `RUN_SHEET_SRC` | `assets/sizes/256/sheep_run_sheet.png` | 192989 B | 跑步 4 帧竖排 sheet（256×1024） |
| `HIT_SHEET_SRC` | `assets/sizes/256/sheep_hit.png` | 45684 B | 受击姿势图（256×256） |

### 素材资产结构

```
assets/
├── sheep_run_sheet.png        640 母版 640×2632（帧间 24px 透明间隔）
├── sheep_run_sheet.json       母版切帧元数据 gap=24 / anchor=(320,603)
├── sizes/128/   128 档 sheet + 4 单帧 + sheet.json
├── sizes/256/   256 档 sheet + 4 单帧 + sheet.json + sheep_hit.png   ← 运行期唯一使用档
├── sizes/512/   512 档 sheet + 4 单帧 + sheet.json
└── preview/     frames_player.html + run_{8,10,12}fps.gif
```

**档位用途必须分清：**

- `sizes/256/` 是运行期唯一被引用的档位，也是 `build.py` 内嵌的档位。
- `sizes/128/`、`sizes/512/` **不进运行时**，但 `verify_assets.js` 的 P6/P7 会逐档断言，**不可删**。
- `assets/sheep_run_sheet.png`（640 母版）是唯一原始素材，亦为 P6 断言对象，**不可删**。

### 锚点约定

锚点 = **脚底中心**。绘制时用锚点对齐地面线，**不要用图片中心**。

| 档位 | anchor.x | anchor.y（脚底） |
|---|---|---|
| 640 母版 | 320（取整；json 实测值） | 603 |
| 512 | 255.5 | 483 |
| 256 | 127.5 | 241 |
| 128 | 63.5 | 120 |

> 注意：640 母版 `anchor.x=320`，派生档为 `S/2-0.5`（差 0.5px）。母版不参与运行时渲染，属元数据约定差异。

---

## 4. 构建命令

```bash
# 在项目根（work-2026-10-27）执行
python tools/build.py                      # 输出 dist/sheep-runner.html
python tools/build.py out/game.html        # 输出到指定路径
```

`tools/build.py`（74 行 / 3332 B）做三件事：

1. `css/style.css` 内联进 `<style>`
2. `js/game.js` 内联进 `<script>`
3. 把 `RUN_SHEET_SRC` / `HIT_SHEET_SRC` 两张 256 图转为 base64 data URI 内嵌

构建是**确定性的**：同一份源码重复构建应逐字节一致。当前正确输出为 **402326 B，sha256 `2f0d52603c3f641b88dc71116b58a5308391e1dbc783828eeade8e9b0afe7248`**。

---

## 5. 测试命令与运行目录要求

### ⚠ 运行目录要求（最容易踩的坑）

`verify_assets.js`、`verify_game.js`、`verify_hit.js`、`verify_file_hit.js` 内部用
`path.resolve('work-2026-10-27')` 定位项目，**必须在工作区根 `BJ-Coding-Workspace` 执行**。
在项目目录里跑会拼成 `work-2026-10-27/work-2026-10-27/...` 并报 `ERR_FILE_NOT_FOUND`。

只有 `verify_anim_rate.js` 两种 cwd 都兼容（内部按顺序探测两个路径）。

### ⚠ 不要并发跑验收脚本

`verify_file_hit.js` 用**墙钟**最多等 45s 等受击图被绘制 3 次，而游戏内时间随渲染帧率推进。
机器被前一个测试占满时（如 `verify_game.js` 刚跑完，单次耗时从 29s 涨到 44s），
渲染掉到约 32fps，45s 墙钟内游戏可能还没走到被炸，于是报
`受击图未加载或被降级`。**这是假阴性，不是缺陷。**

本条在 2026-11-03 复现过一次，同一份 `dist` 单独重跑即 13.8s / PASS（受击图绘制 14 次）。
**排查顺序：先确认脚本是单独跑的、机器空闲；再怀疑受击图。**

### 全量回归

```bash
# cwd = BJ-Coding-Workspace（工作区根）
node work-2026-10-27/.bj-agents/scripts/verify_assets.js
node work-2026-10-27/.bj-agents/scripts/verify_anim_rate.js
node work-2026-10-27/.bj-agents/scripts/verify_game.js
node work-2026-10-27/.bj-agents/scripts/verify_hit.js
node work-2026-10-27/.bj-agents/scripts/verify_file_hit.js
```

### 通过标准

| 脚本 | 断言数 | 通过标准 | 覆盖内容 |
|---|---|---|---|
| `verify_assets.js` | 8 | 8/8 PASS | 预览播放器 P1–P5；四档 PNG 尺寸与元数据 P6；各档单帧正方形 P7；三份 GIF 头 P8 |
| `verify_anim_rate.js` | 逻辑判定 | PASS | 帧率表、12fps 封顶、刷新率无关性 |
| `verify_game.js` | 22 | 22/22 PASS | 拆分版全流程 A1–A15；刷新率无关 B1；`file://` 单文件 C1–C5 |
| `verify_hit.js` | 26 | 26/26 PASS | 受击图加载、dying 冻结、不穿地、旋转连续、变道中被炸 |
| `verify_file_hit.js` | 1 | PASS | `file://` 单文件下受击图正常加载并渲染 |

### 测试脚本清单（13 个，含 6 个素材再生脚本）

| 脚本 | 大小 (B) | SHA256 |
|---|---|---|
| `audit_gait_final.py` | 6333 | `64df5325359ee6300a0be6364829cd793acba2de0d1e7df2e2e88897a9d75ee2` |
| `build_f4_v3.py` | 5718 | `d1abfc0fb9ce2c6b45c9d5d1b5c3a5c8b036cd12f31455bcba7ac119bd8b521d` |
| `f4_commit.py` | 3938 | `f4077e87e802a6f337c1723bc68dff274edcf51f1694da27376e39e7cec2a302` |
| `f4_deliver.py` | 7308 | `8dc268cf89f7900388df6a9dd024f5258c4e4d5430049b31b6bd4c31d8b085e3` |
| `make_probe.py` | 2617 | `b066c9a3fe195c09f7ec6ba6b7380b5d8d26ba7651965fa301f18f331936dcee` |
| `v2_make_player2.py` | 7918 | `cf6ed3c6875fd4f7924ce51897bec989d9e49a85da49538466c3d130fa795466` |
| `v2_sizes.py` | 2203 | `4c577fe76daf45480ee870c94ed4a8517479230a9090831e59b1a75d22f07db9` |
| `verify_anim_rate.js` | 6621 | `8fba5007a81afe09b8e0f453b2a7676c92634064440dec7d7f534a6eede387e3` |
| `verify_assets.js` | 7480 | `c457a74e86748f9646e0f6afe30d4706b2d53f9035607a1db73edf9c6c639c17` |
| `verify_file_hit.js` | 4435 | `6132117679bde0c15c949563c38671b948bbe8d898b64735ad426a669affe6d4` |
| `verify_game.js` | 13786 | `0efbebbfbed39b4feafcd3df0042120216ab44197c4faac0e54364696edff9a5` |
| `verify_hit.js` | 18185 | `d9b8fbd5c640801e2b13286c1d2a8fbae002e652ef2290482391437364f477ee` |
| `verify_player.js` | 2548 | `ba0d19dc13e6bf9615d1fa5acf650c982f8bcdb13e803105d9010faeee57c576` |

> 5 个 `verify_*.js` 为验收脚本；`verify_player.js` 为播放器专项。
> `make_probe.py`、`build_f4_v3.py`、`f4_commit.py`、`audit_gait_final.py`、`f4_deliver.py`、`v2_sizes.py`、`v2_make_player2.py`
> 属素材再生/探针链，删了就无法从 640 母版重建各档，一并纳入基线管理。

---

## 6. 正式 HTML 与关键文件哈希

### 交付物

| 文件 | 大小 (B) | SHA256 |
|---|---|---|
| `dist/sheep-runner.html` | **402326** | **`2f0d52603c3f641b88dc71116b58a5308391e1dbc783828eeade8e9b0afe7248`** |

### 源码

| 文件 | 大小 (B) | SHA256 | 说明 |
|---|---|---|---|
| `index.html` | 2182 | `a1bdc092f2c2d70044efae425d1680a6da1f4534fc61c54cf394a9db0efc0fc1` | 入口 DOM |
| `css/style.css` | 4316 | `547bc3894d7f295611551d8686b471ab4439b6c841145c9fddbe325c26800bcc` | 样式 |
| `js/game.js` | 77790 | `8ea6d6774097a334c61e1acdc12bf0e08a2545f33e6408ca98aeace7a35f1578` | 游戏逻辑（2036 行） |
| `tools/build.py` | 3332 | `f8a54a813e02f56ef4adc80510899ac9b395194251c5c427993c1d356854a688` | 构建脚本（74 行） |

### 跑步素材

| 文件 | 大小 (B) | SHA256 | 说明 |
|---|---|---|---|
| `assets/sizes/256/sheep_run_sheet.png` | 192989 | `ac73a1cdbcad7138bf8e23c420387ab2250ca2cc74ba4a26e0daba532b6dc601` | ★ 运行期跑步 sheet 256×1024 |
| `assets/sizes/256/sheep_run_1.png` | 50401 | `e7a5de25df8a6c23a44aa67b8d6a05dc6aebbc4970fa6d44d3be44c81658884c` | F1 右腿支撑 |
| `assets/sizes/256/sheep_run_2.png` | 50326 | `ee58c3ea1f4cc98cf39f91e9c51bd3bdc7153ba0d8844183d63189fea28947d0` | F2 左腿支撑 |
| `assets/sizes/256/sheep_run_3.png` | 50271 | `15803afec52f758cb43406aadcbc85cac5bb602b9e5772bbccfed2ef0a06fea6` | F3 右腿支撑 |
| `assets/sizes/256/sheep_run_4.png` | 48702 | `86fee901929a76c1953ef9b2549f70eee9f0dab3ba66675f9bdc586f9bed2a46` | F4 左腿支撑（当前重绘版） |
| `assets/sizes/256/sheet.json` | 3609 | `b6872391b185fc0a50c5a287b025606848826560cdcacd2902424a7063853e54` | 256 档元数据 |

### 受击素材

| 文件 | 大小 (B) | SHA256 | 说明 |
|---|---|---|---|
| `assets/sizes/256/sheep_hit.png` | 45684 | `6a13afad3c1217bc6393c07ddb45987436716440520ff00d496390abcd512f7b` | ★ 独立受击蹲姿 256×256 |

### 640 母版与其余档位（受 P6/P7 契约保护，不可删）

| 文件 | 大小 (B) | SHA256 | 说明 |
|---|---|---|---|
| `assets/sheep_run_sheet.png` | 941000 | `ee58de7f0fefb4702d397113a13dc3878984c4ba735cd2000376263adf845db2` | 640 母版 640×2632 |
| `assets/sheep_run_sheet.json` | 823 | `843fea1bd978e8bbd64008063fed8c0bb536ad5dd4bdddaa883088723d2660e4` | 母版元数据 |
| `assets/sizes/128/sheep_run_sheet.png` | 61569 | `67fff662a2b5f3e5d328545ce4f0d3c35a0503a99de1ea1f516335c9c257683e` | 128 档 sheet |
| `assets/sizes/128/sheet.json` | 2480 | `d3bcf34de72aac9b04dcc02345ab5bd1fc8f3525a3954ead6394a33107a60452` | 128 档元数据 |
| `assets/sizes/512/sheep_run_sheet.png` | 658534 | `e2ee5d9ab8e28d5615d1af2f321dc40da3043c1dd3b316ae620c264b81beab5f` | 512 档 sheet |
| `assets/sizes/512/sheet.json` | 2484 | `0395729d823d4cbd143d13b61f5c456a43f17638ee4c7ec90dd947f6113b1461` | 512 档元数据 |

---

## 7. 已知遗留问题

以下均为**已评估、当前接受**的状态，不属于本轮缺陷。

| 项 | 现状 | 影响 | 处置 |
|---|---|---|---|
| 待机动画偏慢（3.82fps） | speed=0 时相位速率最小 | 视觉上起步略缓 | 已评估为可接受，不改 |
| F1/F3 近似镜像（IoU 0.9498） | 源自早期 AI 母版 | 8~12fps 下肉眼不可辨 | 已验收接受 |
| 无跳跃/落地/撞击帧 | 玩法本身无跳跃 | 无 | 若将来加跳跃需另做素材 |
| 摆臂方案 A/B 未定 | 两版摆臂各有取舍 | 无功能性影响 | 长期挂起 |
| 新炸弹火花特效未做 | 当前炸弹为现有绘制 | 无 | 长期挂起 |
| 受击段「重开即再炸」极端场景未压测 | 仅常规流程回归 | 极端边界可能未覆盖 | 建议后续补压测 |
| `verify_file_hit.js` 对机器负载敏感 | 墙钟等 45s，机器忙时游戏内时间推进不足 → 假阴性 | **可能误报受击图未加载** | 单独跑；已在第 5 节写明 |
| `archive/` 占 122.10 MB | 按决策只归档不删 | 占磁盘 | 确认旧 ZIP 未外发后可整体删除 |
| `dist/sheep-frames-pack.zip` 内含修复前旧素材 | 已归档，易误用 | 误用会拿到旧素材 | 对外发素材包须重新打包 |
| `__pycache__` 会再生 | 运行 Python 脚本时生成 | 混入未跟踪文件 | 已加 `.gitignore` |
| 项目尚未初始化 Git | 无 `.git` 目录 | 无版本控制 | 本轮按约束**未执行 `git init`** |

---

## 8. 如何复核本基线

在**工作区根**执行，逐条比对 SHA256：

```bash
# 1) 交付物必须逐字节一致
sha256sum work-2026-10-27/dist/sheep-runner.html
# 期望：2f0d52603c3f641b88dc71116b58a5308391e1dbc783828eeade8e9b0afe7248

# 2) 重建后必须与现有产物一致（确定性构建）
cd work-2026-10-27 && python tools/build.py

# 3) 全量回归（回到工作区根）
cd .. && node work-2026-10-27/.bj-agents/scripts/verify_assets.js   # 等 5 个脚本
```

若任一哈希不符，先定位改动来源，**不要直接覆盖 `dist/sheep-runner.html`**。

---

**羊羊跑酷当前版本：稳定基线已建立（2026-11-03）。**
