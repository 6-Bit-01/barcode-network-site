import { OwnerCrewAnalytics } from "@/components/OwnerCrewAnalytics";
import { requireMemberWorkspaceAccess } from "@/lib/member-access";
import { requireMemberToolAccess } from "@/lib/member-tools";
export default async function ToolPage() {
 await requireMemberWorkspaceAccess("crew");
 const access=await requireMemberToolAccess("insights.read");
 return <OwnerCrewAnalytics key={access.user.id} access={access}/>;
}
