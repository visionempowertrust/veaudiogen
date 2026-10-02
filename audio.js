const catalog={
 sarvam:{name:'Sarvam AI',logo:'स',models:[['Bulbul v3',['shubh','aditya','ritu','priya','neha','rahul','pooja','rohan','simran','kavya','amit','dev','ishita','shreya','ratan','varun','manan','sumit','roopa','kabir','aayan','ashutosh','advait','anand','tanya','tarun','sunny','mani','gokul','vijay','shruti','suhani','mohit','kavitha','rehan','soham','rupali']],['Bulbul v2',['anushka','manisha','vidya','arya','abhilash','karun','hitesh']]]},
 azure:{name:'Azure AI Speech',logo:'Az',models:[['Neural HD',['Swara · hi-IN','Madhur · hi-IN','Neerja · en-IN','Prabhat · en-IN']],['Multilingual Neural',['Aarohi','Arjun','Kavya','Rehaan']]]},
 google:{name:'Google Cloud TTS',logo:'G',models:[['Chirp 3 HD',['Leda','Orus','Aoede','Charon']],['Neural2',['hi-IN-A','hi-IN-B','en-IN-C','en-IN-D']]]},
 aws:{name:'Amazon Polly',logo:'A',models:[['Neural',['Aditi','Kajal','Raveena','Rishi']],['Long-form',['Aditi','Kajal']]]},
 elevenlabs:{name:'ElevenLabs',logo:'XI',models:[['Multilingual v2',['Aria','Roger','Sarah','Liam']],['Flash v2.5',['Laura','George','Lily','Daniel']]]},
 openai:{name:'OpenAI Audio',logo:'AI',models:[['gpt-4o-mini-tts',['Coral','Sage','Verse','Alloy']],['tts-1-hd',['Nova','Onyx','Shimmer','Echo']]]}
};
const languageCodes={'Hindi — हिन्दी':'hi-IN','English — India':'en-IN','Tamil — தமிழ்':'ta-IN','Telugu — తెలుగు':'te-IN','Marathi — मराठी':'mr-IN','Bengali — বাংলা':'bn-IN','Kannada — ಕನ್ನಡ':'kn-IN','Malayalam — മലയാളം':'ml-IN','Gujarati — ગુજરાતી':'gu-IN'};
const select=document.getElementById('service-select'),table=document.getElementById('variation-table');
let configured={},enabled=['sarvam'],generated={},selectedKey=null,speakingKey=null,activeAudio=null;
select.innerHTML='<option value="sarvam">Sarvam AI · checking production configuration…</option>';

function buildNarration(){
 const author=document.getElementById('author-name').value.trim();
 const title=document.getElementById('content-title').value.trim();
 const body=document.getElementById('script').value.trim();
 const languageLabel=document.getElementById('language').value;
 const format=document.getElementById('format').value;
 const direction=document.getElementById('prompt').value.trim();
 if(!author||!title||!body)return null;
 const opening=`Hello! Let us hear the summary of the story "${title}" written by ${author}.`;
 const instructions=[`Language: ${languageLabel}`,`Format: ${format}`,direction?`Additional direction: ${direction}`:''].filter(Boolean).join('. ');
 const closing=`Hope you liked the audio rendering of the ${title} written by ${author}, produced by Vision Empower Trust.`;
 return {author,title,body,languageLabel,language:languageCodes[languageLabel]||'en-IN',format,direction,instructions,text:[opening,body,closing].join(' ')};
}

