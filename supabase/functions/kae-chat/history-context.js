// Presentation-only, bounded recent conversation context for Kae.
// Stored messages and the chat UI are untouched. Missing/invalid timestamps
// remain unmarked rather than invented from the present time.
const easternStampFormat = new Intl.DateTimeFormat("en-US", {
 timeZone:"America/New_York",month:"2-digit",day:"2-digit",
 hour:"2-digit",minute:"2-digit",hourCycle:"h23"
});
export function easternHistoryStamp(timestamp){
 if(typeof timestamp!=="string" || !timestamp.trim())return null;
 const date=new Date(timestamp);
 if(!Number.isFinite(date.getTime()))return null;
 const parts=easternStampFormat.formatToParts(date);
 const part=type=>parts.find(x=>x.type===type)?.value;
 return `[${part("month")}/${part("day")} ${part("hour")}:${part("minute")}]`;
}
export function recentConversationMessages(rows,limit=12){
 // Do not sort or reclassify: the snapshot already provides conversation order.
 // Intermittent chat stays exactly the same role/utterance as ordinary chat.
 const selected=(Array.isArray(rows)?rows:[]).slice(-limit);
 return selected.map(message=>{
  const role=message.role==="mochi"?"assistant":"user";
  const content=message.content;
  const stamp=easternHistoryStamp(message.created_at);
  // A preexisting exact prefix is not duplicated. In particular, legacy rows
  // without a timestamp receive no fabricated metadata.
  const marked=stamp&&typeof content==="string"&&!content.startsWith(stamp+" ")
   ?stamp+" "+content:content;
  return {role,content:marked};
 });
}
