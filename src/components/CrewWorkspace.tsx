"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { MemberAccess } from "@/lib/member-access";
const tools=[
 {permission:"show.overview",title:"Live show overview",description:"See what's playing, who's next, and artist introduction cards.",href:"/account/crew/show"},
 {permission:"song.generate",title:"BARCODE song generator",description:"Write and refine your private lyrics and Suno prompt with BNL.",href:"/account/crew/songs"},
 {permission:"insights.read",title:"Show & community insights",description:"Review show activity, artist history, pacing and account growth.",href:"/account/crew/insights"}
];
export function CrewWorkspace({access}:{access:MemberAccess}) {
 const [authorized,setAuthorized]=useState(true),[current,setCurrent]=useState(access);
 useEffect(()=>{let controller:AbortController|undefined;async function refresh(){
  controller?.abort();controller=new AbortController();const active=controller;setAuthorized(false);
  try{const response=await fetch("/api/member/access",{credentials:"same-origin",cache:"no-store",signal:active.signal});const data=response.ok?await response.json():null;
   if(active.signal.aborted)return;if(data?.user?.id!==access.user.id||data.access?.crew!==true||!(Date.parse(data.session?.expiresAt)>Date.now())){setCurrent({...access,access:{...access.access,crew:false,permissions:[],availablePermissions:[]}});window.location.assign("/account");return;}
   setCurrent(data);setAuthorized(true);
  }catch{/* Keep content hidden until access is checked. */}}
  window.addEventListener("focus",refresh);window.addEventListener("pageshow",refresh);return()=>{controller?.abort();window.removeEventListener("focus",refresh);window.removeEventListener("pageshow",refresh);};
 },[access]);
 const available=tools.filter(tool=>current.access.permissions.includes(tool.permission)&&current.access.availablePermissions?.includes(tool.permission));
 return <section className="mx-auto max-w-5xl rounded-xl border border-border bg-surface p-5 sm:p-8">
  <Link href="/account" className="text-accent underline">Back to your account</Link>
  {authorized?<><p className="public-kicker mt-6">BARCODE Network</p><h1 className="mt-2 text-3xl font-bold">Crew workspace</h1>
  {available.length?<><p className="mt-3 text-muted">Your assigned tools. Choose what you need for the show or your next BARCODE song.</p><div className="mt-8 grid gap-4 md:grid-cols-2">{available.map(tool=><Link key={tool.href} href={tool.href} className="rounded-xl border border-border p-5 hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"><h2 className="text-xl font-bold text-accent">{tool.title}<span aria-hidden="true"> →</span></h2><p className="mt-2 text-muted">{tool.description}</p></Link>)}</div></>:<p className="mt-5 text-muted">Your Crew access is assigned. Tools will become available here as they are ready.</p>}
  </>:<p role="status" className="mt-5">Checking your access. Return to your account if it is unavailable.</p>}
 </section>;
}
