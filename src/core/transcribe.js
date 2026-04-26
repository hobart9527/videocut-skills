/**
 * Transcription pipeline
 * Extract audio -> ASR -> Generate subtitles_words.json
 */

const fs = require('fs');
const path = require('path');
const { extractAudio } = require('../utils/ffmpeg');
const { createProvider } = require('../asr');

/**
 * Generate subtitles_words.json with gap markers from ASR result
 * @param {string} videoPath - Input video file
 * @param {Object} options - Options
 * @returns {Promise<string>} - Path to subtitles_words.json
 */
async function transcribe(videoPath, options = {}) {
  const provider = createProvider(options.asr);

  // Handle --no-upload: skip audio upload
  if (options.upload === false && provider.uploadService !== undefined) {
    provider.uploadService = 'none';
  }

  // Check availability
  const available = await provider.isAvailable();
  if (!available) {
    throw new Error(`ASR provider '${provider.name}' is not available.`);
  }

  const outputFile = options.output || 'subtitles_words.json';

  // Run transcription
  const result = await provider.transcribe(videoPath);

  // Add gap markers
  const wordsWithGaps = addGapMarkers(result.words);

  fs.writeFileSync(outputFile, JSON.stringify(wordsWithGaps, null, 2));
  console.log(`Saved: ${outputFile} (${wordsWithGaps.length} elements)`);

  return outputFile;
}

/**
 * Add silence gap markers between words
 */
function addGapMarkers(words) {
  const result = [];
  let lastEnd = 0;

  for (const word of words) {
    const gapDuration = word.start - lastEnd;

    if (gapDuration > 0.1) {
      if (gapDuration > 0.5) {
        // Split long gaps into 1-second chunks
        let gapStart = lastEnd;
        while (gapStart < word.start) {
          const gapEnd = Math.min(gapStart + 1, word.start);
          result.push({
            text: '',
            start: Math.round(gapStart * 100) / 100,
            end: Math.round(gapEnd * 100) / 100,
            isGap: true,
          });
          gapStart = gapEnd;
        }
      } else {
        result.push({
          text: '',
          start: Math.round(lastEnd * 100) / 100,
          end: Math.round(word.start * 100) / 100,
          isGap: true,
        });
      }
    }

    result.push({
      text: word.text,
      start: word.start,
      end: word.end,
      isGap: false,
    });
    lastEnd = word.end;
  }

  return result;
}

module.exports = { transcribe, addGapMarkers };
