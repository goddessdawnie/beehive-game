import test from 'node:test';
import assert from 'node:assert/strict';
import { easternCalendarDay, compareCompletedTasks, selectTaskView } from '../js/task-selection.js';

const now=new Date('2026-11-27T03:30:00Z'); // November 26 in New York, November 27 in UTC.
const localMidnightAfterNow=()=>{
 const tomorrow=new Date(now);
 tomorrow.setHours(0,0,0,0);
 tomorrow.setDate(tomorrow.getDate()+1);
 return tomorrow;
};
const record=(id,changes={})=>({
 id,title:id,status:'open',created_at:'2026-11-01T10:00:00Z',
 due_at:null,planned_on:null,task_origin:'user',
 instructions:null,completion_notes:null,task_location:null,task_category:null,
 ...changes
});
const view=(tasks,opts={})=>selectTaskView({tasks,now,possibilityCount:3,...opts});

test('Eastern planned-day uses the actual New York date across UTC midnight and DST',()=>{
 assert.equal(easternCalendarDay(now),'2026-11-26');
 assert.equal(easternCalendarDay(new Date('2026-03-08T06:59:00Z')),'2026-03-08');
 assert.equal(easternCalendarDay(new Date('2026-03-08T07:01:00Z')),'2026-03-08');
 assert.equal(easternCalendarDay(new Date('2026-11-01T05:59:00Z')),'2026-11-01');
 assert.equal(easternCalendarDay(new Date('2026-11-01T06:01:00Z')),'2026-11-01');
});

test('status tabs and counts preserve planned day separate from actual deadline',()=>{
 const boundary=localMidnightAfterNow().getTime();
 const tasks=[
  record('anytime'),
  record('due today',{due_at:new Date(boundary-60000).toISOString()}),
  record('due future',{due_at:new Date(boundary+60000).toISOString()}),
  record('chosen future',{due_at:new Date(boundary+3600000).toISOString(),planned_on:'2026-11-26'}),
  record('other plan',{planned_on:'2026-11-25'}),
  record('done',{status:'completed'}),
  record('cancel',{status:'cancelled'}),
  record('defer',{status:'deferred'})
 ];
 const today=view(tasks,{taskFilter:'today'});
 assert.deepEqual(today.counts,{today:2,anytime:2,completed:3,future:1,possibilities:3});
 assert.deepEqual(new Set(today.visible.map(x=>x.id)),new Set(['due today','chosen future']));
 assert.equal(today.plannedDay,'2026-11-26');
 assert.deepEqual(new Set(view(tasks,{taskFilter:'anytime'}).visible.map(x=>x.id)),new Set(['anytime','other plan']));
 assert.deepEqual(view(tasks,{taskFilter:'future'}).visible.map(x=>x.id),['due future']);
 assert.deepEqual(new Set(view(tasks,{taskFilter:'completed'}).visible.map(x=>x.id)),new Set(['done','cancel','defer']));
 assert.equal(tasks[3].due_at,new Date(boundary+3600000).toISOString(),'Selecting a planned task must not rewrite the due date');
 assert.equal(today.visible.length,2,'Selection does not double-count a task planned today with a due date');
});

test('completed ordering uses completion time, then creation time and stable IDs',()=>{
 const tasks=[
  record('older completed',{status:'completed',completed_at:'2026-11-03T20:00:00Z',created_at:'2026-10-01T10:00:00Z'}),
  record('newest completed',{status:'completed',completed_at:'2026-11-06T20:00:00Z',created_at:'2026-09-01T10:00:00Z'}),
  record('cancelled',{status:'cancelled',created_at:'2026-11-05T10:00:00Z'}),
  record('legacy completed',{status:'completed',completed_at:'bogus',created_at:'2026-10-03T10:00:00Z'}),
  record('deferred',{status:'deferred',created_at:'2026-11-04T10:00:00Z'})
 ];
 const ordered=view(tasks,{taskFilter:'completed'}).visible.map(t=>t.id);
 assert.deepEqual(ordered,['newest completed','older completed','cancelled','deferred','legacy completed']);
 assert.ok(compareCompletedTasks(tasks[1],tasks[0])<0);
 assert.deepEqual(view(tasks,{taskFilter:'completed'}).visible.map(t=>t.id),ordered,'No data mutation on repeated selections');
});

test('search and independent context filters find content across tabs without changing counts',()=>{
 const tasks=[
  record('work',{title:'Change camera IP',instructions:'Legacy network details',task_location:'Florence',task_category:'Technical',task_origin:'bee',created_at:'2026-11-01T10:00:00Z'}),
  record('dragon',{title:'Dust the shelves',instructions:'Before Kae notices',task_location:'Williamsburg',task_category:'Cleaning',task_origin:'kae',created_at:'2026-11-03T10:00:00Z'}),
  record('old',{title:'Completed ticket',completion_notes:'NETWORK resolution',status:'completed',task_location:'Florence',task_category:'Technical',task_origin:'synthesis',created_at:'2026-11-04T10:00:00Z'})
 ];
 const initial=view(tasks,{taskFilter:'anytime'});
 assert.deepEqual(initial.visible.map(t=>t.id),['dragon','work']);
 assert.equal(initial.counts.completed,1);
 const searched=view(tasks,{taskFilter:'today',search:'  netWORK  '});
 assert.equal(searched.searching,true);
 assert.deepEqual(searched.visible.map(t=>t.id),['old','work'],'Search finds instructions and completion notes across all tabs');
 assert.equal(searched.counts.today,0);
 assert.deepEqual(view(tasks,{taskFilter:'anytime',locationFilter:' FLORE ',categoryFilter:'TECH',originFilter:'bee'}).visible.map(t=>t.id),['work']);
 assert.deepEqual(view(tasks,{taskFilter:'completed',originFilter:'unknown'}).visible.map(t=>t.id),['old']);
 assert.deepEqual(view(tasks,{taskFilter:'anytime',originFilter:'kae'}).visible.map(t=>t.id),['dragon']);
 assert.deepEqual(view(tasks,{taskFilter:'anytime',originFilter:'unknown'}).visible.map(t=>t.id),[]);
});

test('normal task sort prioritizes due dates when both exist and otherwise latest created time',()=>{
 const tasks=[
  record('later due',{created_at:'2026-11-07T00:00:00Z',due_at:'2026-11-29T21:00:00Z'}),
  record('earlier due',{created_at:'2026-11-08T00:00:00Z',due_at:'2026-11-28T21:00:00Z'})
 ];
 assert.deepEqual(view(tasks,{taskFilter:'future'}).visible.map(t=>t.id),['earlier due','later due']);
 assert.deepEqual(view([record('older',{created_at:'2026-11-01T00:00:00Z'}),record('newer',{created_at:'2026-11-05T00:00:00Z'})],{taskFilter:'anytime'}).visible.map(t=>t.id),['newer','older']);
});
