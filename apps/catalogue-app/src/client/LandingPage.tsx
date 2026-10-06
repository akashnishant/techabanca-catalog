import { useRef, useState } from "react";
import { Brand } from "./Brand";
import "./landing.css";

const tour = [
  { label: "Catalogue", file: "catalogue", title: "Your whole offer. Beautifully organized.", text: "Manage products and services together. Search your items, filter by category or status, and keep the details ready for your next update.", alt: "Catalogue workspace with six demo products and services, search, categories and status filters" },
  { label: "Item details", file: "item", title: "Make every detail useful.", text: "Give each item a description, category, SKU and optional price. Add the specifications that matter to your business and decide what customers should see.", alt: "Real item editor for the Arc Lounge Chair demo product with descriptions, category and price controls" },
  { label: "Website", file: "website", title: "Review first. Publish with intention.", text: "Keep saved content separate from the website revision. Prepare a private preview and review the exact version before a controlled publication.", alt: "Catalogue Website workspace showing preview and publication controls for a demo business" },
];
const features = [
  ["01", "Products + services", "A physical product, a professional service, or both. Choose a catalogue that fits the way your business works."],
  ["02", "Categories + custom fields", "Organize your offer into useful collections. Add text, numbers, dates, links and other supported specifications."],
  ["03", "Images + documents", "Manage item galleries, supported documents, and business imagery alongside the catalogue content."],
  ["04", "Customer enquiries", "Review enquiries in a dedicated inbox. Search, track New, Contacted and Closed statuses, and keep team notes."],
  ["05", "Website + sharing", "Prepare website revisions, review private previews, and use link and QR sharing when a catalogue is active."],
  ["06", "Business + insights", "Maintain your business identity and contacts. Review catalogue activity in the analytics workspace when your website is active."],
];
const faqs = [
  ["What is Techabanca Catalogue?", "A web workspace for organizing your products and services, preparing a catalogue website, and managing customer enquiries. Your business information, item content and website controls stay together."],
  ["Can I use it for services as well as products?", "Yes. During setup, choose products, services, or both. You can organize items into categories and add business-specific fields to describe what you offer."],
  ["Do I need to build a website from scratch?", "No. The workspace includes a managed professional theme and guided business setup. Add your content and imagery, then prepare a private website preview for review."],
  ["Does creating an account publish my catalogue?", "No. Account creation and workspace setup do not publish a website or activate a paid subscription. Public website activation is being finalized for launch and remains a separate controlled step."],
  ["Can I change content without changing the live website immediately?", "Yes. Saved catalogue content and published revisions are separate. The preview and publication workflow lets you review a prepared revision before making it active, subject to publication availability."],
  ["Will I be charged when I sign up or after a trial?", "No. Account creation requires no payment method. Eligible owners and admins can choose to start a 14-day trial from Subscription; it does not renew into a paid plan automatically. Paid subscriptions and their prices are not available yet. Public website activation remains a separate launch step."],
  ["Can I work from my phone?", "Yes. Catalogue is a responsive web application with desktop navigation and a compact mobile workspace. Use the same account in your browser; there is no separate app to install."],
];
function Arrow() { return <span aria-hidden="true">↗</span>; }
function Screen({ file, alt, eager = false }: { file: string; alt: string; eager?: boolean }) {
  return <img src={`/marketing/catalogue/${file}.jpg`} alt={alt} width="1440" height="960" loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"} decoding="async" />;
}
export function LandingPage() {
  const [menu, setMenu] = useState(false), [selected, setSelected] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const active = tour[selected]!;
  const close = () => setMenu(false);
  return <div className="landing" id="top">
    <a className="landing-skip" href="#main-content">Skip to content</a>
    <header className="landing-header">
      <div className="landing-container landing-header-row">
        <Brand variant="dark" href="#top" label="Techabanca Catalogue home" />
        <button className="landing-menu" aria-expanded={menu} aria-controls="landing-nav" aria-label={menu ? "Close navigation" : "Open navigation"} onClick={() => setMenu(!menu)}>{menu ? "Close" : "Menu"} <span aria-hidden="true">{menu ? "−" : "+"}</span></button>
        <nav id="landing-nav" aria-label="Main navigation" className={menu ? "is-open" : ""} onKeyDown={e => { if(e.key === "Escape") { close(); document.querySelector<HTMLButtonElement>(".landing-menu")?.focus(); } }}>
          <a href="#product" onClick={close}>Product</a><a href="#workflow" onClick={close}>Workflow</a><a href="#features" onClick={close}>Features</a><a href="#pricing" onClick={close}>Pricing</a><a href="#faq" onClick={close}>FAQs</a>
          <a href="#signin" onClick={close}>Sign in</a><a className="landing-button landing-button-small" href="#signup" onClick={close}>Get started <Arrow /></a>
        </nav>
      </div>
    </header>
    <main id="main-content" tabIndex={-1}>
      <section className="landing-hero">
        <div className="landing-container landing-hero-grid">
          <div>
            <p className="landing-eyebrow"><span /> PRODUCTS. SERVICES. POSSIBILITIES.</p>
            <h1>Give your business<br /><em>a better showcase.</em></h1>
            <p className="landing-lead">Turn what you offer into a catalogue worth exploring. Bring products, services, website content and customer enquiries into one considered workspace.</p>
            <div className="landing-actions"><a className="landing-button" href="#signup">Create your workspace <Arrow /></a><a className="landing-text-link" href="#product">Explore the product <span aria-hidden="true">↓</span></a></div>
            <div className="landing-proof"><span>✓ Products &amp; services</span><span>✓ Desktop &amp; mobile</span></div>
            <p className="landing-availability">Early access · Workspace setup is available.</p>
          </div>
          <div className="landing-hero-visual">
            <figure className="landing-screen landing-hero-screen"><div className="landing-screen-bar"><span aria-hidden="true">● ● ●</span><span>TECHABANCA CATALOGUE / WORKSPACE</span></div><Screen file="workspace" alt="Actual Techabanca Catalogue home workspace with Forma Studio demo items and navigation" eager /><figcaption>One place to shape what comes next. Actual application, demo data.</figcaption></figure>
            <div className="landing-visual-note"><span className="landing-note-mark" aria-hidden="true">↗</span><div><strong>Your offer, in focus.</strong><span>Organize → Preview → Prepare to share</span></div></div>
          </div>
        </div>
        <div className="landing-container landing-strip"><span>PRODUCTS</span><span>SERVICES</span><span>IMAGES</span><span>WEBSITE</span><span>ENQUIRIES</span><span>INSIGHTS</span></div>
      </section>

      <section className="landing-section" id="product">
        <div className="landing-container">
          <div className="landing-section-heading"><div><p className="landing-eyebrow">A CLOSER LOOK</p><h2>Less scattered content.<br /><em>More business clarity.</em></h2></div><p>From your first item to the next website revision, see how the real Catalogue workspace brings the work together.</p></div>
          <div className="landing-tour-tabs" role="tablist" aria-label="Explore the Catalogue application">{tour.map((item,index) => <button key={item.file} ref={el => { tabs.current[index]=el; }} id={`tour-tab-${index}`} role="tab" aria-selected={selected===index} aria-controls="tour-panel" tabIndex={selected===index ? 0 : -1} onClick={()=>setSelected(index)} onKeyDown={e=>{let next=index;if(e.key==="ArrowRight")next=(index+1)%tour.length;else if(e.key==="ArrowLeft")next=(index+tour.length-1)%tour.length;else if(e.key==="Home")next=0;else if(e.key==="End")next=tour.length-1;else return;e.preventDefault();setSelected(next);tabs.current[next]?.focus();}}><span>0{index+1}</span>{item.label}<Arrow /></button>)}</div>
          <div id="tour-panel" role="tabpanel" aria-labelledby={`tour-tab-${selected}`} tabIndex={0}>
            <figure className="landing-screen"><div className="landing-screen-bar"><span aria-hidden="true">● ● ●</span><span>PRODUCT TOUR / {active.label.toUpperCase()}</span></div><Screen key={active.file} file={active.file} alt={active.alt} /><figcaption>Actual Catalogue application · Illustrative Forma Studio demo records.</figcaption></figure>
            <div className="landing-tour-copy"><h3>{active.title}</h3><p>{active.text}</p></div>
          </div>
        </div>
      </section>

      <section className="landing-section landing-dark" id="workflow">
        <div className="landing-container landing-workflow">
          <div><p className="landing-eyebrow">FROM IDEA TO CATALOGUE</p><h2>A simple rhythm.<br /><em>A stronger presence.</em></h2><p className="landing-lead">Keep the details, the presentation and the next conversation part of the same workflow.</p><a className="landing-text-link" href="#signup">Start with your business <Arrow /></a></div>
          <ol>{[
            ["Shape your offer", "Set up your business, choose products or services, and organize the items and details that define your offer."],
            ["Prepare the presentation", "Add images, maintain website content, and review a private preview of the revision you want to publish."],
            ["Stay close to the conversation", "When your website is active, share its link or QR code and manage incoming enquiries in the workspace."],
          ].map(([title,text],i)=><li key={title}><span>0{i+1}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol>
        </div>
      </section>

      <section className="landing-section landing-detail">
        <div className="landing-container landing-split">
          <div><p className="landing-eyebrow">DETAILS THAT DO THE TALKING</p><h2>Make your offer<br /><em>easy to understand.</em></h2><p className="landing-lead">Give customers context, not just an item name. Keep descriptions, specifications, categories and optional prices in the same place.</p><ul className="landing-checklist"><li>Products and services in one catalogue</li><li>Business-specific fields and specifications</li><li>Images and supported item documents</li><li>Draft, hidden and featured item controls</li></ul></div>
          <figure className="landing-screen"><div className="landing-screen-bar"><span aria-hidden="true">● ● ●</span><span>ITEM DETAILS / DEMO PRODUCT</span></div><Screen file="item" alt="Arc Lounge Chair demo item in the Catalogue editor" /><figcaption>Actual item editor. Demo content, your business in practice.</figcaption></figure>
        </div>
      </section>

      <section className="landing-section landing-mint" id="features">
        <div className="landing-container">
          <div className="landing-section-heading"><div><p className="landing-eyebrow">THE ESSENTIALS, CONNECTED</p><h2>More than a list.<br /><em>A working catalogue.</em></h2></div><p>Build useful content today. Keep the website, enquiries and business context close as your catalogue takes shape.</p></div>
          <div className="landing-feature-grid">{features.map(([number,title,text])=><article key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
        </div>
      </section>

      <section className="landing-section landing-dark landing-mobile-section">
        <div className="landing-container landing-split">
          <div><p className="landing-eyebrow">YOUR BUSINESS, WITH YOU</p><h2>A full workspace.<br /><em>A smaller screen.</em></h2><p className="landing-lead">Review your catalogue from the desk or pick up where you left off on your phone. The responsive workspace adapts to your browser.</p><div className="landing-proof"><span>✓ Same account</span><span>✓ No app to install</span></div><a className="landing-text-link" href="#signin">Return to your workspace <Arrow /></a></div>
          <div className="landing-device-pair"><figure className="landing-screen"><div className="landing-screen-bar"><span aria-hidden="true">● ● ●</span><span>DESKTOP WORKSPACE</span></div><Screen file="workspace" alt="Desktop view of the actual Catalogue workspace" /></figure><figure className="landing-phone"><div aria-hidden="true" className="landing-phone-speaker" /><img src="/marketing/catalogue/mobile.jpg" alt="Actual Catalogue home workspace in a mobile browser with compact navigation" width="390" height="844" loading="lazy" decoding="async" /><figcaption>Actual mobile view · Demo data</figcaption></figure></div>
        </div>
      </section>


      <section className="landing-section landing-pricing" id="pricing" aria-labelledby="pricing-title">
        <div className="landing-container">
          <div className="landing-section-heading"><div><p className="landing-eyebrow">PRICING, WITH CLARITY</p><h2 id="pricing-title">A clear start.<br /><em>No unexpected charges.</em></h2></div><p>Create your workspace at no cost. Paid subscriptions are not available yet; plan prices will be published here when they launch.</p></div>
          <div className="landing-pricing-grid">
            <article className="landing-price-card" aria-labelledby="workspace-price-title">
              <div className="landing-price-top"><p className="landing-eyebrow">AVAILABLE NOW</p><span className="landing-price-badge">Start here</span></div>
              <h3 id="workspace-price-title">Workspace setup</h3><p className="landing-price"><span>₹0</span><span>to create your workspace</span></p>
              <p className="landing-price-description">Bring your business and catalogue content together before you take the next step.</p>
              <ul className="landing-checklist"><li>Set up your business profile</li><li>Organize products, services and categories</li><li>Maintain item details and custom fields</li><li>Use the workspace on desktop or mobile</li></ul>
              <a className="landing-button landing-button-dark" href="#signup">Create your workspace <Arrow /></a><p className="landing-price-footnote">No payment method required for account creation.</p>
            </article>
            <article className="landing-price-card landing-price-future" aria-labelledby="paid-price-title">
              <div className="landing-price-top"><p className="landing-eyebrow">NEXT CHAPTER</p><span className="landing-price-badge">Coming soon</span></div>
              <h3 id="paid-price-title">Paid subscriptions</h3><p className="landing-price landing-price-announcement"><span>To be announced</span><span>prices and plan details</span></p>
              <p className="landing-price-description">We’re preparing the paid plans. This page will show the available options and their prices when they are ready.</p>
              <ul className="landing-checklist"><li>Paid checkout is not available yet</li><li>No paid subscription starts at signup</li><li>A trial does not become a paid plan automatically</li><li>Public website activation is being finalized</li></ul>
              <a className="landing-text-link" href="#product">Explore the product <Arrow /></a><p className="landing-price-footnote">Your workspace is the first step. Publishing remains separate.</p>
            </article>
          </div>
          <aside className="landing-trial-note" aria-labelledby="trial-note-title"><span className="landing-trial-days" aria-hidden="true">14<span>DAYS</span></span><div><h3 id="trial-note-title">An optional 14-day trial</h3><p>Eligible workspace owners and admins can start a trial explicitly from Subscription. No card is required, and there is no automatic paid renewal. Creating an account does not start the trial or publish a website.</p></div><a className="landing-text-link" href="#signin">Sign in to check eligibility <Arrow /></a></aside>
        </div>
      </section>

      <section className="landing-section" id="faq">
        <div className="landing-container landing-faq">
          <div><p className="landing-eyebrow">GOOD QUESTIONS</p><h2>Before you<br /><em>get started.</em></h2><p className="landing-lead">A little clarity for the next step.</p></div>
          <div>{faqs.map(([question,answer])=><details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div>
        </div>
      </section>

      <section className="landing-final"><div className="landing-container"><div><p className="landing-eyebrow">YOUR OFFER DESERVES A BETTER HOME.</p><h2>Show what you do.<br /><em>Make it worth exploring.</em></h2></div><div><a className="landing-button landing-button-dark" href="#signup">Create your workspace <Arrow /></a><p>Account creation does not publish a website.</p></div></div></section>
    </main>
    <footer className="landing-footer"><div className="landing-container"><div className="landing-footer-grid"><div><Brand variant="dark" href="#top" label="Techabanca Catalogue home" /><p>A considered workspace for your products,<br />services and next customer conversation.</p></div><div><strong>CATALOGUE</strong><a href="#product">Product tour</a><a href="#features">Features</a><a href="#pricing">Pricing</a><a href="#faq">FAQs</a></div><div><strong>WORKSPACE</strong><a href="#signin">Sign in</a><a href="#signup">Create account</a></div><div><strong>TECHABANCA</strong><a href="https://techabanca.com" target="_blank" rel="noreferrer">Company <Arrow /></a><a href="https://billing.techabanca.com" target="_blank" rel="noreferrer">Billing <Arrow /></a></div></div><div className="landing-footer-bottom"><span>© {new Date().getFullYear()} Techabanca Catalogue</span><span>Public website activation is being finalized for launch.</span></div></div></footer>
  </div>;
}
