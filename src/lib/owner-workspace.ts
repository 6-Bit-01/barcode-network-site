export const OWNER_WORKSPACE_SECTIONS = [
  { id: "home", label: "Home", href: "/account/owner" },
  { id: "radio", label: "Radio & shows", href: "/account/owner/radio" },
  { id: "artists", label: "Artists & history", href: "/account/owner/artists" },
  { id: "accounts", label: "Accounts & Crew", href: "/account/owner/accounts" },
  { id: "bnl", label: "BNL & music", href: "/account/owner/bnl" },
  { id: "maintenance", label: "Maintenance", href: "/account/owner/maintenance" },
] as const;
export type OwnerWorkspaceSection = typeof OWNER_WORKSPACE_SECTIONS[number]["id"];
export type OwnerToolSection = "radio" | "bnl" | "maintenance";
export const OWNER_TOOL_SECTIONS = {
  radio: {
    title: "Radio & shows", description: "Prepare the broadcast, run the queue, and review past shows.",
    tools: [
      { title: "Show management", description: "Set up a show, manage session options, and open submissions.", href: "/admin/show-management" },
      { title: "Queue control", description: "Run playback, manage the lanes, and use the existing broadcast controls.", href: "/admin/queue" },
      { title: "Archived shows", description: "Review completed broadcasts and their retained show records.", href: "/admin/show-management/archive" },
      { title: "Live status & stream", description: "Update the live indicator, schedule override, and stream address.", href: "/admin/broadcast-settings" },
    ],
  },
  bnl: {
    title: "BNL & music", description: "Work on BNL's songs and review his published output and current Relay.",
    tools: [
      { title: "Broadcast Ballads", description: "Write with BNL, prepare Suno prompts, and manage recordings and releases.", href: "/admin/ballads" },
      { title: "Journals", description: "Review Journal publishing, saved runs, and automation status.", href: "/admin/journal" },
      { title: "Relay controls", description: "Review and manage BNL's current Relay and operator controls.", href: "/admin/relay" },
    ],
  },
  maintenance: {
    title: "Maintenance", description: "Recovery tools for when something needs attention. Everyday show controls are in Radio & shows.",
    tools: [
      { title: "Storage recovery", description: "Inspect storage usage and use the existing reviewed recovery controls.", href: "/admin/storage-recovery" },
      { title: "Upload recovery", description: "Review queue upload recovery records.", href: "/admin/queue/recovery-uploads" },
      { title: "Priority checkout recovery", description: "Review interrupted Priority checkouts and existing reconciliation controls.", href: "/admin/queue/recovery-priority-checkouts" },
    ],
  },
} as const;
