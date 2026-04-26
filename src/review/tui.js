/**
 * Terminal UI review mode
 * Interactive review in terminal using readline (no browser needed)
 */

const readline = require('readline');
const chalk = require('chalk');

/**
 * Run terminal-based interactive review
 * @param {Array} words - subtitles_words.json
 * @param {Array} autoSelected - indices pre-selected by AI
 * @returns {Promise<Array>} - final delete segments list
 */
async function runTUIReview(words, autoSelected) {
  const selected = new Set(autoSelected);
  const pageSize = 20;
  let currentPage = 0;

  const totalPages = Math.ceil(words.length / pageSize);

  console.log(chalk.blue('\n┌─ 终端审核模式 ─────────────────────────┐'));
  console.log(chalk.blue('│  ↑/↓ 移动  |  Space 切换选中  |  Enter 确认 │'));
  console.log(chalk.blue('│  PgUp/PgDn 翻页  |  A 全选  |  C 清除  |  Q 退出 │'));
  console.log(chalk.blue('└────────────────────────────────────────┘\n'));

  // Hide cursor
  process.stdout.write('\x1B[?25l');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  return new Promise((resolve) => {
    let cursor = 0; // cursor position on current page
    let exitFlag = false;

    function render() {
      // Clear screen
      process.stdout.write('\x1Bc');

      const start = currentPage * pageSize;
      const end = Math.min(start + pageSize, words.length);

      console.log(chalk.gray(`Page ${currentPage + 1}/${totalPages} | ${selected.size} selected | Cursor: ${cursor}`));
      console.log(chalk.gray('─'.repeat(60)));

      for (let i = start; i < end; i++) {
        const w = words[i];
        const isCursor = (i - start) === cursor;
        const isSelected = selected.has(i);
        const isAI = autoSelected.includes(i);

        const time = `[${w.start.toFixed(2)}-${w.end.toFixed(2)}]`;
        let text = w.isGap ? `(silence ${(w.end - w.start).toFixed(1)}s)` : w.text;
        text = text.slice(0, 30);

        let line = ` ${isCursor ? '>' : ' '} ${isSelected ? '[X]' : '[ ]'} ${time} ${text}`;

        if (isSelected) line = chalk.red(line);
        else if (isAI && !isSelected) line = chalk.yellow(line);
        else line = chalk.white(line);

        if (isCursor) line = chalk.bold(line);

        console.log(line);
      }

      console.log(chalk.gray('─'.repeat(60)));
      console.log(chalk.gray('Space: toggle | Enter: confirm | PgUp/PgDn: page | A: all | C: clear | Q: quit'));
    }

    function moveCursor(delta) {
      const pageItems = Math.min(pageSize, words.length - currentPage * pageSize);
      cursor = Math.max(0, Math.min(pageItems - 1, cursor + delta));
      render();
    }

    function toggleCurrent() {
      const idx = currentPage * pageSize + cursor;
      if (selected.has(idx)) selected.delete(idx);
      else selected.add(idx);
      render();
    }

    function nextPage() {
      if (currentPage < totalPages - 1) {
        currentPage++;
        cursor = 0;
        render();
      }
    }

    function prevPage() {
      if (currentPage > 0) {
        currentPage--;
        cursor = 0;
        render();
      }
    }

    function selectAll() {
      for (let i = 0; i < words.length; i++) selected.add(i);
      render();
    }

    function clearAll() {
      selected.clear();
      render();
    }

    function confirm() {
      exitFlag = true;
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\x1B[?25h'); // show cursor

      const segments = [];
      const sorted = Array.from(selected).sort((a, b) => a - b);
      sorted.forEach(i => {
        segments.push({ start: words[i].start, end: words[i].end });
      });

      // Merge adjacent
      const merged = [];
      for (const seg of segments) {
        if (merged.length === 0) merged.push({ ...seg });
        else {
          const last = merged[merged.length - 1];
          if (seg.start - last.end < 0.2) last.end = seg.end;
          else merged.push({ ...seg });
        }
      }

      console.log(chalk.green(`\n✓ Confirmed: ${merged.length} segments to delete`));
      resolve(merged);
    }

    function quit() {
      exitFlag = true;
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\x1B[?25h');
      console.log(chalk.yellow('\n✗ Cancelled'));
      resolve([]);
    }

    process.stdin.on('keypress', (str, key) => {
      if (exitFlag) return;

      if (key.name === 'up') moveCursor(-1);
      else if (key.name === 'down') moveCursor(1);
      else if (key.name === 'space') toggleCurrent();
      else if (key.name === 'return' || key.name === 'enter') confirm();
      else if (key.name === 'pageup') prevPage();
      else if (key.name === 'pagedown') nextPage();
      else if (key.name === 'a' || key.name === 'A') selectAll();
      else if (key.name === 'c' || key.name === 'C') clearAll();
      else if (key.name === 'q' || key.name === 'Q') quit();
      else if (key.name === 'c' && key.ctrl) quit();
    });

    render();
  });
}

module.exports = { runTUIReview };
