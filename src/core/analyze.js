/**
 * Rule-based analysis engine for detecting speech errors
 * Replaces Claude's semantic analysis with deterministic rules
 */

const fs = require('fs');

// Filler words / 语气词
const FILLER_WORDS = new Set(['嗯', '啊', '呃', '哎', '唉', '哦', '喔', '哎']);
const STUTTER_PATTERNS = ['那个那个', '就是就是', '然后然后', '这个这个', '那么那么', '嗯嗯'];

/**
 * Analyze subtitles and return indices to delete
 * @param {Array} words - subtitles_words.json array
 * @param {Object} options - analysis options
 * @returns {Array} - indices of elements to mark for deletion
 */
function analyze(words, options = {}) {
  const {
    silenceThreshold = 0.3,
    repeatPrefixLength = 5,
  } = options;

  const selected = new Set();
  const sentences = splitIntoSentences(words);
  const analysis = []; // For logging/reporting

  // 1. Silence detection
  const silenceResult = detectSilence(words, silenceThreshold);
  silenceResult.indices.forEach(i => selected.add(i));
  analysis.push(...silenceResult.logs);

  // 2. Filler words
  const fillerResult = detectFillers(words);
  fillerResult.indices.forEach(i => selected.add(i));
  analysis.push(...fillerResult.logs);

  // 3. Consecutive fillers
  const consecResult = detectConsecutiveFillers(words);
  consecResult.indices.forEach(i => selected.add(i));
  analysis.push(...consecResult.logs);

  // 4. Repeat sentences
  const repeatResult = detectRepeatSentences(sentences, repeatPrefixLength);
  repeatResult.indices.forEach(i => selected.add(i));
  analysis.push(...repeatResult.logs);

  // 5. Stutter patterns
  const stutterResult = detectStutters(words);
  stutterResult.indices.forEach(i => selected.add(i));
  analysis.push(...stutterResult.logs);

  // 6. Incomplete sentences (残句)
  const incompleteResult = detectIncompleteSentences(sentences);
  incompleteResult.indices.forEach(i => selected.add(i));
  analysis.push(...incompleteResult.logs);

  // 7. Self-correction (部分重复/否定纠正)
  const correctionResult = detectSelfCorrections(sentences);
  correctionResult.indices.forEach(i => selected.add(i));
  analysis.push(...correctionResult.logs);

  const sorted = Array.from(selected).sort((a, b) => a - b);

  return {
    indices: sorted,
    analysis,
    sentences,
  };
}

/**
 * Split words into sentences based on long gaps
 */
function splitIntoSentences(words) {
  const sentences = [];
  let curr = { text: '', startIdx: -1, endIdx: -1, words: [] };

  words.forEach((w, i) => {
    const isLongGap = w.isGap && (w.end - w.start) >= 0.5;
    if (isLongGap) {
      if (curr.text.length > 0) {
        sentences.push({ ...curr });
      }
      curr = { text: '', startIdx: -1, endIdx: -1, words: [] };
    } else if (!w.isGap) {
      if (curr.startIdx === -1) curr.startIdx = i;
      curr.text += w.text;
      curr.endIdx = i;
      curr.words.push({ ...w, idx: i });
    }
  });

  if (curr.text.length > 0) {
    sentences.push(curr);
  }

  return sentences;
}

/**
 * Detect silence gaps >= threshold
 */
function detectSilence(words, threshold) {
  const indices = [];
  const logs = [];

  words.forEach((w, i) => {
    if (w.isGap && (w.end - w.start) >= threshold) {
      indices.push(i);
      logs.push({
        type: 'silence',
        idx: i,
        start: w.start,
        end: w.end,
        text: `[静${(w.end - w.start).toFixed(2)}s]`,
      });
    }
  });

  return { indices, logs };
}

/**
 * Detect filler words (嗯, 啊, 呃)
 * Mark but don't auto-delete (lighter rule)
 */
