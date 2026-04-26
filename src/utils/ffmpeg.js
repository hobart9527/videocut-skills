/**
 * FFmpeg utilities
 */

const { execSync } = require('child_process');
const path = require('path');

function extractAudio(videoPath, outputPath) {
  execSync(
    `ffmpeg -y -i "file:${videoPath}" -vn -acodec libmp3lame -q:a 2 "${outputPath}"`,
    { stdio: 'pipe' }
  );
}

function getVideoInfo(videoPath) {
  const duration = parseFloat(
    execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "file:${videoPath}"`, { encoding: 'utf8' }).trim()
  );
  const bitrate = parseInt(
    execSync(`ffprobe -v error -show_entries stream=bit_rate -select_streams v:0 -of csv=p=0 "file:${videoPath}"`, { encoding: 'utf8' }).trim()
  );
  const profile = execSync(`ffprobe -v error -show_entries stream=profile -select_streams v:0 -of csv=p=0 "file:${videoPath}"`, { encoding: 'utf8' }).trim();
  const pixFmt = execSync(`ffprobe -v error -show_entries stream=pix_fmt -select_streams v:0 -of csv=p=0 "file:${videoPath}"`, { encoding: 'utf8' }).trim();

  return { duration, bitrate, profile, pixFmt };
}

function detectEncoder() {
  const platform = process.platform;
  const candidates = [];

  if (platform === 'darwin') {
    candidates.push({ name: 'h264_videotoolbox', args: '-q:v 60', label: 'VideoToolbox' });
  } else if (platform === 'linux') {
    candidates.push({ name: 'h264_nvenc', args: '-preset p4 -cq 20', label: 'NVENC' });
    candidates.push({ name: 'h264_vaapi', args: '-qp 20', label: 'VAAPI' });
  } else if (platform === 'win32') {
    candidates.push({ name: 'h264_nvenc', args: '-preset p4 -cq 20', label: 'NVENC' });
    candidates.push({ name: 'h264_qsv', args: '-global_quality 20', label: 'QSV' });
    candidates.push({ name: 'h264_amf', args: '-quality balanced', label: 'AMF' });
  }

  // Software fallback
  candidates.push({ name: 'libx264', args: '-preset fast -crf 18', label: 'x264 (software)' });

  for (const enc of candidates) {
    try {
      execSync(`ffmpeg -hide_banner -encoders 2>/dev/null | grep ${enc.name}`, { stdio: 'pipe' });
      return enc;
    } catch {
      // Not available
    }
  }

  return candidates[candidates.length - 1];
}

function executeCut(input, deleteList, output, options = {}) {
  const BUFFER_MS = options.bufferMs || 120;
  const CROSSFADE_MS = options.crossfadeMs || 30;
  const info = getVideoInfo(input);
  const duration = info.duration;

  // Expand and merge delete ranges
  const expandedDelete = deleteList
    .map(seg => ({
      start: Math.max(0, seg.start),
      end: Math.min(duration, seg.end),
    }))
    .sort((a, b) => a.start - b.start);

  const MERGE_GAP = 0.2;
  const mergedDelete = [];
  for (const seg of expandedDelete) {
    if (mergedDelete.length === 0 || seg.start > mergedDelete[mergedDelete.length - 1].end + MERGE_GAP) {
      mergedDelete.push({ ...seg });
    } else {
      mergedDelete[mergedDelete.length - 1].end = Math.max(mergedDelete[mergedDelete.length - 1].end, seg.end);
    }
  }

  // Compute keep segments
  const keepSegments = [];
  let cursor = 0;
  for (const del of mergedDelete) {
    if (del.start > cursor) {
      keepSegments.push({ start: cursor, end: del.start });
    }
    cursor = del.end;
  }
  if (cursor < duration) {
    keepSegments.push({ start: cursor, end: duration });
  }

  if (keepSegments.length === 0) {
    throw new Error('Nothing to keep! All video would be deleted.');
  }

  // Build filter_complex
  const crossfadeSec = CROSSFADE_MS / 1000;
  const filters = [];
  let vconcat = '';

  for (let i = 0; i < keepSegments.length; i++) {
    const seg = keepSegments[i];
    filters.push(`[0:v]trim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
    filters.push(`[0:a]atrim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`);
    vconcat += `[v${i}]`;
  }

  filters.push(`${vconcat}concat=n=${keepSegments.length}:v=1:a=0[outv]`);

  if (keepSegments.length === 1) {
    filters.push(`[a0]anull[outa]`);
  } else {
    let currentLabel = 'a0';
    for (let i = 1; i < keepSegments.length; i++) {
      const nextLabel = `a${i}`;
      const outLabel = (i === keepSegments.length - 1) ? 'outa' : `amid${i}`;
      filters.push(`[${currentLabel}][${nextLabel}]acrossfade=d=${crossfadeSec.toFixed(3)}:c1=tri:c2=tri[${outLabel}]`);
      currentLabel = outLabel;
    }
  }

  const encoder = detectEncoder();
  const filterComplex = filters.join(';');

  const cmd = `ffmpeg -y -i "file:${input}" -filter_complex "${filterComplex}" -map "[outv]" -map "[outa]" -c:v ${encoder.name} ${encoder.args} -c:a aac -b:a 192k "file:${output}"`;

  try {
    execSync(cmd, { stdio: 'inherit' });
    return { output, keepSegments, mergedDelete, encoder };
  } catch (err) {
    // Fallback to segment-based cutting
    return executeCutFallback(input, keepSegments, output);
  }
}

