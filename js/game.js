/* 小羊快跑 · 主逻辑（拆分版）– 要出单文件请运行 python tools/build.py */
(function () {
  'use strict';

  /* ============================================================
     0. 基础设置
     ============================================================ */
  var cv = document.getElementById('cv');
  var ctx = cv.getContext('2d', { alpha: false });

  var W = 0, H = 0, DPR = 1;
  var NARROW = false;              // 窄屏标记（由 resize 设置）
  var centerX = 0, horizonY = 0, baseY = 0, SCALE = 400;
  var CAM = 5.5;                       // 透视常量：相机到玩家平面的距离

  // —— 以下全是纯视觉参数，不参与任何游戏数值 / 判定 ——
  var PERSP = 1.10;        // 透视收敛指数：>1 时远处收敛更快、纵深更强
  var vPersp = PERSP;      // 随速度微调后的透视指数（每帧赋值）
  var vSk = 0;             // 归一化速度强度 0~1（每帧由 update 计算）
  var vDt = 0.016;         // 渲染层自用步长，仅驱动视觉插值
  var LS = 0.70;           // 地面离屏层分辨率比例
  var gcvScale = 1;        // 离屏层实际缩放
  var groundCv = null, groundCtx = null;
  var lastRenderT = 0;     // 渲染层自用时间戳（算 vDt）
  var vignetteGrad = null; // 暗角（随尺寸重建）

  // DOM
  var elScore = document.getElementById('score');
  var elCoins = document.getElementById('coins');
  var elSpeed = document.getElementById('speed');
  var elDist = document.getElementById('dist');
  var elShield = document.getElementById('shield');
  var elStart = document.getElementById('startScreen');
  var elOver = document.getElementById('overScreen');
  var elFinal = document.getElementById('finalScore');
  var elFinalCoins = document.getElementById('finalCoins');
  var elFinalDist = document.getElementById('finalDist');
  var elBest = document.getElementById('bestScore');
  var elBestStart = document.getElementById('bestStart');
  var elStartSub = document.getElementById('startSub');
  var elProgText = document.getElementById('progText');
  var elProgFill = document.getElementById('progFill');
  var elOverTitle = document.getElementById('overTitle');
  var elOverSub = document.getElementById('overSub');
  var elFinalTime = document.getElementById('finalTime');
  var elRetry = document.getElementById('btnRetry');
  var BEST_KEY = 'sheepRunner.best';

  /* ============================================================
     1. 常量与状态
     ============================================================ */
  var BASE_SPEED = 11;      // 起始速度（世界单位/秒）
  var MAX_ADD = 19;         // 速度最多比初始快多少
  var SPEED_CAP = BASE_SPEED + MAX_ADD;   // 速度硬上限（终点后不再加速）
  var SPAWN_DIST = 82;      // 物体生成的远处距离
  var LANE_X = [-1, 0, 1];  // 三条车道的世界坐标

  // —— 关卡结构：有尽头的关卡，不是无尽跑 ——
  // 改关卡长短只改 LEVEL_LENGTH 一处：开始页文案、HUD 进度条、终点门都读它。
  var LEVEL_LENGTH = 800;      // 关卡总长（世界单位≈米）
  var FINISH_FREE_ZONE = 110;  // 终点前这段距离内不再刷炸弹
  var FINISH_CLEAR_ZONE = 26;  // 终点前这段距离内完全不刷物体（留出干净冲刺道）
  var FINISH_ROLL = 1.15;      // 冲线后滑行到停的秒数（finishing 阶段）

  var G = {
    state: 'ready',   // ready | playing | finishing | dying | over | won
    t: 0,
    distance: 0,
    bonus: 0,
    score: 0,
    coins: 0,
    speed: 0,
    scroll: 0,
    spawnTimer: 1.4,
    dying: 0,
    finishing: 0,    // 冲线滑行剩余时间（>0 表示在 finishing 状态）
    runTime: 0,      // 本局用时（秒），结算显示
    shake: 0,
    objs: [],
    particles: [],
    texts: [],
    bgFar: 0,        // 远景视差累积（纯视觉，不参与判定）
    bgNear: 0,       // 近景视差累积（纯视觉，不参与判定）
    high: 0
  };

  var player = {
    lane: 1,
    x: 0,
    targetX: 0,
    phase: 0,
    invincible: 0,
    animFrame: 0,      // 当前动画帧（0..3），由 update 按 dt 累积的 phase 推导
    boost: 0
  };

  try {
    G.high = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;
  } catch (e) {
    G.high = 0;
  }

  /* ============================================================
     2. 尺寸与透视工具
     ============================================================ */
  function resize() {
    DPR = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    W = window.innerWidth;
    H = window.innerHeight;
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    centerX = W / 2;
    horizonY = H * 0.44;
    baseY = H * 0.94;
    SCALE = Math.min(W / 3.2, H * 0.68);
    NARROW = (W < 640);            // 窄屏（手机竖屏）：单独调速度与角色尺寸

    // —— 地面离屏层：只用来给“地面”做随速度变化的拖影 ——
    if (!groundCv) {
      groundCv = document.createElement('canvas');
      groundCtx = groundCv.getContext('2d');
    }
    var gs = LS * DPR;
    var cap = 2300000;                     // 离屏层像素上限，避免高 DPR 掉帧
    if (W * H * gs * gs > cap) gs = Math.sqrt(cap / Math.max(1, W * H));
    gcvScale = gs;
    groundCv.width = Math.max(2, Math.round(W * gs));
    groundCv.height = Math.max(2, Math.round(H * gs));

    // 暗角（缓存，避免每帧建渐变）
    vignetteGrad = ctx.createRadialGradient(
      centerX, baseY * 0.60, Math.min(W, H) * 0.30,
      centerX, baseY * 0.60, Math.max(W, H) * 0.80
    );
    vignetteGrad.addColorStop(0, 'rgba(16,26,46,0)');
    vignetteGrad.addColorStop(0.62, 'rgba(16,26,46,0.045)');
    vignetteGrad.addColorStop(1, 'rgba(16,26,46,0.17)');
  }

  function sOf(d) {
    // 指数 >1：远处收敛更快（车道纵深更强），d=0 时仍为 1，玩家尺度不变
    var z = d > 0 ? Math.pow(d, vPersp) : d;
    return CAM / (CAM + z);
  }
  function px(worldX, s) { return centerX + worldX * SCALE * s; }
  function py(s) { return horizonY + (baseY - horizonY) * s; }

  // 世界空间四边形（z 从近到远，x 从左右）
  function worldQuad(zNear, zFar, xL, xR, color) {
    var sN = sOf(zNear), sF = sOf(zFar);
    if (sN <= 0 || sF <= 0) return;
    var yN = py(sN), yF = py(sF);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(px(xL, sN), yN);
    ctx.lineTo(px(xR, sN), yN);
    ctx.lineTo(px(xR, sF), yF);
    ctx.lineTo(px(xL, sF), yF);
    ctx.closePath();
    ctx.fill();
  }

  // x 固定的竖直面：沿 z 展开，高度从 y1 到 y2（世界单位，向上为正）。
  // 站台立面、护栏横杆、广告牌都用它 —— 透视自动近大远小。
  function worldPanel(x, z1, z2, y1, y2, color) {
    var s1 = sOf(z1), s2 = sOf(z2);
    if (s1 <= 0 || s2 <= 0) return;
    var b1 = py(s1), b2 = py(s2);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(px(x, s1), b1 - y1 * SCALE * s1);
    ctx.lineTo(px(x, s2), b2 - y1 * SCALE * s2);
    ctx.lineTo(px(x, s2), b2 - y2 * SCALE * s2);
    ctx.lineTo(px(x, s1), b1 - y2 * SCALE * s1);
    ctx.closePath();
    ctx.fill();
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function hash(n) {
    var x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  /* ============================================================
     3. 音效（WebAudio，无外部资源）
     ============================================================ */
  var actx = null;

  function ensureAudio() {
    if (!actx) {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) actx = new AC();
      } catch (e) { actx = null; }
    }
    if (actx && actx.state === 'suspended') actx.resume();
  }

  function tone(freq, dur, type, vol, delay, glideTo) {
    if (!actx) return;
    var t0 = actx.currentTime + (delay || 0);
    var osc = actx.createOscillator();
    var g = actx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.1, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(actx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  function sfxCoin() { tone(1180, 0.09, 'square', 0.06, 0); tone(1620, 0.13, 'square', 0.05, 0.055); }
  function sfxFood() { tone(660, 0.10, 'triangle', 0.10, 0); tone(880, 0.10, 'triangle', 0.10, 0.075); tone(1320, 0.18, 'triangle', 0.09, 0.15); }
  function sfxShield() { tone(520, 0.08, 'square', 0.07, 0); tone(800, 0.12, 'square', 0.06, 0.06); }
  function sfxMove() { tone(430, 0.05, 'sine', 0.045, 0); }

  function sfxWin() {
    tone(660, 0.12, 'triangle', 0.10, 0);
    tone(880, 0.12, 'triangle', 0.10, 0.10);
    tone(1180, 0.22, 'triangle', 0.11, 0.21);
    tone(1560, 0.34, 'triangle', 0.09, 0.33);
  }

  function sfxBomb() {
    if (!actx) return;
    var dur = 0.65, sr = actx.sampleRate;
    var buf = actx.createBuffer(1, Math.floor(sr * dur), sr);
    var data = buf.getChannelData(0);
    for (var i = 0; i < data.length; i++) {
      var k = 1 - i / data.length;
      data[i] = (Math.random() * 2 - 1) * k * k * 1.6;
    }
    var src = actx.createBufferSource();
    src.buffer = buf;
    var g = actx.createGain();
    g.gain.setValueAtTime(0.34, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
    src.connect(g);
    g.connect(actx.destination);
    src.start();
    tone(130, 0.5, 'sawtooth', 0.16, 0, 38);
  }

  /* ============================================================
     4. 粒子 / 飘字
     ============================================================ */
  function burst(x, y, color, n, power) {
    n = Math.round(n);
    var ps = power * (1 + 0.35 * vSk);          // 粒子速度随游戏速度同步
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = (0.35 + Math.random()) * ps * 520;
      var life = 0.42 + Math.random() * 0.34;
      G.particles.push({
        type: 'dot', x: x, y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 110,
        r: 2 + Math.random() * 4.5,
        life: life, max: life,
        color: color
      });
    }
  }

  function explode(x, y, scale) {
    scale = scale || 1;
    G.particles.push({
      type: 'ring', x: x, y: y, r: 8 * scale, maxR: 205 * scale,
      life: 0.5, max: 0.5
    });
    // 爆炸闪光：更亮的核心白光
    G.particles.push({
      type: 'flash', x: x, y: y, r: 10 * scale, maxR: 96 * scale,
      life: 0.26, max: 0.26
    });
    burst(x, y, '#ff9a3c', 38 * scale, 1.35 * scale);
    burst(x, y, '#ffe27a', 24 * scale, 1.02 * scale);
    burst(x, y, '#fffbe6', 12 * scale, 0.90 * scale);
    burst(x, y, '#5d5d6b', 14 * scale, 0.80 * scale);
  }

  function addText(x, y, str, color) {
    G.texts.push({ x: x, y: y, str: str, color: color, life: 0.95, max: 0.95 });
  }

  function updateParticles(dt) {
    for (var i = G.particles.length - 1; i >= 0; i--) {
      var p = G.particles[i];
      p.life -= dt;
      if (p.life <= 0) { G.particles.splice(i, 1); continue; }
      if (p.type === 'ring') {
        p.r += (p.maxR - p.r) * Math.min(1, dt * 7);
      } else if (p.type === 'flash') {
        p.r += (p.maxR - p.r) * Math.min(1, dt * 16);
      } else {
        p.vy += 1500 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.97;
      }
    }
  }

  function updateTexts(dt) {
    for (var i = G.texts.length - 1; i >= 0; i--) {
      G.texts[i].life -= dt;
      if (G.texts[i].life <= 0) G.texts.splice(i, 1);
    }
  }

  /* ============================================================
     5. 生成逻辑
     ============================================================ */
  function makeObj(lane, type, d) {
    return {
      lane: lane,
      x: LANE_X[lane],
      d: d,
      type: type,
      foodType: type === 'food' ? ['carrot', 'grass', 'apple'][Math.floor(Math.random() * 3)] : null,
      phase: Math.random() * Math.PI * 2,
      dead: false
    };
  }

  function pickType() {
    // 炸弹概率随距离缓慢上升；终点前 FINISH_FREE_ZONE 内直接不刷炸弹
    var nearFinish = (LEVEL_LENGTH - G.distance) < FINISH_FREE_ZONE;
    var pBomb = nearFinish ? 0 : Math.min(0.5, 0.24 + G.distance / 9000);
    var r = Math.random();
    if (r < pBomb) return 'bomb';
    if (r < pBomb + 0.36) return 'coin';
    return 'food';
  }

  function spawnWave(spawnD) {
    var lanes = [0, 1, 2];
    // 洗牌
    for (var i = lanes.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = lanes[i]; lanes[i] = lanes[j]; lanes[j] = t;
    }
    var r = Math.random();
    var count = r < 0.52 ? 1 : (r < 0.87 ? 2 : 3);
    var chosen = lanes.slice(0, count);

    var items = [];
    for (var k = 0; k < chosen.length; k++) {
      items.push({ lane: chosen[k], type: pickType() });
    }
    // 规则：至少给玩家留一条生路（不能三车道全是炸弹）
    var allBomb = true;
    for (var m = 0; m < items.length; m++) {
      if (items[m].type !== 'bomb') { allBomb = false; break; }
    }
    if (allBomb) items[items.length - 1].type = 'coin';

    var d0 = spawnD || (SPAWN_DIST + Math.random() * 4);
    for (var n = 0; n < items.length; n++) {
      G.objs.push(makeObj(items[n].lane, items[n].type, d0 + Math.random() * 3));
    }
  }

  function nextSpawnDelay() {
    var base = rnd(0.8, 1.5);                        // 每条车道 0.8~1.5 秒
    var f = Math.max(0.68, 12 / Math.max(6, G.speed));
    return clamp(base * f, 0.68, 1.5);
  }

  /* ============================================================
     6. 碰撞与结算
     ============================================================ */
  function handleHit(o) {
    o.dead = true;
    var s = sOf(o.d);
    var X = px(o.x, s);
    var Y = py(s) - 0.24 * SCALE * s;

    if (o.type === 'coin') {
      G.bonus += 10;
      G.coins += 1;
      addText(X, Y, '+10', '#ffcf3a');
      burst(X, Y, '#ffd75e', 17, 0.46);
      sfxCoin();
    } else if (o.type === 'food') {
      G.bonus += 30;
      player.invincible = Math.max(player.invincible, 3.5);
      player.boost = Math.max(player.boost, 1.6);
      // 拿到无敌的同一瞬间就把「无敌中」刷出来：否则同一帧内先吃食物再撞炸弹时，
      // 判定认为无敌、玩家却看不到任何提示，正是「没无敌却撞碎」的观感来源。
      syncShieldHud();
      addText(X, Y, '+30 无敌!', '#66e08a');
      burst(X, Y, '#8ef0a0', 24, 0.62);
      burst(X, Y, '#f2ffe8', 9, 0.44);
      sfxFood();
    } else if (o.type === 'bomb') {
      // 严格规则：只有「确实处于无敌」且「HUD 已经在提示无敌」时才允许撞碎加分；
      // 非无敌撞炸弹一律进入 dying（0.85s）→ 结算「撞到炸弹啦！」。
      // 注意：这里显式判 bomb，不再用 else 兜底，避免将来新增物体类型被当成炸弹。
      if (canSmashBomb()) {
        G.bonus += 5;
        addText(X, Y, '+5 撞碎!', '#ffb3c1');
        explode(X, Y, 0.55);
        G.shake = Math.max(G.shake, 9);
        sfxShield();
      } else {
        explode(X, Y, 1.15);
        G.shake = 26;
        G.state = 'dying';
        G.dying = 0.85;
        sfxBomb();
      }
    } else {
      // 未知类型：既不致死也不加分（保守兜底，宁可漏判也不误杀）
      if (window.console && console.warn) console.warn('[sheep] 未知物体类型: ' + o.type);
    }
  }

  // 结算：won=true 通关，false 撞炸弹。两条结局共用同一张结算卡。
  function showResult(won) {
    G.state = won ? 'won' : 'over';
    var dist = Math.min(G.distance, LEVEL_LENGTH);
    var sc = Math.floor(dist) + G.bonus;
    if (sc > G.high) {
      G.high = sc;
      try { localStorage.setItem(BEST_KEY, String(sc)); } catch (e) {}
    }
    elFinal.textContent = sc;
    elFinalCoins.textContent = G.coins;
    elFinalDist.textContent = Math.floor(dist) + ' m';
    elFinalTime.textContent = G.runTime.toFixed(1) + ' s';
    if (elBest) elBest.textContent = G.high;
    if (elBestStart) elBestStart.textContent = G.high;
    if (won) {
      elOverTitle.textContent = '通关成功！';
      elOverTitle.className = 'good';
      elOverSub.textContent = '小羊一口气跑完了整条地铁线～';
      elRetry.textContent = '再跑一次';
    } else {
      elOverTitle.textContent = '撞到炸弹啦！';
      elOverTitle.className = 'bad';
      elOverSub.textContent = '小羊被炸得满头卷毛～';
      elRetry.textContent = '重新开始';
    }
    elOver.classList.remove('hidden');
  }

  function showGameOver() { showResult(false); }

  /* ============================================================
     7. 游戏流程
     ============================================================ */
  function resetGame() {
    G.state = 'ready';
    G.t = 0;
    G.distance = 0;
    G.bonus = 0;
    G.score = 0;
    G.coins = 0;
    G.speed = 0;
    G.scroll = 0;
    G.spawnTimer = 1.2;
    G.dying = 0;
    G.shake = 0;
    G.runTime = 0;
    G.finishing = 0;
    G.bgFar = 0;
    G.bgNear = 0;
    vSk = 0;
    G.objs.length = 0;
    G.particles.length = 0;
    G.texts.length = 0;
    player.lane = 1;
    player.x = 0;
    player.targetX = 0;
    player.phase = 0;
    player.animFrame = 0;
    // 每局都从「不无敌」开始：invincible 必须归零，同时立刻同步 HUD 徽标，
    // 避免上一局残留的无敌状态影响本局第一次撞炸弹的判定
    player.invincible = 0;
    player.boost = 0;
    syncShieldHud();
    updateHUD();
  }

  function startGame() {
    ensureAudio();
    resetGame();
    G.state = 'playing';
    // 预置前几波，避免开局空跑太久
    spawnWave(34);
    spawnWave(52);
    spawnWave(71);
    G.spawnTimer = 1.1;
    elStart.classList.add('hidden');
    elOver.classList.add('hidden');
    lastTime = performance.now();
  }

  function moveLane(dir) {
    ensureAudio();
    if (G.state !== 'playing') return;
    var nl = clamp(player.lane + dir, 0, 2);
    if (nl !== player.lane) {
      player.lane = nl;
      player.targetX = LANE_X[nl];
      sfxMove();
    }
  }

  /* ============================================================
     8. 更新
     ============================================================ */
  // 背景视差累积：只影响视觉滚动速度，不参与任何判定
  function advanceBg(ds, sk) {
    G.bgFar += ds * (1 + 0.20 * sk);
    G.bgNear += ds * (1 + 0.80 * sk);
  }

  function update(dt) {
    G.t += dt;

    if (G.state === 'ready') {
      G.scroll += 5 * dt;
      advanceBg(5 * dt, 0);
      player.phase += dt * animPhaseRate(0);   // ready 恒为 6 rad/s，与改造前完全一致
      player.animFrame = animFrameOf(player.phase);
      G.speed = 0;
      vSk = 0;
      updateParticles(dt);
      updateTexts(dt);
      updateHUD();
      return;
    }

    if (G.state === 'playing') {
      // 速度随 distance 增长，而 distance 又是速度的积分 → 实际是指数加速。
      // 窄屏视野小、反应时间短，所以初速和加速率都单独压一档。
      var spdK = NARROW ? 0.80 : 1.0;
      var accK = NARROW ? 0.52 : 1.0;
      var base = BASE_SPEED * spdK + Math.min(MAX_ADD * spdK, G.distance * 0.011 * accK);
      player.boost = Math.max(0, player.boost - dt);
      player.invincible = Math.max(0, player.invincible - dt);
      G.speed = Math.min(SPEED_CAP * 1.35, base * (player.boost > 0 ? 1.35 : 1));   // 硬上限：吃食物加速也不突破
      vSk = clamp(G.speed / (BASE_SPEED + MAX_ADD), 0, 1);

      G.distance += G.speed * dt;
      G.scroll += G.speed * dt;
      advanceBg(G.speed * dt, vSk);
      G.score = Math.floor(G.distance) + G.bonus;
      G.runTime += dt;

      // 车道平滑移动
      player.x += (player.targetX - player.x) * Math.min(1, dt * 16);
      player.phase += dt * animPhaseRate(G.speed);   // 原 dt * (6 + G.speed * 0.55)，高速段封顶 12fps
      player.animFrame = animFrameOf(player.phase);

      // 生成物体
      G.spawnTimer -= dt;
      if (G.spawnTimer <= 0) {
        // 终点前留最后一段干净的冲刺路：不再放任何物体（炸弹自然也没了）
        if (G.distance < LEVEL_LENGTH - FINISH_CLEAR_ZONE) spawnWave();
        G.spawnTimer = nextSpawnDelay();
      }

      // 物体推进 + 碰撞
      for (var i = 0; i < G.objs.length; i++) {
        var o = G.objs[i];
        var prevD = o.d;
        o.d -= G.speed * dt;
        if (o.dead) continue;
        // 穿过玩家平面时判定（与帧率无关，避免高速穿模）
        if (prevD > 0.35 && o.d <= 0.35) {
          if (Math.abs(o.x - player.x) < 0.58) {
            handleHit(o);
            // 本帧已判定死亡/冲线：立刻停止处理剩余物体，
            // 否则同一帧后面的食物/金币还会继续加分、继续飘字（死亡当帧仍“+30/+5”的乱象）
            if (G.state !== 'playing') break;
          }
        } else if (o.d < -3) {
          o.dead = true;
        }
      }
      if (G.objs.length) {
        G.objs = G.objs.filter(function (o2) { return !o2.dead; });
      }

      // —— 关卡终点：跑满 LEVEL_LENGTH 进入通关流程（有尽头，不再是无尽跑）——
      if (G.distance >= LEVEL_LENGTH) {
        G.distance = LEVEL_LENGTH;
        G.state = 'finishing';
        G.finishing = FINISH_ROLL;
        G.spawnTimer = 999;
        for (var w = 0; w < 5; w++) {
          burst(centerX + (w - 2) * Math.min(W, 900) * 0.13, H * 0.28,
            ['#ffd94a', '#68d391', '#7db8f0', '#ff9ab0', '#fff3c6'][w], 16, 0.95);
        }
        sfxWin();
      }
    } else if (G.state === 'finishing') {
      // 冲线后滑行：只滚视觉，distance 锁在 LEVEL_LENGTH，速度单调降到 0
      G.speed = Math.max(0, G.speed - 26 * dt);
      vSk = clamp(G.speed / (BASE_SPEED + MAX_ADD), 0, 1);
      G.scroll += G.speed * dt;
      advanceBg(G.speed * dt, vSk);
      player.x += (player.targetX - player.x) * Math.min(1, dt * 16);
      player.phase += dt * animPhaseRate(G.speed);
      player.animFrame = animFrameOf(player.phase);
      for (var fo = 0; fo < G.objs.length; fo++) G.objs[fo].d -= G.speed * dt;
      G.finishing -= dt;
      if (G.finishing <= 0) showResult(true);
    } else if (G.state === 'dying') {
      G.speed *= Math.pow(0.015, dt);
      vSk = clamp(G.speed / (BASE_SPEED + MAX_ADD), 0, 1);
      G.scroll += G.speed * dt;
      advanceBg(G.speed * dt, vSk);
      for (var j = 0; j < G.objs.length; j++) G.objs[j].d -= G.speed * dt;
      G.dying -= dt;
      if (G.dying <= 0) showGameOver();
    }

    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 58);

    updateParticles(dt);
    updateTexts(dt);
    updateHUD();
  }

  var hudCache = { sc: -1, co: -1, sp: -1, di: -1, sh: null, rem: -1, pg: -1 };

  function updateHUD() {
    var sc = G.score | 0, co = G.coins, sp = Math.round(G.speed * 3.6), di = Math.floor(G.distance);
    if (sc !== hudCache.sc) { elScore.textContent = sc; hudCache.sc = sc; }
    if (co !== hudCache.co) { elCoins.textContent = co; hudCache.co = co; }
    if (sp !== hudCache.sp) { elSpeed.textContent = sp; hudCache.sp = sp; }
    if (di !== hudCache.di) { elDist.textContent = di; hudCache.di = di; }

    // 关卡进度：剩余距离 + 进度条（单一数据源 LEVEL_LENGTH）
    var rem = Math.max(0, Math.ceil(LEVEL_LENGTH - Math.min(G.distance, LEVEL_LENGTH)));
    var pg = Math.round(clamp(G.distance / LEVEL_LENGTH, 0, 1) * 1000) / 10;
    if (rem !== hudCache.rem) {
      elProgText.textContent = rem > 0 ? ('剩余 ' + rem + ' m') : '终点站到了';
      hudCache.rem = rem;
    }
    if (pg !== hudCache.pg) {
      elProgFill.style.width = pg + '%';
      hudCache.pg = pg;
    }

    syncShieldHud();
  }

  /* ---------------- 无敌：提示与判定的唯一来源 ----------------
     规则：撞碎炸弹必须同时满足
       1) player.invincible > 0
       2) 「无敌中」徽标此刻是可见的
     两条件由 syncShieldHud() 保证同一帧同步，所以不存在
     「看不见提示却被判定为无敌」的情况。 */
  function shieldVisible() {
    return !!(elShield && !elShield.classList.contains('hidden'));
  }

  function canSmashBomb() {
    return player.invincible > 0 && shieldVisible();
  }

  // 立即把「无敌中 + 剩余秒数」同步到 HUD（拿到无敌的那一刻就调用，不等下一帧）
  function syncShieldHud() {
    var inv = player.invincible > 0;
    if (inv) {
      var secs = Math.ceil(player.invincible * 10) / 10;
      var txt = '无敌中 ' + secs.toFixed(1) + 's';
      if (elShield.textContent !== txt) elShield.textContent = txt;
      if (elShield.classList.contains('hidden')) elShield.classList.remove('hidden');
    } else if (!elShield.classList.contains('hidden')) {
      elShield.classList.add('hidden');
      elShield.textContent = '无敌中';
    }
    hudCache.sh = inv;
    return inv;
  }

  /* ============================================================
  /* ============================================================
     9. 绘制 —— 场景
     ============================================================ */
  function drawSky() {
    var g = ctx.createLinearGradient(0, -40, 0, horizonY + 30);
    g.addColorStop(0.00, '#3ba4e6');
    g.addColorStop(0.30, '#68c1f3');
    g.addColorStop(0.56, '#a0dffb');
    g.addColorStop(0.80, '#d2f0ff');
    g.addColorStop(1.00, '#eefaff');
    ctx.fillStyle = g;
    ctx.fillRect(-40, -40, W + 80, horizonY + 80);

    // 太阳 + 暖色光晕
    var sx = W * 0.8, sy = horizonY * 0.28;
    var srad = Math.max(96, W * 0.12);
    var sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, srad);
    sg.addColorStop(0, 'rgba(255,253,232,0.98)');
    sg.addColorStop(0.22, 'rgba(255,248,205,0.70)');
    sg.addColorStop(0.55, 'rgba(255,240,180,0.28)');
    sg.addColorStop(1, 'rgba(255,238,170,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(sx, sy, srad, 0, Math.PI * 2);
    ctx.fill();

    // 云：加了底部阴影，比纯白剪影有体积
    var clouds = [
      { x: 0.12, y: 0.13, s: 1.00, sp: 9 },
      { x: 0.46, y: 0.07, s: 0.72, sp: 6 },
      { x: 0.72, y: 0.22, s: 1.15, sp: 12 },
      { x: 0.92, y: 0.10, s: 0.85, sp: 7 }
    ];
    var span = W * 1.5;
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      var cw = 120 * c.s;
      var cx = ((c.x * W - G.bgFar * c.sp) % span + span) % span - W * 0.25;
      var cy = c.y * horizonY + 20;
      ctx.fillStyle = 'rgba(202,226,246,0.72)';
      ctx.beginPath();
      ctx.arc(cx + cw * 0.08, cy + cw * 0.13, cw * 0.40, 0, Math.PI * 2);
      ctx.arc(cx + cw * 0.48, cy + cw * 0.04, cw * 0.30, 0, Math.PI * 2);
      ctx.arc(cx + cw * 0.82, cy + cw * 0.15, cw * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(cx, cy, cw * 0.42, 0, Math.PI * 2);
      ctx.arc(cx + cw * 0.42, cy - cw * 0.12, cw * 0.32, 0, Math.PI * 2);
      ctx.arc(cx + cw * 0.8, cy + cw * 0.04, cw * 0.36, 0, Math.PI * 2);
      ctx.arc(cx + cw * 0.42, cy + cw * 0.18, cw * 0.34, 0, Math.PI * 2);
      ctx.fill();
    }

    // 远景薄雾：贴地平线的一层淡雾，拉开纵深
    var mist = ctx.createLinearGradient(0, horizonY - H * 0.18, 0, horizonY + 6);
    mist.addColorStop(0, 'rgba(226,244,255,0)');
    mist.addColorStop(0.55, 'rgba(226,244,255,0.26)');
    mist.addColorStop(1, 'rgba(232,248,255,0.58)');
    ctx.fillStyle = mist;
    ctx.fillRect(-40, horizonY - H * 0.18, W + 80, H * 0.18 + 20);
  }

  function drawBuildings() {
    // 远景用 bgFar、近景用 bgNear：两者累积速率不同，高速时差距被拉开
    var layers = [
      { tile: 178, hMin: 46, hMax: 132, color: '#b0c2d8', speed: 3.4, gap: 26, far: 1 },
      { tile: 128, hMin: 34, hMax: 98, color: '#93a5bd', speed: 6.6, gap: 18, far: 0 }
    ];
    for (var L = 0; L < layers.length; L++) {
      var ly = layers[L];
      var scrollPx = (ly.far ? G.bgFar : G.bgNear) * ly.speed;
      var off = scrollPx % ly.tile;
      var baseIdx = Math.floor(scrollPx / ly.tile);
      var count = Math.ceil(W / ly.tile) + 3;
      for (var i = -1; i < count; i++) {
        var idx = i + baseIdx;
        var h = ly.hMin + hash(idx * 1.37 + L * 10.1) * (ly.hMax - ly.hMin);
        var bx = i * ly.tile - off;
        var bw = ly.tile - ly.gap - hash(idx * 2.11) * 34;
        var by = horizonY - h;
        ctx.fillStyle = ly.color;
        ctx.fillRect(bx, by, bw, h + 3);
        // 受光侧高光：让剪影有体积
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(bx, by, Math.max(2, bw * 0.15), h + 3);
        // 屋顶小水箱 / 天线，让剪影有层次
        var rt = hash(idx * 5.7 + L);
        if (rt > 0.62) {
          ctx.fillStyle = ly.color;
          ctx.fillRect(bx + bw * 0.25, by - 10 - rt * 8, Math.max(4, bw * 0.14), 12 + rt * 8);
        }
        // 窗户点（少量暖光，避免整片死板）
        if (L === 1 && bw > 46) {
          for (var wy = by + 12; wy < horizonY - 8; wy += 16) {
            for (var wx = bx + 9; wx < bx + bw - 10; wx += 15) {
              if (hash(wx * 0.31 + wy * 0.77) > 0.45) {
                ctx.fillStyle = hash(wx * 1.7 + wy * 2.3) > 0.72
                  ? 'rgba(255,236,176,0.55)'
                  : 'rgba(255,255,255,0.32)';
                ctx.fillRect(wx, wy, 6, 7);
              }
            }
          }
        }
      }
    }

    // 空气透视：越靠近地平线越化进天色
    var air = ctx.createLinearGradient(0, horizonY - 152, 0, horizonY + 2);
    air.addColorStop(0, 'rgba(210,236,255,0)');
    air.addColorStop(0.6, 'rgba(214,238,255,0.20)');
    air.addColorStop(1, 'rgba(226,244,255,0.58)');
    ctx.fillStyle = air;
    ctx.fillRect(-40, horizonY - 152, W + 80, 154);

    // 地平线雾（加厚）
    var hz = ctx.createLinearGradient(0, horizonY - 54, 0, horizonY + 34);
    hz.addColorStop(0, 'rgba(230,246,255,0)');
    hz.addColorStop(0.55, 'rgba(230,246,255,0.88)');
    hz.addColorStop(1, 'rgba(232,249,255,0.42)');
    ctx.fillStyle = hz;
    ctx.fillRect(-40, horizonY - 54, W + 80, 90);
  }

  function drawGround() {
    // 城市地面：冷灰混凝土，越远越化进雾里（不再是大片绿草地）
    var g = ctx.createLinearGradient(0, horizonY, 0, H + 40);
    g.addColorStop(0.00, '#aab6c6');
    g.addColorStop(0.20, '#8e9aab');
    g.addColorStop(0.55, '#74808f');
    g.addColorStop(1.00, '#5a6472');
    ctx.fillStyle = g;
    ctx.fillRect(-40, horizonY, W + 80, H - horizonY + 80);

    // 两侧站台铺装（比轨道亮一档，把视线压在中间轨道上）
    worldQuad(-4, 600, -9.5, -2.46, '#a9b3c1');
    worldQuad(-4, 600, 2.46, 9.5, '#a9b3c1');

    // 站台砖缝：世界坐标固定，随 scroll 后移，给“地面在动”一个明确参照
    var period = 2.4;
    var start = G.scroll % period;
    for (var i = 0; i < 26; i++) {
      var z = i * period - start;
      if (z < -3) continue;
      if (z > 54) break;
      var absI = Math.round((z + G.scroll) / period);
      var col = (absI % 2 === 0) ? 'rgba(255,255,255,0.16)' : 'rgba(44,56,74,0.12)';
      worldQuad(z, z + period * 0.5, -9.5, -2.46, col);
      worldQuad(z, z + period * 0.5, 2.46, 9.5, col);
    }
  }

  function drawRoad() {
    // ===== 地铁轨道（替代原柏油马路）=====

    // 道砟底色：比两侧站台暗一档，形成“下沉轨道”观感
    worldQuad(-4, 600, -2.0, 2.0, '#39404e');
    worldQuad(-4, 600, -1.72, 1.72, '#414a5a');

    // —— 道砟碎石：世界坐标固定，近大远小 ——
    var pP = 2.6, pStart = G.scroll % pP;
    for (var pi = 0; pi < 26; pi++) {
      var z0 = pi * pP - pStart;
      if (z0 < -3) continue;
      if (z0 > 76) break;
      var absI = Math.round((z0 + G.scroll) / pP);
      for (var sub = 0; sub < 4; sub++) {
        var hA = hash(absI * 3.77 + sub * 17.3);
        var hB = hash(absI * 8.13 + sub * 31.7 + 5.5);
        var hC = hash(absI * 5.31 + sub * 9.1 + 2.2);
        var zz = z0 + sub * pP * 0.25;
        var xl = -1.66 + hA * 1.30;
        var xw = 0.16 + hB * 0.42;
        var xr = Math.min(1.66, xl + xw);
        if (xr <= xl + 0.02) continue;
        var aA = 0.05 + hC * 0.09;
        var col = (hA > 0.55)
          ? 'rgba(200,212,230,' + aA.toFixed(3) + ')'
          : 'rgba(12,16,26,' + (aA * 1.25).toFixed(3) + ')';
        worldQuad(zz, zz + pP * (0.16 + hB * 0.22), xl, xr, col);
      }
    }

    // —— 枕木：横跨轨道，随 scroll 后移（枕木间距是“轨道在动”的主要参照）——
    var tieP = 2.25;
    var tieStart = G.scroll % tieP;
    for (var ti = 0; ti < 52; ti++) {
      var tz = ti * tieP - tieStart;
      if (tz < -2.2) continue;
      if (tz > 86) break;
      var ta = clamp(1 - tz / 100, 0.22, 1);
      worldQuad(tz, tz + 0.62, -1.74, 1.74, 'rgba(78,63,52,' + (0.94 * ta).toFixed(3) + ')');
      worldQuad(tz, tz + 0.16, -1.74, 1.74, 'rgba(178,158,132,' + (0.50 * ta).toFixed(3) + ')');
      worldQuad(tz + 0.46, tz + 0.62, -1.74, 1.74, 'rgba(18,14,12,' + (0.32 * ta).toFixed(3) + ')');
    }

    // —— 钢轨：每条车道两根，连续贯穿 —— 地铁轨道的核心识别点
    for (var li = 0; li < 3; li++) {
      var lcx = LANE_X[li];
      for (var ri = 0; ri < 2; ri++) {
        var rx = lcx + (ri === 0 ? -0.52 : 0.52);
        worldQuad(-4, 600, rx - 0.085, rx + 0.085, 'rgba(22,26,36,0.55)');       // 轨底投影
        worldQuad(-4, 600, rx - 0.058, rx + 0.058, '#9aa5b8');                   // 轨面
        worldQuad(-4, 600, rx - 0.050, rx - 0.020, 'rgba(250,253,255,0.75)');    // 受光高光
        worldQuad(-4, 600, rx + 0.022, rx + 0.050, 'rgba(88,98,116,0.60)');      // 背光
      }
    }

    // —— 站台：压顶石 + 黄色警示带 + 立面（路缘不再是白护栏，而是站台边）——
    for (var sd = 0; sd < 2; sd++) {
      var sgn = sd === 0 ? -1 : 1;
      var inX = sgn * 2.00, midX = sgn * 2.18, outX = sgn * 2.46;
      worldQuad(-4, 600, Math.min(inX, outX), Math.max(inX, outX), '#bcc5d2');       // 压顶
      worldQuad(-4, 600, Math.min(inX, midX), Math.max(inX, midX), '#e6c257');       // 警示带
      worldPanel(inX, -1.5, 600, 0, 0.20, '#7b8596');                                // 平台立面（轨道侧）
      worldPanel(outX, -1.5, 600, 0, 0.26, '#9ba5b4');                               // 外侧立面
    }

    // —— 透视明暗：近端压暗、远端化雾（渐变终点取屏幕底，避开屏幕外亮端）——
    var sN = sOf(-4), sF = sOf(600);
    var yN = py(sN), yF = py(sF);
    var dg = ctx.createLinearGradient(0, yF, 0, H + 40);
    dg.addColorStop(0, 'rgba(24,32,48,0.38)');
    dg.addColorStop(0.32, 'rgba(18,26,42,0.16)');
    dg.addColorStop(1, 'rgba(176,190,210,0.14)');
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.moveTo(px(-2.0, sN), yN);
    ctx.lineTo(px(2.0, sN), yN);
    ctx.lineTo(px(2.0, sF), yF);
    ctx.lineTo(px(-2.0, sF), yF);
    ctx.closePath();
    ctx.fill();
  }

  function drawBush(X, Y, r, seed, s) {
    var near = clamp(s || 1, 0, 1);

    // 地面投影：近处浓、远处淡，高速时略虚
    var sa = (0.14 + 0.20 * near) * (1 - 0.12 * vSk);
    ctx.save();
    ctx.translate(X, Y);
    ctx.scale(1, 0.34);
    var shg = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.55);
    shg.addColorStop(0, 'rgba(14,40,18,' + sa.toFixed(3) + ')');
    shg.addColorStop(1, 'rgba(14,40,18,0)');
    ctx.fillStyle = shg;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    var dark = seed > 0.5 ? '#3f8f36' : '#4a9e3c';
    var base = seed > 0.5 ? '#54ae45' : '#5fbf4d';
    var lit = seed > 0.5 ? '#74d45e' : '#84e26a';

    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(X, Y - r * 0.52, r * 0.80, 0, Math.PI * 2);
    ctx.arc(X - r * 0.74, Y - r * 0.20, r * 0.60, 0, Math.PI * 2);
    ctx.arc(X + r * 0.74, Y - r * 0.22, r * 0.62, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.arc(X - r * 0.05, Y - r * 0.62, r * 0.72, 0, Math.PI * 2);
    ctx.arc(X - r * 0.66, Y - r * 0.28, r * 0.50, 0, Math.PI * 2);
    ctx.arc(X + r * 0.64, Y - r * 0.30, r * 0.52, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = lit;
    ctx.beginPath();
    ctx.arc(X - r * 0.30, Y - r * 0.84, r * 0.42, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    ctx.beginPath();
    ctx.arc(X - r * 0.42, Y - r * 0.96, r * 0.19, 0, Math.PI * 2);
    ctx.fill();

    // 小花
    if (seed > 0.7) {
      ctx.fillStyle = seed > 0.85 ? '#ff8fae' : '#ffdf6b';
      ctx.beginPath();
      ctx.arc(X + r * 0.34, Y - r * 0.92, r * 0.17, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawStreetLamp(X, Ybase, Ytop, side, s) {
    var w = Math.max(1.2, 0.11 * SCALE * s);
    var armLen = 0.55 * SCALE * s;
    var lx = X - side * armLen;
    var ly = Ytop - 0.12 * SCALE * s;
    var near = clamp(s, 0, 1);

    // 地面投影
    var sag = (0.12 + 0.16 * near) * (1 - 0.12 * vSk);
    var sr = Math.max(4, 0.9 * SCALE * s);
    ctx.save();
    ctx.translate(X, Ybase);
    ctx.scale(1, 0.30);
    var sgd = ctx.createRadialGradient(0, 0, 0, 0, 0, sr);
    sgd.addColorStop(0, 'rgba(16,30,24,' + sag.toFixed(3) + ')');
    sgd.addColorStop(1, 'rgba(16,30,24,0)');
    ctx.fillStyle = sgd;
    ctx.beginPath();
    ctx.arc(0, 0, sr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.lineCap = 'round';
    // 灯柱描边
    ctx.strokeStyle = 'rgba(54,64,78,0.85)';
    ctx.lineWidth = w * 1.65;
    ctx.beginPath();
    ctx.moveTo(X, Ybase);
    ctx.lineTo(X, Ytop);
    ctx.lineTo(lx, ly);
    ctx.stroke();
    // 灯柱主体
    ctx.strokeStyle = '#7f8c9c';
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(X, Ybase);
    ctx.lineTo(X, Ytop);
    ctx.lineTo(lx, ly);
    ctx.stroke();
    // 受光侧高光
    ctx.strokeStyle = 'rgba(228,238,248,0.55)';
    ctx.lineWidth = Math.max(0.6, w * 0.30);
    ctx.beginPath();
    ctx.moveTo(X - w * 0.22, Ybase);
    ctx.lineTo(X - w * 0.22, Ytop - w * 0.4);
    ctx.stroke();

    // 灯头光晕
    var rr = Math.max(2, 0.16 * SCALE * s);
    var gd = ctx.createRadialGradient(lx, ly, 0, lx, ly, rr * 3.0);
    gd.addColorStop(0, 'rgba(255,248,205,0.98)');
    gd.addColorStop(0.35, 'rgba(255,236,150,0.50)');
    gd.addColorStop(1, 'rgba(255,232,150,0)');
    ctx.fillStyle = gd;
    ctx.beginPath();
    ctx.arc(lx, ly, rr * 3.0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fffbe0';
    ctx.beginPath();
    ctx.arc(lx, ly, rr * 0.64, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSideProps() {
    // —— 站台护栏立柱：高度用世界坐标换算，透视下近粗远细 ——
    var postStep = 3.2;
    var postStart = G.scroll % postStep;
    for (var pi = 24; pi >= 0; pi--) {
      var pz = pi * postStep - postStart;
      if (pz < -1.5) continue;
      if (pz > 78) break;
      var ps = sOf(pz);
      if (ps < 0.02) continue;
      var pu = SCALE * ps;
      for (var si = 0; si < 2; si++) {
        var X = px(si === 0 ? -2.62 : 2.62, ps);
        ctx.strokeStyle = 'rgba(62,72,88,0.92)';
        ctx.lineWidth = Math.max(1, 0.05 * pu);
        ctx.beginPath();
        ctx.moveTo(X, py(ps));
        ctx.lineTo(X, py(ps) - 1.08 * pu);
        ctx.stroke();
      }
    }

    // —— 护栏横杆：两道细长竖直面，自动向灭点收敛 ——
    for (var hi = 0; hi < 2; hi++) {
      var sgnR = hi === 0 ? -1 : 1;
      worldPanel(sgnR * 2.62, -1.5, 92, 1.00, 1.07, 'rgba(128,140,158,0.95)');
      worldPanel(sgnR * 2.62, -1.5, 92, 0.54, 0.59, 'rgba(98,110,128,0.92)');
    }

    // —— 灯箱广告牌：站外两侧交替出现，给出“城市地铁”氛围 ——
    var bStep = 24;
    var bStart = G.scroll % bStep;
    for (var bi = 12; bi >= 0; bi--) {
      var bz = bi * bStep - bStart;
      if (bz < -2) continue;
      if (bz > 84) break;
      var absB = Math.round((bz + G.scroll) / bStep);
      if (sOf(bz + 1.2) < 0.03) continue;
      var bx = ((absB % 2 === 0) ? -1 : 1) * 3.4;
      var hh = 1.35 + hash(absB * 2.3) * 0.75;
      var tone = hash(absB * 7.1) > 0.5 ? '#4d8fb6' : '#c25f70';
      // 支柱
      worldPanel(bx, bz + 0.22, bz + 0.36, 0, 0.85, '#5b6577');
      worldPanel(bx, bz + 2.24, bz + 2.38, 0, 0.85, '#5b6577');
      // 灯箱面 + 顶部亮边
      worldPanel(bx, bz, bz + 2.6, 0.85, 0.85 + hh, tone);
      worldPanel(bx, bz, bz + 2.6, 0.85 + hh, 0.85 + hh + 0.10, 'rgba(238,246,255,0.9)');
    }

    // —— 站台灯柱：两侧交替（沿用原灯柱画法，配色已转冷）——
    var stepL = 12.5;
    var startL = G.scroll % stepL;
    for (var k = 22; k >= 0; k--) {
      var zz = k * stepL - startL;
      if (zz < -2) continue;
      if (zz > 88) break;
      var ss = sOf(zz);
      if (ss < 0.022) continue;
      var absIdx = Math.round((zz + G.scroll) / stepL);
      var sideDir = (absIdx % 2 === 0) ? -1 : 1;
      var LX = px(sideDir * 2.28, ss);
      if (LX < -180 || LX > W + 180) continue;
      drawStreetLamp(LX, py(ss), py(ss) - 3.2 * SCALE * ss, sideDir, ss);
    }
  }

  /* ============================================================
     10. 绘制 —— 物体
     ============================================================ */
  function drawCoin(x, y, r, t, bounce) {
    var b = clamp(bounce || 0, 0, 1);
    var spin = Math.abs(Math.cos(t * 2.9));
    ctx.save();
    ctx.translate(x, y);

    // 光晕：随弹跳明暗变化
    var glowA = 0.20 + 0.34 * b;
    var gr = r * (1.75 + 0.45 * b);
    var gd = ctx.createRadialGradient(0, 0, r * 0.15, 0, 0, gr);
    gd.addColorStop(0, 'rgba(255,232,132,' + glowA.toFixed(3) + ')');
    gd.addColorStop(0.55, 'rgba(255,214,96,' + (glowA * 0.45).toFixed(3) + ')');
    gd.addColorStop(1, 'rgba(255,206,70,0)');
    ctx.fillStyle = gd;
    ctx.beginPath();
    ctx.arc(0, 0, gr, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.rotate(Math.cos(t * 2.9) * 0.14);          // 旋转摆动幅度加大
    ctx.scale(0.20 + 0.80 * spin, 1);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = '#d9930d'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.86, 0, Math.PI * 2); ctx.fillStyle = '#ffc61f'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.58, 0, Math.PI * 2); ctx.fillStyle = '#ffe789'; ctx.fill();
    ctx.beginPath(); ctx.arc(-r * 0.32, -r * 0.34, r * 0.24, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  function drawBomb(x, y, r, t) {
    ctx.save();
    ctx.translate(x, y);
    // 轻微旋转抖动：越快抖得越急
    ctx.rotate(Math.sin(t * (5.5 + 4.5 * vSk)) * (0.05 + 0.04 * vSk));

    // 引线
    ctx.strokeStyle = '#8b6239';
    ctx.lineWidth = Math.max(1.4, r * 0.16);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(r * 0.30, -r * 0.78);
    ctx.quadraticCurveTo(r * 0.95, -r * 1.30, r * 0.48, -r * 1.72);
    ctx.stroke();

    // —— 引线火花 ——
    // 形态沿革（三次迭代的判据，都是实测）：
    //   ① 原版：4 道等长直线 + 90° 等角 + 绕中心匀速旋转 = 螺旋桨三要素齐全 → 用户原话"竹蜻蜓"。
    //   ② 固定角表 + 向上权重后，仍有 4 根 11px 的辐条被看清 → 视觉评审仍判"风车/星星图标"（3/10）。
    //   ③ 现版：把刺压到 **5px 上限**。关键事实——线状结构短于~6px 时不再被解析为"辐条"，
    //      而退化成边缘毛刺。于是保留了"在烧"的生机，却不再有放射几何感（评审 7/10）。
    // 尺寸一律绝对像素封顶，与 SCALE 完全解耦：1920×1080 下 SCALE=600、弹体达 114.6px，
    // 火花依旧 18/5px——所以"PC 屏幕大"不是原因，"刺能不能被看清"才是。
    var fq = 13 + 16 * vSk;
    var fl = 0.42 + 0.58 * Math.abs(Math.sin(t * fq)) * (0.55 + 0.45 * Math.abs(Math.sin(t * fq * 0.41)));
    if (fl > 1) fl = 1;
    if (fl < 0.18) fl = 0.18;
    var sx = r * 0.48, sy = -r * 1.72;

    // 光晕：18px 绝对上限（原版 1.15r，PC 端曾达 96px）
    var gR = Math.min(r * 0.60, 18);
    var rg = ctx.createRadialGradient(sx, sy, 0, sx, sy, gR);
    rg.addColorStop(0, 'rgba(255,252,225,' + fl.toFixed(3) + ')');
    rg.addColorStop(0.42, 'rgba(255,168,38,' + (0.60 * fl).toFixed(3) + ')');
    rg.addColorStop(1, 'rgba(255,120,20,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(sx, sy, gR, 0, Math.PI * 2);
    ctx.fill();

    // 毛刺：4 根、5px 上限、全部在上半圆。只做小幅抖动，无旋转、无辐条感。
    var spkMax = Math.min(r * 0.30, 5);
    var SPK_ANG = [-2.50, -1.95, -1.30, 0.62];
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(0.7, Math.min(r * 0.04, 1.5));
    for (var k = 0; k < SPK_ANG.length; k++) {
      var jit = Math.sin(t * (21 + k * 6.7) + k * 2.3) * 0.16;      // 只抖不转
      var ang = SPK_ANG[k] + jit;
      var up = Math.max(0, -Math.sin(ang));                          // 朝上的权重 0~1
      var aLen = spkMax * (0.30 + 0.70 * up)
               * (0.55 + 0.45 * Math.abs(Math.sin(t * (17 + k * 4.1) + k)));
      ctx.strokeStyle = 'rgba(255,244,180,' + (0.78 * fl * (0.34 + 0.66 * up)).toFixed(3) + ')';
      var L0 = Math.min(r * 0.11, 4);
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(ang) * L0, sy + Math.sin(ang) * L0);
      ctx.lineTo(sx + Math.cos(ang) * (L0 + aLen), sy + Math.sin(ang) * (L0 + aLen));
      ctx.stroke();
    }

    // 火星上飘：3 颗循环上升 + 淡出 + 由黄转暗红，体积感来自"在离开火源"
    var mhMax = Math.min(r * 1.5, 13);
    var mR = Math.max(0.7, Math.min(r * 0.06, 1.8));
    for (var m = 0; m < 3; m++) {
      var ph = ((t * 1.7 + m * 0.34) % 1 + 1) % 1;
      var dr = ph * mhMax;
      var mx = sx + Math.sin(t * 3.4 + m * 2.6) * Math.min(r * 0.40, 5) + dr * 0.24;
      var my = sy - dr;
      var ma = (1 - ph) * 0.85 * fl;
      ctx.fillStyle = 'rgba(255,' + Math.round(216 - 100 * ph) + ','
                    + Math.round(92 - 58 * ph) + ',' + ma.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(mx, my, mR * (1 - 0.35 * ph), 0, Math.PI * 2);
      ctx.fill();
    }
    // 火心：收紧到 5px 上限，别在深色路面上抢眼
    ctx.fillStyle = '#fffdf0';
    ctx.beginPath();
    ctx.arc(sx, sy, Math.min(r * 0.15, 5), 0, Math.PI * 2);
    ctx.fill();

    // 弹体
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = '#2f2f3a';
    ctx.fill();
    // 体积光：左上受光、右下压暗
    var bg = ctx.createRadialGradient(-r * 0.34, -r * 0.38, r * 0.10, 0, 0, r * 1.15);
    bg.addColorStop(0, 'rgba(124,128,152,0.55)');
    bg.addColorStop(0.6, 'rgba(40,40,54,0.10)');
    bg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-r * 0.30, -r * 0.34, r * 0.30, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.26)';
    ctx.fill();
    // 描边：浅色在外，远距与深色路面拉开对比
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = Math.max(1, r * 0.10);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.04, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.40)';
    ctx.lineWidth = Math.max(1, r * 0.09);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.98, 0, Math.PI * 2);
    ctx.stroke();
    // 顶部引线口
    ctx.fillStyle = '#4c4c5c';
    ctx.fillRect(-r * 0.22, -r * 1.06, r * 0.44, r * 0.22);

    ctx.restore();
  }

  function drawFood(x, y, r, type, pulse) {
    var pl = clamp(pulse || 0, 0, 1);
    ctx.save();
    ctx.translate(x, y);

    // 光圈：脉动更明显
    var haloA = 0.16 + 0.30 * pl;
    var haloR = r * (1.75 + 0.55 * pl);
    var gd = ctx.createRadialGradient(0, 0, r * 0.25, 0, 0, haloR);
    gd.addColorStop(0, 'rgba(178,255,196,' + haloA.toFixed(3) + ')');
    gd.addColorStop(0.55, 'rgba(150,245,180,' + (haloA * 0.5).toFixed(3) + ')');
    gd.addColorStop(1, 'rgba(150,245,180,0)');
    ctx.fillStyle = gd;
    ctx.beginPath();
    ctx.arc(0, 0, haloR, 0, Math.PI * 2);
    ctx.fill();

    if (type === 'carrot') {
      // 叶子
      ctx.fillStyle = '#43b04a';
      for (var i = -1; i <= 1; i++) {
        ctx.save();
        ctx.translate(0, -r * 0.62);
        ctx.rotate(i * 0.55);
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.42, r * 0.17, r * 0.46, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // 萝卜身
      ctx.beginPath();
      ctx.moveTo(-r * 0.56, -r * 0.58);
      ctx.quadraticCurveTo(0, -r * 0.92, r * 0.56, -r * 0.58);
      ctx.quadraticCurveTo(r * 0.22, r * 0.92, 0, r * 1.16);
      ctx.quadraticCurveTo(-r * 0.22, r * 0.92, -r * 0.56, -r * 0.58);
      ctx.closePath();
      ctx.fillStyle = '#ff7e1c';
      ctx.fill();
      // 受光面
      ctx.beginPath();
      ctx.moveTo(-r * 0.40, -r * 0.50);
      ctx.quadraticCurveTo(-r * 0.10, -r * 0.80, r * 0.02, -r * 0.58);
      ctx.quadraticCurveTo(-r * 0.12, r * 0.34, -r * 0.02, r * 0.92);
      ctx.quadraticCurveTo(-r * 0.30, r * 0.40, -r * 0.40, -r * 0.50);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,196,120,0.55)';
      ctx.fill();
      // 纹路
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = Math.max(1, r * 0.09);
      ctx.lineCap = 'round';
      for (var j = 0; j < 2; j++) {
        ctx.beginPath();
        ctx.moveTo(-r * 0.26 + j * r * 0.32, r * 0.08);
        ctx.lineTo(r * 0.20 + j * r * 0.32, -r * 0.18);
        ctx.stroke();
      }
    } else if (type === 'apple') {
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
      ctx.fillStyle = '#ef3838';
      ctx.fill();
      // 底部压暗，做出球感
      var ag = ctx.createRadialGradient(-r * 0.3, -r * 0.34, r * 0.1, 0, 0, r * 0.96);
      ag.addColorStop(0, 'rgba(255,255,255,0.42)');
      ag.addColorStop(0.55, 'rgba(255,255,255,0)');
      ag.addColorStop(1, 'rgba(120,10,20,0.35)');
      ctx.fillStyle = ag;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-r * 0.30, -r * 0.30, r * 0.24, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.62)';
      ctx.fill();
      ctx.strokeStyle = '#7a4a22';
      ctx.lineWidth = Math.max(1.2, r * 0.13);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.82);
      ctx.lineTo(r * 0.10, -r * 1.26);
      ctx.stroke();
      ctx.fillStyle = '#43b04a';
      ctx.beginPath();
      ctx.ellipse(r * 0.42, -r * 1.16, r * 0.34, r * 0.17, -0.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // 青草
      ctx.strokeStyle = '#35a844';
      ctx.lineWidth = Math.max(1.5, r * 0.20);
      ctx.lineCap = 'round';
      for (var g = -2; g <= 2; g++) {
        ctx.beginPath();
        ctx.moveTo(g * r * 0.26, r * 0.72);
        ctx.quadraticCurveTo(g * r * 0.40, 0, g * r * 0.78 + r * 0.18, -r * 0.86);
        ctx.stroke();
      }
      ctx.strokeStyle = '#8ce878';
      ctx.lineWidth = Math.max(1, r * 0.12);
      for (var h = -1; h <= 1; h++) {
        ctx.beginPath();
        ctx.moveTo(h * r * 0.34, r * 0.66);
        ctx.quadraticCurveTo(h * r * 0.5, r * 0.1, h * r * 0.86, -r * 0.6);
        ctx.stroke();
      }
    }

    // 星芒点：强化“可拾取”感
    ctx.fillStyle = 'rgba(255,255,255,' + (0.28 + 0.45 * pl).toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(r * 0.74, -r * 0.94, r * 0.15, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawObject(o) {
    var s = sOf(o.d);
    if (s <= 0.015) return;
    var X = px(o.x, s);
    var unit = SCALE * s;
    if (X < -240 || X > W + 240) return;

    var Y = py(s);
    var rr = 0.19 * unit;

    // 地面影子：近处浓、远处淡，高速略虚化
    var near = clamp(s * 2.4, 0, 1);
    var shA = (0.15 + 0.30 * near) * (1 - 0.16 * vSk);
    var shR = rr * (1.75 + 0.55 * vSk);
    ctx.save();
    ctx.translate(X, Y);
    ctx.scale(1, 0.32);
    var sg = ctx.createRadialGradient(0, 0, rr * 0.15, 0, 0, shR);
    sg.addColorStop(0, 'rgba(10,20,36,' + shA.toFixed(3) + ')');
    sg.addColorStop(0.55, 'rgba(10,20,36,' + (shA * 0.5).toFixed(3) + ')');
    sg.addColorStop(1, 'rgba(10,20,36,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(0, 0, shR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 各自不同的弹跳：金币最高、食物翻倍、炸弹几乎不动
    var bounce = 0, bob = 0;
    if (o.type === 'coin') {
      var pb = Math.sin(G.t * 3.4 + o.phase);
      bounce = Math.max(0, pb);
      bob = pb * 0.17 * unit * (0.80 + 0.40 * vSk);
    } else if (o.type === 'food') {
      var pf = Math.sin(G.t * 2.6 + o.phase);
      bounce = Math.max(0, pf);
      bob = pf * 0.13 * unit * (0.85 + 0.35 * vSk);
    } else {
      bob = Math.sin(G.t * 2.1 + o.phase) * 0.025 * unit;
    }
    var cy = Y - rr * 1.15 - bob;

    if (o.type === 'coin') drawCoin(X, cy, rr * 1.0, G.t + o.phase, bounce);
    else if (o.type === 'bomb') drawBomb(X, cy, rr * 1.10, G.t + o.phase);
    else drawFood(X, cy, rr * 1.15, o.foodType, bounce);
  }

  function drawObjects() {
    var list = G.objs.slice();
    list.sort(function (a, b) { return b.d - a.d; });
    for (var i = 0; i < list.length; i++) drawObject(list[i]);
  }
  /* ---- 终点门：有尽头关卡的视觉终点，纯装饰，不参与任何碰撞 ---- */
  function drawFinishGate() {
    var d = LEVEL_LENGTH - G.distance;
    if (d > 160 || d < 0.4) return;              // 太远看不见 / 已冲过（避免近平面处爆尺度）
    var s = sOf(d);
    var u = SCALE * s;
    var yB = py(s);
    var HW = 1.78;                               // 门洞半宽（世界单位）
    var H_P = 3.25;                              // 立柱高
    var BEAM_Y = 2.60, BEAM_H = 0.66;            // 横梁底高 / 梁高
    var xL = px(-HW, s), xR = px(HW, s);

    // 地面黑白终点线（世界坐标固定，透视下自然变形）
    for (var r = 0; r < 2; r++) {
      for (var c = 0; c < 7; c++) {
        var cx = -1.75 + c * 0.5;
        var col = ((r + c) % 2 === 0) ? 'rgba(248,250,255,0.92)' : 'rgba(38,46,60,0.88)';
        worldQuad(d + 0.2 + r * 0.6, d + 0.2 + (r + 1) * 0.6, cx, cx + 0.5, col);
      }
    }

    // 门柱：底部先落地阴影，避免立柱看起来悬空
    var pw = Math.max(1.6, 0.26 * u);
    for (var ps = 0; ps < 2; ps++) {
      var pshx = ps === 0 ? xL : xR;
      var shR = Math.max(3, 0.40 * u);
      ctx.save();
      ctx.translate(pshx, yB);
      ctx.scale(1, 0.30);
      var gsh = ctx.createRadialGradient(0, 0, shR * 0.15, 0, 0, shR);
      gsh.addColorStop(0, 'rgba(10,20,36,0.46)');
      gsh.addColorStop(0.6, 'rgba(10,20,36,0.22)');
      gsh.addColorStop(1, 'rgba(10,20,36,0)');
      ctx.fillStyle = gsh;
      ctx.beginPath();
      ctx.arc(0, 0, shR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#3b4560';
    ctx.fillRect(xL - pw * 0.5, yB - H_P * u, pw, H_P * u);
    ctx.fillRect(xR - pw * 0.5, yB - H_P * u, pw, H_P * u);
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    ctx.fillRect(xL - pw * 0.5, yB - H_P * u, Math.max(1, pw * 0.30), H_P * u);
    ctx.fillRect(xR - pw * 0.5, yB - H_P * u, Math.max(1, pw * 0.30), H_P * u);

    // 横梁 + 招牌
    var bx = xL - pw * 0.5, bw = (xR - xL) + pw;
    ctx.fillStyle = '#e4653f';
    ctx.fillRect(bx, yB - H_P * u, bw, BEAM_H * u);
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.fillRect(bx, yB - H_P * u, bw, Math.max(1, 0.10 * u));

    var fs = 0.42 * u;
    if (fs > 5) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 ' + fs.toFixed(1) + 'px "Segoe UI","PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillStyle = '#fff8ea';
      ctx.fillText('FINISH', (xL + xR) / 2, yB - H_P * u + BEAM_H * u * 0.55);
      ctx.restore();
    }

    // 彩旗：挂在横梁下，轻轻摆动（纯视觉，G.t 驱动）
    var flags = ['#f5cf74', '#8ed6ad', '#9cc2ea', '#f0aabb'];
    var n = 9;
    for (var f = 0; f < n; f++) {
      var fx = xL + (xR - xL) * (f + 0.5) / n;
      var wob = Math.sin(G.t * 4.2 + f * 0.7) * 0.02 * u;
      ctx.fillStyle = flags[f % flags.length];
      ctx.beginPath();
      ctx.moveTo(fx - 0.10 * u, yB - BEAM_Y * u);
      ctx.lineTo(fx + 0.10 * u, yB - BEAM_Y * u);
      ctx.lineTo(fx + wob, yB - (BEAM_Y - 0.44) * u);
      ctx.closePath();
      ctx.fill();
    }
  }

  /* ============================================================
     11. 绘制 —— 小羊（追尾背影 · 羊的身手 + 人的手脚）
     ============================================================ */

  // 本段专用配色
  var _WOOL = '#fffdf8', _WOOL_SH = '#e7dbc9', _WOOL_EDGE = '#b8a48c';
  var _HORN_C = '#f4ead6', _HORN_EDGE = '#a58e6c';
  var _SKIN = '#fbd9b8', _SKIN_FAR = '#eab78d', _SKIN_EDGE = '#c8956a';

  // 羊毛身子：多排圆叠成蓬松一团（羊的身子就是羊毛，不做人类胸腰）
  var BODY_PUFF = [
    [0.000, -0.945, 0.225],
    [-0.215, -0.985, 0.190], [0.215, -0.985, 0.190],
    [0.000, -1.115, 0.275],
    [-0.265, -1.150, 0.205], [0.265, -1.150, 0.205],
    [0.000, -1.290, 0.275],
    [-0.265, -1.325, 0.205], [0.265, -1.325, 0.205],
    [0.000, -1.460, 0.250],
    [-0.210, -1.500, 0.180], [0.210, -1.500, 0.180],
    [0.000, -1.620, 0.180],
    [0.000, -1.755, 0.215],
    [-0.190, -1.680, 0.175], [0.190, -1.680, 0.175]
  ];

  // 后脑勺：一整团羊毛，左右刻意不完全对称（羊毛本来就不对称）。
  // 内部一律不放纹理弧线——成对弧线会被看成眼睛/嘴，等于违规画了五官
  var HEAD_PUFF = [
    [0.000, 0.000, 0.248],
    [-0.152, -0.100, 0.162], [0.140, -0.082, 0.150],
    [-0.170, 0.030, 0.150], [0.160, 0.014, 0.140],
    [-0.136, 0.142, 0.145], [0.148, 0.128, 0.138],
    [0.012, 0.180, 0.150],
    [-0.010, -0.184, 0.158],
    [-0.098, -0.202, 0.122], [0.086, -0.190, 0.128]
  ];

  // 头的中心高度：故意让头底沉进身子羊毛里，
  // 头和身子合并成一团画（见 WOOL_ALL），中间就不会出现“脖子接缝”或项圈
  var HEAD_Y = -2.030;

  var WOOL_ALL = (function () {
    var out = [], i;
    for (i = 0; i < BODY_PUFF.length; i++) out.push(BODY_PUFF[i]);
    for (i = 0; i < HEAD_PUFF.length; i++) {
      out.push([HEAD_PUFF[i][0], HEAD_PUFF[i][1] + HEAD_Y, HEAD_PUFF[i][2]]);
    }
    return out;
  })();

  // 小卷毛尾巴
  var TAIL_PUFF = [
    [0.000, 0.000, 0.102],
    [0.056, -0.032, 0.068],
    [-0.050, -0.018, 0.060],
    [0.026, 0.056, 0.052]
  ];

  function puffSet(puffs, color, k, dx, dy) {
    ctx.fillStyle = color;
    for (var i = 0; i < puffs.length; i++) {
      var p = puffs[i];
      ctx.beginPath();
      ctx.arc(p[0] + (dx || 0), p[1] + (dy || 0), p[2] * (k || 1), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 羊毛分层：柔和外晕边 → 主描边 → 主体 → 仅在轮廓内做一次径向渐变。
  // 关键：阴影用“整体一次渐变”而不是每坨圆错位叠色，
  // 否则每坨圆都会留下棕色月牙弧，多个弧在头上会拼成一张脸。
  function woolSet(puffs, cx, cy, rx, ry) {
    puffSet(puffs, 'rgba(184,164,140,0.18)', 1.26, 0, 0.010);
    puffSet(puffs, _WOOL_EDGE, 1.12);

    ctx.save();
    ctx.beginPath();
    for (var i = 0; i < puffs.length; i++) {
      var p = puffs[i];
      ctx.moveTo(p[0] + p[2], p[1]);
      ctx.arc(p[0], p[1], p[2], 0, Math.PI * 2);
    }
    ctx.clip();
    ctx.fillStyle = _WOOL;
    ctx.fillRect(cx - rx * 1.5, cy - ry * 1.5, rx * 3, ry * 3);
    // 体积：左上受光、右下压暗
    ctx.translate(cx - rx * 0.22, cy - ry * 0.20);
    ctx.scale(1, ry / rx);
    var g = ctx.createRadialGradient(0, 0, rx * 0.10, 0, 0, rx * 1.22);
    g.addColorStop(0, 'rgba(255,255,255,0.62)');
    g.addColorStop(0.42, 'rgba(255,255,255,0.08)');
    g.addColorStop(0.66, 'rgba(201,183,160,0.14)');
    g.addColorStop(1, 'rgba(166,146,122,0.36)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx * 1.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function curl(x, y, r, a0, a1) {
    ctx.beginPath();
    ctx.arc(x, y, r, a0 * Math.PI, a1 * Math.PI);
    ctx.stroke();
  }

  // 人型腿：整条腿用一条折线一次成形（描边+肤色各一笔）。
  // 分段画会在膝/肘留下描边圆头的深色圆环，看着像木偶关节；
  // 关节感改由“膝部折角 + 内侧一道褶皱短弧”表达。
  function humanLeg(hipX, ph, side, amp, tone) {
    var sw = Math.sin(ph);
    var lift = Math.max(0, sw) * amp;
    var kick = Math.max(0, -sw) * amp;

    var hipY = -0.845;
    var kneeY = hipY + 0.380 - 0.095 * lift + 0.008 * kick;
    var kneeX = hipX + side * (0.026 + 0.075 * lift);
    var calfLen = 0.305 - 0.190 * lift;
    var ankleX = kneeX - side * (0.022 + 0.070 * lift);
    var ankleY = kneeY + calfLen;
    var footX = ankleX + side * 0.012;
    var footY = ankleY + 0.050;

    var w = 0.172;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // 描边层：大腿、小腿各按自己的粗细描边
    // 腿不走直线：大腿向外微弓、小腿略内收，靠弧度做出肌肉感（不是木棍）
    var tmx = (hipX + kneeX) / 2 + side * 0.036, tmy = (hipY + kneeY) / 2;
    var cmx = (kneeX + ankleX) / 2 + side * 0.022, cmy = (kneeY + ankleY) / 2;
    ctx.strokeStyle = _SKIN_EDGE;
    ctx.lineWidth = w + 0.030;
    ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.quadraticCurveTo(tmx, tmy, kneeX, kneeY); ctx.stroke();
    ctx.lineWidth = w * 0.72 + 0.030;
    ctx.beginPath(); ctx.moveTo(kneeX, kneeY); ctx.quadraticCurveTo(cmx, cmy, ankleX, ankleY); ctx.stroke();
    // 主体层：大腿粗、小腿细；膝部补一个半径为大腿一半的同色圆，
    // 这样描边在膝部仍是等宽的 0.015，不会留下深色圆环
    ctx.strokeStyle = tone;
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.quadraticCurveTo(tmx, tmy, kneeX, kneeY); ctx.stroke();
    ctx.lineWidth = w * 0.72;
    ctx.beginPath(); ctx.moveTo(kneeX, kneeY); ctx.quadraticCurveTo(cmx, cmy, ankleX, ankleY); ctx.stroke();
    ctx.beginPath(); ctx.arc(kneeX, kneeY, w * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = tone; ctx.fill();

    // 膝部内侧褶皱：一小段弧提示关节，不做整圈
    ctx.strokeStyle = 'rgba(200,149,105,0.55)';
    ctx.lineWidth = 0.021;
    var ka = side > 0 ? Math.PI : 0;
    ctx.beginPath();
    ctx.arc(kneeX, kneeY, w * 0.33, ka - 0.85, ka + 0.85);
    ctx.stroke();

    // 人脚：脚跟在下（近镜头），脚趾朝上（前方）
    var fw = 0.126 * (1 + 0.09 * lift);
    var fl = 0.168 * (1 + 0.05 * lift);
    ctx.beginPath();
    ctx.moveTo(footX - fw, footY - 0.004);
    ctx.quadraticCurveTo(footX - fw * 1.06, footY - fl, footX, footY - fl - 0.010);
    ctx.quadraticCurveTo(footX + fw * 1.06, footY - fl, footX + fw, footY - 0.004);
    ctx.quadraticCurveTo(footX + fw * 0.60, footY + 0.086, footX, footY + 0.090);
    ctx.quadraticCurveTo(footX - fw * 0.60, footY + 0.086, footX - fw, footY - 0.004);
    ctx.closePath();
    ctx.fillStyle = tone; ctx.fill();
    ctx.strokeStyle = _SKIN_EDGE; ctx.lineWidth = 0.026; ctx.stroke();

    // 脚趾：三颗小圆凸在脚掌前端（略高于脚背边缘，确保看得见）
    ctx.fillStyle = tone;
    ctx.strokeStyle = _SKIN_EDGE;
    ctx.lineWidth = 0.019;
    for (var t = -1; t <= 1; t++) {
      ctx.beginPath();
      ctx.arc(footX + t * 0.056, footY - fl + 0.016, 0.034, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // 人型手臂：短短的（一条折线 + 手掌三指 + 拇指），同样不画关节环
  // 背影视角下“前后摆”不能靠左右旋转（会变成两臂对称张合），
  // 要靠高度与长度表达：前摆被透视压短、手位偏高；后摆伸长、手位偏低
  function humanArm(shX, shY, aw, side, tone) {
    var len = 0.252 - 0.076 * aw;
    var handR = 0.090 * (1 + 0.10 * aw);
    var elbowX = shX + side * (0.020 + 0.012 * (1 - aw));
    var elbowY = shY + len * 0.52;
    var handX = shX + side * (0.034 + 0.018 * (1 - aw));
    var handY = shY + len;

    var w = 0.152;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = _SKIN_EDGE;
    ctx.lineWidth = w + 0.030;
    ctx.beginPath(); ctx.moveTo(shX, shY); ctx.lineTo(elbowX, elbowY); ctx.stroke();
    ctx.lineWidth = w * 0.83 + 0.030;
    ctx.beginPath(); ctx.moveTo(elbowX, elbowY); ctx.lineTo(handX, handY - handR * 0.7); ctx.stroke();
    ctx.strokeStyle = tone;
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(shX, shY); ctx.lineTo(elbowX, elbowY); ctx.stroke();
    ctx.lineWidth = w * 0.83;
    ctx.beginPath(); ctx.moveTo(elbowX, elbowY); ctx.lineTo(handX, handY - handR * 0.7); ctx.stroke();
    ctx.beginPath(); ctx.arc(elbowX, elbowY, w * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = tone; ctx.fill();

    // 肘部内侧褶皱
    ctx.strokeStyle = 'rgba(200,149,105,0.50)';
    ctx.lineWidth = 0.019;
    var ea = side > 0 ? Math.PI : 0;
    ctx.beginPath();
    ctx.arc(elbowX, elbowY, w * 0.30, ea - 0.80, ea + 0.80);
    ctx.stroke();

    // 手掌
    ctx.beginPath();
    ctx.ellipse(handX, handY, handR * 0.95, handR, 0, 0, Math.PI * 2);
    ctx.fillStyle = tone; ctx.fill();
    ctx.strokeStyle = _SKIN_EDGE; ctx.lineWidth = 0.024; ctx.stroke();
    // 拇指（朝身体一侧）
    ctx.beginPath();
    ctx.ellipse(handX - side * handR * 0.92, handY - handR * 0.16,
                handR * 0.40, handR * 0.30, side * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = tone; ctx.fill();
    ctx.lineWidth = 0.020; ctx.stroke();
    // 三根手指（朝下，远离手掌）
    for (var f = -1; f <= 1; f++) {
      ctx.beginPath();
      ctx.arc(handX + f * handR * 0.56, handY + handR * 0.90, handR * 0.31, 0, Math.PI * 2);
      ctx.fillStyle = tone; ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // 羊角：从头顶钻出、向上向外卷成螺旋，末端向内下勾（逐段收细）
  function sheepHorn(dir) {
    ctx.save();
    ctx.scale(dir, 1);
    var cx = 0.292, cy = -0.372;
    var a0 = 205 * Math.PI / 180, a1 = -58 * Math.PI / 180;
    var N = 16, i, t, a, R, pts = [];
    for (i = 0; i <= N; i++) {
      t = i / N;
      a = a0 + (a1 - a0) * t;
      R = 0.238 - 0.190 * t;
      pts.push([cx + R * Math.cos(a), cy - R * Math.sin(a), 0.070 - 0.048 * t]);
    }
    ctx.fillStyle = _HORN_EDGE;
    for (i = 0; i < pts.length; i++) {
      ctx.beginPath();
      ctx.arc(pts[i][0], pts[i][1], pts[i][2] + 0.024, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = _HORN_C;
    for (i = 0; i < pts.length; i++) {
      ctx.beginPath();
      ctx.arc(pts[i][0], pts[i][1], pts[i][2], 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.70)';
    for (i = 0; i < pts.length - 2; i++) {
      ctx.beginPath();
      ctx.arc(pts[i][0] - 0.014, pts[i][1] - 0.016, pts[i][2] * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 羊耳：横向长椭圆。背影视角只看得到耳背，所以不给粉内耳
  function sheepEar(dir) {
    ctx.save();
    ctx.translate(0.268 * dir, 0.018);
    ctx.scale(dir, 1);
    ctx.rotate(0.30);
    ctx.beginPath();
    ctx.ellipse(0.078, 0, 0.170, 0.100, 0, 0, Math.PI * 2);
    ctx.fillStyle = _WOOL_EDGE; ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0.078, -0.008, 0.140, 0.076, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#f7ede1'; ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0.020, 0.002, 0.052, 0.048, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(184,164,140,0.45)'; ctx.fill();
    ctx.restore();
  }

  /* ---- 角色：8 帧跑步精灵图 ----
     素材取 sizes/256/：竖排 8 帧、每帧 256×256、帧间无间隔，元数据见同目录 sheet.json。
     帧序 1→8 就是一次完整的左右交替步（正后方视角，画面临左右即角色左右）：
       实测腿部墨量占比：F1/F2 抬右腿（46.7% / 45.7%），F5/F6/F7 抬左腿（51.5% / 50.5% / 50.6%），
       F3/F4/F8 为过渡帧 —— 一个循环内左右各抬一次，不会出现「只迈一条腿」。
     八帧脚底都对齐在锚点 y=241，所以只要把「锚点」钉在地面线上，跑步过程中脚就不会上下漂。
     因此这里不再给角色本体加任何垂直/水平位移（改造前靠 bobY/bobX 伪造起伏）。
     拆分版读外部文件；tools/build.py 会按这一行的路径把图片换成内嵌 base64。 */
  var RUN_SHEET_SRC = 'assets/sizes/256/sheep_run_sheet.png';
  var RUN_FRAME = 256;        // 单帧边长（源像素）
  var RUN_COUNT = 8;          // 帧数（= 一个步幅周期的帧数）
  var RUN_ANCHOR_X = 127.5;   // 锚点（脚底中心）在帧内的 x（F1 为 127.0，其余 127.5）
  var RUN_ANCHOR_Y = 241;     // 锚点 y —— 八帧脚底都落在这一条线上
  // 尺度对齐：旧站立贴图内容高 882px 对应 2.30u。新 8 帧素材逐帧实测内容高（256 版）
  // 均为 170px（原图 676px × 1/4，八帧一致），取它作为 2.30u 的基准，
  // 这样换图后角色在屏幕上的高度与改造前一致，不改变画面构图。
  var RUN_REF_CONTENT = 170;
  var RUN_FRAME_U = 2.30 * RUN_FRAME / RUN_REF_CONTENT;   // 整帧在 u 单位下的边长
  var RUN_K = RUN_FRAME_U / RUN_FRAME;                    // 源像素 → u 单位的换算

  /* —— 受击定格（dying 专用姿势）——
     单独一张 256×256 图，不并入跑步 sheet：sheet 已是 256×2048（8 帧竖排、帧间无间隔），
     受击图与跑步帧彻底分离，改帧数碰不到它。

     图片来源：取 8 帧跑步动画的 F4（四肢最收拢、重心最低的一帧）原样落成一张单体图，
     所以「撞到炸弹」那一刻看到的小羊，与跑动中是同一个形象
     （此前用的是旧 4 帧时代那张蹲伏图，风格与新素材对不上）。
     同源同帧尺寸，锚点天然一致（实测，alpha>24）：
       bbox = x 72..183、y 72..241
       → bbox 中心 x = 127.5 = RUN_ANCHOR_X
       → 脚底 y      = 241   = RUN_ANCHOR_Y
     尺度：该帧内容高恰为 170px，与 RUN_REF_CONTENT 相同 → HIT_K 数值上等于 RUN_K，
     跑步 ↔ 受击切换时角色大小零跳变（不会突然缩一下）。

     绕锚点旋转会让最低点探到地面线以下。早期按「最外一点×tanθ」估的抬升量把单位弄错了，
     少抬约 5 倍；且抬升量当时是在 ctx.scale(u,u) 之后 translate，单位又变成源像素，
     实际只抬 0.1 屏幕像素——两项叠加等于没抬，于是改用下面这套查表。

     做法：图片加载后按真实不透明轮廓预采样一张 θ → 需抬升量(u) 的小表，
     绘制时查表并向上取整（单调化），因此抬升量恒 ≥ 真实下探量 → 最低像素永不穿地。
     画布被 file:// 污染、取不到像素时退回保守解析上界（maxX·sinθ + maxUp·(1-cosθ)），
     同样只会多抬、不会少抬。 */
  var HIT_SHEET_SRC = 'assets/sizes/256/sheep_hit.png';
  // 受击图与跑步帧同源同尺：基准内容高就取该帧实测的 170px，两套 K 数值相等。
  var HIT_REF_CONTENT = 170;
  var HIT_K = 2.30 / HIT_REF_CONTENT;          // 源像素 → u（≈0.013529，等于 RUN_K）
  var HIT_FRAME_U = HIT_K * RUN_FRAME;         // 受击图整帧边长（≈3.4647u，等于 RUN_FRAME_U）
  var HIT_DIP_MAX_DX = 55.5;    // 轮廓相对锚点的最右偏移（源像素，实测 x 72..183，锚点 127.5）
  var HIT_DIP_MAX_UP = 169;     // 轮廓相对锚点的最高偏移（源像素，实测 y 72..241）
  var HIT_DIP_N = 48;           // 采样段数：0.30rad 分 48 段，单段 0.00625rad
  var HIT_DIP_MAXTH = 0.30;     // 表覆盖的最大倾角（实际最大 0.25，留余量）
  var HIT_DIP_LUT = null;       // null=未构建；数组=查表；false=构建失败走解析上界

  function buildHitDipTable() {
    if (HIT_DIP_LUT !== null) return;
    try {
      var cv = document.createElement('canvas');
      cv.width = RUN_FRAME; cv.height = RUN_FRAME;
      var c2 = cv.getContext('2d');
      c2.drawImage(HIT_SHEET, 0, 0);
      var d = c2.getImageData(0, 0, RUN_FRAME, RUN_FRAME).data;
      var px = [], py = [];
      for (var y = 0; y < RUN_FRAME; y++) {
        for (var x = 0; x < RUN_FRAME; x++) {
          if (d[(y * RUN_FRAME + x) * 4 + 3] > 24) {
            px.push(x - RUN_ANCHOR_X); py.push(y - RUN_ANCHOR_Y);
          }
        }
      }
      if (!px.length) { HIT_DIP_LUT = false; return; }
      var lut = [];
      for (var i = 0; i <= HIT_DIP_N; i++) {
        var th = HIT_DIP_MAXTH * i / HIT_DIP_N;
        var s = Math.sin(th), c1 = Math.cos(th) - 1, best = 0;
        for (var k = 0; k < px.length; k++) {
          var v = px[k] * s + py[k] * c1;
          if (v > best) best = v;
        }
        lut.push((best + 0.5) * HIT_K);   // 源像素 → u，另加 0.5 源像素安全余量
      }
      for (var j = 1; j <= HIT_DIP_N; j++) lut[j] = Math.max(lut[j], lut[j - 1]);
      HIT_DIP_LUT = lut;
    } catch (e) {
      HIT_DIP_LUT = false;   // 取不到像素（污染画布）→ 解析上界
    }
  }

  // 给定倾角，返回为保证不穿地所需的最小抬升量（u）。只会 ≥ 真实下探量。
  function hitDipU(th) {
    var a = Math.abs(th);
    if (a > HIT_DIP_MAXTH) a = HIT_DIP_MAXTH;
    if (HIT_DIP_LUT && HIT_DIP_LUT.length) {
      var idx = Math.ceil(a / HIT_DIP_MAXTH * HIT_DIP_N);
      if (idx < 0) idx = 0;
      if (idx > HIT_DIP_N) idx = HIT_DIP_N;
      return HIT_DIP_LUT[idx];
    }
    return (HIT_DIP_MAX_DX * Math.sin(a) + HIT_DIP_MAX_UP * (1 - Math.cos(a))) * HIT_K;
  }

  /* —— 跑步动画帧率（由速度决定，高速段封顶）——
     phase 是「游戏时间」的积分，animFrameOf 再把 phase 按 RUN_COUNT 等分量化成帧号，
     所以 帧率 = 相位角速度 / (2π) × RUN_COUNT。据此「限制帧率」直接用「限制相位角速度」实现：

       w = (待机帧率 + (封顶帧率 − 待机帧率) × min(1, speed / 达标速度)) × 2π / RUN_COUNT
       RUN_W_MAX = RUN_FPS_MAX × 2π / RUN_COUNT　← 封顶值，与帧数联动，改 RUN_COUNT 不失配

     8 帧时：待机 6fps，speed ≈ 23 达 12fps 封顶。
     （换算提示：旧 4 帧 @12fps = 3 步幅/秒；8 帧 @12fps = 1.5 步幅/秒，一个循环 667ms。
       若要恢复原步频，把 RUN_FPS_MAX 改成 24 即可，其余一行不用动。）

     关键：这里封顶的是「速度 w」，不是「帧」——不做逐帧丢弃、不跳过帧号：
       · dt 始终完整参与积分，游戏物理 / 碰撞 / 计时一行未动；
       · 相位推进只取决于累计游戏时间，与渲染刷新率无关（60Hz 与 144Hz 同时长推进帧数一致）；
       · 钳制函数连续，速度爬到门槛时相位速度不突变，也不会累积时间误差。 */
  var RUN_FPS_IDLE = 6;                          // 待机帧率（fps）
  var RUN_FPS_MAX = 12;                          // 高速段动画帧率上限（fps）
  var RUN_SPEED_KNEE = 23;                       // 到此速度即达封顶帧率
  var RUN_W_OF = function (fps) { return fps * 2 * Math.PI / RUN_COUNT; };
  var RUN_W_MAX = RUN_W_OF(RUN_FPS_MAX);         // 12fps / 8 帧 → 3π ≈ 9.4248 rad/s

  function animPhaseRate(speed) {
    var t = speed / RUN_SPEED_KNEE;
    if (t > 1) t = 1;
    if (t < 0) t = 0;
    return RUN_W_OF(RUN_FPS_IDLE + (RUN_FPS_MAX - RUN_FPS_IDLE) * t);
  }

  function animPhaseRate(speed) {
    var w = 6 + speed * 0.55;
    return w > RUN_W_MAX ? RUN_W_MAX : w;
  }

  var RUN_SHEET = new Image();
  var runSheetReady = false;
  RUN_SHEET.onload = function () { runSheetReady = true; };
  RUN_SHEET.onerror = function () {
    // 加载失败不抛错、不阻塞游戏（绘制与碰撞解耦），只是角色不显示
    console.warn('[sheep] 跑步精灵图加载失败，角色将不可见: ' + RUN_SHEET_SRC);
  };
  RUN_SHEET.src = RUN_SHEET_SRC;

  // 受击蹲伏图：加载失败时静默降级为「dying 期间照旧用跑步帧」，角色不会因此消失。
  var HIT_SHEET = new Image();
  var hitSheetReady = false;
  HIT_SHEET.onload = function () {
    hitSheetReady = true;
    buildHitDipTable();   // 加载后立即按真实轮廓采样抬升表（失败则内部静默回退）
  };
  HIT_SHEET.onerror = function () {
    console.warn('[sheep] 受击图加载失败，dying 期间退回跑步帧: ' + HIT_SHEET_SRC);
  };
  HIT_SHEET.src = HIT_SHEET_SRC;

  // 帧号由 phase 推导：一个 phase 周期 = 一个完整步幅 = 一整套 8 帧，按八等分取。
  // phase 在 update 里由 dt 累积（见 update），所以动画速度只取决于游戏时间，
  // 与屏幕刷新率无关：60Hz 与 144Hz 下同样时长内推进的帧数一致。
  function animFrameOf(ph) {
    var k = Math.floor((ph / (Math.PI * 2)) * RUN_COUNT) % RUN_COUNT;
    return k < 0 ? 0 : k;
  }

  // hitLift：仅 dying 传数字（本体相对地面线抬起多少 u），其余状态传 null。
  function drawSheep(u, phase, inv, frame, hitLift) {
    var sk = vSk;
    ctx.save();

    // 起落分量只用来给影子做呼吸，不再作用于角色本体（脚必须钉在地面线上）。
    var bounce = Math.abs(Math.sin(phase));            // 一个步幅周期内起落两次
    var spd = 0.35 + 0.65 * sk;

    // 影子：两层。外圈是柔和的环境投影，内圈是贴地的接触影。
    // 宽度按新贴图的内容宽度重算：内容宽 176px / 256 × RUN_FRAME_U ≈ 1.81u。
    ctx.save();
    ctx.scale(1, 0.34);
    var shR = 0.85 * u * (1 + 0.08 * sk) * (1 - 0.14 * bounce);
    var shA = (0.46 - 0.06 * sk) * (1 - 0.17 * bounce);
    var shg = ctx.createRadialGradient(0, 0, 0, 0, 0, shR);
    shg.addColorStop(0, 'rgba(22,36,56,' + shA.toFixed(3) + ')');
    shg.addColorStop(0.55, 'rgba(22,36,56,' + (shA * 0.50).toFixed(3) + ')');
    shg.addColorStop(1, 'rgba(22,36,56,0)');
    ctx.fillStyle = shg;
    ctx.beginPath();
    ctx.arc(0, 0, shR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();   // 结束外圈环境投影

    // 接触影：贴着脚底的一小圈深影。y 压得更扁，让它只从脚底往下铺开一小段。
    ctx.save();
    ctx.scale(1, 0.26);
    var cR = 0.36 * u * (1 - 0.10 * bounce);
    var cA = (0.52 - 0.12 * bounce) * (0.85 + 0.15 * spd);
    var cg = ctx.createRadialGradient(0, 0, 0, 0, 0, cR);
    cg.addColorStop(0, 'rgba(12,22,38,' + cA.toFixed(3) + ')');
    cg.addColorStop(0.55, 'rgba(12,22,38,' + (cA * 0.62).toFixed(3) + ')');
    cg.addColorStop(1, 'rgba(12,22,38,0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(0, 0, cR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 无敌光环：节奏与尺寸沿用改造前的参数
    if (inv) {
      var sp2 = 16 + 14 * sk;
      var a = 0.40 + 0.34 * Math.sin(G.t * sp2);
      var a2 = 0.18 + 0.16 * Math.sin(G.t * sp2 + 1.6);
      ctx.beginPath();
      ctx.ellipse(0, -1.28 * u, 1.38 * u, 1.98 * u, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,214,64,' + a.toFixed(3) + ')';
      ctx.lineWidth = Math.max(2, 0.10 * u);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, -1.28 * u, 1.56 * u, 2.16 * u, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,248,190,' + a2.toFixed(3) + ')';
      ctx.lineWidth = Math.max(1.5, 0.055 * u);
      ctx.stroke();
    }

    // —— 角色本体：按锚点把整帧贴到地面线上 ——
    // 竖排布局、帧间无间隔，第 frame 帧的源 y 就是 frame × RUN_FRAME。
    // 目标矩形与「帧号」无关（只有源 y 在变），所以脚底每一帧都落在同一条地面线上：
    // 不会出现上下漂、左右抖，也不做任何缩放压扁（不拉伸）。
    //
    // 受击（hitLift 为数字）时改画独立蹲伏图，源 y 恒为 0；hitLift 只作用于本体，
    // 影子仍钉在地面线上 —— 抬起来的是身体，不会出现影子跟着飞。
    var useHit = typeof hitLift === 'number' && hitSheetReady;
    if (useHit || runSheetReady) {
      // hitLift 的单位是 u，而 ctx 此时还没 scale → 先 translate 会把 u 当成屏幕像素。
      // 所以必须乘 u 且在 scale 之前抬：这样抬升量才能与锚点、帧尺寸同一套尺度。
      if (useHit && hitLift > 0) ctx.translate(0, -hitLift * u);
      ctx.scale(u, u);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      // 受击图与跑步帧各用各的尺度：受击图锁旧基准（HIT_*），跑步帧按新素材（RUN_*）；
      // 两者锚点相同，所以状态切换时脚底落在同一条地面线上，不会瞬移。
      var kk = useHit ? HIT_K : RUN_K;
      var fU = useHit ? HIT_FRAME_U : RUN_FRAME_U;
      ctx.drawImage(
        useHit ? HIT_SHEET : RUN_SHEET,
        0, useHit ? 0 : frame * RUN_FRAME, RUN_FRAME, RUN_FRAME,
        -RUN_ANCHOR_X * kk, -RUN_ANCHOR_Y * kk,
        fU, fU
      );
    }

    ctx.restore();
  }

  function drawPlayer() {
    if (G.state === 'over') return;
    var X = px(player.x, 1);
    var Y = py(1);
    // 角色尺寸：原来只跟 SCALE 走，窄屏时 SCALE 被宽度压死（手机只有 54px 高）。
    // 改成同时受屏高约束，手机上角色高度约占屏高 11%，桌面上约 25%。
    var u = Math.min(H * 0.11, SCALE * 0.30);

    ctx.save();
    ctx.translate(X, Y);
    // hitLift = 受击时本体相对地面线抬起多少 u（只作用于本体）；非 dying 为 null。
    var hitLift = null;
    if (G.state === 'dying') {
      // t：命中瞬间 0 → dying 结束 1。时长与结束时机仍完全由 G.dying / 0.85 决定。
      var dtt = clamp(1 - Math.max(0, G.dying) / 0.85, 0, 1);
      // 旋转：终点仍是 0.25rad。起始取当前变道侧倾并随时间归零，
      // 这样「正在变道时被炸」不会把侧倾瞬间抹掉（不跳位）；直行被炸时与原曲线逐帧一致。
      var th = (player.lean || 0) * (1 - dtt) + dtt * 0.25;
      // 冲击弹起 → 落地下沉：两端都取 0，所以切进 dying、弹回落定都不跳位；
      // 前半程（0.52t）内弹起再落回，之后贴地，只靠旋转表现失去平衡。
      var pop = 0.18 * Math.sin(Math.PI * Math.min(1, dtt / 0.52));
      // 绕锚点旋转会让最低点探到地面以下：抬升量直接查 hitDipU(th)（按真实轮廓采样、
      // 向上取整），它恒 ≥ 真实下探量，所以只会多抬、不会把本体压到地面以下。
      hitLift = pop + hitDipU(th);
      ctx.rotate(th);
    } else {
      // 变道侧倾：跟随横向速度倾过去，约 0.2 秒回正
      var want = clamp((player.targetX - player.x) * 0.24, -0.22, 0.22);
      player.lean = (player.lean || 0) + (want - (player.lean || 0)) * Math.min(1, vDt * 13);
      ctx.rotate(player.lean);
    }
    drawSheep(u, player.phase, player.invincible > 0, player.animFrame, hitLift);
    ctx.restore();
  }
  /* ============================================================
     12. 绘制 —— 特效
     ============================================================ */
  function drawParticles() {
    for (var i = 0; i < G.particles.length; i++) {
      var p = G.particles[i];
      var a = Math.max(0, p.life / p.max);
      if (p.type === 'ring') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,200,110,' + (a * 0.95).toFixed(3) + ')';
        ctx.lineWidth = Math.max(1, 14 * a);
        ctx.stroke();
      } else if (p.type === 'flash') {
        var fr = Math.max(2, p.r);
        var fg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, fr);
        fg.addColorStop(0, 'rgba(255,255,250,' + (a * 0.95).toFixed(3) + ')');
        fg.addColorStop(0.45, 'rgba(255,232,160,' + (a * 0.55).toFixed(3) + ')');
        fg.addColorStop(1, 'rgba(255,190,80,0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(p.x, p.y, fr, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.4 + a * 0.6), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawTexts() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var fs = Math.round(clamp(W * 0.024, 17, 32));
    ctx.font = '900 ' + fs + 'px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    for (var i = 0; i < G.texts.length; i++) {
      var t = G.texts[i];
      var k = t.life / t.max;
      var dy = (1 - k) * 104;                       // 上浮更快
      var a = Math.min(1, k * 3.6);                 // 出现即满亮
      if (k < 0.22) a *= k / 0.22;                  // 尾巴收得利落
      var pop = 1 + 0.22 * Math.max(0, 1 - (1 - k) * 7);   // 起手弹一下
      ctx.save();
      ctx.translate(t.x, t.y - dy);
      ctx.scale(pop, pop);
      ctx.globalAlpha = a;
      ctx.lineWidth = Math.max(3, fs * 0.22);
      ctx.strokeStyle = 'rgba(255,255,255,0.94)';
      ctx.strokeText(t.str, 0, 0);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, 0, 0);
      ctx.restore();
    }
    ctx.textBaseline = 'alphabetic';
  }

  /* ============================================================
     13. 主渲染
     ============================================================ */
  function render() {
    // 渲染层自用步长（只驱动视觉插值，不参与任何游戏数值）
    vDt = clamp(G.t - lastRenderT, 0, 0.05);
    if (!(vDt > 0)) vDt = 0.016;
    lastRenderT = G.t;

    var sk = vSk;
    var playing = (G.state === 'playing' || G.state === 'dying' || G.state === 'finishing');

    // 透视随速度轻微收紧：远处收敛更快、近处横向流动更明显
    vPersp = PERSP + 0.07 * sk;

    // 底色（防止震动时露出黑边）
    ctx.fillStyle = '#4a5261';
    ctx.fillRect(0, 0, W, H);

    ctx.save();

    // —— 镜头：撞炸弹的强震动 + 跑动中的持续微抖 ——
    var sh = G.shake;
    var micro = playing ? (0.28 + 1.05 * sk) : 0;
    var ox = 0, oy = 0;
    if (sh > 0.6) {
      ox += (Math.random() - 0.5) * sh;
      oy += (Math.random() - 0.5) * sh;
    }
    if (micro > 0) {
      ox += (Math.sin(G.t * 41.7) * 0.62 + Math.sin(G.t * 23.3) * 0.38) * micro;
      oy += (Math.cos(G.t * 47.1) * 0.55 + Math.sin(G.t * 19.7) * 0.45) * micro * 0.85;
    }
    if (ox !== 0 || oy !== 0) ctx.translate(ox, oy);

    drawSky();
    drawBuildings();

    // —— 地面层：先画到离屏画布，再按速度做拖影/模糊合成 ——
    //    （只有地面会被拖影，小羊和道具随后在主线画布上按原样绘制）
    var mainCtx = ctx;
    ctx = groundCtx;
    ctx.setTransform(gcvScale, 0, 0, gcvScale, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    drawGround();
    drawRoad();
    drawSideProps();
    ctx = mainCtx;

    if (groundCv) {
      ctx.drawImage(groundCv, 0, 0, W, H);

      // 拖影：从灭点向外扩散的多重错位重影（比 blur 便宜得多，且方向正确）
      // 速度越高层数贡献越强；ready 状态 bk=0，完全没有拖影
      var bk = playing ? sk : 0;
      if (bk > 0.02) {
        for (var i = 1; i <= 3; i++) {
          var e = 1 + i * 0.009 * (0.5 + bk);
          ctx.save();
          ctx.globalAlpha = (0.26 * bk) / i;
          ctx.translate(centerX, horizonY);
          ctx.scale(e, e);
          ctx.translate(-centerX, -horizonY);
          ctx.drawImage(groundCv, 0, i * 0.9 * bk, W, H);
          ctx.restore();
        }
      }
    }

    drawFinishGate();       // 关卡终点门：始终在所有物体更远处，所以先画
    drawObjects();
    drawPlayer();
    drawParticles();
    drawTexts();

    // 暗角：把视线收拢到路面中央
    if (vignetteGrad) {
      ctx.fillStyle = vignetteGrad;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.restore();
  }

  /* ============================================================
     14. 输入
     ============================================================ */
  window.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') {
      e.preventDefault();
      moveLane(-1);
    } else if (k === 'ArrowRight' || k === 'd' || k === 'D') {
      e.preventDefault();
      moveLane(1);
    } else if (k === ' ' || k === 'Enter' || k === 'Spacebar') {
      e.preventDefault();
      if (G.state === 'ready' || G.state === 'over' || G.state === 'won') startGame();
    }
  }, { passive: false });

  var tStartX = 0, tStartY = 0, tStartT = 0;

  cv.addEventListener('touchstart', function (e) {
    var t = e.changedTouches[0];
    tStartX = t.clientX;
    tStartY = t.clientY;
    tStartT = performance.now();
    ensureAudio();
  }, { passive: true });

  cv.addEventListener('touchend', function (e) {
    var t = e.changedTouches[0];
    var dx = t.clientX - tStartX;
    var dy = t.clientY - tStartY;
    if (Math.abs(dx) > 26 && Math.abs(dx) > Math.abs(dy) * 1.15) {
      moveLane(dx > 0 ? 1 : -1);
    } else if (Math.abs(dx) < 26 && Math.abs(dy) < 26 && performance.now() - tStartT < 320) {
      if (G.state === 'ready' || G.state === 'over' || G.state === 'won') startGame();
    }
  }, { passive: true });

  cv.addEventListener('mousedown', function () {
    if (G.state === 'ready' || G.state === 'over' || G.state === 'won') startGame();
  });

  document.getElementById('btnStart').addEventListener('click', function (e) {
    e.stopPropagation();
    startGame();
  });
  document.getElementById('btnRetry').addEventListener('click', function (e) {
    e.stopPropagation();
    startGame();
  });

  window.addEventListener('blur', function () {
    lastTime = performance.now();
  });

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () {
    setTimeout(resize, 120);
  });

  /* ============================================================
     15. 主循环
     ============================================================ */
  var lastTime = performance.now();

  function loop(now) {
    var dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.05) dt = 0.05;      // 卡顿保护
    if (dt < 0) dt = 0;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  /* ============================================================
     16. 启动
     ============================================================ */
  resize();
  // 关卡长度只有 LEVEL_LENGTH 一处定义，界面文案跟着它走，避免两处写死数字
  elStartSub.innerHTML = '三车道飞驰，躲炸弹、捡金币、啃胡萝卜<br>跑完 ' + LEVEL_LENGTH + ' 米到终点站就算通关';
  resetGame();
  elBestStart.textContent = G.high;
  requestAnimationFrame(loop);

})();