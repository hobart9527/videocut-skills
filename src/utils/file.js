/**
 * File utilities
 */

const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function findVideoInDir(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  const video = files.find(f => /\.(mp4|mov|mkv|avi)$/i.test(f));
  return video ? path.join(dir, video) : null;
}

function createOutputDir(videoPath, baseDir = './output') {
  const videoName = path.basename(videoPath, path.extname(videoPath));
  const date = new Date().toISOString().slice(0, 10);
  const dir = path.join(baseDir, `${date}_${videoName}`);
  ensureDir(dir);
  return dir;
}

function getSubDirs(baseDir) {
  const dirs = {
    transcribe: path.join(baseDir, '1_转录'),
    analyze: path.join(baseDir, '2_分析'),
    review: path.join(baseDir, '3_审核'),
    subtitle: path.join(baseDir, '字幕'),
    output: path.join(baseDir, '3_输出'),
  };
  Object.values(dirs).forEach(ensureDir);
  return dirs;
}

module.exports = {
  ensureDir,
  findVideoInDir,
  createOutputDir,
  getSubDirs,
};
