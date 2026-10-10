import { OwnerHome } from "@/components/OwnerHome";
import { requireMemberWorkspaceAccess } from "@/lib/member-access";
export default async function OwnerHomePage() {
  await requireMemberWorkspaceAccess("owner");
  return <OwnerHome />;
}
