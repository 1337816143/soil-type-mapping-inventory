'use strict';

const assert = require('assert');
const fs = require('fs');

const notice = '上传成功！稍等3~5分钟刷新网站即可查看新上传的文件。';
const replyScript = fs.readFileSync('upload-auth-reply-batch.js', 'utf8');
const commonScript = fs.readFileSync('upload-success-notice.js', 'utf8');
const rules = fs.readFileSync('MAINTENANCE_RULES.md', 'utf8');

assert(replyScript.includes(notice), '整改答复上传成功提醒缺失');
assert(commonScript.includes(notice), '通用上传成功提醒缺失');
assert(rules.includes(notice), '维护约束未锁定上传成功提醒');
assert(!replyScript.includes("closest('#adm-ok,#confirmUpload')"), '整改答复仍被管理员密码拦截');
assert(replyScript.includes('class="reply-view-btn"'), '查看按钮缺失');
assert(replyScript.includes('class="replace-btn"'), '替换按钮缺失');

console.log('upload success notice validation passed');
