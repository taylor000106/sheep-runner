# 小羊快跑 · Sheep Runner

三车道伪 3D 跑酷（Canvas 2D，纯前端、无依赖、无构建工具链）。
操作只有**左右变道**，没有跳跃；撞到炸弹即结算。

本文件中的体积、行数、SHA256 均为 2026-11-03 实测值，改动代码后请一并更新。

---

## 1. 入口

```
index.html          DOM 骨架（63 行 / 2182 B）：一个 <canvas id="cv"> + 两个引用
├── css/style.css   全部样式（87 行 / 4316 B）
└── js/game.js      全部游戏逻辑（2036 行 / 77790 B）
```

- **开发调试**：双击 `index.html`，或起个本地静态服务（任意 http server）。
- **`index.html` 不用构建**，改完刷新即可。

`js/game.js` 引用的素材只有两张（相对路径，运行期仅此两张）：

| 常量 | 路径 | 体积 | 用途 |
|---|---|---|---|
| `RUN_SHEET_SRC` | `assets/sizes/256/sheep_run_sheet.png` | 192989 B | 跑步 4 帧竖排 sheet（256×1024） |
| `HIT_SHEET_SRC` | `assets/sizes/256/sheep_hit.png` | 45684 B | 受击姿势图（256×256），**独立素材**，非跑步帧 |

---

## 2. 资源

```
assets/
├── sheep_run_sheet.png        640 母版：640×2632 竖排 4 帧，帧间 24px 透明间隔（941000 B）
├── sheep_run_sheet.json       母版切帧元数据（gap=24, anchor=(320,603)）
├── sizes/                     降采样档位，每档都有 sheet.json（gap=0, anchor=(S/2-0.5, 实测脚底)）
│   ├── 512/   658534 B   ← 规格档
│   ├── 256/   192989 B   ← ★ 运行期唯一使用档
│   └── 128/    61569 B   ← 规格档
├── preview/                   frames_player.html 预览播放器 + run_{8,10,12}fps.gif
└── README.md                  素材包详细说明（切帧坐标、锚点表、F4 换代史）
```

**档位用途要分清**：

- **256 档**是运行期唯一被引用的档位。`build.py` 内嵌的也是这一档。
- **512 / 128 档不进运行时**，但**不可删**：`verify_assets.js` 的 P6（四档 PNG 尺寸与元数据一致）、
  P7（各档单帧均为正方形）会逐档断言它们。删了会直接 FAIL。
- **640 母版**是唯一原始素材，各档由它降采样得到；同样是 P6 的断言对象。

四档共同契约：`anchor = 脚底中心`，四帧脚底落在同一 y 上，把锚点钉在地面线即可保证跑动时脚不上下漂。
绘制时**用锚点对齐地面，不要用图片中心**。切帧坐标与锚点数值见 `assets/README.md`。

---

## 3. 玩法逻辑（`js/game.js`）

- 车道：`var LANE_X = [-1, 0, 1]`，变道插值过渡，变道时有侧倾。
- 状态机：`ready → playing → dying → over`，`dying` 阶段冻结跑步相位。
- 跑步动画：`RUN_COUNT = 4` 帧，`RUN_FPS_MAX = 12`。
  帧率 = `animPhaseRate(speed)` 随速度上升，到 `RUN_W_MAX`（≈23.36 速度）后**封顶 12fps**；
  低速段与原公式逐点一致。相位按 `dt` 积分，**与显示器刷新率无关**（30～240Hz 及抖动 dt 均一致）。
- 碰撞与贴图解耦：碰撞判定用逻辑坐标，跟贴图帧无关，换素材不影响手感。
- 受击动画：`dying` 期间只画 `sheep_hit.png`，绕锚点旋转并抬升，不穿地、不跳位；时长 0.85s 游戏时间。

### 跑步 4 帧

| 帧 | 支撑腿 | 摆动腿 |
|---|---|---|
| F1 | 右腿 | 左腿 |
| F2 | 左腿 | 右腿 |
| F3 | 右腿 | 左腿 |
| F4 | 左腿 | 右腿 |

**支撑腿按 右 → 左 → 右 → 左 严格 1:1 交替。**
F4 为独立原创姿态（非 F2 镜像，IoU(F4, 镜像 F2) = 0.8385），重绘前是 右→左→右→右 的 3:1 不均。
F1/F3 仍近似镜像（IoU 0.9498）。四帧无重复、无缺帧，相邻帧差异 0.217/0.271/0.268/0.219。

---

## 4. 构建与交付

拆分版是**开发形态**；对外分发用单文件版：

```bash
python tools/build.py                    # 输出 dist/sheep-runner.html
python tools/build.py out/game.html      # 输出到指定路径
```

`tools/build.py`（74 行）做三件事：CSS 内联进 `<style>`、JS 内联进 `<script>`、
把 `RUN_SHEET_SRC` / `HIT_SHEET_SRC` 两张 256 图转 base64 data URI 内嵌。
产物零外链，双击即玩。

当前产物：**`dist/sheep-runner.html`，402326 B，sha256 `2f0d52603c3f641b…`**。
构建是确定性的：同一份源码重复构建逐字节一致，可用来验证改动是否只影响预期范围。

> 交付物只有 `dist/sheep-runner.html` 一个文件。`index.html` 那套是源码形态，不用于分发。

---

## 5. 两个必须守住的约束

1. **`file://` 下画布会被判为"已污染"**。贴图从文件 URL 加载，之后调 `ctx.getImageData()` /
   `toDataURL()` 会抛 SecurityError。本项目全程只用 `drawImage`，不读回像素，所以目前无影响；
   **以后别加像素读回逻辑**，否则要么走 http 服务，要么必须用单文件内嵌版（data URI 不污染）。
2. **不要改成 ES module 拆分**。`<script type="module">` 在 `file://` 下被 CORS 拦死，
   双击就打不开了。要保持"双击即玩"，JS 只能是普通脚本，或由 `build.py` 合并。

---

## 6. 测试与归档

回归脚本（`.bj-agents/scripts/`，全部在**工作区根**执行）：

```bash
node work-2026-10-27/.bj-agents/scripts/verify_assets.js      # 素材与元数据契约 8 项
node work-2026-10-27/.bj-agents/scripts/verify_anim_rate.js   # 动画帧率与刷新率无关性
node work-2026-10-27/.bj-agents/scripts/verify_game.js        # 玩法全流程 22 项
node work-2026-10-27/.bj-agents/scripts/verify_hit.js         # 受击专项 26 项
node work-2026-10-27/.bj-agents/scripts/verify_file_hit.js    # file:// 单文件受击渲染
```

> `verify_assets.js` / `verify_game.js` / `verify_hit.js` / `verify_file_hit.js` 内部用
> `path.resolve('work-2026-10-27')` 定位项目，**必须在工作区根运行**；在项目目录里跑会找不到文件。
> `verify_anim_rate.js` 两种 cwd 都支持。

历史资料统一放在 `archive/2026-11-03-pre-audit/`（按原相对路径保存，未删除）：
旧世代 640 母版与 `*_v2_squatF4.png`、拆分前根目录单文件 `sheep-runner.html`、
两个旧 ZIP（`dist/sheep-frames-pack.zip`、`sheep_run_animation.zip`）、
一次性加工/调参脚本 59 个、历史截图与中间数据。

相关文档：

- `docs/file-structure-audit.md` —— 文件结构审计报告
- `docs/action-states-audit.md` —— 动作状态审计
- `assets/README.md` —— 素材包细节（切帧坐标、锚点、F4 三代换代史）
- `.bj-agents/notes/sheep-runner.md` —— 开发过程笔记
