/**
 * Subtitle command: transcribe -> review -> burn
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { createOutputDir } = require('../utils/file');
const { burnSubtitle } = require('../utils/ffmpeg');
const { createProvider } = require('../asr');

async function subtitleCommand(videoPath, options = {}) {
  const videoName = path.basename(videoPath, path.extname(videoPath));
  const baseDir = path.join(createOutputDir(videoPath), '字幕');
  if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });

  const outputPath = options.output || path.join(baseDir, `${videoName}_字幕.mp4`);

  console.log(chalk.blue('\n📜 videocut: subtitle'));
  console.log(chalk.gray(`   Video: ${videoPath}`));
  console.log(chalk.gray(`   Output: ${outputPath}`));

  // Step 1: Transcribe (if no SRT provided)
  let srtPath = options.srt;

  if (!srtPath) {
    console.log(chalk.yellow('Step 1/3: Transcribing...'));
    const provider = createProvider();
    const result = await provider.transcribe(videoPath);

    // Convert words to sentence-level SRT
    const sentences = wordsToSentences(result.words);
    const srtContent = generateSRT(sentences);
    srtPath = path.join(baseDir, `${videoName}.srt`);
    fs.writeFileSync(srtPath, srtContent);
    console.log(chalk.green(`SRT saved: ${srtPath}`));

    // Also save editable JSON
    fs.writeFileSync(
      path.join(baseDir, `${videoName}_subtitles.json`),
      JSON.stringify(sentences, null, 2)
    );
  }

  // Step 2: Review (optional, could add TUI here)
  console.log(chalk.yellow('Step 2/3: Review SRT (optional, edit file directly)'));

  // Step 3: Burn
  console.log(chalk.yellow('Step 3/3: Burning subtitles...'));

  burnSubtitle(videoPath, srtPath, outputPath, options.style);

  console.log(chalk.green('\n✅ Done!'));
  console.log(chalk.gray(`   Output: ${outputPath}`));

  return outputPath;
}

function wordsToSentences(words) {
  const sentences = [];
  let current = { text: '', start: 0, end: 0 };

  for (const w of words) {
    if (w.isGap && w.end - w.start > 0.5) {
      if (current.text) {
        sentences.push({ ...current });
        current = { text: '', start: 0, end: 0 };
      }
    } else if (!w.isGap) {
      if (!current.text) current.start = w.start;
      current.text += w.text;
      current.end = w.end;
    }
  }

  if (current.text) sentences.push(current);
  return sentences;
}

function generateSRT(sentences) {
  return sentences.map((s, i) => {
    const start = formatSrtTime(s.start);
    const end = formatSrtTime(s.end);
    return `${i + 1}\n${start} --> ${end}\n${s.text}\n`;
  }).join('\n');
}

function formatSrtTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function pad(n, len = 2) {
  return n.toString().padStart(len, '0');
}

module.exports = { subtitleCommand };