function detectFillers(words) {
  const indices = [];
  const logs = [];

  words.forEach((w, i) => {
    if (!w.isGap && w.text.length <= 1 && FILLER_WORDS.has(w.text)) {
      // Only mark if standalone (surrounded by gaps or sentence boundaries)
      const prevIsGap = i > 0 && words[i - 1].isGap;
      const nextIsGap = i < words.length - 1 && words[i + 1].isGap;
      if (prevIsGap || nextIsGap) {
        indices.push(i);
        logs.push({
          type: 'filler',
          idx: i,
          start: w.start,
          end: w.end,
          text: w.text,
        });
      }
    }
  });

  return { indices, logs };
}

/**
 * Detect consecutive fillers (嗯啊, 啊呃)
 */
function detectConsecutiveFillers(words) {
  const indices = [];
  const logs = [];

  for (let i = 0; i < words.length - 1; i++) {
    const w1 = words[i];
    const w2 = words[i + 1];
    if (!w1.isGap && !w2.isGap &&
        FILLER_WORDS.has(w1.text) && FILLER_WORDS.has(w2.text) &&
        w2.start - w1.end < 0.3) {
      indices.push(i, i + 1);
      logs.push({
        type: 'consecutive_filler',
        idx: [i, i + 1],
        start: w1.start,
        end: w2.end,
        text: w1.text + w2.text,
      });
    }
  }

  return { indices, logs };
}

/**
 * Detect repeated sentences (adjacent sentences with same prefix >= N chars)
 */
function detectRepeatSentences(sentences, prefixLength = 5) {
  const indices = [];
  const logs = [];

  for (let i = 0; i < sentences.length - 1; i++) {
    const s1 = sentences[i];
    const s2 = sentences[i + 1];

    // Check prefix match
    const prefix = s1.text.slice(0, prefixLength);
    if (prefix.length >= prefixLength && s2.text.startsWith(prefix)) {
      // Delete the shorter sentence (usually the first, incorrect one)
      const target = s1.text.length <= s2.text.length ? s1 : s2;
      for (let j = target.startIdx; j <= target.endIdx; j++) {
        indices.push(j);
      }
      logs.push({
        type: 'repeat_sentence',
        idx: [target.startIdx, target.endIdx],
        start: s1.words[0]?.start || 0,
        end: s2.words[s2.words.length - 1]?.end || 0,
        text: `重复: "${s1.text}" vs "${s2.text}"`,
        deleted: target.text,
      });
    }
  }

  return { indices, logs };
}

/**
 * Detect stutter patterns (那个那个, 就是就是)
 */
function detectStutters(words) {
  const indices = [];
  const logs = [];

  // Build full text with indices
  const textParts = [];
  words.forEach((w, i) => {
    if (!w.isGap) {
      textParts.push({ text: w.text, idx: i, start: w.start, end: w.end });
    }
  });

  const fullText = textParts.map(p => p.text).join('');

  for (const pattern of STUTTER_PATTERNS) {
    let pos = 0;
    while ((pos = fullText.indexOf(pattern, pos)) !== -1) {
      // Map character position back to word indices
      let charCount = 0;
      let startIdx = -1;
      let endIdx = -1;
      let startTime = 0;
      let endTime = 0;

      for (const part of textParts) {
        if (charCount <= pos && charCount + part.text.length > pos) {
          startIdx = part.idx;
          startTime = part.start;
        }
        if (charCount <= pos + pattern.length - 1 && charCount + part.text.length > pos + pattern.length - 1) {
          endIdx = part.idx;
          endTime = part.end;
          break;
        }
        charCount += part.text.length;
      }

      if (startIdx >= 0 && endIdx >= 0) {
        // Mark first occurrence for deletion (the repeated part)
        const halfLen = Math.floor(pattern.length / 2);
        let charCount2 = 0;
        let splitIdx = -1;
        for (const part of textParts) {
          if (charCount2 <= pos + halfLen && charCount2 + part.text.length > pos + halfLen) {
            splitIdx = part.idx;
            break;
          }
          charCount2 += part.text.length;
        }

        if (splitIdx >= 0) {
          for (let j = startIdx; j < splitIdx; j++) {
            indices.push(j);
          }
          logs.push({
            type: 'stutter',
            idx: [startIdx, splitIdx - 1],
            start: startTime,
            end: endTime,
            text: pattern,
          });
        }
      }

      pos += 1;
    }
  }

  return { indices, logs };
}

