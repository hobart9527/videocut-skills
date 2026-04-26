/**
 * Local Whisper ASR Provider (stub)
 * Requires whisper.cpp or faster-whisper to be installed
 */

const { execSync } = require('child_process');
const { ASRProvider } = require('./base');

class WhisperASR extends ASRProvider {
  constructor(options = {}) {
    super(options);
    this.model = options.model || 'large-v3';
    this.localPath = options.localPath || '';
  }

  get name() {
    return 'whisper';
  }

  async isAvailable() {
    try {
      execSync('which whisper', { stdio: 'pipe' });
      return true;
    } catch {
      try {
        execSync('which whisper.cpp', { stdio: 'pipe' });
        return true;
      } catch {
        return false;
      }
    }
  }

  async transcribe(audioPath) {
    // TODO: Implement using whisper.cpp or faster-whisper
    // For now, provide a helpful error with installation instructions
    const available = await this.isAvailable();
    if (!available) {
      throw new Error(
        'Whisper is not installed. To use local Whisper:\n' +
        '  1. Install whisper.cpp: brew install whisper.cpp\n' +
        '  2. Or install faster-whisper: pip install faster-whisper\n' +
        '  3. Then download model: whisper-cpp-download-ggml-model large-v3\n' +
        '  4. Set model path: videocut config set asr.whisper.localPath /path/to/model'
      );
    }

    // Placeholder for actual implementation
    throw new Error('Whisper ASR implementation is in progress. Please use --asr cloud or --asr volcengine for now.');
  }
}

module.exports = { WhisperASR };
