import { getAssetUploadPolicy, isValidAssetUploadSize } from "@techabanca/domain";
import { Hono, type Context } from "hono";
import type { CatalogueAppEnv } from "../app-env";
import { requireAuthentication } from "../middleware/require-authentication";
import { AdminError, AdminService, badAdminInput } from "../services/admin-service";

async function input(request:Request,keys:string[]):Promise<Record<string,unknown>> {
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type")??""))throw badAdminInput();
 const max=16384,declared=request.headers.get("Content-Length");
 if(declared&&(!/^\d+$/.test(declared)||Number(declared)>max))throw badAdminInput();
 const reader=request.body?.getReader();if(!reader)throw badAdminInput();
 let size=0;const chunks:Uint8Array[]=[];
 try{for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>max){await reader.cancel();throw badAdminInput();}chunks.push(chunk.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{
  const value:unknown=JSON.parse(new TextDecoder("utf-8",{fatal:true,ignoreBOM:false}).decode(bytes));
  if(!value||typeof value!=="object"||Array.isArray(value))throw badAdminInput();
  const record=value as Record<string,unknown>;
  if(Object.keys(record).length!==keys.length||keys.some(key=>!Object.hasOwn(record,key)))throw badAdminInput();
  return record;
 }catch{throw badAdminInput();}
}
export function createAdminRoutes() {
 const app=new Hono<CatalogueAppEnv>();
 app.use("*",async(c,next)=>{c.header("Cache-Control","private, no-store");c.header("Referrer-Policy","no-referrer");await next();});
 app.use("*",requireAuthentication);
 app.use("*",async(c,next)=>{
  c.header("Cache-Control","private, no-store");
  if(!["GET","HEAD"].includes(c.req.method)){
   const url=new URL(c.req.url);
   if(c.req.header("Origin")!==url.origin||["same-site","cross-site"].includes(c.req.header("Sec-Fetch-Site")??""))
    return c.json({error:{code:"invalid_origin",message:"Use the administration form in this workspace."}},403);
  }
  await next();
 });
 const service=(c:Context<CatalogueAppEnv>)=>{
  const session=c.get("authSession");if(!session)throw new Error("authentication_required");
  return new AdminService(c.env.DB,{userId:session.userId,sessionId:session.sessionId});
 };
 app.use("*",async(c,next)=>{if(new URL(c.req.url).pathname!=="/api/v1/admin/access")await service(c).ensure();c.header("Referrer-Policy","no-referrer");await next();});
 app.get("/access",async c=>{
  try{await service(c).ensure();return c.json({data:{enabled:true}});}catch(e){if(e instanceof AdminError&&e.status===403)return c.json({data:{enabled:false}});throw e;}
 });
 app.get("/overview",async c=>c.json({data:await service(c).overview()}));
 app.get("/catalogues",async c=>c.json({data:await service(c).catalogues(new URL(c.req.url).searchParams)}));
 app.get("/users",async c=>c.json({data:await service(c).users(new URL(c.req.url).searchParams)}));
 app.get("/cases",async c=>c.json({data:await service(c).cases(new URL(c.req.url).searchParams)}));
 app.get("/catalogues/:id",async c=>{
  const q=new URL(c.req.url).searchParams;
  if([...q.keys()].some(k=>!["page","assetPage"].includes(k))||["page","assetPage"].some(k=>q.getAll(k).length>1)||["page","assetPage"].some(k=>q.has(k)&&!/^[1-9]\d{0,3}$/.test(q.get(k)!)))throw badAdminInput();
  return c.json({data:await service(c).catalogue(c.req.param("id"),Number(q.get("page")??1),Number(q.get("assetPage")??1))});
 });
 app.get("/cases/:id",async c=>c.json({data:await service(c).case(c.req.param("id"))}));
 app.post("/cases",async c=>c.json({data:await service(c).createCase(await input(c.req.raw,["id","catalogueId","reason","summary"]))},201));
 app.post("/cases/:id/status",async c=>c.json({data:await service(c).updateCase(c.req.param("id"),await input(c.req.raw,["version","status","note"]),"status")}));
 app.post("/cases/:id/notes",async c=>c.json({data:await service(c).updateCase(c.req.param("id"),await input(c.req.raw,["version","note"]),"note")}));
 app.post("/cases/:id/public-access",async c=>{
  const value=await input(c.req.raw,["blocked","moderationVersion","catalogueVersion","note"]);
  if(typeof value.blocked!=="boolean")throw badAdminInput();
  return c.json({data:await service(c).publicAccess(c.req.param("id"),value,value.blocked)});
 });
 app.get("/reserved-slugs",async c=>c.json({data:await service(c).reserved(new URL(c.req.url).searchParams)}));
 app.post("/reserved-slugs",async c=>c.json({data:await service(c).reserve(await input(c.req.raw,["slug","reason"]))},201));
 app.post("/reserved-slugs/:slug/release",async c=>{
  await input(c.req.raw,[]);
  return c.json({data:await service(c).release(c.req.param("slug"))});
 });
 app.get("/assets/:id",async c=>{
  const asset=await service(c).asset(c.req.param("id")),object=await c.env.ASSETS.get(asset.key);
  if(!object)return c.json({error:{code:"asset_unavailable",message:"This verified file is unavailable."}},404);
  const policy=getAssetUploadPolicy(asset.mime);
  if(!policy||!isValidAssetUploadSize(policy.assetKind,object.size)||object.size!==asset.bytes||object.etag!==asset.etag||object.httpMetadata?.contentType!==asset.mime)throw new AdminError(409,"asset_changed","This file changed after verification. It cannot be opened for review.");
  const body=await object.arrayBuffer(),checksum=[...new Uint8Array(await crypto.subtle.digest("SHA-256",body))].map(b=>b.toString(16).padStart(2,"0")).join("");
  if(checksum!==asset.checksum)throw new AdminError(409,"asset_changed","This file changed after verification. It cannot be opened for review.");
  // Recheck immediately before returning an object; never expose its storage key.
  await service(c).ensure();
  return new Response(body,{headers:{"Content-Type":asset.mime,"X-Content-Type-Options":"nosniff","Cache-Control":"private, no-store",
   "Content-Disposition":asset.mime==="application/pdf"?"attachment; filename=review.pdf":"inline",
   "Content-Security-Policy":"default-src 'none'; sandbox"}});
 });
 app.onError((error,c)=>{
  if(error instanceof AdminError)return c.json({error:{code:error.code,message:error.message}},error.status);
  return c.json({error:{code:"administration_unavailable",message:"Administration is temporarily unavailable. Please try again."}},503);
 });
 return app;
}