/**
 * Detect incomplete sentences (trailing off with long gap)
 * A sentence that ends with an incomplete word followed by long silence
 */
function detectIncompleteSentences(sentences) {
  const indices = [];
  const logs = [];

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    // If sentence is very short (< 3 chars) and followed by another sentence with similar start
    if (s.text.length < 3 && s.text.length > 0) {
      for (let j = i + 1; j < sentences.length; j++) {
        const next = sentences[j];
        if (next.text.startsWith(s.text)) {
          // s is likely a残句
          for (let k = s.startIdx; k <= s.endIdx; k++) {
            indices.push(k);
          }
          logs.push({
            type: 'incomplete',
            idx: [s.startIdx, s.endIdx],
            start: s.words[0]?.start || 0,
            end: s.words[s.words.length - 1]?.end || 0,
            text: s.text,
          });
          break;
        }
      }
    }
  }

  return { indices, logs };
}

/**
 * Detect self-corrections
 * Pattern: "A...不对...B" or "A...不是...B"
 * Delete the A part
 */
function detectSelfCorrections(sentences) {
  const indices = [];
  const logs = [];

  const NEGATION_WORDS = new Set(['不对', '不是', '错了', '应该', '重新']);

  for (let i = 0; i < sentences.length - 1; i++) {
    const s1 = sentences[i];
    const s2 = sentences[i + 1];

    // Check if s1 contains negation followed by correction
    for (const neg of NEGATION_WORDS) {
      const negPos = s1.text.indexOf(neg);
      if (negPos > 0) {
        // Delete the part before negation
        let charCount = 0;
        let splitIdx = -1;
        for (const w of s1.words) {
          if (charCount + w.text.length > negPos) {
            splitIdx = w.idx;
            break;
          }
          charCount += w.text.length;
        }

        if (splitIdx >= 0) {
          for (let k = s1.startIdx; k < splitIdx; k++) {
            indices.push(k);
          }
          logs.push({
            type: 'self_correction',
            idx: [s1.startIdx, splitIdx - 1],
            start: s1.words[0]?.start || 0,
            end: s1.words.find(w => w.idx === splitIdx - 1)?.end || 0,
            text: s1.text,
          });
        }
      }
    }

    // Also detect: s1 and s2 share prefix, s2 is the corrected version
    if (s1.text.length > 3 && s2.text.length > s1.text.length) {
      const prefix = s1.text.slice(0, Math.min(s1.text.length - 1, 4));
      if (s2.text.startsWith(prefix) && s2.text !== s1.text) {
        // s2 might be a correction, but we need more evidence
        // Skip for now - this requires semantic understanding
      }
    }
  }

  return { indices, logs };
}

/**
 * Export analysis results to human-readable format
 */
function exportReadable(words, analysis, outputPath) {
  const lines = [];
  lines.push('# 口误分析报告\n');
  lines.push(`| 时间 | 类型 | 内容 | 处理 |`);
  lines.push(`|------|------|------|------|`);

  for (const item of analysis) {
    const typeLabels = {
      silence: '静音',
      filler: '语气词',
      consecutive_filler: '连续语气词',
      repeat_sentence: '重复句',
      stutter: '卡顿词',
      incomplete: '残句',
      self_correction: '重说纠正',
    };

    const time = `${item.start?.toFixed(2) || 0}-${item.end?.toFixed(2) || 0}`;
    const type = typeLabels[item.type] || item.type;
    const text = item.text || '';

    lines.push(`| ${time} | ${type} | ${text} | 删 |`);
  }

  lines.push(`\n**总计: ${analysis.length} 处**`);
  fs.writeFileSync(outputPath, lines.join('\n'));
}

module.exports = { analyze, exportReadable };
