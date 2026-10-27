// 多模态模型调用（OpenAI 兼容 chat/completions 协议）
//
// 云开发控制台 → 云函数 aiAnnotate → 配置 → 环境变量：
//   VISION_API_KEY  必填
//   VISION_API_URL  选填，默认通义千问（DashScope 兼容模式）
//                     通义：https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
//                     智谱：https://open.bigmodel.cn/api/paas/v4/chat/completions
//                     豆包：https://ark.cn-beijing.volces.com/api/v3/chat/completions
//   VISION_MODEL    选填，默认 qwen-vl-max（智谱填 glm-4v-plus，豆包填推理接入点 ID）
const https = require('https');
const http = require('http');

const DEFAULT_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const DEFAULT_MODEL = 'qwen-vl-max';

function enabled() {
  return !!process.env.VISION_API_KEY;
}

function postJSON(urlStr, headers, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.request({
      hostname: u.hostname,
      port: u.port || undefined,
      path: u.pathname + u.search,
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
      timeout: timeoutMs
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error('HTTP ' + res.statusCode + ': ' + data.slice(0, 200)));
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('bad json: ' + data.slice(0, 120))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.write(JSON.stringify(body));
    req.end();
  });
}

// 从模型回复里取第一个 JSON 对象（模型常会包一层 ```json 代码块）
function extractJSON(text) {
  if (!text) return null;
  const s = String(text).replace(/```(?:json)?/g, '');
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(s.slice(i, j + 1)); } catch (e) { return null; }
}

// 单图 + 文本提问，返回解析后的 JSON 对象
async function askJSON(imageBuf, prompt, opts) {
  opts = opts || {};
  const res = await postJSON(
    process.env.VISION_API_URL || DEFAULT_URL,
    { Authorization: 'Bearer ' + process.env.VISION_API_KEY },
    {
      model: process.env.VISION_MODEL || DEFAULT_MODEL,
      temperature: 0.1,
      max_tokens: opts.maxTokens || 1200,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + imageBuf.toString('base64') } },
          { type: 'text', text: prompt }
        ]
      }]
    },
    opts.timeoutMs || 25000
  );
  const text = res && res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content;
  const json = extractJSON(Array.isArray(text) ? text.map((t) => t.text || '').join('') : text);
  if (!json) throw new Error('模型未返回可解析的 JSON');
  return json;
}

module.exports = { enabled, askJSON, extractJSON };
