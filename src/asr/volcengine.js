/**
 * Volcengine ASR Provider (preset)
 * Backward-compatible wrapper around CloudASR with ByteDance defaults.
 */

const { CloudASR } = require('./cloud');

class VolcengineASR extends CloudASR {
  constructor(options = {}) {
    super({
      providerName: 'volcengine',
      baseURL: 'https://openspeech.bytedance.com/api/v1/vc',
      apiKeyHeader: 'x-api-key',
      language: options.language || 'zh-CN',
      useItn: options.useItn !== false,
      useCapitalize: options.useCapitalize !== false,
      extraQuery: {
        use_itn: options.useItn !== false,
        use_capitalize: options.useCapitalize !== false,
        max_lines: 1,
        words_per_line: 15,
      },
      successCode: 0,
      pendingCode: 1000,
      ...options,
    });
  }
}

module.exports = { VolcengineASR };
