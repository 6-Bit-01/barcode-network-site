import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url), React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
const crew = { user: { id: "crew-a", name: "Crew name" }, session: { expiresAt: "2099-01-01T00:00:00Z" }, access: { owner: false, crew: true, permissions: ["show.overview", "song.generate", "insights.read"], availablePermissions: ["show.overview", "song.generate", "insights.read"] } };
function harness(name, props, fetcher = async () => Response.json(crew)) {
 const states = [], effects = [], refs = [], callbacks = [], pending = [], listeners = new Map(), redirects = [];
 let stateCursor = 0, effectCursor = 0, refCursor = 0, callbackCursor = 0;
 const hooks = { ...React,
  useState(initial) { const i = stateCursor++; if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial; return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; },
  useRef(initial) { const i = refCursor++; return refs[i] ??= { current: initial }; },
  useCallback(fn, deps) { const i = callbackCursor++, old = callbacks[i]; if (!old || deps.some((value, j) => value !== old.deps[j])) callbacks[i] = { fn, deps }; return callbacks[i].fn; },
  useEffect(fn, deps) { const i = effectCursor++, old = effects[i]; if (!old || deps.some((value, j) => value !== old.deps[j])) { old?.cleanup?.(); effects[i] = { fn, deps }; pending.push(i); } }
 };
 hooks.useLayoutEffect = hooks.useEffect;
 const modules = new Map();
 function load(relative) {
  if (modules.has(relative)) return modules.get(relative);
  const filename = new URL("../src/" + relative + (relative.startsWith("lib/") ? ".ts" : ".tsx"), import.meta.url);
  assert.ok(fs.existsSync(filename), `Missing required UI module: ${relative}`);
  const target = { exports: {} }; modules.set(relative, target.exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, {
   module: target, exports: target.exports, AbortController, Date, fetch: fetcher,
   window: { addEventListener: (event, fn) => { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(fn); }, removeEventListener: (event, fn) => listeners.get(event)?.delete(fn), location: { assign: destination => redirects.push(destination) } },
   require: id => id === "react" ? hooks : id === "next/link" ? "a" : id.startsWith("@/") ? load(id.slice(2)) : require(id)
  });
  return target.exports;
 }
 const Component = load("components/" + name)[name];
 function render() { stateCursor = effectCursor = refCursor = callbackCursor = 0; return Component(props); }
 async function settle() { for (let i = 0; i < 4; i++) { render(); for (const slot of pending.splice(0)) effects[slot].cleanup = effects[slot].fn(); await new Promise(resolve => setImmediate(resolve)); } return render(); }
 return { render, settle, redirects, updateProps: next => { props = next; return render(); }, event: event => Promise.all([...listeners.get(event) ?? []].map(listener => listener())) };
}
const markup = tree => renderToStaticMarkup(tree);
function links(html) { return [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(match => ({ href: match[1], text: match[2].replace(/<[^>]+>/g, "").trim() })); }
function workspaceNav(html, label = "Crew workspace") { return html.match(new RegExp(`<nav[^>]*aria-label="${label}"[\\s\\S]*?<\\/nav>`))?.[0]; }
function navigation(access, section = "home") { return markup(harness("CrewWorkspaceNavigation", { access, section }).render()); }

test("Crew navigation offers only assigned tools that are currently available", () => {
 const access = { ...crew, access: { ...crew.access, permissions: ["show.overview", "song.generate"], availablePermissions: ["show.overview", "insights.read"] } };
 const html = navigation(access), nav = workspaceNav(html);
 assert.ok(nav);
 assert.deepEqual(links(nav).map(link => link.href), ["/account/crew/show"]);
 assert.ok(links(html).some(link => link.href === "/account"));
 assert.doesNotMatch(html, /href="\/account\/crew\/(?:songs|insights)"/);
});

test("expired, non-Crew and malformed permission projections hide all Crew destinations", () => {
 const denied = [
  { ...crew, session: { expiresAt: "2000-01-01T00:00:00Z" } },
  { ...crew, session: { expiresAt: "invalid" } },
  { ...crew, access: { ...crew.access, crew: false } },
  { ...crew, access: { ...crew.access, crew: "true" } },
  { ...crew, access: { ...crew.access, permissions: "show.overview song.generate insights.read" } },
  { ...crew, access: { ...crew.access, availablePermissions: "show.overview song.generate insights.read" } },
  { ...crew, access: { ...crew.access, permissions: undefined } },
  { ...crew, access: { ...crew.access, availablePermissions: {} } },
  { ...crew, access: { ...crew.access, permissions: ["show.overview", null] } },
  { ...crew, access: { ...crew.access, availablePermissions: ["show.overview", 1] } }
 ];
 for (const access of denied) {
  const html = navigation(access, "songs");
  assert.deepEqual(links(html).map(link => link.href), ["/account"]);
  assert.equal(workspaceNav(html), undefined);
 }
});

test("each Crew section is current text and its sibling links open distinct tools", () => {
 const sections = ["home", "show", "songs", "insights"], destinations = ["/account/crew", "/account/crew/show", "/account/crew/songs", "/account/crew/insights"];
 for (const [index, section] of sections.entries()) {
  const html = navigation(crew, section), nav = workspaceNav(html);
  assert.ok(nav);
  assert.equal((nav.match(/<span[^>]*aria-current="page"/g) || []).length, 1);
  assert.deepEqual(links(nav).map(link => link.href), destinations.filter((_, i) => i !== index));
  assert.doesNotMatch(nav, new RegExp(`href="${destinations[index]}"`));
  assert.ok(html.includes('aria-label="Breadcrumb"'));
  assert.ok(links(html).some(link => link.href === "/account"));
  if (section !== "home") assert.ok(links(html).some(link => link.href === "/account/crew"));
  assert.doesNotMatch(html, /\/account\/owner|\/admin|gross|revenue|financial|<main/i);
 }
});

test("a sparse Crew grant has Home and account navigation without future tools", () => {
 const html = navigation({ ...crew, access: { ...crew.access, permissions: ["support.conversations", "quality.reports"], availablePermissions: crew.access.availablePermissions } });
 assert.ok(workspaceNav(html));
 assert.deepEqual(links(html).map(link => link.href), ["/account"]);
 assert.doesNotMatch(html, /href="\/account\/crew\/(?:show|songs|insights)"/);
});

test("Crew Home uses the refreshed identity and hides old navigation during authority checks", async () => {
 let current = crew, release;
 const ui = harness("CrewWorkspace", { access: crew }, async () => new Promise(resolve => { release = () => resolve(Response.json(current)); }));
 const first = markup(await ui.settle());
 assert.ok(workspaceNav(first));
 assert.match(first, /Crew name/);
 assert.doesNotMatch(first, /<main/);
 current = { ...crew, user: { ...crew.user, name: "New Crew name" }, access: { ...crew.access, permissions: ["insights.read"] } };
 const checking = ui.event("focus");
 assert.equal(workspaceNav(markup(ui.render())), undefined);
 assert.doesNotMatch(markup(ui.render()), /Crew name|href="\/account\/crew\/songs"/);
 release(); await checking;
 const fresh = markup(await ui.settle());
 assert.match(fresh, /New Crew name/);
 assert.deepEqual(links(workspaceNav(fresh)).map(link => link.href), ["/account/crew/insights"]);
 assert.doesNotMatch(fresh, /href="\/account\/crew\/(?:songs|show)"/);
});

test("Crew Home rejects revoked and malformed fresh authority without retaining tool cards", async () => {
 for (const access of [
  { ...crew, access: { ...crew.access, crew: false } },
  { ...crew, session: { expiresAt: "2000-01-01T00:00:00Z" } },
  { ...crew, access: { ...crew.access, permissions: "show.overview song.generate insights.read" } }
 ]) {
  const ui = harness("CrewWorkspace", { access: crew }, async () => Response.json(access));
  await ui.settle(); await ui.event("focus");
  const html = markup(await ui.settle());
  assert.equal(workspaceNav(html), undefined);
  assert.deepEqual(links(html).map(link => link.href), ["/account"]);
  assert.deepEqual(ui.redirects, ["/account"]);
 }
});

const unavailableShow = { schemaVersion: "barcode_crew_show_v1", available: false, source: { readAt: "2026-10-10T22:00:00Z", historyCoverageStartedAt: "2026-08-24" }, session: null, current: null, next: null, upcoming: [], pressure: null, timing: null, introduction: null };
const unavailableInsights = { schemaVersion: "barcode_crew_insights_v1", available: false, source: { historyCoverageStartedAt: "2026-08-24", archiveBuiltAt: "2026-10-10T22:00:00Z" }, overview: null, shows: [], comparison: { latest: null, previous: null }, artists: [], accounts: null, unavailable: [] };
test("insights navigation chooses the existing Owner parent or the Crew tool surface", async () => {
 for (const owner of [true, false]) {
  const access = { ...crew, access: { ...crew.access, owner, crew: !owner, permissions: owner ? [] : crew.access.permissions } };
  const ui = harness("OwnerCrewAnalytics", { access }, async path => Response.json(path === "/api/member/access" ? access : unavailableInsights));
  const html = markup(await ui.settle());
  assert.doesNotMatch(html, /<main/);
  if (owner) {
   assert.ok(workspaceNav(html, "Owner workspace"));
   const crumbs = html.match(/<nav[^>]*aria-label="Breadcrumb"[\s\S]*?<\/nav>/)?.[0];
   assert.ok(links(crumbs).some(link => link.href === "/account/owner/radio"));
   assert.match(crumbs, /<span[^>]*aria-current="page"[^>]*>Show &amp; community insights<\/span>/);
   assert.equal(workspaceNav(html), undefined);
  } else {
   const nav = workspaceNav(html); assert.ok(nav);
   assert.doesNotMatch(nav, /href="\/account\/crew\/insights"/);
   assert.doesNotMatch(html, /\/account\/owner|\/admin|Recorded confirmed gross/);
  }
 }
});

const crewTools = [
 { component: "CrewShowOverview", permission: "show.overview", siblingPermission: "insights.read", siblingHref: "/account/crew/insights", path: "/api/member/tools/show", snapshot: unavailableShow },
 { component: "OwnerCrewAnalytics", permission: "insights.read", siblingPermission: "show.overview", siblingHref: "/account/crew/show", path: "/api/member/tools/analytics", snapshot: unavailableInsights }
];
function accountOnly(html) {
 assert.equal(Boolean(workspaceNav(html, "Owner workspace")), false);
 assert.equal(workspaceNav(html), undefined);
 assert.deepEqual(links(html).map(link => link.href), ["/account"]);
}
for (const tool of crewTools) {
 test(`${tool.component} initially offers only the account return until current authority resolves`, async () => {
  let release;
  const ui = harness(tool.component, { access: crew }, async path => {
   if (path === "/api/member/access") return new Promise(resolve => { release = () => resolve(Response.json(crew)); });
   assert.equal(path, tool.path); return Response.json(tool.snapshot);
  });
  accountOnly(markup(ui.render()));
  accountOnly(markup(await ui.settle()));
  assert.equal(typeof release, "function");
  release();
  assert.ok(workspaceNav(markup(await ui.settle())));
 });

 test(`${tool.component} derives sibling links from refreshed grants while its own grant remains`, async () => {
  let current = crew;
  const ui = harness(tool.component, { access: crew }, async path => {
   if (path === "/api/member/access") return Response.json(current);
   assert.equal(path, tool.path); return Response.json(tool.snapshot);
  });
  assert.ok(links(workspaceNav(markup(await ui.settle()))).some(link => link.href === "/account/crew/songs"));
  current = { ...crew, access: { ...crew.access, permissions: [tool.permission, "song.generate"], availablePermissions: [tool.permission] } };
  await ui.event("focus");
  assert.deepEqual(links(workspaceNav(markup(await ui.settle()))).map(link => link.href), ["/account/crew"]);
  current = { ...crew, access: { ...crew.access, permissions: [tool.permission, tool.siblingPermission, "song.generate"], availablePermissions: [tool.permission, tool.siblingPermission] } };
  await ui.event("focus");
  assert.deepEqual(links(workspaceNav(markup(await ui.settle()))).map(link => link.href), ["/account/crew", tool.siblingHref]);
 });

 test(`${tool.component} removes Crew navigation immediately while authority refresh is pending`, async () => {
  let hold = false, release;
  const ui = harness(tool.component, { access: crew }, async path => {
   if (path === "/api/member/access") return hold ? new Promise(resolve => { release = () => resolve(Response.json(crew)); }) : Response.json(crew);
   assert.equal(path, tool.path); return Response.json(tool.snapshot);
  });
  assert.ok(workspaceNav(markup(await ui.settle())));
  hold = true;
  const checking = ui.event("focus");
  accountOnly(markup(ui.render()));
  assert.equal(typeof release, "function");
  release(); await checking;
  assert.ok(workspaceNav(markup(await ui.settle())));
 });

 test(`${tool.component} keeps Crew navigation cleared after authority failure`, async () => {
  let fail = false, toolReads = 0;
  const ui = harness(tool.component, { access: crew }, async path => {
   if (path === "/api/member/access") { if (fail) throw new Error("authority unavailable"); return Response.json(crew); }
   assert.equal(path, tool.path); toolReads++; return Response.json(tool.snapshot);
  });
  assert.ok(workspaceNav(markup(await ui.settle())));
  fail = true; await ui.event("focus");
  accountOnly(markup(await ui.settle()));
  assert.equal(toolReads, 1);
 });

 test(`${tool.component} clears navigation and blocks further reads when its Crew grant is revoked`, async () => {
  let revoked = false, toolReads = 0;
  const ui = harness(tool.component, { access: crew }, async path => {
   if (path === "/api/member/access") return Response.json(revoked ? { ...crew, access: { ...crew.access, permissions: ["song.generate"] } } : crew);
   assert.equal(path, tool.path); toolReads++; return Response.json(tool.snapshot);
  });
  assert.ok(workspaceNav(markup(await ui.settle())));
  revoked = true; await ui.event("focus");
  accountOnly(markup(await ui.settle()));
  assert.deepEqual(ui.redirects, ["/account"]);
  assert.equal(toolReads, 1);
 });
}

test("Crew Home immediately adopts replaced server access props without retaining the old identity or grants", async () => {
 for (const memberId of ["crew-a", "crew-b"]) {
  const rechecked = { ...crew, user: { ...crew.user, name: "Rechecked original member" }, access: { ...crew.access, permissions: ["song.generate"] } };
  const ui = harness("CrewWorkspace", { access: crew }, async () => Response.json(rechecked));
  await ui.settle(); await ui.event("focus");
  const previous = markup(await ui.settle());
  assert.match(previous, /Rechecked original member/);
  assert.deepEqual(links(workspaceNav(previous)).map(link => link.href), ["/account/crew/songs"]);
  const replacement = { ...crew, user: { id: memberId, name: "Replacement member" }, access: { ...crew.access, permissions: ["insights.read"] } };
  const html = markup(ui.updateProps({ access: replacement }));
  assert.match(html, /Replacement member/);
  assert.doesNotMatch(html, /Rechecked original member|Crew name|href="\/account\/crew\/(?:songs|show)"/);
  assert.deepEqual(links(workspaceNav(html)).map(link => link.href), ["/account/crew/insights"]);
 }
});

const ownerAccess = { ...crew, user: { ...crew.user, name: "Original Owner" }, access: { ...crew.access, owner: true, crew: false, permissions: [] } };
const ownerFinancialInsights = { ...unavailableInsights, available: true, financials: { available: true, basis: "recorded_confirmed_gross", scannedShows: 1, availableShows: 1, currencies: [{ currency: "USD", amountCents: 700, paymentCount: 1 }], refunds: null, net: null } };
const ownerSnapshot = tool => tool.component === "OwnerCrewAnalytics" ? ownerFinancialInsights : tool.snapshot;
for (const tool of crewTools) {
 test(`${tool.component} initially hides Owner navigation until current Owner authority resolves`, async () => {
  let release;
  const ui = harness(tool.component, { access: ownerAccess }, async path => {
   if (path === "/api/member/access") return new Promise(resolve => { release = () => resolve(Response.json(ownerAccess)); });
   assert.equal(path, tool.path); return Response.json(ownerSnapshot(tool));
  });
  accountOnly(markup(ui.render()));
  accountOnly(markup(await ui.settle()));
  assert.equal(typeof release, "function");
  release();
  assert.ok(workspaceNav(markup(await ui.settle()), "Owner workspace"));
 });

 test(`${tool.component} shows its existing Owner parent after current Owner authority succeeds`, async () => {
  const ui = harness(tool.component, { access: ownerAccess }, async path => {
   if (path === "/api/member/access") return Response.json(ownerAccess);
   assert.equal(path, tool.path); return Response.json(ownerSnapshot(tool));
  });
  const html = markup(await ui.settle());
  assert.ok(workspaceNav(html, "Owner workspace"));
  assert.equal(workspaceNav(html), undefined);
  const crumbs = html.match(/<nav[^>]*aria-label="Breadcrumb"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(links(crumbs).some(link => link.href === "/account/owner/radio"));
  if (tool.component === "OwnerCrewAnalytics") {
   assert.equal(html.includes("Recorded confirmed gross"), true);
   assert.equal(html.includes("USD"), true);
  }
 });

 test(`${tool.component} hides Owner destinations immediately while current authority is being rechecked`, async () => {
  let hold = false, release;
  const ui = harness(tool.component, { access: ownerAccess }, async path => {
   if (path === "/api/member/access") return hold ? new Promise(resolve => { release = () => resolve(Response.json(ownerAccess)); }) : Response.json(ownerAccess);
   assert.equal(path, tool.path); return Response.json(ownerSnapshot(tool));
  });
  assert.ok(workspaceNav(markup(await ui.settle()), "Owner workspace"));
  hold = true;
  const checking = ui.event("focus");
  const pending = markup(ui.render());
  accountOnly(pending);
  assert.equal(pending.includes("Recorded confirmed gross"), false);
  assert.equal(typeof release, "function");
  release(); await checking;
  assert.ok(workspaceNav(markup(await ui.settle()), "Owner workspace"));
 });

 test(`${tool.component} switches an open Owner tool to only Crew navigation after fresh demotion`, async () => {
  let current = ownerAccess, toolReads = 0;
  const ui = harness(tool.component, { access: ownerAccess }, async path => {
   if (path === "/api/member/access") return Response.json(current);
   assert.equal(path, tool.path); toolReads++; return Response.json(ownerSnapshot(tool));
  });
  assert.ok(workspaceNav(markup(await ui.settle()), "Owner workspace"));
  current = { ...crew, access: { ...crew.access, permissions: [tool.permission], availablePermissions: [tool.permission] } };
  await ui.event("focus");
  const html = markup(await ui.settle());
  assert.equal(Boolean(workspaceNav(html, "Owner workspace")), false);
  assert.equal(/href="\/(?:account\/owner|admin)(?:\/|"|#)/.test(html), false);
  assert.deepEqual(links(workspaceNav(html)).map(link => link.href), ["/account/crew"]);
  assert.equal(toolReads, 2);
  assert.deepEqual(ui.redirects, []);
 });

 test(`${tool.component} keeps Owner navigation cleared when its current authority fails`, async () => {
  let fail = false, toolReads = 0;
  const ui = harness(tool.component, { access: ownerAccess }, async path => {
   if (path === "/api/member/access") { if (fail) throw new Error("authority unavailable"); return Response.json(ownerAccess); }
   assert.equal(path, tool.path); toolReads++; return Response.json(ownerSnapshot(tool));
  });
  assert.ok(workspaceNav(markup(await ui.settle()), "Owner workspace"));
  fail = true; await ui.event("focus");
  const html = markup(await ui.settle());
  accountOnly(html);
  assert.equal(html.includes("Recorded confirmed gross"), false);
  assert.equal(toolReads, 1);
 });
}

test("insights hides malformed financial rows after the open Owner account is freshly demoted to Crew", async () => {
 let current = ownerAccess;
 const ui = harness("OwnerCrewAnalytics", { access: ownerAccess }, async path => {
  if (path === "/api/member/access") return Response.json(current);
  assert.equal(path, "/api/member/tools/analytics"); return Response.json(ownerFinancialInsights);
 });
 assert.equal(markup(await ui.settle()).includes("Recorded confirmed gross"), true);
 current = { ...crew, access: { ...crew.access, permissions: ["insights.read"], availablePermissions: ["insights.read"] } };
 await ui.event("focus");
 const html = markup(await ui.settle());
 assert.equal(html.includes("Recorded confirmed gross"), false);
 assert.equal(html.includes("USD"), false);
});
