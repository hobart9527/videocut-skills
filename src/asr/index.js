/**
 * ASR Provider Factory
 */

const config = require('../config');
const { CloudASR } = require('./cloud');
const { VolcengineASR } = require('./volcengine');
const { WhisperASR } = require('./whisper');

function createProvider(providerName) {
  const name = providerName || config.get('asr.provider') || 'volcengine';

  switch (name) {
    case 'cloud':
      return new CloudASR(config.get('asr.cloud') || {});

    case 'volcengine':
      return new VolcengineASR(config.get('asr.volcengine') || {});

    case 'whisper':
      return new WhisperASR(config.get('asr.whisper') || {});

    default:
      throw new Error(`Unknown ASR provider: ${name}. Available: cloud, volcengine, whisper`);
  }
}

module.exports = { createProvider };
