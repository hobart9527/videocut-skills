/**
 * Main cut command - orchestrate the full pipeline
 * Transcribe -> Analyze -> Review -> Cut
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const { createOutputDir, getSubDirs } = require('../utils/file');
const { executeCut } = require('../utils/ffmpeg');
const { transcribe } = require('./transcribe');
const { analyze, exportReadable } = require('./analyze');
const { generateReviewHTML } = require('../review/web');
const { runTUIReview } = require('../review/tui');
const { generateReport } = require('../review/report');

async function cutCommand(videoPath, options = {}) {
  const spinner = ora();

  // Validate input
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  const videoName = path.basename(videoPath, path.extname(videoPath));
  const baseDir = options.output
    ? path.join(options.output, '剪口播')
    : path.join(createOutputDir(videoPath), '剪口播');

  const dirs = getSubDirs(baseDir);

  console.log(chalk.blue('\n🎬 videocut: 剪口播'));
  console.log(chalk.gray(`   Video: ${videoPath}`));
  console.log(chalk.gray(`   Output: ${baseDir}`));
  console.log(chalk.gray(`   Review mode: ${options.review}`));
  console.log();

  // Step 1: Transcribe
  spinner.start('Step 1/4: Transcribing audio...');
  const transcribeOutput = path.join(dirs.transcribe, 'subtitles_words.json');
  const rawResult = await transcribe(videoPath, {
    asr: options.asr,
    output: transcribeOutput,
    upload: options.upload,
  });
  spinner.succeed(`Transcription complete: ${rawResult}`);

  // Step 2: Analyze
  spinner.start('Step 2/4: Analyzing speech errors...');
  const words = JSON.parse(fs.readFileSync(transcribeOutput, 'utf8'));
  const { indices: autoSelected, analysis, sentences } = analyze(words, {
    silenceThreshold: parseFloat(options.threshold),
  });

  fs.writeFileSync(
    path.join(dirs.analyze, 'auto_selected.json'),
    JSON.stringify(autoSelected, null, 2)
  );

  exportReadable(words, analysis, path.join(dirs.analyze, '口误分析.md'));
  spinner.succeed(`Analysis complete: ${autoSelected.length} segments flagged`);

  // Step 3: Review (mode-dependent)
  let finalDeleteList = [];

  switch (options.review) {
    case 'web': {
      spinner.start('Step 3/4: Generating review webpage...');

      // Create symlink to video in review dir
      const reviewVideoPath = path.join(dirs.review, 'video.mp4');
      if (fs.existsSync(reviewVideoPath)) fs.unlinkSync(reviewVideoPath);
      fs.symlinkSync(path.resolve(videoPath), reviewVideoPath);

      // Generate review HTML
      const htmlPath = path.join(dirs.review, 'review.html');
      generateReviewHTML(words, autoSelected, htmlPath);
      spinner.succeed(`Review page: ${htmlPath}`);

      // Start server and wait for user
      const { startServer } = require('../review/web');
      const deleteList = await startServer(dirs.review, {
        port: options.port || 8899,
        videoPath: reviewVideoPath,
      });

      finalDeleteList = deleteList;
      break;
    }

    case 'tui': {
      spinner.start('Step 3/4: Starting terminal review...');
      spinner.stop();

      finalDeleteList = await runTUIReview(words, autoSelected);
      break;
    }

    case 'auto': {
      console.log(chalk.yellow('Step 3/4: Auto mode - using AI selections directly'));
      finalDeleteList = autoSelected.map(idx => ({
        start: words[idx].start,
        end: words[idx].end,
      }));
      break;
    }

    case 'report': {
      spinner.start('Step 3/4: Generating static report...');

      const reportPath = path.join(baseDir, '..', '审核报告.html');
      generateReport(words, autoSelected, analysis, reportPath);
      spinner.succeed(`Report saved: ${reportPath}`);

      console.log(chalk.green('\n✅ Report generated. Open in browser:'));
      console.log(chalk.blue(`   ${reportPath}`));
      console.log(chalk.yellow('\nNote: Report mode is view-only. To cut video, use --review=web|tui|auto'));

      return { reportPath, autoSelected };
    }

    default:
      throw new Error(`Unknown review mode: ${options.review}. Use web|tui|auto|report`);
  }

  if (finalDeleteList.length === 0) {
    console.log(chalk.yellow('\nNo segments selected for deletion. Skipping cut.'));
    return;
  }

  // Step 4: Cut
  spinner.start(`Step 4/4: Cutting video (${finalDeleteList.length} segments)...`);

  const outputFile = path.join(dirs.review, `${videoName}_cut.mp4`);

  // Save delete list for reference
  fs.writeFileSync(
    path.join(dirs.review, 'delete_segments.json'),
    JSON.stringify(finalDeleteList, null, 2)
  );

  const result = executeCut(videoPath, finalDeleteList, outputFile);

  // Print stats
  const { getVideoInfo } = require('../utils/ffmpeg');
  const originalInfo = getVideoInfo(videoPath);
  const outputInfo = getVideoInfo(outputFile);
  const deletedDuration = originalInfo.duration - outputInfo.duration;
  const savedPercent = ((deletedDuration / originalInfo.duration) * 100).toFixed(1);

  spinner.succeed('Cut complete!');

  console.log(chalk.green('\n✅ Done!'));
  console.log(chalk.gray(`   Input:  ${videoPath}`));
  console.log(chalk.gray(`   Output: ${outputFile}`));
  console.log(chalk.gray(`   Duration: ${originalInfo.duration.toFixed(1)}s → ${outputInfo.duration.toFixed(1)}s`));
  console.log(chalk.gray(`   Deleted: ${deletedDuration.toFixed(1)}s (${savedPercent}%)`));

  return { outputFile, originalInfo, outputInfo };
}

module.exports = { cutCommand };
