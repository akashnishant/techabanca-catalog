import { canTransitionModerationStatus, hasPublicIdPrefix, isModerationStatus, isValidCatalogueSlug, MODERATION_REASONS,
 type AdminCatalogue, type AdminCatalogueDetail, type AdminCase, type AdminCaseDetail, type AdminOverview, type AdminPage, type AdminReservedSlug, type AdminUser } from "@techabanca/domain";
export type PlatformActor = { userId: number; sessionId: number };
export class AdminError extends Error {
 constructor(public readonly status: 400 | 403 | 404 | 409 | 429, public readonly code: string, message: string) { super(message); }
}
export const badAdminInput = () => new AdminError(400, "invalid_admin_request", "Check the administration request and try again.");
export function platformActorSql(actor: PlatformActor) {
 if (![actor.userId, actor.sessionId].every(x => Number.isSafeInteger(x) && x > 0)) throw new AdminError(403, "platform_access_required", "Platform administration access is required.");
 // Only validated server-resolved database integers enter this expression.
 return `EXISTS (SELECT 1 FROM platform_admins g JOIN users u ON u.id = g.user_id
 JOIN sessions s ON s.user_id = u.id WHERE g.user_id = ${actor.userId} AND s.id = ${actor.sessionId}
 AND g.status = 'active' AND u.status = 'active' AND u.deleted_at IS NULL
 AND s.revoked_at IS NULL AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;
}
function filters(query: URLSearchParams, states: string[]) {
 const q = (query.get("q") ?? "").trim(), state = query.get("state") ?? "all", text = query.get("page") ?? "1";
 if ([...query.keys()].some(k => !["q", "state", "page"].includes(k)) || ["q", "state", "page"].some(k => query.getAll(k).length > 1)
 || q.length > 100 || !states.includes(state) || !/^[1-9]\d{0,3}$/.test(text)) throw badAdminInput();
 return { q, state, page: Number(text) };
}
const catalogueSelect = `SELECT c.public_id AS id, c.name, o.name AS businessName, c.slug, c.status, c.version,
 r.status AS routeStatus, p.revision_number AS revision, p.public_id AS publicationId, m.blocked,
 m.version AS moderationVersion, mc.public_id AS blockingCaseId,
 (SELECT count(*) FROM catalogue_items i WHERE i.catalogue_id=c.id AND i.deleted_at IS NULL) AS items,
 (SELECT coalesce(sum(a.byte_size),0) FROM assets a WHERE a.organization_id=o.id AND a.status='ready' AND a.deleted_at IS NULL) AS storageBytes,
 (SELECT s.status FROM subscriptions s WHERE s.organization_id=o.id ORDER BY s.created_at DESC,s.id DESC LIMIT 1) AS subscriptionStatus
 FROM catalogues c JOIN organizations o ON o.id=c.organization_id
 JOIN catalogue_moderation_state m ON m.catalogue_id=c.id
 LEFT JOIN moderation_cases mc ON mc.id=m.case_id
 LEFT JOIN public_catalogue_routes r ON r.catalogue_public_id=c.public_id
 LEFT JOIN catalogue_publications p ON p.id=r.publication_id`;
const caseSelect = `SELECT mc.public_id AS id, c.public_id AS catalogueId, c.name AS catalogueName, c.slug,
 mc.source, mc.status, mc.reason_code AS reason, mc.summary, mc.resolution_note AS resolutionNote,
 mc.version, mc.opened_at AS openedAt, mc.updated_at AS updatedAt
 FROM moderation_cases mc JOIN catalogues c ON c.id=mc.catalogue_id`;
function catalogueRow(row: Omit<AdminCatalogue,"blocked"> & { blocked: number | boolean }): AdminCatalogue { return { ...row, blocked: !!row.blocked }; }
function text(value: unknown, max: number) { if (typeof value !== "string" || !value.trim() || value.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw badAdminInput(); return value.trim(); }
function version(value: unknown) { if (!Number.isSafeInteger(value) || Number(value) < 0) throw badAdminInput(); return Number(value); }
export class AdminService {
 private readonly gate: string;
 constructor(private readonly db: D1Database, private readonly actor: PlatformActor) { this.gate = platformActorSql(actor); }
 async ensure() { if (!await this.db.prepare("SELECT 1 WHERE " + this.gate).first()) throw new AdminError(403, "platform_access_required", "Platform administration access is required."); }
 private async budget() {
  await this.ensure(); const bucket = Math.floor(Date.now()/60000), expiry = new Date((bucket+2)*60000).toISOString();
  const row = await this.db.prepare(`INSERT INTO platform_actor_windows(user_id,bucket,attempts,expires_at)
   SELECT ?,?,1,? WHERE ${this.gate} ON CONFLICT(user_id,bucket) DO UPDATE SET attempts=attempts+1 WHERE attempts<60 RETURNING attempts`)
   .bind(this.actor.userId,bucket,expiry).first();
  if (!row) { await this.ensure(); throw new AdminError(429,"admin_rate_limited","Too many administration changes. Wait a minute and try again."); }
 }
 private async changed(result: D1Result) { if (!result.meta.changes) { await this.ensure(); throw new AdminError(409,"moderation_changed","The case, catalogue or permissions changed. Refresh before trying again."); } }
 private audit(action: string, entity: string, id: string, note: Record<string, unknown>, now: string, condition: string) {
  return this.db.prepare(`INSERT INTO audit_events(organization_id,actor_user_id,actor_type,action,entity_type,entity_public_id,metadata_json,created_at)
   SELECT (SELECT c.organization_id FROM catalogues c WHERE c.public_id=?),?,'admin',?,?,?,?,? WHERE ${condition} AND ${this.gate}`)
   .bind(note.catalogueId ?? null,this.actor.userId,action,entity,id,JSON.stringify(note),now);
 }
 async overview(): Promise<AdminOverview> {
  await this.ensure(); const results = await this.db.batch([
   this.db.prepare(`SELECT (SELECT count(*) FROM users WHERE deleted_at IS NULL) AS users,
    (SELECT count(*) FROM organizations WHERE deleted_at IS NULL) AS organizations,
    (SELECT count(*) FROM catalogues WHERE deleted_at IS NULL) AS catalogues,
    (SELECT count(*) FROM catalogue_moderation_state WHERE blocked=1) AS suspended,
    (SELECT count(*) FROM subscriptions) AS subscriptions,
    (SELECT coalesce(sum(byte_size),0) FROM assets WHERE status='ready' AND deleted_at IS NULL) AS storageBytes,
    (SELECT count(*) FROM moderation_cases WHERE status IN ('open','reviewing')) AS openCases WHERE ${this.gate}`),
   this.db.prepare(`SELECT a.action,a.entity_type AS entityType,a.entity_public_id AS entityId,u.display_name AS actor,a.created_at AS createdAt
    FROM audit_events a LEFT JOIN users u ON u.id=a.actor_user_id WHERE ${this.gate} ORDER BY a.created_at DESC,a.id DESC LIMIT 30`),
  ]);
  if (!results[0].results[0]) { await this.ensure(); throw new Error("admin_unavailable"); }
  return { counts: results[0].results[0] as AdminOverview["counts"], activity: results[1].results as AdminOverview["activity"] };
 }
 async catalogues(query: URLSearchParams): Promise<AdminPage<AdminCatalogue>> {
  const f=filters(query,["all","draft","published","suspended","archived"]); await this.ensure();
  const where=` WHERE c.deleted_at IS NULL AND o.deleted_at IS NULL AND ${this.gate}
   AND (?='all' OR c.status=?) AND (?='' OR instr(lower(c.name),lower(?))>0 OR instr(lower(o.name),lower(?))>0 OR instr(c.slug,lower(?))>0)`;
  const b=[f.state,f.state,f.q,f.q,f.q,f.q];
  const rs=await this.db.batch([this.db.prepare("SELECT count(*) AS n FROM catalogues c JOIN organizations o ON o.id=c.organization_id"+where).bind(...b),
   this.db.prepare(catalogueSelect+where+" ORDER BY c.updated_at DESC,c.id DESC LIMIT 24 OFFSET ?").bind(...b,(f.page-1)*24)]);
  return { rows:(rs[1].results as Array<Omit<AdminCatalogue,"blocked"> & { blocked:number }>).map(catalogueRow),total:(rs[0].results[0] as {n:number}).n,page:f.page,pageSize:24 };
 }
 async users(query: URLSearchParams): Promise<AdminPage<AdminUser>> {
  const f=filters(query,["all","active","suspended"]); await this.ensure();
  const where=` WHERE u.deleted_at IS NULL AND ${this.gate} AND (?='all' OR u.status=?) AND (?='' OR instr(lower(u.display_name),lower(?))>0 OR instr(lower(u.email),lower(?))>0)`;
  const b=[f.state,f.state,f.q,f.q,f.q];
  const rs=await this.db.batch([this.db.prepare("SELECT count(*) AS n FROM users u"+where).bind(...b),
   this.db.prepare(`SELECT u.public_id AS id,u.display_name AS name,u.email,u.status,u.created_at AS createdAt,
    (SELECT count(*) FROM organization_members m WHERE m.user_id=u.id AND m.status='active') AS businesses,
    EXISTS(SELECT 1 FROM platform_admins g WHERE g.user_id=u.id AND g.status='active') AS platformAdmin FROM users u`+where+" ORDER BY u.created_at DESC,u.id DESC LIMIT 24 OFFSET ?").bind(...b,(f.page-1)*24)]);
  return { rows:(rs[1].results as Array<Omit<AdminUser,"platformAdmin"> & {platformAdmin:number}>).map(row=>({...row,platformAdmin:!!row.platformAdmin})),total:(rs[0].results[0] as {n:number}).n,page:f.page,pageSize:24 };
 }
 async cases(query: URLSearchParams): Promise<AdminPage<AdminCase>> {
  const f=filters(query,["all","open","reviewing","resolved","dismissed"]); await this.ensure();
  const where=` WHERE c.deleted_at IS NULL AND ${this.gate} AND (?='all' OR mc.status=?) AND (?='' OR instr(lower(mc.summary),lower(?))>0 OR instr(lower(c.name),lower(?))>0 OR instr(c.slug,lower(?))>0)`;
  const b=[f.state,f.state,f.q,f.q,f.q,f.q];
  const rs=await this.db.batch([this.db.prepare("SELECT count(*) AS n FROM moderation_cases mc JOIN catalogues c ON c.id=mc.catalogue_id"+where).bind(...b),
   this.db.prepare(caseSelect+where+" ORDER BY mc.opened_at DESC,mc.id DESC LIMIT 24 OFFSET ?").bind(...b,(f.page-1)*24)]);
  return { rows:rs[1].results as AdminCase[],total:(rs[0].results[0] as {n:number}).n,page:f.page,pageSize:24 };
 }
 async catalogue(id: string, page=1, assetPage=1): Promise<AdminCatalogueDetail> {
  if (!hasPublicIdPrefix(id,"cat") || !Number.isSafeInteger(page) || page<1 || page>9999 || !Number.isSafeInteger(assetPage) || assetPage<1 || assetPage>9999) throw badAdminInput(); await this.ensure();
  const rs=await this.db.batch([
   this.db.prepare(catalogueSelect+` WHERE c.public_id=? AND c.deleted_at IS NULL AND o.deleted_at IS NULL AND ${this.gate}`).bind(id),
   this.db.prepare(`SELECT i.public_id AS id,i.name,i.item_type AS type,i.status,coalesce(i.long_description,i.short_description) AS description FROM catalogue_items i JOIN catalogues c ON c.id=i.catalogue_id
    WHERE c.public_id=? AND i.deleted_at IS NULL AND ${this.gate} ORDER BY i.sort_order,i.name,i.id LIMIT 24 OFFSET ?`).bind(id,(page-1)*24),
   this.db.prepare(`SELECT a.public_id AS id,a.original_filename AS name,a.asset_kind AS kind,a.mime_type AS mime,a.byte_size AS bytes,a.status,(a.status='ready' AND a.verified_at IS NOT NULL AND a.mime_type IN ('image/png','image/jpeg','image/webp','application/pdf')) AS reviewable FROM assets a JOIN catalogues c ON c.organization_id=a.organization_id
    WHERE c.public_id=? AND a.deleted_at IS NULL AND ${this.gate} ORDER BY a.created_at DESC,a.id DESC LIMIT 24 OFFSET ?`).bind(id,(assetPage-1)*24),
   this.db.prepare(`SELECT count(*) AS n FROM assets a JOIN catalogues c ON c.organization_id=a.organization_id WHERE c.public_id=? AND a.deleted_at IS NULL AND ${this.gate}`).bind(id),
   this.db.prepare(caseSelect+` WHERE c.public_id=? AND ${this.gate} ORDER BY mc.opened_at DESC,mc.id DESC LIMIT 30`).bind(id),
   this.db.prepare(`SELECT s.public_id AS id,p.name AS plan,s.status,s.trial_ends_at AS trialEndsAt,s.current_period_ends_at AS periodEndsAt FROM subscriptions s JOIN subscription_plans p ON p.id=s.plan_id JOIN catalogues c ON c.organization_id=s.organization_id WHERE c.public_id=? AND ${this.gate} ORDER BY s.created_at DESC,s.id DESC LIMIT 10`).bind(id),
  ]);
  const c=rs[0].results[0] as Omit<AdminCatalogue,"blocked"> & {blocked:number};
  if (!c) { await this.ensure(); throw new AdminError(404,"catalogue_not_found","This catalogue is unavailable."); }
  return { catalogue:catalogueRow(c),items:rs[1].results as AdminCatalogueDetail["items"],itemPage:page,itemTotal:c.items,assets:(rs[2].results as AdminCatalogueDetail["assets"]).map(a=>({...a,reviewable:!!a.reviewable})),assetPage,assetTotal:(rs[3].results[0] as {n:number}).n,cases:rs[4].results as AdminCase[],subscriptions:rs[5].results as AdminCatalogueDetail["subscriptions"] };
 }
 async case(id: string): Promise<AdminCaseDetail> {
  if (!hasPublicIdPrefix(id,"mod")) throw badAdminInput(); await this.ensure();
  const record=await this.db.prepare(caseSelect+` WHERE mc.public_id=? AND c.deleted_at IS NULL AND ${this.gate}`).bind(id).first<AdminCase>();
  if (!record) { await this.ensure(); throw new AdminError(404,"case_not_found","This moderation case is unavailable."); }
  const [catalogue,events]=await Promise.all([this.catalogue(record.catalogueId),this.db.prepare(`SELECT e.event_type AS type,e.from_status AS 'from',e.to_status AS 'to',e.note,u.display_name AS actor,e.created_at AS createdAt
   FROM moderation_case_events e JOIN moderation_cases mc ON mc.id=e.moderation_case_id LEFT JOIN users u ON u.id=e.actor_user_id
   WHERE mc.public_id=? AND ${this.gate} ORDER BY e.id DESC LIMIT 100`).bind(id).all<AdminCaseDetail["events"][number]>()]);
  return { record,catalogue:catalogue.catalogue,events:events.results };
 }
 async createCase(input: Record<string,unknown>) {
  const id=input.id,cat=input.catalogueId,reason=input.reason,summary=text(input.summary,1000);
  if (typeof id!=="string"||!hasPublicIdPrefix(id,"mod")||typeof cat!=="string"||!hasPublicIdPrefix(cat,"cat")||typeof reason!=="string"||!MODERATION_REASONS.includes(reason as typeof MODERATION_REASONS[number])) throw badAdminInput();
  await this.budget(); const prior=await this.db.prepare(`SELECT c.public_id AS catalogueId,mc.reason_code AS reason,mc.summary FROM moderation_cases mc JOIN catalogues c ON c.id=mc.catalogue_id WHERE mc.public_id=? AND ${this.gate}`).bind(id).first();
  if (prior) { if (prior.catalogueId!==cat||prior.reason!==reason||prior.summary!==summary) throw new AdminError(409,"case_id_conflict","This request ID already belongs to another case."); return this.case(id); }
  const now=new Date().toISOString();
  const result=await this.db.batch([
   this.db.prepare(`INSERT INTO moderation_cases(public_id,organization_id,catalogue_id,reason_code,summary,opened_at,updated_at,created_by_user_id)
    SELECT ?,c.organization_id,c.id,?,?,?, ?,? FROM catalogues c JOIN organizations o ON o.id=c.organization_id
    WHERE c.public_id=? AND c.deleted_at IS NULL AND o.deleted_at IS NULL AND ${this.gate} ON CONFLICT(public_id) DO NOTHING`).bind(id,reason,summary,now,now,this.actor.userId,cat),
   this.db.prepare("INSERT INTO moderation_case_events(moderation_case_id,actor_user_id,event_type,note,created_at) SELECT id,?,'created',?,? FROM moderation_cases WHERE public_id=? AND changes()=1").bind(this.actor.userId,summary,now,id),
   this.audit("moderation.case_created","moderation",id,{catalogueId:cat,reason},now,"changes()=1"),
  ]);
  await this.changed(result[0]); return this.case(id);
 }
 async updateCase(id: string,input: Record<string,unknown>,kind:"status"|"note") {
  const expected=version(input.version),note=text(input.note,2000),record=(await this.case(id)).record;
  const status=kind==="status"?input.status:record.status;
  if (typeof status!=="string"||!isModerationStatus(status)||(kind==="status"&&(status===record.status||!canTransitionModerationStatus(record.status,status)))) throw badAdminInput();
  await this.budget(); const now=new Date().toISOString(),token=crypto.randomUUID();
  const condition=`EXISTS(SELECT 1 FROM moderation_cases WHERE public_id='${id}' AND write_token='${token}')`;
  const rs=await this.db.batch([
   this.db.prepare(`UPDATE moderation_cases SET status=?,resolution_note=CASE WHEN ?='status' AND ? IN ('resolved','dismissed') THEN ? ELSE resolution_note END,
    resolved_at=CASE WHEN ? IN ('resolved','dismissed') THEN coalesce(resolved_at,?) ELSE NULL END,version=version+1,write_token=?,updated_at=?
    WHERE public_id=? AND version=? AND status=? AND ${this.gate}`).bind(status,kind,status,note,status,now,token,now,id,expected,record.status),
   this.db.prepare(`INSERT INTO moderation_case_events(moderation_case_id,actor_user_id,event_type,from_status,to_status,note,created_at)
    SELECT id,?,?,?,?,?,? FROM moderation_cases WHERE public_id=? AND ${condition} AND ${this.gate}`)
    .bind(this.actor.userId,kind==="status"?"status_changed":"note",kind==="status"?record.status:null,kind==="status"?status:null,note,now,id),
   this.audit(kind==="status"?"moderation.status_changed":"moderation.note_added","moderation",id,{catalogueId:record.catalogueId,from:record.status,to:status},now,condition),
  ]);
  await this.changed(rs[0]); return this.case(id);
 }
 async publicAccess(id:string,input:Record<string,unknown>,blocked:boolean) {
  const current=await this.case(id),expected=version(input.moderationVersion),catalogueVersion=version(input.catalogueVersion),note=text(input.note,2000);
  if (blocked && !["open","reviewing"].includes(current.record.status)) throw new AdminError(409,"case_closed","Open a review case before suspending public access.");
  await this.budget();const now=new Date().toISOString(),token=crypto.randomUUID();
  const stateCondition=`EXISTS(SELECT 1 FROM catalogue_moderation_state m JOIN catalogues c ON c.id=m.catalogue_id WHERE c.public_id='${current.record.catalogueId}' AND m.write_token='${token}')`;
  const rs=await this.db.batch([
   this.db.prepare(`UPDATE catalogue_moderation_state AS m SET blocked=?,previous_status=CASE WHEN ?=1 THEN (SELECT status FROM catalogues WHERE id=m.catalogue_id) ELSE previous_status END,
    case_id=(SELECT id FROM moderation_cases WHERE public_id=?),version=version+1,write_token=?
    WHERE m.version=? AND m.blocked=? AND ${this.gate}
    AND EXISTS(SELECT 1 FROM moderation_cases mc WHERE mc.public_id=? AND mc.catalogue_id=m.catalogue_id AND (?=0 OR mc.status IN ('open','reviewing')))
    AND EXISTS(SELECT 1 FROM catalogues c JOIN organizations o ON o.id=c.organization_id WHERE c.id=m.catalogue_id AND c.public_id=? AND c.version=?
     AND c.deleted_at IS NULL AND o.deleted_at IS NULL AND o.status='active'
     AND ((?=1 AND c.status IN ('draft','published') AND NOT EXISTS(SELECT 1 FROM public_catalogue_routes r WHERE r.catalogue_public_id=c.public_id AND r.status='suspended'))
       OR (?=0 AND c.status='suspended' AND m.case_id=(SELECT id FROM moderation_cases WHERE public_id=?))))`)
    .bind(blocked?1:0,blocked?1:0,id,token,expected,blocked?0:1,id,blocked?1:0,current.record.catalogueId,catalogueVersion,blocked?1:0,blocked?1:0,id),
   this.db.prepare(`UPDATE catalogues SET status=CASE WHEN ?=1 THEN 'suspended' ELSE (SELECT previous_status FROM catalogue_moderation_state WHERE catalogue_id=catalogues.id) END,
    version=version+1,updated_at=? WHERE public_id=? AND ${stateCondition}`).bind(blocked?1:0,now,current.record.catalogueId),
   this.db.prepare(`UPDATE public_catalogue_routes SET status=?,updated_at=? WHERE catalogue_public_id=? AND ${stateCondition}
    AND EXISTS(SELECT 1 FROM catalogue_publications p WHERE p.id=public_catalogue_routes.publication_id AND p.state='active')`).bind(blocked?"suspended":"active",now,current.record.catalogueId),
   this.db.prepare(`UPDATE catalogue_publications SET state='failed',failed_at=?,preview_revoked_at=?
    WHERE catalogue_public_id=? AND state='building' AND ?=1 AND ${stateCondition}`).bind(now,now,current.record.catalogueId,blocked?1:0),
   this.db.prepare(`INSERT INTO moderation_case_events(moderation_case_id,actor_user_id,event_type,note,created_at)
    SELECT id,?,?,?,? FROM moderation_cases WHERE public_id=? AND ${stateCondition} AND ${this.gate}`).bind(this.actor.userId,blocked?"public_suspended":"public_restored",note,now,id),
   this.audit(blocked?"moderation.public_suspended":"moderation.public_restored","catalogue",current.record.catalogueId,{catalogueId:current.record.catalogueId,caseId:id},now,stateCondition),
  ]);
  await this.changed(rs[0]);return this.case(id);
 }
 async reserved(query=new URLSearchParams()):Promise<AdminPage<AdminReservedSlug>> {
  const f=filters(query,["all"]);await this.ensure();
  const where=` WHERE ${this.gate} AND (?='' OR instr(slug,lower(?))>0)`;
  const rs=await this.db.batch([
   this.db.prepare("SELECT count(*) AS n FROM reserved_slugs"+where).bind(f.q,f.q),
   this.db.prepare("SELECT slug,reason,platform_managed AS managed FROM reserved_slugs"+where+" ORDER BY slug LIMIT 24 OFFSET ?").bind(f.q,f.q,(f.page-1)*24)
  ]);
  return {rows:(rs[1].results as Array<Omit<AdminReservedSlug,"managed"> & {managed:number}>).map(r=>({...r,managed:!!r.managed})),total:(rs[0].results[0] as {n:number}).n,page:f.page,pageSize:24};
 }
 async reserve(input:Record<string,unknown>) {
  const slug=input.slug,reason=text(input.reason,200);
  if(typeof slug!=="string"||!isValidCatalogueSlug(slug)||/^(draft|deleted)-/.test(slug))throw badAdminInput();await this.budget();const now=new Date().toISOString();
  try {const rs=await this.db.batch([
   this.db.prepare(`INSERT INTO reserved_slugs(slug,reason,platform_managed,created_at) SELECT ?,?,1,? WHERE ${this.gate}
    AND NOT EXISTS(SELECT 1 FROM catalogues WHERE slug=? AND deleted_at IS NULL) ON CONFLICT(slug) DO NOTHING`).bind(slug,reason,now,slug),
   this.audit("moderation.slug_reserved","slug",slug,{},now,"changes()=1"),
  ]);if(!rs[0].meta.changes){await this.ensure();throw new AdminError(409,"slug_unavailable","This slug is already reserved or claimed.");}}catch(e){if(e instanceof Error&&e.message.includes("slug_already_claimed_by_catalogue"))throw new AdminError(409,"slug_unavailable","This slug is already reserved or claimed.");throw e;}return {saved:true};
 }
 async release(slug:string) {
  if(!isValidCatalogueSlug(slug))throw badAdminInput();await this.budget();const now=new Date().toISOString();const rs=await this.db.batch([
   this.db.prepare(`DELETE FROM reserved_slugs WHERE slug=? AND platform_managed=1 AND ${this.gate}`).bind(slug),
   this.audit("moderation.slug_released","slug",slug,{},now,"changes()=1"),
  ]);if(!rs[0].meta.changes){await this.ensure();throw new AdminError(409,"reservation_unavailable","This reservation is protected or was already released.");}return {saved:true};
 }
 async asset(id:string) {
  if(!hasPublicIdPrefix(id,"ast"))throw badAdminInput();await this.ensure();
  const asset=await this.db.prepare(`SELECT a.object_key AS key,a.mime_type AS mime,a.byte_size AS bytes,a.etag,a.checksum_sha256 AS checksum FROM assets a JOIN organizations o ON o.id=a.organization_id
   WHERE a.public_id=? AND a.status='ready' AND a.deleted_at IS NULL AND a.verified_at IS NOT NULL AND o.deleted_at IS NULL AND ${this.gate}`).bind(id).first<{key:string;mime:string;bytes:number;etag:string|null;checksum:string|null}>();
  if(!asset||!["image/png","image/jpeg","image/webp","application/pdf"].includes(asset.mime))throw new AdminError(404,"asset_unavailable","This verified file is unavailable.");return asset;
 }
}
export async function purgeModerationWindows(db:D1Database,date=new Date()) {
 const now=date.toISOString();
 for (let round=0;round<20;round++) {
  const rs=await db.batch([
   db.prepare("DELETE FROM platform_actor_windows WHERE (user_id,bucket) IN (SELECT user_id,bucket FROM platform_actor_windows WHERE expires_at<=? LIMIT 1000)").bind(now),
   db.prepare("DELETE FROM moderation_report_windows WHERE (catalogue_id,client_hash,bucket) IN (SELECT catalogue_id,client_hash,bucket FROM moderation_report_windows WHERE expires_at<=? LIMIT 1000)").bind(now),
  ]);
  if(rs.every(r=>r.meta.changes<1000))return;
 }
 throw new Error("moderation_retention_backlog");
}
