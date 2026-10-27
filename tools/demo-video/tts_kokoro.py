"""离线中文配音：sherpa-onnx + Kokoro v1.1-zh（Apache-2.0）。

由 narrate.js 调用：
  python3 tts_kokoro.py --model-dir <dir> --sid 5 --speed 1.05 --jobs jobs.json
jobs.json = [{"text": "...", "out": "/abs/path.wav"}, ...]

首次运行会从 sherpa-onnx 的 GitHub Release 下载模型（约 147MB）到 --model-dir。
依赖：pip install sherpa-onnx
"""
import argparse
import array
import json
import os
import sys
import tarfile
import urllib.request
import wave

MODEL = 'kokoro-int8-multi-lang-v1_1'
URL = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/' + MODEL + '.tar.bz2'


def ensure_model(root):
    d = os.path.join(root, MODEL)
    if os.path.exists(os.path.join(d, 'model.int8.onnx')):
        return d
    os.makedirs(root, exist_ok=True)
    tmp = os.path.join(root, MODEL + '.tar.bz2')
    print('[tts] 下载模型 ' + URL, file=sys.stderr, flush=True)
    urllib.request.urlretrieve(URL, tmp)
    with tarfile.open(tmp, 'r:bz2') as tf:
        tf.extractall(root)
    os.remove(tmp)
    return d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model-dir', required=True)
    ap.add_argument('--sid', type=int, default=5)
    ap.add_argument('--speed', type=float, default=1.05)
    ap.add_argument('--jobs', required=True)
    ap.add_argument('--threads', type=int, default=4)
    a = ap.parse_args()

    import sherpa_onnx

    k = ensure_model(a.model_dir)
    p = lambda n: os.path.join(k, n)
    tts = sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
                model=p('model.int8.onnx'), voices=p('voices.bin'), tokens=p('tokens.txt'),
                data_dir=p('espeak-ng-data'), dict_dir=p('dict'),
                lexicon=p('lexicon-us-en.txt') + ',' + p('lexicon-zh.txt')),
            num_threads=a.threads, provider='cpu'),
        # 数字 / 日期 / 电话的中文读法
        rule_fsts=','.join(p(n) for n in ('phone-zh.fst', 'date-zh.fst', 'number-zh.fst')),
        max_num_sentences=1))

    with open(a.jobs, encoding='utf-8') as f:
        jobs = json.load(f)
    for i, job in enumerate(jobs):
        audio = tts.generate(job['text'], sid=a.sid, speed=a.speed)
        pcm = array.array('h', (max(-32768, min(32767, int(s * 32767))) for s in audio.samples))
        with wave.open(job['out'], 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(audio.sample_rate)
            w.writeframes(pcm.tobytes())
        print('[tts] %d/%d %.1fs %s' % (i + 1, len(jobs), len(audio.samples) / audio.sample_rate, job['text'][:24]),
              file=sys.stderr, flush=True)


if __name__ == '__main__':
    main()
