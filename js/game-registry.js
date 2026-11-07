// Executable games are installed in source, never loaded from database-provided URLs.
export const installedGames = Object.freeze(['three', 'wordle', 'sudoku', 'wumpus', '2048']);
export function enabledGames(records) {
  const disabled = new Set(records.filter(row => row.enabled === false).map(row => row.game_key));
  return new Set(installedGames.filter(key => !disabled.has(key)));
}
export function renderGameRegistry(document, enabled) {
  for (const key of installedGames) {
    const button = document.getElementById('open-' + key);
    button.classList.toggle('game-registry-hidden', !enabled.has(key));
    button.disabled = !enabled.has(key);
    const panel = document.getElementById('play-' + key);
    if (!enabled.has(key) && !panel.classList.contains('hidden')) {
      panel.classList.add('hidden');
      document.getElementById('play-library').classList.remove('hidden');
    }
  }
}
