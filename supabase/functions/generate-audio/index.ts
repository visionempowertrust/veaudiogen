import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigins = new Set(['https://visionempowertrust.github.io','http://127.0.0.1:4173','http://localhost:4173']);
const languages = new Set(['hi-IN','en-IN','ta-IN','te-IN','mr-IN','bn-IN','kn-IN','ml-IN','gu-IN']);
const speakersByModel = {
  'bulbul:v3': new Set(['shubh','aditya','ritu','priya','neha','rahul','pooja','rohan','simran','kavya','amit','dev','ishita','shreya','ratan','varun','manan','sumit','roopa','kabir','aayan','ashutosh','advait','anand','tanya','tarun','sunny','mani','gokul','vijay','shruti','suhani','mohit','kavitha','rehan','soham','rupali'])
};

function cors(origin: string | null) {
  const allowed = origin && allowedOrigins.has(origin) ? origin : 'https://visionempowertrust.github.io';
  return {'Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
}
function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {status, headers:{...cors(origin),'Content-Type':'application/json','Cache-Control':'no-store'}});
}
function textChunks(text:string,limit=1900){
  const chunks:string[]=[];let remaining=text.trim();
  while(remaining.length>limit){let end=remaining.lastIndexOf('. ',limit);if(end<limit*.5)end=remaining.lastIndexOf(' ',limit);if(end<1)end=limit;chunks.push(remaining.slice(0,end+1).trim());remaining=remaining.slice(end+1).trim()}
  if(remaining)chunks.push(remaining);return chunks;
}

