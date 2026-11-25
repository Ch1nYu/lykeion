// Run after Lykeion.start; the original note remains available even without this enhancement.
document.addEventListener('DOMContentLoaded', () => {
  for (const note of document.querySelectorAll('.chapter .prose .note')) {
    if (note.closest('details')) continue;
    const details = document.createElement('details');
    details.className = 'reading-note';
    const summary = document.createElement('summary');
    const first = note.textContent.trim().split('\n')[0];
    summary.textContent = first.length <= 40 ? first : '補充提醒';
    note.before(details);
    details.append(summary, note);
  }
});
