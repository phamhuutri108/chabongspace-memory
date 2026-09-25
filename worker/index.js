import { AwsClient } from "aws4fetch";

const json = (data, init={}) => new Response(JSON.stringify(data), {
  ...init, headers: {"content-type":"application/json; charset=utf-8", ...(init.headers||{})}
});
const cors = {"access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,PUT,DELETE,OPTIONS","access-control-allow-headers":"content-type,authorization"};

async function signR2(env,key,method,contentType){
  const client=new AwsClient({accessKeyId:env.R2_ACCESS_KEY_ID,secretAccessKey:env.R2_SECRET_ACCESS_KEY});
  const url=new URL(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME}/${key}`);
  url.searchParams.set("X-Amz-Expires","900");
  const signed=await client.sign(new Request(url,{method,headers:contentType?{"content-type":contentType}:{} }),{aws:{signQuery:true}});
  return signed.url;
}
export default {
 async fetch(request,env){
  if(request.method==="OPTIONS") return new Response(null,{headers:cors});
  const url=new URL(request.url);
  try{
   if(url.pathname==="/api/health") return json({ok:true,service:"chabongspace-memory"},{headers:cors});
   if(url.pathname==="/api/photos"&&request.method==="GET"){
    const limit=Math.min(Number(url.searchParams.get("limit")||100),500);
    const rows=await env.DB.prepare("SELECT id,r2_key,preview_key,created_at,captured_at,caption,location,event,person,pet,ai_labels,tags,width,height,size_bytes,mime_type,status FROM photos WHERE status='ready' ORDER BY created_at DESC LIMIT ?").bind(limit).all();
    return json(rows.results,{headers:cors});
   }
   if(url.pathname==="/api/uploads"&&request.method==="POST"){
    const body=await request.json();
    if(!body.id||!body.mimeType) return json({error:"id and mimeType are required"},{status:400,headers:cors});
    const key=`photos/${new Date().getUTCFullYear()}/${String(new Date().getUTCMonth()+1).padStart(2,"0")}/${body.id}/original`;
    const previewKey=`photos/${new Date().getUTCFullYear()}/${String(new Date().getUTCMonth()+1).padStart(2,"0")}/${body.id}/preview.webp`;
    const uploadUrl=await signR2(env,key,"PUT",body.mimeType);
    const previewUrl=await signR2(env,previewKey,"PUT","image/webp");
    await env.DB.prepare("INSERT INTO photos (id,r2_key,preview_key,created_at,captured_at,caption,width,height,size_bytes,mime_type,status) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status='uploading'").bind(body.id,key,previewKey,new Date().toISOString(),body.capturedAt||null,body.caption||null,body.width||null,body.height||null,body.sizeBytes||null,body.mimeType,"uploading").run();
    return json({id:body.id,key,previewKey,uploadUrl,previewUrl},{headers:cors});
   }
   if(url.pathname==="/api/uploads/complete"&&request.method==="POST"){
    const body=await request.json();
    await env.DB.prepare("UPDATE photos SET status='ready',size_bytes=COALESCE(?,size_bytes),caption=COALESCE(?,caption) WHERE id=?").bind(body.sizeBytes||null,body.caption||null,body.id).run();
    return json({ok:true,id:body.id},{headers:cors});
   }
   if(url.pathname==="/api/download"&&request.method==="GET"){
    const id=url.searchParams.get("id"); const row=await env.DB.prepare("SELECT r2_key FROM photos WHERE id=?").bind(id).first();
    if(!row) return json({error:"not found"},{status:404,headers:cors});
    return json({url:await signR2(env,row.r2_key,"GET")},{headers:cors});
   }
   return new Response("Not found",{status:404,headers:cors});
  }catch(e){return json({error:e.message||"server error"},{status:500,headers:cors});}
 }
};