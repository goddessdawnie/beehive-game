import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installedGames,enabledGames,renderGameRegistry} from '../js/game-registry.js';
test('registry preserves existing games by default and ignores unknown executable names',()=>{
 assert.deepEqual([...enabledGames([])],installedGames);
 const set=enabledGames([{game_key:'sudoku',enabled:false},{game_key:'javascript:alert(1)',enabled:true}]);
 assert.equal(set.has('sudoku'),false);assert.equal(set.has('javascript:alert(1)'),false);
});
test('disabling the active game closes its panel and disables its menu button; enabling restores it',()=>{
 const nodes=new Map();
 for(const id of ['play-library',...installedGames.flatMap(key=>['open-'+key,'play-'+key])]){
  const classes=new Set(id.startsWith('play-')&&id!=='play-sudoku'?['hidden']:[]);
  nodes.set(id,{disabled:false,classList:{contains:k=>classes.has(k),add:k=>classes.add(k),remove:k=>classes.delete(k),toggle(k,on){on?classes.add(k):classes.delete(k);}}});
 }
 const doc={getElementById:id=>nodes.get(id)};
 renderGameRegistry(doc,enabledGames([{game_key:'sudoku',enabled:false}]));
 assert.equal(nodes.get('open-sudoku').disabled,true);
 assert.equal(nodes.get('open-sudoku').classList.contains('game-registry-hidden'),true);
 assert.equal(nodes.get('play-sudoku').classList.contains('hidden'),true);
 assert.equal(nodes.get('play-library').classList.contains('hidden'),false);
 renderGameRegistry(doc,enabledGames([]));assert.equal(nodes.get('open-sudoku').disabled,false);
});
