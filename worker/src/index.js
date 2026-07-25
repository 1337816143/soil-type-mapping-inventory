const DEFAULT_MAX_FILE_MB = 20;
const ALLOWED_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'xlsx', 'xls', 'zip', 'rar']);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return jsonResponse({ ok: true, service: 'soil-type-mapping-upload' }, 200, request, env);
    }

    if (request.method === 'OPTIONS') {
      return handleOptions(request, env);
    }

    if (request.method !== 'POST' || url.pathname !== '/upload') {
      return jsonResponse({ ok: false, message: 'Not found' }, 404, request, env);
    }

    const originCheck = validateOrigin(request, env);
    if (!originCheck.ok) {
      return jsonResponse({ ok: false, message: originCheck.message }, 403, request, env);
    }

    if (!env.GITHUB_UPLOAD_TOKEN) {
      return jsonResponse({ ok: false, message: '上传服务尚未配置 GitHub 凭证' }, 503, request, env);
    }

    const contentType = request.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
      return jsonResponse({ ok: false, message: '请求格式错误，必须使用 multipart/form-data' }, 415, request, env);
    }

    const maxFileBytes = getMaxFileBytes(env);
    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (declaredLength && declaredLength > maxFileBytes + 1024 * 1024) {
      return jsonResponse({ ok: false, message: `文件不能超过 ${Math.floor(maxFileBytes / 1024 / 1024)} MB` }, 413, request, env);
    }

    try {
      const form = await request.formData();
      const file = form.get('file');
      const city = cleanText(form.get('city'), 60);
      const unit = cleanText(form.get('unit'), 100);
      const district = cleanText(form.get('district'), 80);

      if (!(file instanceof File)) {
        return jsonResponse({ ok: false, message: '未检测到上传文件' }, 400, request, env);
      }
      if (!city || !unit || !district) {
        return jsonResponse({ ok: false, message: '任务信息不完整，请刷新页面后重试' }, 400, request, env);
      }
      if (file.size <= 0) {
        return jsonResponse({ ok: false, message: '不能上传空文件' }, 400, request, env);
      }
      if (file.size > maxFileBytes) {
        return jsonResponse({ ok: false, message: `文件不能超过 ${Math.floor(maxFileBytes / 1024 / 1024)} MB` }, 413, request, env);
      }

      const extension = getExtension(file.name);
      if (!ALLOWED_EXTENSIONS.has(extension)) {
        return jsonResponse({ ok: false, message: '不支持该文件类型，请上传 PDF、Word、Excel、ZIP 或 RAR 文件' }, 400, request, env);
      }

      const timestamp = getChinaTimestamp();
      const randomSuffix = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      const rawKey = `${city}_${unit}_${district}`;
      const safeKey = truncateUtf8(sanitizeFilePart(rawKey), 180);
      const fileName = `${safeKey}_整改答复_${timestamp}${randomSuffix}.${extension}`;
      const repository = env.GITHUB_REPOSITORY || '1337816143/soil-type-mapping-inventory';
      const branch = env.GITHUB_BRANCH || 'main';
      const apiUrl = `https://api.github.com/repos/${repository}/contents/replies/${encodeURIComponent(fileName)}`;

      const bytes = new Uint8Array(await file.arrayBuffer());
      const contentBase64 = bytesToBase64(bytes);
      const githubResponse = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${env.GITHUB_UPLOAD_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
          'User-Agent': 'soil-type-mapping-upload-worker'
        },
        body: JSON.stringify({
          message: `整改答复: ${rawKey}`,
          content: contentBase64,
          branch
        })
      });

      if (!githubResponse.ok) {
        let githubMessage = '';
        try {
          const errorBody = await githubResponse.json();
          githubMessage = errorBody && errorBody.message ? errorBody.message : '';
        } catch (_) {}
        console.error('GitHub upload failed', githubResponse.status, githubMessage);
        const message = githubResponse.status === 401 || githubResponse.status === 403
          ? '服务器上传凭证无效或权限不足'
          : githubResponse.status === 422
            ? '文件名冲突，请重新上传'
            : 'GitHub 写入失败，请稍后重试';
        return jsonResponse({ ok: false, message }, 502, request, env);
      }

      return jsonResponse({
        ok: true,
        file: fileName,
        time: timestamp,
        size: file.size,
        message: '上传成功，页面正在自动更新'
      }, 201, request, env);
    } catch (error) {
      console.error('Upload error', error && error.stack ? error.stack : error);
      return jsonResponse({ ok: false, message: '上传服务发生异常，请稍后重试' }, 500, request, env);
    }
  }
};

function getAllowedOrigins(env) {
  return new Set(String(env.ALLOWED_ORIGINS || 'https://1337816143.github.io')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean));
}

function validateOrigin(request, env) {
  const origin = request.headers.get('origin') || '';
  if (!origin) return { ok: false, message: '缺少来源信息' };
  if (!getAllowedOrigins(env).has(origin)) return { ok: false, message: '当前页面无权调用上传服务' };
  return { ok: true };
}

function handleOptions(request, env) {
  const originCheck = validateOrigin(request, env);
  if (!originCheck.ok) return jsonResponse({ ok: false, message: originCheck.message }, 403, request, env);
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, env)
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = getAllowedOrigins(env);
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin'
  };
  if (allowed.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function jsonResponse(payload, status, request, env) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(request, env),
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}

function getMaxFileBytes(env) {
  const configured = Number(env.MAX_FILE_MB || DEFAULT_MAX_FILE_MB);
  const safeMb = Number.isFinite(configured) && configured > 0 ? Math.min(configured, 20) : DEFAULT_MAX_FILE_MB;
  return Math.floor(safeMb * 1024 * 1024);
}

function getExtension(fileName) {
  const match = String(fileName || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLength);
}

function sanitizeFilePart(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|%#]/g, '-')
    .replace(/\.\.+/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateUtf8(value, maxBytes) {
  const encoder = new TextEncoder();
  let result = '';
  for (const character of value) {
    if (encoder.encode(result + character).length > maxBytes) break;
    result += character;
  }
  return result || '整改答复';
}

function getChinaTimestamp() {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(new Date());
  const values = {};
  for (const part of parts) values[part.type] = part.value;
  return `${values.year}${values.month}${values.day}${values.hour}${values.minute}${values.second}`;
}

function bytesToBase64(bytes) {
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}