function heights(seed){return Array.from({length:32},(_,index)=>12+((index*13+seed*7)%27))}
function render(){
 const provider=catalog[select.value];
 document.getElementById('service-hint').textContent=configured[select.value]?'Production credential is available securely through Supabase Vault.':'This service is not configured for production.';
 table.innerHTML=provider.models.map((model,index)=>{
  const key=select.value+'-'+index,generatedSample=generated[key],voice=generatedSample?.voice||model[1][0],isSpeaking=speakingKey===key;
  return `<article class="variation-row ${generatedSample?'generated':''}" data-key="${key}"><span class="model-logo">${provider.logo}</span><span class="model"><strong>${model[0]}</strong><small>${provider.name}</small></span><select class="voice-select" aria-label="Voice for ${model[0]}">${model[1].map(item=>`<option ${item===voice?'selected':''}>${item}</option>`).join('')}</select><button class="generate-one">${generatedSample?'Regenerate':'Generate sample'}</button>${generatedSample?`<div class="sample"><button class="play" aria-label="${isSpeaking?'Stop':'Play'} sample">${isSpeaking?'■':'▶'}</button><div class="wave" aria-hidden="true">${heights(index+select.value.length).map(height=>`<i style="height:${height}px"></i>`).join('')}</div><small>${isSpeaking?'Playing generated narration':`${generatedSample.languageLabel} · ${generatedSample.format}`} · ${generatedSample.duration}</small><label class="select-rendition"><input type="checkbox" ${selectedKey===key?'checked':''}> Select rendition</label></div>`:''}</article>`;
 }).join('');
 const count=Object.keys(generated).length;
 document.getElementById('ready-count').textContent=`${count} sample${count===1?'':'s'} ready`;
 updateSelection();
}
function updateSelection(){
 const button=document.getElementById('download-selected'),title=document.getElementById('selected-title'),copy=document.getElementById('selected-copy');
 if(!selectedKey||!generated[selectedKey]){title.textContent='No rendition selected';copy.textContent='Generate samples, listen, then select one rendition to download.';button.disabled=true;return}
 const sample=generated[selectedKey];title.textContent=`${sample.model} · ${sample.voice} selected`;copy.textContent=`${sample.provider} · ready as high-quality MP3`;button.disabled=false;
}
function stopSpeech(){if('speechSynthesis'in window)window.speechSynthesis.cancel();if(activeAudio){activeAudio.pause();activeAudio.currentTime=0;activeAudio=null}speakingKey=null;render()}
function playSpeech(key){
 if(speakingKey===key){stopSpeech();toast('Playback stopped');return}
 const sample=generated[key];
 if(sample?.audioUrl){
  stopSpeech();activeAudio=new Audio(sample.audioUrl);speakingKey=key;activeAudio.onended=()=>{speakingKey=null;activeAudio=null;render()};activeAudio.onerror=()=>{speakingKey=null;activeAudio=null;render();toast('The generated MP3 could not be played')};activeAudio.play().then(()=>{render();toast('Playing Sarvam production audio')}).catch(()=>{speakingKey=null;render();toast('Press Play again to allow audio')});return;
 }
 if(!('speechSynthesis'in window)){
  toast('This browser cannot generate dynamic speech. Open the page in Chrome or Edge, or connect a provider API.');
  return;
 }
 window.speechSynthesis.cancel();
 if(!sample?.text){toast('Regenerate this sample with complete content details');return}
 const utterance=new SpeechSynthesisUtterance(sample.text),language=sample.language;
 utterance.lang=language;utterance.rate=.92;utterance.pitch=1;
 const matchingVoices=window.speechSynthesis.getVoices().filter(voice=>voice.lang.toLowerCase().startsWith(language.split('-')[0].toLowerCase()));
 const modelIndex=Number(key.split('-').pop())||0;
 if(matchingVoices.length)utterance.voice=matchingVoices[modelIndex%matchingVoices.length];
 utterance.onend=()=>{speakingKey=null;render()};utterance.onerror=()=>{speakingKey=null;render();toast('This browser could not play the selected language voice')};
 speakingKey=key;window.speechSynthesis.speak(utterance);render();toast('Playing an audible browser voice preview');
}
select.addEventListener('change',()=>{stopSpeech();render()});
table.addEventListener('change',event=>{
 if(event.target.matches('.voice-select')){const row=event.target.closest('.variation-row'),sample=generated[row.dataset.key];if(sample){sample.voice=event.target.value;if(selectedKey===row.dataset.key)updateSelection()}}
 if(event.target.matches('.select-rendition input')){const key=event.target.closest('.variation-row').dataset.key;selectedKey=event.target.checked?key:null;render()}
});
async function generateSample(row,button){
 const provider=catalog[select.value],index=Number(row.dataset.key.split('-').pop()),voice=row.querySelector('.voice-select').value,narration=buildNarration();
 if(!narration){toast('Add the author, title, and script before generating');return}
 if(!configured.sarvam){toast('Sarvam is not configured in Supabase Vault');return}
 button.disabled=true;button.textContent='Generating production audio…';
 try{
  const config=window.VAANI_SUPABASE;
  const model=provider.models[index][0].toLowerCase().replace(' ',':');
  const response=await fetch(`${config.url}/functions/v1/generate-audio`,{method:'POST',headers:{apikey:config.publishableKey,Authorization:`Bearer ${config.publishableKey}`,'Content-Type':'application/json'},body:JSON.stringify({text:narration.text,language_code:narration.language,speaker:voice,model,pace:.92,temperature:.6})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||'Sarvam audio generation failed');
  generated[row.dataset.key]={provider:provider.name,model:provider.models[index][0],voice,duration:'production MP3',audioUrl:`data:${result.mimeType||'audio/mpeg'};base64,${result.audio}`,requestId:result.requestId,...narration};
  render();toast(`${narration.languageLabel} ${narration.format.toLowerCase()} generated by Sarvam`);
 }catch(error){button.disabled=false;button.textContent='Generate sample';const message=error instanceof TypeError?'Production audio backend is not deployed in Supabase yet.':error.message;toast(message)}
}
table.addEventListener('click',event=>{
 const row=event.target.closest('.variation-row');if(!row)return;
 if(event.target.closest('.generate-one'))generateSample(row,event.target.closest('.generate-one'));
 else if(event.target.closest('.play'))playSpeech(row.dataset.key);
});
document.getElementById('download-selected').addEventListener('click',()=>{const sample=generated[selectedKey];if(!sample?.audioUrl){toast('Generate and select a production rendition first');return}const link=document.createElement('a');link.href=sample.audioUrl;link.download=`${sample.title.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()}-${sample.voice}.mp3`;document.body.appendChild(link);link.click();link.remove()});
window.addEventListener('pagehide',stopSpeech);
async function loadConfiguredServices(){
 const config=window.VAANI_SUPABASE;
 try{const response=await fetch(`${config.url}/rest/v1/rpc/list_configured_ai_services`,{method:'POST',headers:{apikey:config.publishableKey,Authorization:`Bearer ${config.publishableKey}`,'Content-Type':'application/json'},body:'{}'});if(!response.ok)throw new Error();const rows=await response.json();configured=Object.fromEntries(rows.map(row=>[row.provider,true]));enabled=['sarvam'];select.innerHTML=`<option value="sarvam">Sarvam AI · ${configured.sarvam?'production':'setup pending'}</option>`}catch{configured={};select.innerHTML='<option value="sarvam">Sarvam AI · Supabase setup pending</option>'}render()}
loadConfiguredServices();
