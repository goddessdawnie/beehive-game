import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
test('open task editor round-trips optional context independently of due date', () => {
  const start = source.indexOf("button('Edit',()=>{");
  const end = source.indexOf("row.append(form)})", start);
  assert.ok(start >= 0 && end > start, 'open-task edit handler exists');
  const editor = source.slice(start, end);
  for (const field of ['task_location','task_category']) {
    const variable = field === 'task_location' ? 'location' : 'category';
    assert.ok(editor.includes(variable + '.value=t.' + field + "||''"), field + ' loads existing value');
    assert.ok(editor.includes(field + ':' + variable + '.value.trim()||null'), field + ' saves nullable trimmed value');
  }
  assert.ok(editor.includes('locationLabel,categoryLabel'), 'both controls visible in editor');
  assert.ok(editor.includes('due_at:due'), 'real due date retained');
  assert.ok(editor.includes('recurrence_rule:rule'), 'recurrence retained');
  assert.ok(editor.includes('reward_coins:Number(reward.value)'), 'reward retained');
});
