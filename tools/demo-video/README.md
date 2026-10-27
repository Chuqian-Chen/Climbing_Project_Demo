# 演示视频生成器（tools/demo-video）

把 `miniprogram/` 的**真实源码**放进浏览器里跑起来，按分镜自动点击、滑动、输入，逐帧录成 MP4。
不需要微信开发者工具，也不需要手动录屏。改了页面后重跑一次，就能得到新的演示视频。

成片示例：
- 横屏：[`docs/demo/yanyou-beta-demo.mp4`](../../docs/demo/yanyou-beta-demo.mp4)（1920×1080 · 无声）
- 竖屏 + 讲解字幕（视频号）：[`docs/demo/yanyou-beta-vertical.mp4`](../../docs/demo/yanyou-beta-vertical.mp4)（1080×1920 · 无声）

## 一条命令出片

```bash
cd tools/demo-video
npm install                 # 只装 playwright
npx playwright install chromium
npm run record              # → out/yanyou-beta-demo.mp4 + out/yanyou-beta-demo-cover.jpg
```

需要本机有 `ffmpeg`（macOS：`brew install ffmpeg`）。

### 竖屏 9:16 + 讲解字幕（视频号）

```bash
npm run record:vertical     # → out/yanyou-beta-vertical.mp4（1080×1920，无声）+ -cover.jpg（片头卡，可做视频号封面）
```

- 字幕文字在 `scenario.js` 的 `narration`（`text` 字段）；每句按阅读速度停留，`s.say(id)` 显示后不阻塞，手机里的操作同时进行，下一句会等上一句播完，`s.hush()` 用在换页前。
- 字幕压在画面 75%~80% 高度，避开视频号底部的标题和互动区。
- 成片无声，发布时可在视频号 App 里加背景音乐。

#### 可选：配音讲解

`npm run record:vertical-voice`（即 `--narrate`）会逐句合成中文配音并铺到时间线上，字幕时长改为跟随音频，另输出 `.srt` 外挂字幕：

- 需要 `pip install sherpa-onnx`，首次运行自动下载 Kokoro v1.1-zh 模型（约 147MB，Apache-2.0）；Mac 也可用系统朗读 `--tts say --voice Tingting`。
- `speak` 字段是实际朗读的文字：TTS 读英文缩写不稳，朗读里写成中文说法（Beta→贝塔、TA山→他山、AI→人工智能），字幕保留原词。
- 换音色 `--voice <0-102>`（默认 5，女声；例如 60 是男声），语速 `--speed 1.05`；音频按内容哈希缓存在 `out/voice/`；响度归一到 -16 LUFS。

常用参数（`node record.js ...`）：

| 参数 | 作用 |
| --- | --- |
| `--layout vertical` | 竖屏 630×1120 画布 → 1080×1920；默认 `horizontal`（1600×900 → 1920×1080） |
| `--captions` | 显示讲解字幕（无声） |
| `--narrate` | 可选：合成配音 + 字幕；`--tts kokoro\|say`、`--voice`、`--speed`、`--python`、`--model-dir` |
| `--out <path>` | 输出路径，默认 `out/yanyou-beta-demo.mp4` / `out/yanyou-beta-vertical.mp4` |
| `--dpr` | 画布缩放倍数；横屏默认 1.2（1080p），2.4 → 4K |
| `--crf 20` | x264 质量，越小越清晰、文件越大 |
| `--dry` | 只跑分镜不录制，调试脚本用 |
| `--headed` | 弹出浏览器窗口，边看边跑 |
| `--keep-frames` | 保留 `out/frames/` 原始帧 |

## 在浏览器里手动玩

```bash
npm run serve               # 打开 http://localhost:5179
```

页面左边就是可点的小程序（Tab、跳转、picker、toast、modal 都可用），右边是字幕面板。
默认每次刷新都重置为 seed 数据；`?keep=1` 保留上次操作留下的本地数据。

## 它是怎么工作的

```
compile.js   WXML → AST、WXSS → 按页面加作用域的 CSS（rpx→px）、JS/TS → CommonJS 模块表
runtime/     浏览器端的小程序运行时：Page / Component / setData / wx:if / wx:for / 事件冒泡
             wx.* API（路由栈、storage、toast、modal、picker、定位、canvas 等）
             index.html + stage.*：手机外壳、字幕面板、触点动画
seed.js      录制前写入 storage 的数据：个人档案、近两月打卡、TA山真实墙照与圈点
scenario.js  分镜：7 个章节的字幕 + 讲解词 + 每一步操作
narrate.js   可选配音：逐句合成（tts_kokoro.py / macOS say）、按开口时刻铺轨与视频合成
record.js    起本地服务 → Chromium 打开舞台页 → 执行分镜 → CDP screencast 采帧 → ffmpeg 合成
serve.js     零依赖静态服务（预览与录制共用）
shot.js      调试：逐页截图，核对渲染
```

- `wx.cloud` 在模拟器里恒为 `undefined`，`api.js` 自动走「本地演示数据」分支，和开发者工具未开通云开发时一致。
- 定位固定在北京望京（`runtime.js` 里 `CFG.location`），所以首页「附近岩馆」第一个是磐石·望京，Beta 流里出现「本馆」标。
- 墙面圈点章节用的是 `cloudfunctions/initDb/real-content.js` 里 TA山 主墙的真实标注，墙照为 `docs/tashan.jpg`；线路的上墙 / 拆线日期按「今天」滚动。

## 改分镜

编辑 `scenario.js`：`chapters` 是右侧字幕，`run(s)` 里是操作序列。可用的操作：

```js
s.chapter(i)                          // 切换到第 i 章字幕（不 await = 与下一步页面跳转同时开始）
s.say('id') / s.hush(ms)              // 讲解一句（不阻塞）/ 等这句说完
s.bullet(i)                           // 点亮当前章第 i 条要点
s.tap('.selector', { text, nth })     // 点当前页元素；目标不在视野时先自动滑过去
s.type('.input', '文字')              // 点输入框并逐字输入
s.scroll(dy, ms) / s.scrollTo(sel)    // 手指滑动当前页
s.tab(i) / s.back()                   // 点 TabBar / 导航栏返回
s.pick([col0, col1])                  // picker 弹出后滚到指定行并确定
s.nextMedia(['/assets/demo/x.jpg'])   // 指定下一次 chooseMedia 选到的图片
s.wait(ms) / s.cover(show, html)      // 停顿 / 片头片尾
```

选择器默认只在当前页（`[data-top]`）内查找；弹层用 `{ global: true }`。

## 已知边界

- 只模拟了本项目用到的组件和 API；`video` 不能播放 `cloud://` 文件（封面照常显示），`wx.request` 统一返回失败（天气不显示）。
- 字体按 PingFang SC → Noto Sans SC → 系统字体回退，和真机字形略有差异。
- 这是演示用模拟器，不能替代开发者工具 / 真机测试（见 `docs/launch/真机测试checklist.md`）。
