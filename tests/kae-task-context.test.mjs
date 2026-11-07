import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergeRecentTaskActivity} from '../supabase/functions/kae-chat/task-context.js';

const now=Date.parse('2026-11-07T12:00:00Z');
const cutoff=now-48*60*60*1000;
const iso=ms=>new Date(ms).toISOString();
const task=(id,changes={})=>({
 id,title:id,status:'open',updated_at:iso(cutoff+60_000),
 completed_at:null,completion_notes:null,task_origin:'user',...changes
});

test('includes old-created task edited within 48 hours, exact boundary, and excludes prior activity',()=>{
 const old=task('old-created', {updated_at:iso(now-15_000)});
 const boundary=task('at-boundary',{updated_at:iso(cutoff)});
 const expired=task('expired',{updated_at:iso(cutoff-1)});
 const r=mergeRecentTaskActivity([old,boundary,expired],[],cutoff);
 assert.deepEqual(r.tasks.map(t=>t.title),['old-created','at-boundary']);
 assert.equal(r.partial,false);
 assert.equal(r.window_hours,48);
});

test('merges two independently ordered searches; completion cannot disappear behind updates',()=>{
 const recentCompletion=task('completed',{status:'completed',updated_at:iso(cutoff-100000),completed_at:iso(now-15000),completion_notes:'Packed six boxes and cleared the floor'});
 const recentlyEdited=task('updated',{updated_at:iso(now-30000)});
 const r=mergeRecentTaskActivity([recentlyEdited,recentCompletion],[recentCompletion],cutoff);
 assert.deepEqual(r.tasks.map(t=>t.title),['completed','updated']);
 assert.equal(r.tasks.length,2);
 assert.equal(r.tasks[0].completion_notes,'Packed six boxes and cleared the floor');
 assert.equal(r.tasks[0].completed_at,iso(now-15000));
});

test('reopened task is currently open, not a recently completed task',()=>{
 const reopened=task('reopened',{status:'open',updated_at:iso(now-3000),completed_at:iso(now-8000),completion_notes:'Old note'});
 const r=mergeRecentTaskActivity([reopened],[reopened],cutoff);
 assert.equal(r.tasks[0].status,'open');
 assert.equal(r.tasks[0].completed_at,null);
 assert.equal(r.tasks[0].completion_notes,null);
});

test('sorts by actual recent event; deterministic ID tie-break and completion notes clipped',()=>{
 const a=task('a',{status:'completed',updated_at:iso(now-3000),completed_at:iso(now-1000),completion_notes:'z'.repeat(500)});
 const b=task('b',{updated_at:iso(now-1000)});
 const r=mergeRecentTaskActivity([b,a],[a],cutoff);
 assert.deepEqual(r.tasks.map(t=>t.title),['a','b']);
 assert.equal(r.tasks[0].completion_notes.length,350);
});

test('caps output and marks partial at either source cap or merged cap',()=>{
 const fifty=Array.from({length:50},(_,i)=>task('t'+String(i).padStart(2,'0'),{updated_at:iso(now-i*60000)}));
 const r=mergeRecentTaskActivity(fifty.slice(0,41),[],cutoff);
 assert.equal(r.tasks.length,24);
 assert.equal(r.partial,true);
 const smaller=mergeRecentTaskActivity(fifty.slice(0,3),[],cutoff);
 assert.equal(smaller.tasks.length,3);
 assert.equal(smaller.partial,false);
 const fiftyCompleted=fifty.map(x=>({...x,status:'completed',completed_at:x.updated_at}));
 const completionCap=mergeRecentTaskActivity([],fiftyCompleted.slice(0,41),cutoff);
 assert.equal(completionCap.partial,true);
});