function executeCutFallback(input, keepSegments, output) {
  const fs = require('fs');
  const tmpDir = `/tmp/videocut_${Date.now()}`;
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    const encoder = detectEncoder();
    const partFiles = [];

    keepSegments.forEach((seg, i) => {
      const partFile = path.join(tmpDir, `part${i.toString().padStart(4, '0')}.mp4`);
      const segDuration = seg.end - seg.start;
      const cmd = `ffmpeg -y -ss ${seg.start.toFixed(3)} -i "file:${input}" -t ${segDuration.toFixed(3)} -c:v ${encoder.name} ${encoder.args} -c:a aac -b:a 128k -avoid_negative_ts make_zero "${partFile}"`;

      console.log(`Cutting segment ${i + 1}/${keepSegments.length}: ${seg.start.toFixed(2)}s - ${seg.end.toFixed(2)}s`);
      execSync(cmd, { stdio: 'pipe' });
      partFiles.push(partFile);
    });

    const listFile = path.join(tmpDir, 'list.txt');
    const listContent = partFiles.map(f => `file '${path.resolve(f)}'`).join('\n');
    fs.writeFileSync(listFile, listContent);

    const concatCmd = `ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${output}"`;
    console.log('Merging segments...');
    execSync(concatCmd, { stdio: 'pipe' });

    return { output, keepSegments, mergedDelete: [], encoder };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function burnSubtitle(videoPath, srtPath, outputPath, style = 'default') {
  const styles = {
    default: "FontSize=22,FontName=PingFang SC,Bold=1,PrimaryColour=&H0000deff,OutlineColour=&H00000000,Outline=2,Alignment=2,MarginV=30",
    minimal: "FontSize=18,FontName=PingFang SC,Bold=0,PrimaryColour=&H00ffffff,OutlineColour=&H00000000,Outline=1,Alignment=2,MarginV=20",
  };

  const styleStr = styles[style] || styles.default;

  const cmd = `ffmpeg -y -i "file:${videoPath}" -vf "subtitles='${srtPath}':force_style='${styleStr}'" -c:a copy -y "file:${outputPath}"`;
  execSync(cmd, { stdio: 'inherit' });
}

module.exports = {
  extractAudio,
  getVideoInfo,
  detectEncoder,
  executeCut,
  burnSubtitle,
};
