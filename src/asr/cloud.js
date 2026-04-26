/**
 * Generic Cloud ASR Provider
 * Supports any ASR service with submit + poll query workflow.
 *
 * Presets:
 *   - volcengine (ByteDance openspeech)
 *   - custom (fully configurable)
 */

const fs = require('fs');
const { execSync } = require('child_process');
const { ASRProvider } = require('./base');

const defaults = {
  providerName: 'cloud',
  baseURL: '',
  apiKey: '',
  apiKeyHeader: 'Authorization',
  submitPath: '/submit',
  queryPath: '/query',
  submitMethod: 'POST',
  queryMethod: 'GET',
  language: 'zh-CN',
  extraQuery: {},
  extraHeaders: {},
  bodyTemplate: null,
  pollInterval: 5000,
  maxAttempts: 120,
  successCode: 0,
  pendingCode: null,
  taskIdPath: 'id',
  resultPath: 'utterances',
  wordsPath: 'words',
  textField: 'text',
  startField: 'start_time',
  endField: 'end_time',
  timeUnit: 1000,
  uploadService: 'uguu',
};

class CloudASR extends ASRProvider {
  constructor(options = {}) {
    super(options);
    Object.assign(this, defaults, options);
  }

  get name() {
    return this.providerName;
  }

  async isAvailable() {
    return !!this.apiKey && !!this.baseURL;
  }

  async transcribe(audioPath) {
    if (!this.apiKey || !this.baseURL) {
      throw new Error(
        'Cloud ASR not configured. Run:\n' +
        '  videocut config set asr.cloud.baseURL <url>\n' +
        '  videocut config set asr.cloud.apiKey <key>'
      );
    }

    let actualAudioPath = audioPath;
    if (/\.(mp4|mov|mkv|avi|wmv|flv)$/i.test(audioPath)) {
      const tmpAudio = `/tmp/videocut_audio_${Date.now()}.mp3`;
      console.log('Extracting audio...');
      execSync(
        `ffmpeg -y -i "file:${audioPath}" -vn -acodec libmp3lame -q:a 2 "${tmpAudio}"`,
        { stdio: 'pipe' }
      );
      actualAudioPath = tmpAudio;
    }

    const audioURL = await this._uploadAudio(actualAudioPath);

    console.log('Submitting transcription job...');
    const taskId = await this._submitJob(audioURL);
    console.log(`Task submitted: ${taskId}, waiting...`);

    const result = await this._pollResult(taskId);
    return this._normalizeResult(result);
  }

  async _uploadAudio(audioPath) {
    if (this.uploadService === 'none') {
      return audioPath; // assume direct file path is accepted
    }

    if (this.uploadService === 'uguu') {
      try {
        const cmd = `curl -s -F "files[]=@${audioPath}" https://uguu.se/upload`;
        const res = JSON.parse(execSync(cmd, { encoding: 'utf8', timeout: 120000 }));
        if (res.success && res.files?.[0]?.url) {
          return res.files[0].url;
        }
      } catch {
        console.warn('uguu.se upload failed, trying file.io...');
      }
    }

    // Fallback / default: file.io
    try {
      const cmd = `curl -s -F "file=@${audioPath}" https://file.io`;
      const res = JSON.parse(execSync(cmd, { encoding: 'utf8', timeout: 120000 }));
      if (res.link) return res.link;
    } catch {
      throw new Error('Failed to upload audio. Check your network or set uploadService to none.');
    }
  }

  async _submitJob(audioURL) {
    const hotWords = this._loadHotWords();
    const body = this.bodyTemplate
      ? this.bodyTemplate(audioURL, hotWords)
      : { url: audioURL, ...(hotWords.length ? { hot_words: hotWords } : {}) };

    const query = new URLSearchParams({
      language: this.language,
      ...this.extraQuery,
    }).toString();

    const headers = [
      '-H', 'Accept: */*',
      '-H', `${this.apiKeyHeader}: ${this.apiKey}`,
      '-H', 'content-type: application/json',
      ...Object.entries(this.extraHeaders).flatMap(([k, v]) => ['-H', `${k}: ${v}`]),
    ];

    // Write body to temp file to avoid shell escaping issues with single quotes
    const bodyFile = `/tmp/videocut_body_${Date.now()}.json`;
    fs.writeFileSync(bodyFile, JSON.stringify(body));

    const cmd = `curl -s -L -X ${this.submitMethod} "${this.baseURL}${this.submitPath}?${query}" ${headers.map(h => `"${h}"`).join(' ')} -d "@${bodyFile}"`;
    const res = JSON.parse(execSync(cmd, { encoding: 'utf8', timeout: 60000 }));

    try { fs.unlinkSync(bodyFile); } catch {}

    const taskId = this._getPath(res, this.taskIdPath);
    if (!taskId) {
      throw new Error(`Submission failed: ${JSON.stringify(res)}`);
    }
    return taskId;
  }

  async _pollResult(taskId) {
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      await sleep(this.pollInterval);
      process.stdout.write('.');

      const query = new URLSearchParams({ id: taskId }).toString();
      const headers = [
        '-H', 'Accept: */*',
        '-H', `${this.apiKeyHeader}: ${this.apiKey}`,
        ...Object.entries(this.extraHeaders).flatMap(([k, v]) => ['-H', `${k}: ${v}`]),
      ];

      const cmd = `curl -s -L -X ${this.queryMethod} "${this.baseURL}${this.queryPath}?${query}" ${headers.map(h => `"${h}"`).join(' ')}`;
      const res = JSON.parse(execSync(cmd, { encoding: 'utf8', timeout: 30000 }));

      const code = res.code ?? res.status ?? res.error_code ?? 0;
      if (code === this.successCode) {
        process.stdout.write('\n');
        const items = this._getPath(res, this.resultPath) || [];
        console.log(`Transcription complete: ${items.length} utterances`);
        return res;
      }
      if (this.pendingCode !== null && code !== this.pendingCode) {
        throw new Error(`Transcription failed: ${JSON.stringify(res)}`);
      }
    }
    throw new Error('Transcription timeout');
  }

  _normalizeResult(result) {
    const words = [];
    const items = this._getPath(result, this.resultPath) || [];

    for (const item of items) {
      const wordList = this.wordsPath ? this._getPath(item, this.wordsPath) : [item];
      for (const w of wordList || []) {
        words.push({
          text: this._getPath(w, this.textField),
          start: (this._getPath(w, this.startField) || 0) / this.timeUnit,
          end: (this._getPath(w, this.endField) || 0) / this.timeUnit,
        });
      }
    }
    return { words, raw: result };
  }

  _getPath(obj, path) {
    if (!path) return obj;
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }

  _loadHotWords() {
    const dictPaths = [
      '字幕/词典.txt',
      './字幕/词典.txt',
      '../字幕/词典.txt',
    ];
    for (const p of dictPaths) {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, 'utf8')
          .split('\n')
          .map(l => l.trim())
          .filter(l => l.length > 0);
      }
    }
    return [];
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { CloudASR };
