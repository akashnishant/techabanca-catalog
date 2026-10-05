import { MODERATION_REASONS, publicSubscriptionSql, reportClientHash, verifyReportToken, type ReportClaims } from "@techabanca/domain";
import type { PublicBindings, Site } from "./model";
export class ReportError extends Error { constructor(public readonly status:number,message:string,public readonly retryAfter?:number){super(message);} }
export async function readReportForm(request:Request) {
 const fail=(status=400)=>new ReportError(status,"Reload the report form and try again.");
 if(!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(request.headers.get("Content-Type")??""))throw fail(415);
 const max=12*1024,declared=request.headers.get("Content-Length");
 if(declared&&(!/^\d+$/.test(declared)||Number(declared)>max))throw fail(413);
 const reader=request.body?.getReader();if(!reader)throw fail();
 const bytes=new Uint8Array(max);let length=0;
 try{for(;;){const chunk=await reader.read();if(chunk.done)break;if(length+chunk.value.length>max){await reader.cancel();throw fail(413);}bytes.set(chunk.value,length);length+=chunk.value.length;}}finally{reader.releaseLock();}
 const fields:Record<string,string>=Object.create(null);
 try{
  const body=new TextDecoder("utf-8",{fatal:true,ignoreBOM:false}).decode(bytes.subarray(0,length));
  for(const field of body.split("&")){
   const at=field.indexOf("="),name=decodeURIComponent((at<0?field:field.slice(0,at)).replace(/\+/g," ")),
    value=decodeURIComponent((at<0?"":field.slice(at+1)).replace(/\+/g," "));
   if(!["reason","summary","formToken","companyWebsite"].includes(name)||Object.hasOwn(fields,name))throw fail();
   fields[name]=value;
  }
 }catch{throw fail();}
 return fields;
}
export async function reportClaims(fields:Record<string,string>,env:PublicBindings,site:Site,now:number) {
 const claims=await verifyReportToken(fields.formToken??"",env.PUBLICATION_PREVIEW_SECRET,now);
 if(!claims||claims.slug!==site.slug||claims.catalogueId!==site.catalogue_public_id||claims.publicationId!==site.publication_public_id)
  throw new ReportError(409,"This form expired or the catalogue changed. Reload it before sending.");
 if(now-claims.issuedAt<2)throw new ReportError(429,"Please wait a moment before sending your report.",2);
 return claims;
}
const targetSql=" FROM public_catalogue_routes r JOIN catalogue_publications p ON p.id=r.publication_id "
 +"JOIN published_catalogues pc ON pc.publication_id=p.id JOIN catalogues c ON c.public_id=pc.catalogue_public_id "
 +"JOIN organizations o ON o.id=c.organization_id WHERE r.slug=? AND r.status='active' AND p.state='active' AND p.public_id=? "
 +"AND pc.slug=r.slug AND pc.catalogue_public_id=r.catalogue_public_id AND p.catalogue_public_id=r.catalogue_public_id "
 +"AND c.status NOT IN ('suspended','archived') AND c.deleted_at IS NULL AND o.status='active' AND o.deleted_at IS NULL "
 +"AND NOT EXISTS(SELECT 1 FROM reserved_slugs rs WHERE rs.slug=r.slug)";
export async function captureReport(env:PublicBindings,site:Site,claims:ReportClaims,fields:Record<string,string>,address:string,date=new Date()) {
 const summary=(fields.summary??"").trim(),reason=fields.reason;
 if(!MODERATION_REASONS.includes(reason as typeof MODERATION_REASONS[number])||!summary||summary.length>1000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(summary))
  throw new ReportError(422,"Choose a reason and describe the issue in 1–1,000 characters.");
 const policy=targetSql+" AND "+publicSubscriptionSql(env.DEPLOYMENT_ENVIRONMENT==="local"),db=env.DB;
 const target=await db.prepare("SELECT c.id AS id"+policy).bind(site.slug,claims.publicationId).first<{id:number}>();
 if(!target)throw new ReportError(404,"This catalogue is unavailable.");
 const bucket=Math.floor(date.getTime()/3600000),now=date.toISOString(),expiry=new Date((bucket+1)*3600000+86400000).toISOString(),
  client=await reportClientHash(address,env.PUBLICATION_PREVIEW_SECRET!),id="mod_"+crypto.randomUUID().replace(/-/g,"");
 const rate=(hash:string,limit:number)=>db.prepare("INSERT INTO moderation_report_windows(catalogue_id,client_hash,bucket,attempts,expires_at) SELECT ?,?,?,1,? "
  +"WHERE NOT EXISTS(SELECT 1 FROM moderation_cases WHERE submission_nonce=?) ON CONFLICT(catalogue_id,client_hash,bucket) DO UPDATE SET attempts=min(attempts+1,?)")
  .bind(target.id,hash,bucket,expiry,claims.nonce,limit+1);
 const rs=await db.batch([
  rate(client,5),rate("*",30),
  db.prepare("INSERT INTO moderation_cases(public_id,organization_id,catalogue_id,reason_code,summary,source,submission_nonce,opened_at,updated_at) "
   +"SELECT ?,c.organization_id,c.id,?,?,'public_report',?,?,?"+policy
   +" AND EXISTS(SELECT 1 FROM moderation_report_windows w WHERE w.catalogue_id=c.id AND w.client_hash=? AND w.bucket=? AND w.attempts<=5)"
   +" AND EXISTS(SELECT 1 FROM moderation_report_windows w WHERE w.catalogue_id=c.id AND w.client_hash='*' AND w.bucket=? AND w.attempts<=30)"
   +" ON CONFLICT(submission_nonce) WHERE submission_nonce IS NOT NULL DO NOTHING")
   .bind(id,reason,summary,claims.nonce,now,now,site.slug,claims.publicationId,client,bucket,bucket),
  db.prepare("INSERT INTO moderation_case_events(moderation_case_id,event_type,note,created_at) SELECT id,'created',?,? FROM moderation_cases WHERE public_id=? AND changes()=1").bind(summary,now,id),
  db.prepare("INSERT INTO audit_events(organization_id,actor_type,action,entity_type,entity_public_id,metadata_json,created_at) SELECT organization_id,'system','moderation.public_reported','moderation',public_id,?,? FROM moderation_cases WHERE public_id=? AND changes()=1")
   .bind(JSON.stringify({catalogueId:site.catalogue_public_id,reason}),now,id),
 ]);
 if(rs[2].meta.changes>0)return;
 if(await db.prepare("SELECT 1 FROM moderation_cases WHERE submission_nonce=? AND catalogue_id=?").bind(claims.nonce,target.id).first())return;
 const limited=await db.prepare("SELECT 1 FROM moderation_report_windows WHERE catalogue_id=? AND bucket=? AND ((client_hash=? AND attempts>5) OR (client_hash='*' AND attempts>30))").bind(target.id,bucket,client).first();
 if(limited)throw new ReportError(429,"Too many reports were sent recently. Please try again in an hour.");
 throw new ReportError(409,"The catalogue changed while sending. Reload the page before sending.");
}
