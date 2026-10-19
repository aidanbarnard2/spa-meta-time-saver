/* Ads Manager runner for the Meta Time Saver queue.
   Claude pastes this into an Ads Manager tab (adsmanager.facebook.com) and runs window.__amRun(jobs),
   where jobs come from SPA_AM.queue() in the dashboard. It uses the signed-in person's own Ads Manager
   session (window.__accessToken), so it can post for Pages the dashboard's system user can't.
   Results go back to the dashboard with SPA_AM.complete(results). Nothing here stores or sends the token anywhere else. */
(function () {
  const BASE = 'https://adsmanager-graph.facebook.com/v23.0/';
  const tok = () => window.__accessToken;
  const amG = async (p, params = {}) => { const u = new URL(BASE + p); for (const [k, v] of Object.entries(params)) u.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v)); u.searchParams.set('access_token', tok()); const j = await (await fetch(u, { credentials: 'include' })).json(); if (j.error) throw new Error(j.error.error_user_msg || j.error.message); return j; };
  const amP = async (p, body = {}) => { const fd = new URLSearchParams(); for (const [k, v] of Object.entries(body)) fd.set(k, typeof v === 'string' ? v : JSON.stringify(v)); fd.set('access_token', tok()); const j = await (await fetch(BASE + p, { method: 'POST', body: fd, credentials: 'include' })).json(); if (j.error) throw new Error((j.error.error_user_title ? j.error.error_user_title + ': ' : '') + (j.error.error_user_msg || j.error.message)); return j; };
  const FC = 'id,name,object_story_spec,contextual_multi_ads,degrees_of_freedom_spec,asset_feed_spec,creative_sourcing_spec,url_tags';
  const swap = (s, f, t) => { if (!s) return s; let o = String(s).replace(new RegExp(f.name + '(\\s*)' + f.y, 'gi'), t.name + '$1' + t.y).replace(new RegExp(f.name + '_' + f.y, 'gi'), t.name + '_' + t.y); return o; };
  const cleanDof = (dof) => { if (!dof) return dof; const d = JSON.parse(JSON.stringify(dof)); if (d.creative_features_spec && d.creative_features_spec.standard_enhancements) delete d.creative_features_spec.standard_enhancements; return d; };
  const cleanOss = (oss) => { const o = JSON.parse(JSON.stringify(oss)); if (o.video_data && o.video_data.image_hash && o.video_data.image_url) delete o.video_data.image_url; if (o.link_data && o.link_data.image_hash && o.link_data.picture) delete o.link_data.picture; if (o.photo_data && o.photo_data.image_hash && o.photo_data.url) delete o.photo_data.url; return o; };

  async function carousel(j) {
    const ad = await amG(j.ad, { fields: 'id,creative{id}' });
    if (!ad.creative || ad.creative.id !== j.creative) throw new Error('The ad changed since these edits were made; re-check it in the dashboard');
    const old = await amG(j.creative, { fields: FC });
    const oss = cleanOss(old.object_story_spec);
    if (!oss.link_data || !oss.link_data.child_attachments) throw new Error('Not a carousel');
    oss.link_data.child_attachments = j.cards.map(c => { const o = { link: c.link, name: c.name, description: c.description, call_to_action: c.call_to_action || { type: 'SHOP_NOW' } }; if (c.image_hash) o.image_hash = c.image_hash; else if (c.picture) o.picture = c.picture; if (c.video_id) o.video_id = c.video_id; return o; });
    const body = { name: String(old.name || j.name).replace(/\s*\|\s*updated.*$/, '').slice(0, 80) + ' | updated ' + new Date().toISOString().slice(0, 10), object_story_spec: oss, contextual_multi_ads: { enroll_status: 'OPT_OUT' } };
    if (old.degrees_of_freedom_spec) body.degrees_of_freedom_spec = cleanDof(old.degrees_of_freedom_spec);
    const afs = old.asset_feed_spec ? JSON.parse(JSON.stringify(old.asset_feed_spec)) : {}; afs.audios = [{ type: 'opted_out' }]; body.asset_feed_spec = afs;
    if (old.creative_sourcing_spec) body.creative_sourcing_spec = old.creative_sourcing_spec;
    if (old.url_tags) body.url_tags = old.url_tags;
    const created = await amP(j.acct + '/adcreatives', body);
    await amP(j.ad, { creative: { creative_id: created.id } });
    const chk = await amG(j.ad, { fields: 'effective_status,creative{id,contextual_multi_ads}' });
    if (!chk.creative || chk.creative.id !== created.id || (chk.creative.contextual_multi_ads || {}).enroll_status !== 'OPT_OUT') throw new Error('Saved, but the check after didn’t match');
    return { created: created.id, status: chk.effective_status };
  }

  async function draft(j) {
    // Meta copies fewer than 3 objects per call: campaign, then each ad set into it, then each ad into its ad set (all paused, same names)
    const NR = { rename_strategy: 'NO_RENAME' };
    const r = await amP(j.src + '/copies', { deep_copy: false, status_option: 'PAUSED', rename_options: NR });
    const cid = r.copied_campaign_id; if (!cid) throw new Error('Meta did not return the copied campaign');
    for (const s0 of ((await amG(j.src + '/adsets', { fields: 'id,name', limit: '100' })).data || [])) {
      const rs = await amP(s0.id + '/copies', { campaign_id: cid, deep_copy: false, status_option: 'PAUSED', rename_options: NR });
      const nsid = rs.copied_adset_id || rs.id;
      for (const a0 of ((await amG(s0.id + '/ads', { fields: 'id,name,tracking_specs,conversion_domain,creative{id}', limit: '100' })).data || [])) {
        try { await amP(a0.id + '/copies', { adset_id: nsid, status_option: 'PAUSED', rename_options: NR }); }
        catch (e) { // e.g. old creative still carries the retired standard_enhancements: make the ad fresh with the same content
          const c = await amG(a0.creative.id, { fields: FC });
          const body = { name: swap(c.name || a0.name, j.from, j.to).slice(0, 100), object_story_spec: cleanOss(c.object_story_spec), contextual_multi_ads: { enroll_status: 'OPT_OUT' } };
          if (c.degrees_of_freedom_spec) body.degrees_of_freedom_spec = cleanDof(c.degrees_of_freedom_spec);
          for (const k of ['asset_feed_spec', 'creative_sourcing_spec']) if (c[k]) body[k] = c[k];
          if (c.url_tags) body.url_tags = swap(c.url_tags, j.from, j.to);
          const nc = await amP(j.acct + '/adcreatives', body);
          const ad = { name: a0.name, adset_id: nsid, creative: { creative_id: nc.id }, status: 'PAUSED' };
          if (a0.tracking_specs) ad.tracking_specs = a0.tracking_specs; if (a0.conversion_domain) ad.conversion_domain = a0.conversion_domain;
          await amP(j.acct + '/ads', ad);
        }
      }
    }
    const upd = { name: j.name }; if (j.cents) upd.lifetime_budget = String(Math.round(j.cents));
    try { await amP(cid, { ...upd, start_time: j.start, stop_time: j.end }); } catch (e) { await amP(cid, upd); }
    const sets = (await amG(cid + '/adsets', { fields: 'id,name', limit: '100' })).data || [];
    for (const s of sets) await amP(s.id, { name: swap(s.name, j.from, j.to), start_time: j.start, end_time: j.end });
    const ads = (await amG(cid + '/ads', { fields: 'id,name,creative{id}', limit: '100' })).data || [];
    const warnings = [];
    for (const a of ads) {
      await amP(a.id, { name: swap(a.name, j.from, j.to) });
      try {
        const c = await amG(a.creative.id, { fields: FC });
        const tags = c.url_tags ? swap(c.url_tags, j.from, j.to) : c.url_tags;
        if (!c.object_story_spec || (tags === c.url_tags && (c.contextual_multi_ads || {}).enroll_status === 'OPT_OUT')) continue;
        const body = { name: swap(c.name || a.name, j.from, j.to).slice(0, 100), object_story_spec: cleanOss(c.object_story_spec), contextual_multi_ads: { enroll_status: 'OPT_OUT' } };
        for (const k of ['asset_feed_spec', 'creative_sourcing_spec']) if (c[k]) body[k] = c[k];
        if (c.degrees_of_freedom_spec) body.degrees_of_freedom_spec = cleanDof(c.degrees_of_freedom_spec);
        if (tags) body.url_tags = tags;
        const nc = await amP(j.acct + '/adcreatives', body);
        await amP(a.id, { creative: { creative_id: nc.id } });
      } catch (e) { warnings.push(a.name + ': UTMs still say ' + j.from.name + ' (' + String(e.message).slice(0, 90) + ')'); }
    }
    if (j.live !== false) {
      // copy was made paused; turn on what was on last month so it starts by itself on the 1st
      let onSets = null, onAds = null;
      try { onSets = new Set(((await amG(j.src + '/adsets', { fields: 'name,configured_status', limit: '100' })).data || []).filter(s => s.configured_status === 'ACTIVE').map(s => s.name)); onAds = new Set(((await amG(j.src + '/ads', { fields: 'name,configured_status', limit: '100' })).data || []).filter(s => s.configured_status === 'ACTIVE').map(s => s.name)); } catch (e) { onSets = onAds = null; }
      for (const s of sets) if (!onSets || onSets.has(s.name)) { try { await amP(s.id, { status: 'ACTIVE' }); } catch (e) { warnings.push(s.name + ': ad set not turned on'); } }
      for (const a of ads) if (!onAds || onAds.has(a.name)) { try { await amP(a.id, { status: 'ACTIVE' }); } catch (e) { warnings.push(a.name + ': ad not turned on'); } }
      await amP(cid, { status: 'ACTIVE' });
    }
    return { campaign: cid, warnings };
  }

  window.__amResults = window.__amResults || {};
  window.__amRun = async function (jobs) {
    for (const j of jobs) {
      if (window.__amResults[j.key] && window.__amResults[j.key].ok) continue;
      try { const r = j.type === 'carousel' ? await carousel(j) : await draft(j); window.__amResults[j.key] = { key: j.key, ok: true, ...r }; }
      catch (e) { window.__amResults[j.key] = { key: j.key, ok: false, error: e.message }; }
    }
    return Object.values(window.__amResults);
  };
  return 'Ads Manager runner ready';
})();
