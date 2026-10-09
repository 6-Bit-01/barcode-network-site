import { OwnerAccountWorkspace } from "@/components/OwnerAccountWorkspace";
import { requireMemberWorkspaceAccess } from "@/lib/member-access";
export default async function OwnerAccountPage() {
  const access = await requireMemberWorkspaceAccess("owner");
  return <OwnerAccountWorkspace access={access} />;
}