Deno.serve(async (request) => {
  const origin=request.headers.get('origin');
  if(request.method==='OPTIONS') return new Response('ok',{headers:cors(origin)});
  if(request.method!=='POST') return json({error:'Method not allowed'},405,origin);
  if(origin && !allowedOrigins.has(origin)) return json({error:'Origin not allowed'},403,origin);

  const supabaseUrl=Deno.env.get('SUPABASE_URL')!;
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!serviceKey) return json({error:'Server credential is unavailable'},500,origin);
  const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});

  if(request.headers.get('content-type')?.includes('multipart/form-data')) {
    let form: FormData;
    try { form=await request.formData(); } catch { return json({error:'Invalid upload form'},400,origin); }
    if(form.get('action')!=='process-media') return json({error:'Unsupported upload action'},400,origin);
    const file=form.get('file'),language=String(form.get('language_code')||'');
    if(!(file instanceof File)||!file.size) return json({error:'Choose an audio or video file'},400,origin);
    if(file.size>20_000_000) return json({error:'The upload must be 20 MB or smaller'},413,origin);
    if(!languages.has(language)) return json({error:'Unsupported source language'},400,origin);
    const {data:quota,error:quotaError}=await admin.rpc('consume_audio_generation_quota');
    if(quotaError) return json({error:'Usage protection is not configured'},503,origin);
    if(!quota) return json({error:'Processing limit reached. Please try again later.'},429,origin);
    const {data:apiKey,error:keyError}=await admin.rpc('get_ai_service_key',{p_provider:'sarvam'});
    if(keyError||!apiKey) return json({error:'Sarvam is not configured in Supabase Vault'},503,origin);
    try {
      const headers={'api-subscription-key':apiKey,'Content-Type':'application/json'};
      const initiated=await fetch('https://api.sarvam.ai/speech-to-text/job/v1',{method:'POST',headers,body:JSON.stringify({job_parameters:{language_code:language,model:'saaras:v3',mode:'transcribe'}})}),job=await initiated.json().catch(()=>null);
      if(!initiated.ok||!job?.job_id)throw new Error(job?.error?.message||job?.message||'Could not create the Sarvam batch job');
      const fileName=file.name.replace(/[^a-zA-Z0-9._-]/g,'-');
      const linksResponse=await fetch('https://api.sarvam.ai/speech-to-text/job/v1/upload-files',{method:'POST',headers,body:JSON.stringify({job_id:job.job_id,files:[fileName]})}),links=await linksResponse.json().catch(()=>null);
      const uploadUrl=links?.upload_urls?.[fileName]?.file_url;
      if(!linksResponse.ok||!uploadUrl)throw new Error(links?.error?.message||links?.message||'Could not prepare the Sarvam upload');
      const uploaded=await fetch(uploadUrl,{method:'PUT',headers:{'Content-Type':file.type||'application/octet-stream','x-ms-blob-type':'BlockBlob'},body:file});
      if(!uploaded.ok)throw new Error(`Audio upload failed (${uploaded.status})`);
      const started=await fetch(`https://api.sarvam.ai/speech-to-text/job/v1/${job.job_id}/start`,{method:'POST',headers:{'api-subscription-key':apiKey}}),startResult=await started.json().catch(()=>null);
      if(!started.ok)throw new Error(startResult?.error?.message||startResult?.message||'Could not start the Sarvam batch job');
      return json({batch:true,jobId:job.job_id,state:startResult?.job_state||'Running',sourceLanguage:language},202,origin);
    } catch(error) { return json({error:error instanceof Error?error.message:'Sarvam media processing failed'},502,origin); }
  }

  let input: Record<string, unknown>;
  try { input=await request.json(); } catch { return json({error:'Invalid JSON body'},400,origin); }

  if(input.action==='process-media-status') {
    const jobId=String(input.job_id||''),language=String(input.language_code||'');
    if(!/^[a-zA-Z0-9_-]{8,200}$/.test(jobId)||!languages.has(language))return json({error:'Invalid processing job'},400,origin);
    const {data:apiKey,error:keyError}=await admin.rpc('get_ai_service_key',{p_provider:'sarvam'});
    if(keyError||!apiKey) return json({error:'Sarvam is not configured in Supabase Vault'},503,origin);
    const headers={'api-subscription-key':apiKey,'Content-Type':'application/json'};
    const statusResponse=await fetch(`https://api.sarvam.ai/speech-to-text/job/v1/${jobId}/status`,{headers:{'api-subscription-key':apiKey}}),status=await statusResponse.json().catch(()=>null);
    if(!statusResponse.ok)return json({error:status?.error?.message||status?.message||'Could not read batch status'},502,origin);
    if(status.job_state==='Failed')return json({error:status.error_message||'Sarvam batch processing failed'},502,origin);
    if(status.job_state!=='Completed')return json({pending:true,state:status.job_state||'Running'},202,origin);
    const outputName=status.job_details?.[0]?.outputs?.[0]?.file_name;
    if(!outputName)return json({error:'Sarvam completed without a transcript file'},502,origin);
    const downloadResponse=await fetch('https://api.sarvam.ai/speech-to-text/job/v1/download-files',{method:'POST',headers,body:JSON.stringify({job_id:jobId,files:[outputName]})}),downloads=await downloadResponse.json().catch(()=>null),downloadUrl=downloads?.download_urls?.[outputName]?.file_url;
    if(!downloadResponse.ok||!downloadUrl)return json({error:downloads?.error?.message||downloads?.message||'Could not retrieve the transcript'},502,origin);
    const transcriptResponse=await fetch(downloadUrl),transcriptResult=await transcriptResponse.json().catch(()=>null),transcript=transcriptResult?.transcript||transcriptResult?.data?.transcript;
    if(!transcript)return json({error:'The completed batch result contained no transcript'},502,origin);
    let englishTranslation=transcript;
    if(language!=='en-IN'){
      const translated:string[]=[];
      for(const chunk of textChunks(transcript)){const response=await fetch('https://api.sarvam.ai/translate',{method:'POST',headers,body:JSON.stringify({input:chunk,source_language_code:language,target_language_code:'en-IN',model:'sarvam-translate:v1'})}),result=await response.json().catch(()=>null);if(!response.ok||!result?.translated_text)return json({error:result?.error?.message||result?.message||'English translation failed'},502,origin);translated.push(result.translated_text)}
      englishTranslation=translated.join(' ');
    }
    return json({pending:false,state:'Completed',transcript,englishTranslation,sourceLanguage:language},200,origin);
  }

  if(input.action==='process-english-tts') {
    const text=String(input.text||'').trim(),gender=input.gender==='female'?'female':'male',speaker=input.gender==='female'?'priya':'ratan';
    if(!text||text.length>20_000) return json({error:'English translation must contain 1 to 20,000 characters'},400,origin);
    const {data:quota,error:quotaError}=await admin.rpc('consume_audio_generation_quota');
    if(quotaError) return json({error:'Usage protection is not configured'},503,origin);
    if(!quota) return json({error:'Audio generation limit reached. Please try again later.'},429,origin);
    const {data:apiKey,error:keyError}=await admin.rpc('get_ai_service_key',{p_provider:'sarvam'});
    if(keyError||!apiKey) return json({error:'Sarvam is not configured in Supabase Vault'},503,origin);
    const audios:string[]=[],requestIds:string[]=[];
    for(const chunk of textChunks(text,2400)){const response=await fetch('https://api.sarvam.ai/text-to-speech',{method:'POST',headers:{'api-subscription-key':apiKey,'Content-Type':'application/json'},body:JSON.stringify({text:chunk,language_code:'en-IN',speaker,model:'bulbul:v3',pace:.92,temperature:.6,speech_sample_rate:24000,output_audio_codec:'mp3'})}),result=await response.json().catch(()=>null),audio=result?.audios?.[0];if(!response.ok||!audio)return json({error:result?.error?.message||result?.message||'Sarvam returned no English audio'},response.status===429?429:502,origin);audios.push(audio);if(result.request_id)requestIds.push(result.request_id)}
    return json({audio:audios[0],audios,mimeType:'audio/mpeg',speaker,gender,requestIds},200,origin);
  }

  if(input.action==='list-saved') {
    const {data,error}=await admin.from('selected_audio_renditions').select('id,author,title,content_format,language_code,model,speaker,audio_base64,mime_type,created_by,created_at').order('created_at',{ascending:false}).limit(50);
    if(error) return json({error:'Saved audio library is not configured'},503,origin);
    return json({records:data},200,origin);
  }

  if(input.action==='save-selection') {
    const audio=typeof input.audio==='string'?input.audio:'';
    if(!audio||audio.length>8_000_000) return json({error:'Selected audio is missing or too large'},400,origin);
    const {data,error}=await admin.from('selected_audio_renditions').insert({
      author:String(input.author||'').slice(0,300),title:String(input.title||'').slice(0,500),content_format:String(input.format||'').slice(0,40),
      language_code:String(input.language_code||'').slice(0,20),model:String(input.model||'').slice(0,40),speaker:String(input.speaker||'').slice(0,80),
      narration_text:String(input.narration_text||'').slice(0,5000),audio_base64:audio,mime_type:String(input.mime_type||'audio/mpeg').slice(0,80),
      sarvam_request_id:input.request_id?String(input.request_id).slice(0,200):null,created_by:String(input.created_by||'Volunteer').slice(0,120)
    }).select('id').single();
    if(error) return json({error:'Selected rendition storage is not configured'},503,origin);
    return json({id:data.id},201,origin);
  }

  const author=String(input.author||'').trim(),title=String(input.title||'').trim(),body=String(input.body||'').trim();
  const language=String(input.language_code||''),model=String(input.model||'bulbul:v3');
  const speaker=String(input.speaker||'shubh');
  if(!author||!title||!body) return json({error:'Author, title, and story content are required'},400,origin);
  if(!languages.has(language)) return json({error:'Unsupported language'},400,origin);
  if(!(model in speakersByModel)) return json({error:'Unsupported Sarvam model'},400,origin);
  if(!speakersByModel[model as keyof typeof speakersByModel].has(speaker)) return json({error:`Unsupported voice for ${model}`},400,origin);

  const format='Summary';
  const sourceText=`Hello! Let us hear the summary of the story "${title}" written by ${author}. ${body} Hope you liked the audio rendering of the ${title} written by ${author}, produced by Vision Empower Trust.`;
  if(sourceText.length>2000) return json({error:'The complete narration must be 2,000 characters or fewer for translation'},400,origin);

  const {data:quota,error:quotaError}=await admin.rpc('consume_audio_generation_quota');
  if(quotaError) return json({error:'Usage protection is not configured'},503,origin);
  if(!quota) return json({error:'Audio generation limit reached. Please try again later.'},429,origin);
  const {data:apiKey,error:keyError}=await admin.rpc('get_ai_service_key',{p_provider:'sarvam'});
  if(keyError||!apiKey) return json({error:'Sarvam is not configured in Supabase Vault'},503,origin);

  const detection=await fetch('https://api.sarvam.ai/text-lid',{
    method:'POST',headers:{'api-subscription-key':apiKey,'Content-Type':'application/json'},
    body:JSON.stringify({input:sourceText.slice(0,1000)})
  });
  const detectionResult=await detection.json().catch(()=>null);
  if(!detection.ok) return json({error:detectionResult?.error?.message||detectionResult?.message||`Sarvam language detection failed (${detection.status})`},detection.status===429?429:502,origin);
  const sourceLanguage=detectionResult?.language_code;
  if(!sourceLanguage||!languages.has(sourceLanguage)) return json({error:'Sarvam could not identify the story language'},422,origin);

  let translatedText=sourceText,translationRequestId:string|null=null;
  if(sourceLanguage!==language){
    const translation=await fetch('https://api.sarvam.ai/translate',{
      method:'POST',headers:{'api-subscription-key':apiKey,'Content-Type':'application/json'},
      body:JSON.stringify({input:sourceText,source_language_code:sourceLanguage,target_language_code:language,model:'sarvam-translate:v1'})
    });
    const translationResult=await translation.json().catch(()=>null);
    if(!translation.ok) return json({error:translationResult?.error?.message||translationResult?.message||`Sarvam translation failed (${translation.status})`},translation.status===429?429:502,origin);
    translatedText=translationResult?.translated_text;
    translationRequestId=translationResult?.request_id||null;
    if(!translatedText) return json({error:'Sarvam returned no translated narration'},502,origin);
  }
  const textLimit=2500;
  if(translatedText.length>textLimit) return json({error:`The translated narration exceeds the ${textLimit.toLocaleString()} character limit for ${model}`},400,origin);

  const sarvam=await fetch('https://api.sarvam.ai/text-to-speech',{
    method:'POST',headers:{'api-subscription-key':apiKey,'Content-Type':'application/json'},
    body:JSON.stringify({text:translatedText,language_code:language,speaker,model,pace:Math.min(2,Math.max(.5,Number(input.pace)||.92)),temperature:Math.min(2,Math.max(.01,Number(input.temperature)||.6)),speech_sample_rate:24000,output_audio_codec:'mp3'})
  });
  const result=await sarvam.json().catch(()=>null);
  if(!sarvam.ok) return json({error:result?.error?.message||result?.message||`Sarvam request failed (${sarvam.status})`},sarvam.status===429?429:502,origin);
  const audio=result?.audios?.[0];
  if(!audio) return json({error:'Sarvam returned no audio'},502,origin);
  return json({audio,mimeType:'audio/mpeg',requestId:result.request_id||null,translationRequestId,languageDetectionRequestId:detectionResult.request_id||null,sourceLanguage,translatedText,model,speaker,language},200,origin);
});
