const dashboardBody=document.getElementById('audio-dashboard-body');
const recordingCount=document.getElementById('recording-count');
const dashboardAudioUrls=[];
const languageNames={'hi-IN':'Hindi','en-IN':'English','ta-IN':'Tamil','te-IN':'Telugu','mr-IN':'Marathi','bn-IN':'Bengali','kn-IN':'Kannada','ml-IN':'Malayalam','gu-IN':'Gujarati'};

function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}
function blobUrl(base64,mimeType){
 const binary=atob(base64),parts=[];
 for(let offset=0;offset<binary.length;offset+=8192){
  const slice=binary.slice(offset,offset+8192),bytes=new Uint8Array(slice.length);
  for(let index=0;index<slice.length;index++)bytes[index]=slice.charCodeAt(index);
  parts.push(bytes);
 }
 const url=URL.createObjectURL(new Blob(parts,{type:mimeType||'audio/mpeg'}));
 dashboardAudioUrls.push(url);return url;
}
async function loadDashboard(){
 const config=window.VAANI_SUPABASE;
 try{
  const response=await fetch(`${config.url}/functions/v1/generate-audio`,{method:'POST',headers:{apikey:config.publishableKey,Authorization:`Bearer ${config.publishableKey}`,'Content-Type':'application/json'},body:JSON.stringify({action:'list-saved'})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||'Could not load saved audio');
  const records=result.records||[];recordingCount.textContent=records.length;
  if(!records.length){dashboardBody.innerHTML='<tr><td colspan="5"><strong>No saved audio yet.</strong><small>Create audio, select a final rendition, and use Save Audio.</small></td></tr>';return}
  dashboardBody.innerHTML=records.map(record=>{
   const url=blobUrl(record.audio_base64,record.mime_type),language=languageNames[record.language_code]||record.language_code;
   return `<tr><td><strong>${escapeHtml(record.title)}</strong><small>${escapeHtml(record.author)}</small></td><td>${escapeHtml(language)}</td><td><span class="format">${escapeHtml(record.content_format)}</span></td><td><audio controls preload="none" src="${url}" aria-label="${escapeHtml(record.title)} audio"></audio><a class="audio-link" href="${url}" download="${escapeHtml(record.title).replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.mp3">Download MP3</a></td><td>${escapeHtml(record.created_by||'Volunteer')}</td></tr>`;
  }).join('');
 }catch(error){dashboardBody.innerHTML=`<tr><td colspan="5"><strong>Saved audio is unavailable.</strong><small>${escapeHtml(error.message)}</small></td></tr>`}
}
window.addEventListener('pagehide',()=>dashboardAudioUrls.forEach(url=>URL.revokeObjectURL(url)));
loadDashboard();
