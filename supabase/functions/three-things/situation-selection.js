// Pure preference only: situational hints must never prohibit non-work ideas.
export function catalogPoolForSituation(available,situation,preferWork=true){
 const all=Array.isArray(available)?available:[];
 if(!preferWork || situation?.work?.usual_shift_window!==true)return all;
 const work=all.filter(x=>x?.work_compatible===true);
 return work.length?work:all;
}
