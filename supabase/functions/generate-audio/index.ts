import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigins = new Set([
  'https://visionempowertrust.github.io',
  'http://127.0.0.1:4173',
  'http://localhost:4173'
]);
const languages = new Set(['hi-IN','en-IN','ta-IN','te-IN','mr-IN','bn-IN','kn-IN','ml-IN','gu-IN']);
const speakersByModel = {
  'bulbul:v3': new Set(['shubh','aditya','ritu','priya','neha','rahul','pooja','rohan','simran','kavya','amit','dev','ishita','shreya','ratan','varun','manan','sumit','roopa','kabir','aayan','ashutosh','advait','anand','tanya','tarun','sunny','mani','gokul','vijay','shruti','suhani','mohit','kavitha','rehan','soham','rupali']),
  'bulbul:v2': new Set(['anushka','manisha','vidya','arya','abhilash','karun','hitesh'])
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

  let input: {text?:string;language_code?:string;speaker?:string;model?:string;pace?:number;temperature?:number};
  try { input=await request.json(); } catch { return json({error:'Invalid JSON body'},400,origin); }
  const text=(input.text||'').trim(), language=input.language_code||'', model=input.model||'bulbul:v3', speaker=input.speaker||(model==='bulbul:v2'?'anushka':'shubh');
  if(!(model in speakersByModel)) return json({error:'Unsupported Sarvam model'},400,origin);
  const textLimit=model==='bulbul:v2'?1500:2500;
  if(!text||text.length>textLimit) return json({error:`Text must contain 1 to ${textLimit.toLocaleString()} characters for ${model}`},400,origin);
  if(!languages.has(language)) return json({error:'Unsupported language'},400,origin);
  if(!speakersByModel[model as keyof typeof speakersByModel].has(speaker)) return json({error:`Unsupported voice for ${model}`},400,origin);

  const supabaseUrl=Deno.env.get('SUPABASE_URL')!;
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!serviceKey) return json({error:'Server credential is unavailable'},500,origin);
  const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
  const {data:quota,error:quotaError}=await admin.rpc('consume_audio_generation_quota');
  if(quotaError) return json({error:'Usage protection is not configured'},503,origin);
  if(!quota) return json({error:'Audio generation limit reached. Please try again later.'},429,origin);
  const {data:apiKey,error:keyError}=await admin.rpc('get_ai_service_key',{p_provider:'sarvam'});
  if(keyError||!apiKey) return json({error:'Sarvam is not configured in Supabase Vault'},503,origin);

  const sarvam=await fetch('https://api.sarvam.ai/text-to-speech',{
    method:'POST',
    headers:{'api-subscription-key':apiKey,'Content-Type':'application/json'},
    body:JSON.stringify({text,language_code:language,speaker,model,pace:model==='bulbul:v2'?Math.min(3,Math.max(.3,input.pace||.92)):Math.min(2,Math.max(.5,input.pace||.92)),...(model==='bulbul:v3'?{temperature:Math.min(2,Math.max(.01,input.temperature||.6))}:{}),speech_sample_rate:24000,output_audio_codec:'mp3'})
  });
  const result=await sarvam.json().catch(()=>null);
  if(!sarvam.ok) return json({error:result?.error?.message||result?.message||`Sarvam request failed (${sarvam.status})`},sarvam.status===429?429:502,origin);
  const audio=result?.audios?.[0];
  if(!audio) return json({error:'Sarvam returned no audio'},502,origin);
  return json({audio,mimeType:'audio/mpeg',requestId:result.request_id||null,model,speaker,language},200,origin);
});
