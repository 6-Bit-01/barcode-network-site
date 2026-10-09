import { CrewWorkspace } from "@/components/CrewWorkspace";
import { requireMemberWorkspaceAccess } from "@/lib/member-access";
export default async function CrewAccountPage() {
  const access = await requireMemberWorkspaceAccess("crew");
  return <CrewWorkspace access={access} />;
}
