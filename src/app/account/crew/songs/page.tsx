import { BarcodeSongWorkspace } from "@/components/BarcodeSongWorkspace";
import { requireMemberWorkspaceAccess } from "@/lib/member-access";
import { requireMemberToolAccess } from "@/lib/member-tools";
export default async function ToolPage() {
 await requireMemberWorkspaceAccess("crew");
 const access=await requireMemberToolAccess("song.generate");
 return <BarcodeSongWorkspace key={access.user.id} access={access}/>;
}
