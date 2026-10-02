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

Deno.serve(async (request) => {
  const origin=request.headers.get('origin');
  if(request.method==='OPTIONS') return new Response('ok',{headers:cors(origin)});
  if(request.method!=='POST') return json({error:'Method not allowed'},405,origin);
  if(origin && !allowedOrigins.has(origin)) return json({error:'Origin not allowed'},403,origin);

  let input: Record<string, unknown>;
  try { input=await request.json(); } catch { return json({error:'Invalid JSON body'},400,origin); }
  const supabaseUrl=Deno.env.get('SUPABASE_URL')!;
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!serviceKey) return json({error:'Server credential is unavailable'},500,origin);
  const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});

  if(input.action==='save-selection') {
    const audio=typeof input.audio==='string'?input.audio:'';
    if(!audio||audio.length>8_000_000) return json({error:'Selected audio is missing or too large'},400,origin);
    const {data,error}=await admin.from('selected_audio_renditions').insert({
      author:String(input.author||'').slice(0,300),title:String(input.title||'').slice(0,500),content_format:String(input.format||'').slice(0,40),
      language_code:String(input.language_code||'').slice(0,20),model:String(input.model||'').slice(0,40),speaker:String(input.speaker||'').slice(0,80),
      narration_text:String(input.narration_text||'').slice(0,5000),audio_base64:audio,mime_type:String(input.mime_type||'audio/mpeg').slice(0,80),
      sarvam_request_id:input.request_id?String(input.request_id).slice(0,200):null
    }).select('id').single();
    if(error) return json({error:'Selected rendition storage is not configured'},503,origin);
    return json({id:data.id},201,origin);
  }

  const author=String(input.author||'').trim(),title=String(input.title||'').trim(),body=String(input.body||'').trim();
  const requestedFormat=String(input.format||'Summary').trim(),language=String(input.language_code||''),model=String(input.model||'bulbul:v3');
  const speaker=String(input.speaker||'shubh');
  if(!author||!title||!body) return json({error:'Author, title, and story content are required'},400,origin);
  if(!languages.has(language)) return json({error:'Unsupported language'},400,origin);
  if(!(model in speakersByModel)) return json({error:'Unsupported Sarvam model'},400,origin);
  if(!speakersByModel[model as keyof typeof speakersByModel].has(speaker)) return json({error:`Unsupported voice for ${model}`},400,origin);

  const format=['Summary','Poem','Skit'].includes(requestedFormat)?requestedFormat:'Summary';
  const sourceText=`Hello! Let us hear the ${format.toLowerCase()} of the story "${title}" written by ${author}. ${body} Hope you liked the audio rendering of the ${title} written by ${author}, produced by Vision Empower Trust.`;
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
