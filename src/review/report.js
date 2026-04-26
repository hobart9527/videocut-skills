/**
 * Generate static HTML report (view-only, no interactivity)
 * Useful for archiving AI analysis results
 */

const fs = require('fs');

/**
 * Generate a static HTML report of analysis results
 * @param {Array} words - subtitles_words.json
 * @param {Array} autoSelected - indices selected by AI
 * @param {Array} analysis - analysis logs
 * @param {string} outputPath - output HTML path
 */
function generateReport(words, autoSelected, analysis, outputPath) {
  const totalDuration = words[words.length - 1]?.end || 0;
  const selectedDuration = autoSelected.reduce((sum, i) => {
    return sum + (words[i]?.end - words[i]?.start || 0);
  }, 0);

  const typeLabels = {
    silence: '静音',
    filler: '语气词',
    consecutive_filler: '连续语气词',
    repeat_sentence: '重复句',
    stutter: '卡顿词',
    incomplete: '残句',
    self_correction: '重说纠正',
  };

  const typeColors = {
    silence: '#2196F3',
    filler: '#FF9800',
    consecutive_filler: '#FF5722',
    repeat_sentence: '#f44336',
    stutter: '#9C27B0',
    incomplete: '#795548',
    self_correction: '#607D8B',
  };

  // Build transcript with highlights
  let transcriptHTML = '';
  words.forEach((w, i) => {
    const isSelected = autoSelected.includes(i);
    const style = isSelected
      ? 'background:#f44336;color:white;text-decoration:line-through;'
      : w.isGap ? 'background:#333;color:#888;' : '';

    const text = w.isGap
      ? `[${(w.end - w.start).toFixed(1)}s]`
      : w.text;

    transcriptHTML += `<span style="${style}padding:2px 4px;margin:1px;border-radius:2px;display:inline-block;" title="${w.start.toFixed(2)}s-${w.end.toFixed(2)}s">${text}</span>`;
  });

  // Build analysis table
  const analysisRows = analysis.map(item => {
    const color = typeColors[item.type] || '#666';
    return `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #333;font-family:monospace;">${item.start?.toFixed(2) || 0}-${item.end?.toFixed(2) || 0}</td>
        <td style="padding:8px;border-bottom:1px solid #333;"><span style="background:${color};color:white;padding:2px 8px;border-radius:4px;font-size:12px;">${typeLabels[item.type] || item.type}</span></td>
        <td style="padding:8px;border-bottom:1px solid #333;">${item.text || ''}</td>
      </tr>
    `;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>口播审核报告</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #1a1a1a; color: #e0e0e0; margin: 0; padding: 20px; line-height: 1.6; }
    h1 { color: #fff; border-bottom: 2px solid #333; padding-bottom: 10px; }
    .stats { display: flex; gap: 20px; margin: 20px 0; flex-wrap: wrap; }
    .stat-box { background: #252525; padding: 15px 20px; border-radius: 8px; min-width: 150px; }
    .stat-value { font-size: 28px; font-weight: bold; color: #4CAF50; }
    .stat-label { font-size: 12px; color: #888; margin-top: 5px; }
    .section { margin: 30px 0; }
    .section h2 { color: #fff; font-size: 18px; margin-bottom: 15px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 10px 8px; background: #333; color: #fff; font-weight: normal; }
    .transcript { background: #252525; padding: 20px; border-radius: 8px; line-height: 2.2; font-size: 16px; }
    .note { background: #1a3a1a; color: #4CAF50; padding: 15px; border-radius: 8px; margin: 20px 0; }
  </style>
</head>
<body>
  <h1>口播审核报告</h1>

  <div class="stats">
    <div class="stat-box">
      <div class="stat-value">${words.length}</div>
      <div class="stat-label">总元素数</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${autoSelected.length}</div>
      <div class="stat-label">AI标记删除</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${selectedDuration.toFixed(1)}s</div>
      <div class="stat-label">预计删除时长</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${totalDuration.toFixed(1)}s</div>
      <div class="stat-label">视频总时长</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${((selectedDuration / totalDuration) * 100).toFixed(1)}%</div>
      <div class="stat-label">删除比例</div>
    </div>
  </div>

  <div class="note">
    <strong>注意：</strong>此报告为静态预览，无法交互编辑。如需剪辑，请使用 <code>videocut cut video.mp4 --review=web</code> 或 <code>--review=tui</code>。
  </div>

  <div class="section">
    <h2>问题列表 (${analysis.length} 处)</h2>
    <table>
      <thead>
        <tr>
          <th>时间</th>
          <th>类型</th>
          <th>内容</th>
        </tr>
      </thead>
      <tbody>
        ${analysisRows}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2>全文标注</h2>
    <div class="transcript">
      ${transcriptHTML}
    </div>
    <p style="color:#888;font-size:12px;margin-top:10px;">
      <span style="background:#f44336;color:white;padding:2px 6px;border-radius:2px;">红色删除线</span> = AI建议删除
      <span style="margin-left:15px;background:#333;color:#888;padding:2px 6px;border-radius:2px;">灰色</span> = 静音段
    </p>
  </div>

  <div class="section" style="margin-top:40px;color:#666;font-size:12px;text-align:center;">
    Generated by videocut-skills
  </div>
</body>
</html>`;

  fs.writeFileSync(outputPath, html);
}

module.exports = { generateReport };
