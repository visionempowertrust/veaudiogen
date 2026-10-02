const mediaFile=document.getElementById('media-file'),processButton=document.getElementById('process-media'),statusText=document.getElementById('processing-status');
const results=document.getElementById('processing-results'),sourceTranscript=document.getElementById('source-transcript'),englishTranslation=document.getElementById('english-translation');
const genderResult=document.getElementById('gender-result'),generateEnglish=document.getElementById('generate-english-audio'),audioOutput=document.getElementById('english-audio-output');
let estimatedGender='male',englishAudioUrl=null;

mediaFile.addEventListener('change',()=>{const file=mediaFile.files[0];document.getElementById('file-copy').textContent=file?`${file.name} · ${(file.size/1048576).toFixed(1)} MB`:'Choose an audio or video file'});

function encodeWav(buffer){
 const samples=buffer.getChannelData(0),output=new ArrayBuffer(44+samples.length*2),view=new DataView(output);let offset=0;
 const writeText=text=>{for(let index=0;index<text.length;index++)view.setUint8(offset++,text.charCodeAt(index))};
 writeText('RIFF');view.setUint32(offset,36+samples.length*2,true);offset+=4;writeText('WAVE');writeText('fmt ');view.setUint32(offset,16,true);offset+=4;view.setUint16(offset,1,true);offset+=2;view.setUint16(offset,1,true);offset+=2;view.setUint32(offset,16000,true);offset+=4;view.setUint32(offset,32000,true);offset+=4;view.setUint16(offset,2,true);offset+=2;view.setUint16(offset,16,true);offset+=2;writeText('data');view.setUint32(offset,samples.length*2,true);offset+=4;
 for(const sample of samples){const value=Math.max(-1,Math.min(1,sample));view.setInt16(offset,value<0?value*32768:value*32767,true);offset+=2}
 return output;
}

async function extractAudio(file){
 const isVideo=file.type.startsWith('video/')||/\.(mp4|webm|mov|mkv)$/i.test(file.name);if(!isVideo)return file;
 statusText.textContent='Extracting the audio track from the video…';
 const context=new AudioContext();
 try{
  const decoded=await context.decodeAudioData(await file.arrayBuffer());
  if(decoded.duration>30.5)throw new Error('The video must be 30 seconds or shorter');
  const offline=new OfflineAudioContext(1,Math.ceil(decoded.duration*16000),16000),source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();
  const rendered=await offline.startRendering(),wav=encodeWav(rendered),name=file.name.replace(/\.[^.]+$/, '')+'-audio.wav';return new File([wav],name,{type:'audio/wav'});
 }catch(error){throw new Error(error.message||'This browser could not extract audio from the video. Use an MP4 with an AAC audio track.')}finally{await context.close()}
}

async function estimateSpeakerGender(file){
 try{
  const context=new AudioContext(),buffer=await context.decodeAudioData(await file.arrayBuffer()),channel=buffer.getChannelData(0),rate=buffer.sampleRate;
  const start=Math.max(0,Math.floor(channel.length*.25)),length=Math.min(channel.length-start,Math.floor(rate*12)),step=Math.max(1,Math.floor(rate/16000)),samples=[];
  for(let index=start;index<start+length;index+=step)samples.push(channel[index]);
  const sampleRate=rate/step,frequencies=[];
  for(let frame=0;frame+2048<samples.length;frame+=2048){
   let energy=0;for(let i=0;i<2048;i++)energy+=samples[frame+i]*samples[frame+i];if(energy/2048<.00008)continue;
   let bestLag=0,bestScore=0;const minLag=Math.floor(sampleRate/300),maxLag=Math.floor(sampleRate/75);
   for(let lag=minLag;lag<=maxLag;lag++){let score=0;for(let i=0;i<2048-lag;i++)score+=samples[frame+i]*samples[frame+i+lag];if(score>bestScore){bestScore=score;bestLag=lag}}
   if(bestLag)frequencies.push(sampleRate/bestLag);
  }
  await context.close();if(!frequencies.length)return null;frequencies.sort((a,b)=>a-b);return frequencies[Math.floor(frequencies.length/2)]>=165?'female':'male';
 }catch{return null}
}

processButton.addEventListener('click',async()=>{
 const file=mediaFile.files[0];if(!file){toast('Choose an audio or video file first');return}if(file.size>20000000){toast('The upload must be 20 MB or smaller');return}
 processButton.disabled=true;statusText.textContent='Uploading and processing with Sarvam…';results.hidden=true;audioOutput.innerHTML='';
 try{
  const audioFile=await extractAudio(file),genderPromise=estimateSpeakerGender(audioFile),form=new FormData();form.append('action','process-media');form.append('language_code',document.getElementById('source-language').value);form.append('file',audioFile,audioFile.name);statusText.textContent='Uploading extracted audio and processing with Sarvam…';
  const config=window.VAANI_SUPABASE,response=await fetch(`${config.url}/functions/v1/generate-audio`,{method:'POST',headers:{apikey:config.publishableKey,Authorization:`Bearer ${config.publishableKey}`},body:form}),result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||'Media processing failed');
  sourceTranscript.value=result.transcript||'';englishTranslation.value=result.englishTranslation||'';estimatedGender=await genderPromise||'male';
  genderResult.textContent=`Estimated original speaker: ${estimatedGender}. English voice: ${estimatedGender==='female'?'Priya':'Ratan'}.`;
  results.hidden=false;statusText.textContent='Transcript and English translation ready';toast('Media processing complete');
 }catch(error){statusText.textContent='Processing failed';toast(error.message||'Media processing failed')}finally{processButton.disabled=false}
});

generateEnglish.addEventListener('click',async()=>{
 const text=englishTranslation.value.trim();if(!text){toast('Process a file before generating English audio');return}
 generateEnglish.disabled=true;generateEnglish.textContent='Generating English audio…';
 try{
  const config=window.VAANI_SUPABASE,response=await fetch(`${config.url}/functions/v1/generate-audio`,{method:'POST',headers:{apikey:config.publishableKey,Authorization:`Bearer ${config.publishableKey}`,'Content-Type':'application/json'},body:JSON.stringify({action:'process-english-tts',text,gender:estimatedGender})}),result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||'English audio generation failed');if(englishAudioUrl)URL.revokeObjectURL(englishAudioUrl);
  const binary=atob(result.audio),bytes=new Uint8Array(binary.length);for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);englishAudioUrl=URL.createObjectURL(new Blob([bytes],{type:result.mimeType||'audio/mpeg'}));
  audioOutput.innerHTML=`<audio controls autoplay src="${englishAudioUrl}"></audio><a class="audio-link" href="${englishAudioUrl}" download="english-translation-${result.speaker}.mp3">Download English MP3</a>`;toast(`English audio generated with ${result.speaker}`);
 }catch(error){toast(error.message||'English audio generation failed')}finally{generateEnglish.disabled=false;generateEnglish.textContent='Generate English audio'}
});

document.querySelectorAll('.copy-result').forEach(button=>button.addEventListener('click',async()=>{await navigator.clipboard.writeText(document.getElementById(button.dataset.copy).value);toast('Copied to clipboard')}));
window.addEventListener('pagehide',()=>{if(englishAudioUrl)URL.revokeObjectURL(englishAudioUrl)});
