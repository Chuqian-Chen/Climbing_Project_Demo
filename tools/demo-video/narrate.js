// 讲解配音：把 scenario.narration 的每一句合成为 wav（按内容哈希缓存在 out/voice/）
//   engine=kokoro（默认）：离线神经网络 TTS，需 `pip install sherpa-onnx`，首次自动下载模型
//   engine=say：macOS 自带 say 命令（如 -v Tingting），无需额外安装
// 返回 { id: { file, dur } }，dur 单位秒
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');

const VOICE_DIR = path.join(__dirname, 'out', 'voice');

function probeDuration(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return parseFloat(String(out).trim());
}

function synthesize(narration, opts) {
  const engine = opts.tts || 'kokoro';
  const voice = String(opts.voice || (engine === 'say' ? 'Tingting' : '5'));
  const speed = opts.speed || (engine === 'say' ? 1 : 1.05);
  fs.mkdirSync(VOICE_DIR, { recursive: true });
  const result = {};
  const todo = [];
  Object.keys(narration).forEach((id) => {
    const line = narration[id];
    const speak = line.speak || line.text;
    const hash = crypto.createHash('sha1').update([engine, voice, speed, speak].join('|')).digest('hex').slice(0, 12);
    const file = path.join(VOICE_DIR, id + '-' + hash + '.wav');
    result[id] = { file, text: line.text };
    if (!fs.existsSync(file)) todo.push({ id, text: speak, out: file });
  });

  if (todo.length) {
    console.log('[narrate] 合成 ' + todo.length + ' 句（' + engine + ' / ' + voice + '）…');
    if (engine === 'kokoro') {
      const jobs = path.join(VOICE_DIR, 'jobs.json');
      fs.writeFileSync(jobs, JSON.stringify(todo.map((t) => ({ text: t.text, out: t.out }))));
      const py = opts.python || process.env.PYTHON || 'python3';
      execFileSync(py, [
        path.join(__dirname, 'tts_kokoro.py'),
        '--model-dir', opts.modelDir || path.join(__dirname, '.models'),
        '--sid', voice, '--speed', String(speed), '--jobs', jobs
      ], { stdio: 'inherit' });
    } else if (engine === 'say') {
      todo.forEach((t) => {
        const aiff = t.out.replace(/\.wav$/, '.aiff');
        execFileSync('say', ['-v', voice, '-r', String(Math.round(190 * speed)), '-o', aiff, t.text]);
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', aiff, '-ar', '24000', '-ac', '1', t.out]);
        fs.rmSync(aiff, { force: true });
      });
    } else {
      throw new Error('未知 TTS 引擎：' + engine + '（可选 kokoro / say）');
    }
  }
  Object.keys(result).forEach((id) => { result[id].dur = probeDuration(result[id].file); });
  const total = Object.keys(result).reduce((n, id) => n + result[id].dur, 0);
  console.log('[narrate] ' + Object.keys(result).length + ' 句，共 ' + total.toFixed(1) + 's');
  return result;
}

// 把各句按实际开口时刻铺到时间线上，两遍 loudnorm（-16 LUFS / -1.5 dBTP）后与无声视频合成
function muxNarration(silentVideo, spoken, videoStart, out) {
  const dur = probeDuration(silentVideo);
  const voiceWav = out.replace(/\.mp4$/, '.voice.wav');
  const args = ['-y', '-loglevel', 'error'];
  const parts = [];
  spoken.forEach((s, i) => {
    args.push('-i', s.file);
    const ms = Math.max(0, Math.round((s.at - videoStart) * 1000));
    parts.push('[' + i + ':a]aresample=48000,adelay=' + ms + ':all=1[a' + i + ']');
  });
  const mix = spoken.map((s, i) => '[a' + i + ']').join('') +
    'amix=inputs=' + spoken.length + ':normalize=0:dropout_transition=0,apad,atrim=0:' + dur.toFixed(3) + '[mix]';
  execFileSync('ffmpeg', args.concat(['-filter_complex', parts.concat([mix]).join(';'), '-map', '[mix]', '-ac', '1', voiceWav]), { stdio: 'inherit' });

  // 第一遍测量，第二遍按测量值线性增益（单遍 loudnorm 对有停顿的人声会偏响）
  const target = 'I=-16:TP=-1.5:LRA=11';
  const measured = measureLoudness(voiceWav, target);
  const ln = 'loudnorm=' + target + ':measured_I=' + measured.input_i + ':measured_TP=' + measured.input_tp +
    ':measured_LRA=' + measured.input_lra + ':measured_thresh=' + measured.input_thresh +
    ':offset=' + measured.target_offset + ':linear=true';
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', silentVideo, '-i', voiceWav,
    // 单声道复制到双声道时各降 3dB，按 EBU R128 双声道计量仍是 -16 LUFS
    '-filter_complex', '[1:a]' + ln + ',aresample=48000,pan=stereo|c0=0.7071*c0|c1=0.7071*c0[aout]',
    '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
    '-movflags', '+faststart', out
  ], { stdio: 'inherit' });
  fs.rmSync(voiceWav, { force: true });

  writeSrt(spoken, videoStart, out.replace(/\.mp4$/, '.srt'));
  fs.writeFileSync(out.replace(/\.mp4$/, '.timeline.json'), JSON.stringify(spoken.map((s) => ({
    id: s.id, start: +(s.at - videoStart).toFixed(3), dur: s.dur, text: s.text
  })), null, 2));
  return out;
}

function measureLoudness(file, target) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'loudnorm=' + target + ':print_format=json', '-f', 'null', '-'], { encoding: 'utf8' });
  const txt = r.stderr || '';
  const json = txt.slice(txt.lastIndexOf('{'), txt.lastIndexOf('}') + 1);
  return JSON.parse(json);
}

function srtTime(t) {
  const ms = Math.max(0, Math.round(t * 1000));
  const p = (n, w) => String(n).padStart(w, '0');
  return p(Math.floor(ms / 3600000), 2) + ':' + p(Math.floor(ms / 60000) % 60, 2) + ':' + p(Math.floor(ms / 1000) % 60, 2) + ',' + p(ms % 1000, 3);
}

// 外挂字幕（B 站等平台可直接导入；视频号用画面里的硬字幕）
function writeSrt(spoken, videoStart, file) {
  const body = spoken.map((s, i) => {
    const a = s.at - videoStart;
    return (i + 1) + '\n' + srtTime(a) + ' --> ' + srtTime(a + s.dur + 0.2) + '\n' + s.text + '\n';
  }).join('\n');
  fs.writeFileSync(file, body);
}

module.exports = { synthesize, muxNarration };
