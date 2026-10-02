const providers=[
 {id:'sarvam',name:'Sarvam AI',desc:'Indian languages and accents',logo:'स'},
 {id:'azure',name:'Azure AI Speech',desc:'Microsoft neural voices',logo:'Az'},
 {id:'google',name:'Google Cloud TTS',desc:'Google Neural2 and WaveNet',logo:'G'},
 {id:'aws',name:'Amazon Polly',desc:'AWS neural text-to-speech',logo:'A'},
 {id:'elevenlabs',name:'ElevenLabs',desc:'Expressive multilingual voices',logo:'XI'},
 {id:'openai',name:'OpenAI Audio',desc:'Natural text-to-speech models',logo:'AI'}
];
const grid=document.getElementById('provider-grid'),count=document.getElementById('configured-count');
let configured=new Set();
function render(){
 grid.innerHTML=providers.map(provider=>{const ready=configured.has(provider.id);return `<article class="provider-card"><div class="provider-name"><span class="provider-logo">${provider.logo}</span><span><strong>${provider.name}</strong><small>${provider.desc}</small></span></div><div class="key-field"><strong>${ready?'Production credential available':'Not configured'}</strong><small>${ready?'Encrypted in Supabase Vault':'Add this provider through the secure SQL setup'}</small></div><span class="connect ${ready?'saved':''}">${ready?'✓ Ready':'Unavailable'}</span></article>`}).join('');
 count.textContent=`${configured.size} production service${configured.size===1?'':'s'} configured`;
}
async function loadConfigured(){
 const config=window.VAANI_SUPABASE;
 try{
  const response=await fetch(`${config.url}/rest/v1/rpc/list_configured_ai_services`,{method:'POST',headers:{apikey:config.publishableKey,Authorization:`Bearer ${config.publishableKey}`,'Content-Type':'application/json'},body:'{}'});
  if(!response.ok)throw new Error('Secure service registry is not ready');
  const rows=await response.json();configured=new Set(rows.map(row=>row.provider));render();
 }catch(error){render();count.textContent='Supabase Vault setup is pending';toast(error.message)}
}
render();loadConfigured();
