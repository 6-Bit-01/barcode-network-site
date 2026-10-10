import { CrewShowOverview } from "@/components/CrewShowOverview";
import { requireMemberWorkspaceAccess } from "@/lib/member-access";
import { requireMemberToolAccess } from "@/lib/member-tools";
export default async function ToolPage() {
 await requireMemberWorkspaceAccess("crew");
 const access=await requireMemberToolAccess("show.overview");
 return <CrewShowOverview key={access.user.id} access={access}/>;
}
