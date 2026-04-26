/**
 * ASR Provider Base Class
 */

class ASRProvider {
  constructor(options = {}) {
    this.options = options;
  }

  /**
   * Transcribe audio file to structured result
   * @param {string} audioPath - Path to audio file
   * @returns {Promise<{words: Array<{text, start, end}>}>}
   */
  async transcribe(audioPath) {
    throw new Error('transcribe() must be implemented');
  }

  /**
   * Check if this provider is available (dependencies, API keys, etc.)
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    return true;
  }

  /**
   * Provider name
   * @returns {string}
   */
  get name() {
    return 'base';
  }
}

module.exports = { ASRProvider };
