import { OwnerArtistWorkspace } from "@/components/OwnerArtistWorkspace";
import { requireMemberWorkspaceAccess } from "@/lib/member-access";
export default async function OwnerArtistsPage() {
  const access = await requireMemberWorkspaceAccess("owner");
  return <OwnerArtistWorkspace key={access.user.id} access={access} />;
}
