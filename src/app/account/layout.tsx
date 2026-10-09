import type { Metadata } from "next";
export const metadata:Metadata = { title:"Your account", robots:{index:false,follow:false} };
export const dynamic="force-dynamic";
export default function AccountLayout({children}:{children:React.ReactNode}) {return <div className="px-4 pb-16 pt-24">{children}</div>;}
