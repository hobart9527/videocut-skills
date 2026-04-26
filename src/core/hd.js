/**
 * HD export command: 2-pass encoding + sharpening
 */

const { execSync } = require('child_process');
const path = require('path');
const chalk = require('chalk');

async function hdCommand(videoPath, options = {}) {
  const multiplier = parseFloat(options.multiplier) || 1.2;
  const outputPath = options.output || videoPath.replace(/\.[^.]+$/, '_hd.mp4');
  const sharpen = options.sharpen !== false;

  console.log(chalk.blue('\n🎬 videocut: hd export'));
  console.log(chalk.gray(`   Input: ${videoPath}`));
  console.log(chalk.gray(`   Output: ${outputPath}`));
  console.log(chalk.gray(`   Bitrate multiplier: ${multiplier}x`));
  console.log(chalk.gray(`   Sharpen: ${sharpen ? 'yes' : 'no'}`));

  // Probe video
  const duration = parseFloat(
    execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "file:${videoPath}"`, { encoding: 'utf8' }).trim()
  );
  const bitrate = parseInt(
    execSync(`ffprobe -v error -show_entries stream=bit_rate -select_streams v:0 -of csv=p=0 "file:${videoPath}"`, { encoding: 'utf8' }).trim()
  );
  const profile = execSync(`ffprobe -v error -show_entries stream=profile -select_streams v:0 -of csv=p=0 "file:${videoPath}"`, { encoding: 'utf8' }).trim();
  const pixFmt = execSync(`ffprobe -v error -show_entries stream=pix_fmt -select_streams v:0 -of csv=p=0 "file:${videoPath}"`, { encoding: 'utf8' }).trim();

  const bitrateK = Math.round(bitrate / 1000 * multiplier);
  const maxrateK = Math.round(bitrateK * 1.3);
  const bufsizeK = bitrateK * 2;

  const profileMap = { high: 'high', main: 'main', baseline: 'baseline' };
  const x264Profile = profileMap[profile.toLowerCase()] || 'high';

  const vfFilter = sharpen ? 'unsharp=5:5:0.3:5:5:0.3' : null;

  console.log(chalk.gray(`   Source: ${bitrate / 1000}kbps, ${profile}, ${pixFmt}`));
  console.log(chalk.gray(`   Target: ${bitrateK}kbps\n`));

  // Pass 1
  console.log(chalk.yellow('Pass 1/2: Analyzing...'));
  const passlog = `/tmp/ffmpeg2pass_${Date.now()}`;
  const pass1Args = [
    '-y', '-v', 'error', '-stats',
    '-i', `file:${videoPath}`,
    ...(vfFilter ? ['-vf', vfFilter] : []),
    '-c:v', 'libx264', '-profile:v', x264Profile,
    '-b:v', `${bitrateK}k`, '-preset', 'slow',
    '-pix_fmt', pixFmt,
    '-pass', '1', '-passlogfile', passlog,
    '-an', '-f', 'null',
    process.platform === 'win32' ? 'NUL' : '/dev/null',
  ];

  execSync(`ffmpeg ${pass1Args.map(a => `"${a}"`).join(' ')}`, { stdio: 'inherit', shell: true });

  // Pass 2
  console.log(chalk.yellow('\nPass 2/2: Encoding...'));
  const pass2Args = [
    '-y', '-v', 'error', '-stats',
    '-i', `file:${videoPath}`,
    ...(vfFilter ? ['-vf', vfFilter] : []),
    '-c:v', 'libx264', '-profile:v', x264Profile,
    '-b:v', `${bitrateK}k`,
    '-maxrate', `${maxrateK}k`,
    '-bufsize', `${bufsizeK}k`,
    '-preset', 'slow',
    '-pix_fmt', pixFmt,
    '-pass', '2', '-passlogfile', passlog,
    '-c:a', 'copy',
    '-movflags', '+faststart',
    `file:${outputPath}`,
  ];

  execSync(`ffmpeg ${pass2Args.map(a => `"${a}"`).join(' ')}`, { stdio: 'inherit', shell: true });

  // Cleanup pass log
  try {
    const logPrefix = passlog;
    ['-0.log', '-0.log.mbtree'].forEach(suffix => {
      try { require('fs').unlinkSync(logPrefix + suffix); } catch {}
    });
  } catch {}

  // Stats
  const newBitrate = parseInt(
    execSync(`ffprobe -v error -show_entries stream=bit_rate -select_streams v:0 -of csv=p=0 "file:${outputPath}"`, { encoding: 'utf8' }).trim()
  );

  console.log(chalk.green('\n✅ HD export complete!'));
  console.log(chalk.gray(`   Bitrate: ${bitrate / 1000}kbps -> ${newBitrate / 1000}kbps`));
  console.log(chalk.gray(`   Output: ${outputPath}`));

  return outputPath;
}

module.exports = { hdCommand };
