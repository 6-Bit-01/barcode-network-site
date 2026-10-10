import { OwnerAccountWorkspace } from "@/components/OwnerAccountWorkspace";
import { requireMemberWorkspaceAccess } from "@/lib/member-access";
export default async function OwnerAccountsPage() {
  const access = await requireMemberWorkspaceAccess("owner");
  return <OwnerAccountWorkspace key={access.user.id} access={access} />;
}
