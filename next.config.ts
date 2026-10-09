import type { NextConfig } from "next";
const nextConfig: NextConfig = {
 async headers() {
   return [{source:"/account/:path*",headers:[{key:"Referrer-Policy",value:"no-referrer"},{key:"X-Robots-Tag",value:"noindex, nofollow"}]}];
 },
};
export default nextConfig;
