"""把拆分版（index.html + css/style.css + js/game.js + 角色精灵图）打回单文件。

用法:
    python tools/build.py                 # 输出 dist/sheep-runner.html
    python tools/build.py out.html        # 输出到指定路径

做的事：
  1. style.css 内容塞回 <style>...</style>
  2. game.js 内容塞回 <script>...</script>
  3. 把 game.js 里 RUN_SHEET_SRC 指向的那张图读进来，换成内嵌 base64
     —— 路径从代码里解析，不在本脚本里写死，换尺寸只改 game.js 一行
  4. 剥掉拆分时加的头部注释

退出码非 0 表示资源缺失或仍有外链残留。
"""
import base64
import hashlib
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSS_HDR = '/* 小羊快跑 · 样式表 */\n'
JS_HDR = '/* 小羊快跑 · 主逻辑（拆分版）– 要出单文件请运行 python tools/build.py */\n'

rd = lambda *p: open(os.path.join(ROOT, *p), 'rb').read()
rt = lambda *p: open(os.path.join(ROOT, *p), encoding='utf-8', newline='').read()

html = rt('index.html')
css = rt('css', 'style.css')
js = rt('js', 'game.js')

assert css.startswith(CSS_HDR), 'style.css 头部注释不见了'
css = css[len(CSS_HDR):]
assert js.startswith(JS_HDR), 'game.js 头部注释不见了'
js = js[len(JS_HDR):]

# ---- 图片：路径从代码里解析，避免脚本与代码各写一份 ----
# 目前需要内嵌的图有两张：
#   RUN_SHEET_SRC  跑步四帧矮向 sheet（256×1024）
#   HIT_SHEET_SRC  受击蹲伏单帧（256×256）
# 新增图片只需要在下面列表里加个变量名，不用改其它地方。
IMG_VARS = ['RUN_SHEET_SRC', 'HIT_SHEET_SRC']
inlined = []
for var in IMG_VARS:
    m = re.search(r"var %s = '([^']+)';" % var, js)
    assert m, 'game.js 里找不到 %s 声明' % var
    rel = m.group(1)
    ap = os.path.join(ROOT, *rel.split('/'))
    assert os.path.isfile(ap), '%s 指向的图不存在: %s' % (var, rel)
    b64 = base64.b64encode(open(ap, 'rb').read()).decode()
    # 只替换这一处的字面量（该路径字符串在代码里应恰好出现一次）
    assert js.count("'" + rel + "'") == 1, '%s 的路径在 game.js 中出现不止一次，替换会有歧义' % var
    js = js.replace("'" + rel + "'", "'data:image/png;base64," + b64 + "'", 1)
    inlined.append((var, rel, ap, b64))

# 拼回原结构：<link...> -> <style>；<script src...> -> <script>
html = html.replace('<link rel="stylesheet" href="css/style.css">', '<style>\n' + css + '</style>', 1)
html = html.replace('<script src="js/game.js"></script>', '<script>\n' + js + '\n</script>', 1)
assert 'css/style.css' not in html and 'js/game.js' not in html, '仍有 CSS/JS 外部引用'
for _v, _rel, _ap, _b in inlined:
    assert _rel not in html, '仍有图片外链: ' + _rel

out = sys.argv[1] if len(sys.argv) > 1 else os.path.join('dist', 'sheep-runner.html')
out = os.path.join(ROOT, out)
os.makedirs(os.path.dirname(out), exist_ok=True)
open(out, 'w', encoding='utf-8', newline='').write(html)

print('已生成 %s' % os.path.relpath(out, ROOT))
for _v, _rel, _ap, _b in inlined:
    print('  %s = %s (%.1fKB -> base64 %.1fKB)' % (
        _v, _rel, os.path.getsize(_ap) / 1024, len(_b) / 1024))
print('  %d B  sha256=%s' % (len(html.encode()), hashlib.sha256(html.encode()).hexdigest()[:16]))
