const catalog={
 sarvam:{name:'Sarvam AI',logo:'स',models:[['Bulbul v2',['Meera · Warm','Ratan · Gentle','Aarav · Clear','Kavya · Expressive']],['Bulbul v1',['Anushka · Calm','Manisha · Bright','Vidya · Mature']]]},
 azure:{name:'Azure AI Speech',logo:'Az',models:[['Neural HD',['Swara · hi-IN','Madhur · hi-IN','Neerja · en-IN','Prabhat · en-IN']],['Multilingual Neural',['Aarohi','Arjun','Kavya','Rehaan']]]},
 google:{name:'Google Cloud TTS',logo:'G',models:[['Chirp 3 HD',['Leda','Orus','Aoede','Charon']],['Neural2',['hi-IN-A','hi-IN-B','en-IN-C','en-IN-D']]]},
 aws:{name:'Amazon Polly',logo:'A',models:[['Neural',['Aditi','Kajal','Raveena','Rishi']],['Long-form',['Aditi','Kajal']]]},
 elevenlabs:{name:'ElevenLabs',logo:'XI',models:[['Multilingual v2',['Aria','Roger','Sarah','Liam']],['Flash v2.5',['Laura','George','Lily','Daniel']]]},
 openai:{name:'OpenAI Audio',logo:'AI',models:[['gpt-4o-mini-tts',['Coral','Sage','Verse','Alloy']],['tts-1-hd',['Nova','Onyx','Shimmer','Echo']]]}
};
const languageCodes={'Hindi — हिन्दी':'hi-IN','English — India':'en-IN','Tamil — தமிழ்':'ta-IN','Telugu — తెలుగు':'te-IN','Marathi — मराठी':'mr-IN','Bengali — বাংলা':'bn-IN','Kannada — ಕನ್ನಡ':'kn-IN','Malayalam — മലയാളം':'ml-IN','Gujarati — ગુજરાતી':'gu-IN'};
const select=document.getElementById('service-select'),table=document.getElementById('variation-table');
let configured=JSON.parse(sessionStorage.getItem('vaani-services')||'{}');
let enabled=Object.keys(configured).filter(key=>catalog[key]);
if(!enabled.length)enabled=['sarvam','azure','google','elevenlabs','openai'];
select.innerHTML=enabled.map(id=>`<option value="${id}">${catalog[id].name}${configured[id]?' · configured':' · preview'}</option>`).join('');
let generated={},selectedKey=null,speakingKey=null,fallbackAudio=null;

function heights(seed){return Array.from({length:32},(_,index)=>12+((index*13+seed*7)%27))}
function render(){
 const provider=catalog[select.value];
 document.getElementById('service-hint').textContent=configured[select.value]?'Ready with the key configured in this session.':'Preview mode — browser speech is available for listening; configure an API key for provider-quality output.';
 table.innerHTML=provider.models.map((model,index)=>{
  const key=select.value+'-'+index,generatedSample=generated[key],voice=generatedSample?.voice||model[1][0],isSpeaking=speakingKey===key;
  return `<article class="variation-row ${generatedSample?'generated':''}" data-key="${key}"><span class="model-logo">${provider.logo}</span><span class="model"><strong>${model[0]}</strong><small>${provider.name}</small></span><select class="voice-select" aria-label="Voice for ${model[0]}">${model[1].map(item=>`<option ${item===voice?'selected':''}>${item}</option>`).join('')}</select><button class="generate-one">${generatedSample?'Regenerate':'Generate sample'}</button>${generatedSample?`<div class="sample"><button class="play" aria-label="${isSpeaking?'Stop':'Play'} sample">${isSpeaking?'■':'▶'}</button><div class="wave" aria-hidden="true">${heights(index+select.value.length).map(height=>`<i style="height:${height}px"></i>`).join('')}</div><small>${isSpeaking?'Playing browser preview':'Ready to play'} · ${generatedSample.duration}</small><label class="select-rendition"><input type="checkbox" ${selectedKey===key?'checked':''}> Select rendition</label></div>`:''}</article>`;
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
function stopSpeech(){if('speechSynthesis'in window)window.speechSynthesis.cancel();if(fallbackAudio){fallbackAudio.pause();fallbackAudio.currentTime=0}speakingKey=null;render()}
function playSpeech(key){
 if(speakingKey===key){stopSpeech();toast('Playback stopped');return}
 if(!('speechSynthesis'in window)){
  if(fallbackAudio){fallbackAudio.pause();fallbackAudio.currentTime=0}
  fallbackAudio=new Audio('assets/browser-voice-preview.ogg');
  fallbackAudio.onended=()=>{speakingKey=null;render()};
  fallbackAudio.onerror=()=>{speakingKey=null;render();toast('The audio preview could not be loaded')};
  speakingKey=key;render();
  fallbackAudio.play().then(()=>toast('Playing an audible sample preview')).catch(()=>{speakingKey=null;render();toast('Press Play again to allow audio')});
  return;
 }
 window.speechSynthesis.cancel();
 const text=document.getElementById('script').value.trim();
 if(!text){toast('Add script text before playing a sample');return}
 const utterance=new SpeechSynthesisUtterance(text),language=languageCodes[document.getElementById('language').value]||'en-IN';
 utterance.lang=language;utterance.rate=.92;utterance.pitch=1;
 const matchingVoices=window.speechSynthesis.getVoices().filter(voice=>voice.lang.toLowerCase().startsWith(language.split('-')[0].toLowerCase()));
 const modelIndex=Number(key.split('-').pop())||0;
 if(matchingVoices.length)utterance.voice=matchingVoices[modelIndex%matchingVoices.length];
 utterance.onend=()=>{speakingKey=null;render()};utterance.onerror=()=>{speakingKey=null;render();toast('This browser could not play the selected language voice')};
 speakingKey=key;window.speechSynthesis.speak(utterance);render();toast('Playing an audible browser voice preview');
}
select.addEventListener('change',()=>{if('speechSynthesis'in window)window.speechSynthesis.cancel();speakingKey=null;render()});
table.addEventListener('change',event=>{
 if(event.target.matches('.voice-select')){const row=event.target.closest('.variation-row'),sample=generated[row.dataset.key];if(sample){sample.voice=event.target.value;if(selectedKey===row.dataset.key)updateSelection()}}
 if(event.target.matches('.select-rendition input')){const key=event.target.closest('.variation-row').dataset.key;selectedKey=event.target.checked?key:null;render()}
});
table.addEventListener('click',event=>{
 const row=event.target.closest('.variation-row');if(!row)return;
 if(event.target.closest('.generate-one')){const provider=catalog[select.value],index=Number(row.dataset.key.split('-').pop()),voice=row.querySelector('.voice-select').value,button=event.target.closest('.generate-one');button.disabled=true;button.textContent='Generating…';setTimeout(()=>{generated[row.dataset.key]={provider:provider.name,model:provider.models[index][0],voice,duration:'0:'+(18+index*4)};render();toast('Sample ready — press Play to hear it')},900)}
 else if(event.target.closest('.play'))playSpeech(row.dataset.key);
});
document.getElementById('download-selected').addEventListener('click',()=>toast('Connect the selected provider API to download a real MP3'));
window.addEventListener('pagehide',()=>{if('speechSynthesis'in window)window.speechSynthesis.cancel();if(fallbackAudio)fallbackAudio.pause()});
render();
