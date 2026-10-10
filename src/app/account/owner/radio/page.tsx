import { OwnerToolWorkspace } from "@/components/OwnerToolWorkspace";
import { requireMemberWorkspaceAccess } from "@/lib/member-access";
export default async function OwnerToolsPage() {
  await requireMemberWorkspaceAccess("owner");
  return <OwnerToolWorkspace section="radio" />;
}
