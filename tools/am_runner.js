/* Ads Manager runner for the Meta Time Saver queue.
   Claude pastes this into an Ads Manager tab (adsmanager.facebook.com), clicks the "Open the Meta Time Saver queue"
   button it adds (window.__amButton()), which opens the dashboard as a popup and receives the waiting jobs in
   window.__amJobs; then runs window.__amRun(window.__amJobs) and sends the results back with window.__amReport(results). It uses the signed-in person's own Ads Manager
   session (window.__accessToken), so it can post for Pages the dashboard's system user can't.
   Nothing here stores or sends the token anywhere else. */
(function () {
  const BASE = 'https://adsmanager-graph.facebook.com/v23.0/';
  const tok = () => window.__accessToken;
  const amG = async (p, params = {}) => { const u = new URL(BASE + p); for (const [k, v] of Object.entries(params)) u.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v)); u.searchParams.set('access_token', tok()); const j = await (await fetch(u, { credentials: 'include' })).json(); if (j.error) throw new Error(j.error.error_user_msg || j.error.message); return j; };
  const amP = async (p, body = {}) => { const fd = new URLSearchParams(); for (const [k, v] of Object.entries(body)) fd.set(k, typeof v === 'string' ? v : JSON.stringify(v)); fd.set('access_token', tok()); const j = await (await fetch(BASE + p, { method: 'POST', body: fd, credentials: 'include' })).json(); if (j.error) throw new Error((j.error.error_user_title ? j.error.error_user_title + ': ' : '') + (j.error.error_user_msg || j.error.message)); return j; };
  const FC = 'id,name,object_story_spec,contextual_multi_ads,degrees_of_freedom_spec,asset_feed_spec,creative_sourcing_spec,url_tags';
  const swap = (s, f, t) => { if (!s) return s; let o = String(s).replace(new RegExp(f.name + '(\\s*)' + f.y, 'gi'), t.name + '$1' + t.y).replace(new RegExp(f.name + '_' + f.y, 'gi'), t.name + '_' + t.y); return o; };
  const utmMonth = (tags, to) => tags ? String(tags).replace(/(?<![A-Za-z])(January|February|March|April|May|June|July|August|September|October|November|December)(_|%20|\+| )(\d{4})(?!\d)/g, (m, mo, sep) => to.name + sep + to.y) : tags;
  /* house setup (Nov 4 2026): Meta's creative enhancements are off by default; only the comment preview and the profile card
     stay as they are. Each known enhancement is named as off (Meta switches new ones on by itself), media reordering and
     carousel-to-video always (a card's photo under another card's title). Same list as the dashboard's HOUSE.baseOff. */
  const ALLOW = ['inline_comment', 'profile_card'];
  const BASE_OFF = ['media_order', 'carousel_to_video', 'advantage_plus_creative', 'enhance_cta', 'text_optimizations', 'image_touchups',
    'reveal_details_over_time', 'show_summary', 'show_destination_blurbs', 'product_extensions', 'ig_video_native_subtitle',
    'image_background_gen', 'pac_relaxation', 'hide_price', 'product_metadata_automation', 'site_extensions', 'description_automation',
    'add_text_overlay', 'image_templates', 'image_uncrop', 'image_animation', 'image_brightness_and_contrast', 'video_auto_crop',
    'video_uncrop', 'text_translation', 'translate_voiceover'];
  const cleanDof = (dof, presentOnly) => { const d = JSON.parse(JSON.stringify(dof || {})); const cf = d.creative_features_spec = d.creative_features_spec || {}; delete cf.standard_enhancements;
    for (const [k, v] of Object.entries(cf)) if (v && v.enroll_status === 'OPT_IN' && !ALLOW.includes(k)) cf[k] = { enroll_status: 'OPT_OUT' };
    for (const f of (presentOnly ? ['media_order', 'carousel_to_video'] : BASE_OFF)) cf[f] = { enroll_status: 'OPT_OUT' }; return d; };
  // house setup: no Meta-picked music on any ad
  const musicOff = (afs) => ({ ...(afs ? JSON.parse(JSON.stringify(afs)) : {}), audios: [{ type: 'opted_out' }] });
  // some creative types reject a feature they don't have; then only the ones the creative already carries are set
  const createHouse = async (acct, body, oldDof) => { try { return await amP(acct + '/adcreatives', body); } catch (e) { if (!body.degrees_of_freedom_spec) throw e; body.degrees_of_freedom_spec = cleanDof(oldDof, true); try { return await amP(acct + '/adcreatives', body); } catch (e2) { throw e; } } };
  const cleanOss = (oss) => { const o = JSON.parse(JSON.stringify(oss)); if (o.video_data && o.video_data.image_hash && o.video_data.image_url) delete o.video_data.image_url; if (o.link_data && o.link_data.image_hash && o.link_data.picture) delete o.link_data.picture; if (o.link_data && o.link_data.child_attachments) for (const ch of o.link_data.child_attachments) if (ch.image_hash && ch.picture) delete ch.picture; if (o.photo_data && o.photo_data.image_hash && o.photo_data.url) delete o.photo_data.url; return o; };
  // QA, Nov 1 2026 (Evan): the website at the front of the URL parameters is the site the ad links to (a copy can keep another store's)
  const SITE_SKIP = /^(fb\.me|m\.me|wa\.me|bit\.ly|.*facebook\.com|.*instagram\.com)$/;
  const siteOf = (u) => { const m = String(u || '').match(/^https?:\/\/([^/?#\s]+)/i); return m ? m[1].toLowerCase().replace(/^www\./, '') : ''; };
  const landingOf = (c) => { const oss = (c && c.object_story_spec) || {}, ld = oss.link_data || {}, vd = oss.video_data || {}; return ld.link || ((vd.call_to_action || {}).value || {}).link || (((((c && c.asset_feed_spec) || {}).link_urls) || [])[0] || {}).website_url || ''; };
  const fixTagSite = (tags, link) => { const t = siteOf(tags), l = siteOf(link); return t && l && t !== l && !SITE_SKIP.test(t) && !SITE_SKIP.test(l) ? String(tags).replace(/^https?:\/\/[^?#\s]*/i, String(link).match(/^https?:\/\/[^/?#\s]+/i)[0]) : tags; };
  // house setup: a display link (the site shown under the ad), the landing page's site as written
  const addDisplayLink = (oss) => { const ld = (oss || {}).link_data, vd = (oss || {}).video_data; const st = (u) => { const m = String(u || '').match(/^https?:\/\/([^/?#\s]+)/i); return m && !SITE_SKIP.test(siteOf(u)) ? m[1].toLowerCase() : ''; };
    if (ld && !ld.caption) { const s = st(ld.link || ((ld.child_attachments || [])[0] || {}).link); if (s) ld.caption = s; }
    else if (vd && vd.call_to_action && vd.call_to_action.value && !vd.call_to_action.value.link_caption) { const s = st(vd.call_to_action.value.link); if (s) vd.call_to_action.value.link_caption = s; }
    return oss; };

  async function carousel(j) {
    const ad = await amG(j.ad, { fields: 'id,creative{id}' });
    if (!ad.creative || ad.creative.id !== j.creative) throw new Error('The ad changed since these edits were made; re-check it in the dashboard');
    const old = await amG(j.creative, { fields: FC });
    const oss = cleanOss(old.object_story_spec);
    if (!oss.link_data || !oss.link_data.child_attachments) throw new Error('Not a carousel');
    oss.link_data.child_attachments = j.cards.map(c => { const o = { link: c.link, name: c.name, description: c.description, call_to_action: c.call_to_action || { type: 'SHOP_NOW' } }; if (c.image_hash) o.image_hash = c.image_hash; else if (c.picture) o.picture = c.picture; if (c.video_id) o.video_id = c.video_id; return o; });
    if (j.message) oss.link_data.message = j.message;   // a new caption queued with the cards (e.g. the November emojis)
    addDisplayLink(oss);   // house setup: the site shown under the ad
    const body = { name: String(old.name || j.name).replace(/\s*\|\s*updated.*$/, '').slice(0, 80) + ' | updated ' + new Date().toISOString().slice(0, 10), object_story_spec: oss, contextual_multi_ads: { enroll_status: 'OPT_OUT' } };
    body.degrees_of_freedom_spec = cleanDof(old.degrees_of_freedom_spec);
    body.asset_feed_spec = musicOff(old.asset_feed_spec);
    if (old.creative_sourcing_spec) body.creative_sourcing_spec = old.creative_sourcing_spec;
    if (old.url_tags) body.url_tags = fixTagSite(old.url_tags, landingOf(body));
    const created = await createHouse(j.acct, body, old.degrees_of_freedom_spec);
    await amP(j.ad, { creative: { creative_id: created.id } });
    const chk = await amG(j.ad, { fields: 'effective_status,creative{id,contextual_multi_ads}' });
    if (!chk.creative || chk.creative.id !== created.id || (chk.creative.contextual_multi_ads || {}).enroll_status !== 'OPT_OUT') throw new Error('Saved, but the check after didn’t match');
    return { created: created.id, status: chk.effective_status };
  }

  /* a new caption on any ad (video, banner or carousel), everything else kept: e.g. the November emojis on a copied video */
  async function recaption(j) {
    const ad = await amG(j.ad, { fields: 'id,creative{id}' });
    if (!ad.creative || ad.creative.id !== j.creative) throw new Error('The ad changed since this was queued; re-check it in the dashboard');
    const old = await amG(j.creative, { fields: FC });
    if (!old.object_story_spec) throw new Error('This ad is a boosted post; its caption is the post itself');
    const oss = cleanOss(old.object_story_spec);
    const part = oss.link_data || oss.video_data || oss.photo_data; if (!part) throw new Error('No caption to change');
    part.message = j.message; addDisplayLink(oss);
    const body = { name: String(old.name || j.name).replace(/\s*\|\s*updated.*$/, '').slice(0, 80) + ' | updated ' + new Date().toISOString().slice(0, 10), object_story_spec: oss, contextual_multi_ads: { enroll_status: 'OPT_OUT' } };
    body.degrees_of_freedom_spec = cleanDof(old.degrees_of_freedom_spec);
    body.asset_feed_spec = musicOff(old.asset_feed_spec);
    if (old.creative_sourcing_spec) body.creative_sourcing_spec = old.creative_sourcing_spec;
    if (old.url_tags) body.url_tags = fixTagSite(old.url_tags, landingOf(body));
    const created = await createHouse(j.acct, body, old.degrees_of_freedom_spec);
    await amP(j.ad, { creative: { creative_id: created.id } });
    const chk = await amG(j.ad, { fields: 'effective_status,creative{id,contextual_multi_ads}' });
    if (!chk.creative || chk.creative.id !== created.id || (chk.creative.contextual_multi_ads || {}).enroll_status !== 'OPT_OUT') throw new Error('Saved, but the check after didn’t match');
    return { created: created.id, status: chk.effective_status };
  }

  async function draft(j) {
    // Same steps as the dashboard's own draft: campaign copied paused, each ad set copied into it with next month's dates
    // (keeping last month's on/off), each ad made fresh with next month's UTMs and multi-advertiser off, campaign switched on last.
    // Ads Manager can read each ad's music, so music is kept exactly as it was.
    const NR = { rename_strategy: 'NO_RENAME' };
    const live = j.live !== false;
    const sw = (x) => utmMonth(swap(x, j.from, j.to), j.to);
    const r = await amP(j.src + '/copies', { deep_copy: false, status_option: 'PAUSED', rename_options: NR });
    const cid = r.copied_campaign_id; if (!cid) throw new Error('Meta did not return the copied campaign');
    const warnings = [];
    try {
      const upd = { name: j.name }; if (j.cents) upd.lifetime_budget = String(Math.round(j.cents));
      try { await amP(cid, { ...upd, start_time: j.start, stop_time: j.end }); } catch (e) { await amP(cid, upd); }
      const sets = (await amG(j.src + '/adsets', { fields: 'id,name,configured_status,targeting,ads.limit(50){id,name,configured_status,tracking_specs,conversion_domain,creative{id}}', limit: '50' })).data || [];
      for (const s of sets) {
        const rs = await amP(s.id + '/copies', { campaign_id: cid, deep_copy: false, status_option: live ? 'INHERITED_FROM_SOURCE' : 'PAUSED', rename_options: NR, start_time: j.start, end_time: j.end });
        const nsid = rs.copied_adset_id || rs.id; if (!nsid) throw new Error('Meta did not return the copied ad set for ' + s.name);
        // placements always follow the Meta Placements doc (j.house), by the ad's format and size
        const supd = { name: sw(s.name) };
        const ads0 = (s.ads || {}).data || [];
        if (j.house && s.targeting && ads0[0]) {
          const c0 = await amG(ads0[0].creative.id, { fields: 'object_story_spec' }); const o = c0.object_story_spec || {};
          const size = ((ads0[0].name + ' ' + s.name).match(/\b(VT|SQ|HZ)\b/) || [])[1];
          let kind = (o.link_data && o.link_data.child_attachments) ? 'carousel' : o.video_data ? (size === 'VT' ? 'VT' : (size ? 'feed' : null)) : null;
          const ih = (o.link_data || {}).image_hash || (o.photo_data || {}).image_hash;
          if (!kind && ih) { const im = ((await amG(j.acct + '/adimages', { hashes: [ih], fields: 'hash,width,height' })).data || [])[0]; if (im) kind = Math.abs(im.width - im.height) <= 0.02 * Math.max(im.width, im.height) ? 'banner_sq' : 'banner'; }
          if (kind && j.house[kind]) { const t = JSON.parse(JSON.stringify(s.targeting)); for (const k of ['publisher_platforms', 'facebook_positions', 'instagram_positions', 'audience_network_positions', 'messenger_positions', 'threads_positions', 'whatsapp_positions', 'age_range']) delete t[k]; supd.targeting = Object.assign(t, JSON.parse(JSON.stringify(j.house[kind]))); }
        }
        await amP(nsid, supd);
        for (const a of ads0) {
          const c = await amG(a.creative.id, { fields: FC + ',object_story_id,effective_object_story_id' });
          let body;
          if (c.object_story_spec) {
            body = { name: sw(c.name || a.name).slice(0, 100), object_story_spec: addDisplayLink(cleanOss(c.object_story_spec)), contextual_multi_ads: { enroll_status: 'OPT_OUT' } };
            body.degrees_of_freedom_spec = cleanDof(c.degrees_of_freedom_spec);
            body.asset_feed_spec = musicOff(c.asset_feed_spec);
            if (c.creative_sourcing_spec) body.creative_sourcing_spec = c.creative_sourcing_spec;
          } else if (c.effective_object_story_id || c.object_story_id) {
            body = { name: sw(c.name || a.name).slice(0, 100), object_story_id: c.effective_object_story_id || c.object_story_id, contextual_multi_ads: { enroll_status: 'OPT_OUT' } };
          } else throw new Error('Can’t read the creative of ' + a.name);
          if (c.url_tags) body.url_tags = fixTagSite(utmMonth(c.url_tags, j.to), landingOf(c));
          const nc = await createHouse(j.acct, body, c.degrees_of_freedom_spec);
          const ad = { name: sw(a.name), adset_id: nsid, creative: { creative_id: nc.id }, status: live && a.configured_status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED' };
          const ts = (a.tracking_specs || []).slice();   // website events on with the client's pixel (QA, Oct 30 2026)
          if (j.pixel && !ts.some(t => (t.fb_pixel || []).map(String).includes(String(j.pixel)))) ts.unshift({ 'action.type': ['offsite_conversion'], fb_pixel: [String(j.pixel)] });
          if (ts.length) ad.tracking_specs = ts;
          if (a.conversion_domain) ad.conversion_domain = a.conversion_domain;
          await amP(j.acct + '/ads', ad);
        }
      }
      if (live) await amP(cid, { status: 'ACTIVE' });
      return { campaign: cid, warnings };
    } catch (e) {
      // leave the half-made copy paused and clearly named so Aidan can delete it (Claude doesn't delete anything)
      try { await amP(cid, { status: 'PAUSED', name: 'FAILED DRAFT, delete me: ' + j.name }); } catch (e2) { }
      throw new Error(e.message + ' (a paused half-made copy named "FAILED DRAFT, delete me" is in the account)');
    }
  }

  /* the queue lives in the dashboard (another site), so a real click here opens the dashboard as a popup and the two pages
     message each other: the dashboard sends the waiting jobs, and gets the results back to mark them done */
  const DASH = 'https://aidanbarnard2.github.io';
  if (!window.__amListening) {
    window.__amListening = true;
    window.addEventListener('message', (e) => {
      if (e.origin !== DASH || !e.data || e.data.spa !== 'am') return;
      if (e.data.op === 'jobs') window.__amJobs = e.data.jobs || [];
      if (e.data.op === 'completed') window.__amCompleted = e.data.result;
    });
  }
  window.__amOpenDashboard = function () {
    window.__amJobs = null; window.__amCompleted = null;
    const w = window.open(DASH + '/spa-meta-time-saver/#amjobs', 'spa_dash_bridge'); window.__amDash = w;
    const t = setInterval(() => { if (window.__amJobs || !w || w.closed) return clearInterval(t); try { w.postMessage({ spa: 'am', op: 'jobs' }, DASH); } catch (e) { } }, 1000);
    return !!w;
  };
  window.__amReport = function (results) { window.__amCompleted = null; window.__amDash.postMessage({ spa: 'am', op: 'complete', results }, DASH); return true; };
  /* a button for Claude to click (a popup needs a real click) */
  window.__amButton = function () {
    let b = document.getElementById('spa-am-open'); if (b) b.remove();
    b = document.createElement('button'); b.id = 'spa-am-open'; b.textContent = 'Open the Meta Time Saver queue';
    b.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;padding:12px 20px;font:600 15px system-ui;background:#1f3a6e;color:#fff;border:0;border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,.3);cursor:pointer';
    b.onclick = () => { window.__amOpenDashboard(); b.textContent = 'Queue opened'; setTimeout(() => b.remove(), 1500); };
    document.body.appendChild(b); return true;
  };

  window.__amResults = window.__amResults || {};
  window.__amRun = async function (jobs) {
    for (const j of jobs) {
      if (window.__amResults[j.key] && window.__amResults[j.key].ok) continue;
      try { const r = j.type === 'carousel' ? await carousel(j) : j.type === 'creative' ? await recaption(j) : await draft(j); window.__amResults[j.key] = { key: j.key, ok: true, ...r }; }
      catch (e) { window.__amResults[j.key] = { key: j.key, ok: false, error: e.message }; }
    }
    return Object.values(window.__amResults);
  };
  return 'Ads Manager runner ready';
})();
