import { MODERATION_REASONS } from "@techabanca/domain";
import type { Site } from "./model";
import type { PublicHost } from "./routing";
import { document, escapeHtml } from "./render";
export function reportPage(site:Site,host:PublicHost,options:{token?:string;notice?:string;sent?:boolean;reason?:string;summary?:string}={}) {
 const labels:Record<string,string>={spam:"Spam",prohibited_content:"Prohibited content",impersonation:"Impersonation",abuse:"Abuse",security:"Security issue",legal:"Legal concern",other:"Other"};
 const body='<section class="wrap section"><p class="eyebrow">Catalogue review</p><h1>Report this catalogue</h1>'
  +'<p class="muted">Tell Techabanca about a concern with this catalogue. Reports are reviewed before any action is taken. Avoid including personal or sensitive information.</p>'
  +(options.notice?'<p class="notice" role="alert">'+escapeHtml(options.notice)+'</p>':'')
  +(options.sent?'<div class="notice" role="status"><h2>Report received</h2><p>Thank you. Your report has been received for review.</p></div><a class="button" href="/">Return to catalogue</a>':
   options.token?'<form class="enquiry-form" method="post" action="/report"><input type="hidden" name="formToken" value="'+escapeHtml(options.token)+'">'
    +'<div class="enquiry-field"><label>Reason<select name="reason" required>'+MODERATION_REASONS.map(reason=>'<option value="'+reason+'"'+(options.reason===reason?' selected':'')+'>'+labels[reason]+'</option>').join('')+'</select></label></div>'
    +'<div class="enquiry-field"><label>Describe the issue<textarea name="summary" required minlength="1" maxlength="1000" rows="6">'+escapeHtml(options.summary??"")+'</textarea></label></div>'
    +'<div hidden aria-hidden="true"><label>Website<input name="companyWebsite" tabindex="-1" autocomplete="off"></label></div>'
    +'<button type="submit" class="button">Send report</button></form>':'<p class="notice">Reporting is temporarily unavailable. Please try again later.</p>')
  +'</section>';
 return document(site,host,"/report","Report this catalogue",body,{noindex:true});
}
