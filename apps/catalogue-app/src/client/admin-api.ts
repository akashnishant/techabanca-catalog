import type { AdminCatalogueDetail, AdminCaseDetail, AdminOverview, AdminPage, AdminCatalogue, AdminCase, AdminUser, AdminReservedSlug } from "@techabanca/domain";
export class AdminApiError extends Error { constructor(public readonly status:number,message:string){super(message);} }
export function createAdminApi(fetcher:typeof fetch=fetch) {
 async function request<T>(path:string,signal?:AbortSignal,body?:unknown):Promise<T>{
  const init:RequestInit & {credentials:"same-origin"}={signal,credentials:"same-origin",headers:{"Accept":"application/json",...(body===undefined?{}:{"Content-Type":"application/json"})},
   ...(body===undefined?{}:{method:"POST",body:JSON.stringify(body)})};
  const response=await fetcher("/api/v1/admin"+path,init);
  let value:{data?:T;error?:{message?:string}};try{value=await response.json() as typeof value;}catch{throw new AdminApiError(response.status,"Administration returned an unreadable response. Please try again.");}
  if(!response.ok)throw new AdminApiError(response.status,value?.error?.message??"Administration is temporarily unavailable.");
  if(!value||typeof value!=="object"||!("data" in value))throw new AdminApiError(503,"Administration returned an unreadable response.");
  return value.data as T;
 }
 const query=(q:string,state:string,page:number)=>new URLSearchParams({q,state,page:String(page)}).toString();
 return {
  access:(signal?:AbortSignal)=>request<{enabled:boolean}>("/access",signal),
  overview:(signal?:AbortSignal)=>request<AdminOverview>("/overview",signal),
  catalogues:(q:string,state:string,page:number,signal?:AbortSignal)=>request<AdminPage<AdminCatalogue>>("/catalogues?"+query(q,state,page),signal),
  users:(q:string,state:string,page:number,signal?:AbortSignal)=>request<AdminPage<AdminUser>>("/users?"+query(q,state,page),signal),
  cases:(q:string,state:string,page:number,signal?:AbortSignal)=>request<AdminPage<AdminCase>>("/cases?"+query(q,state,page),signal),
  reserved:(q:string,page:number,signal?:AbortSignal)=>request<AdminPage<AdminReservedSlug>>("/reserved-slugs?"+query(q,"all",page),signal),
  catalogue:(id:string,page=1,assetPage=1,signal?:AbortSignal)=>request<AdminCatalogueDetail>("/catalogues/"+encodeURIComponent(id)+"?page="+page+"&assetPage="+assetPage,signal),
  case:(id:string,signal?:AbortSignal)=>request<AdminCaseDetail>("/cases/"+encodeURIComponent(id),signal),
  createCase:(id:string,catalogueId:string,reason:string,summary:string)=>request<AdminCaseDetail>("/cases",undefined,{id,catalogueId,reason,summary}),
  status:(id:string,version:number,status:string,note:string)=>request<AdminCaseDetail>("/cases/"+encodeURIComponent(id)+"/status",undefined,{version,status,note}),
  note:(id:string,version:number,note:string)=>request<AdminCaseDetail>("/cases/"+encodeURIComponent(id)+"/notes",undefined,{version,note}),
  publicAccess:(record:AdminCaseDetail,blocked:boolean,note:string)=>request<AdminCaseDetail>("/cases/"+encodeURIComponent(record.record.id)+"/public-access",undefined,
   {blocked,note,moderationVersion:record.catalogue.moderationVersion,catalogueVersion:record.catalogue.version}),
  reserve:(slug:string,reason:string)=>request<{saved:boolean}>("/reserved-slugs",undefined,{slug,reason}),
  release:(slug:string)=>request<{saved:boolean}>("/reserved-slugs/"+encodeURIComponent(slug)+"/release",undefined,{}),
 };
}
export const adminApi=createAdminApi();
