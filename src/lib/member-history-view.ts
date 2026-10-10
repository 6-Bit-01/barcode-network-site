import type { MemberQueueHistoryTrack } from "./member-radio-history";

export type MemberHistoryShow = {
  key: string;
  label: string;
  date: string;
  recordLabel: string;
  currentShow: boolean;
  tracks: MemberQueueHistoryTrack[];
};

// These are the existing private response keys. Unknown or ambiguous keys stay
// separate: matching dates, titles or Artist credits never prove one source show.
function sourceShowKey(track: MemberQueueHistoryTrack): string {
  const native = track.source === "native" && /^native:([^:]+):[^:]+$/.exec(track.key);
  if (native) return `native:${native[1]}`;
  const historical = track.source === "historical" && /^historical:([a-f0-9]{64}):.+$/.exec(track.key);
  if (historical) return `historical:${historical[1]}`;
  return `record:${track.key}`;
}

export function memberHistoryView(tracks: readonly MemberQueueHistoryTrack[], showKey = "", search = "") {
  const byShow = new Map<string, MemberHistoryShow>();
  for (const track of tracks) {
    const key = JSON.stringify([sourceShowKey(track), track.showDate, track.showLabel]);
    const group = byShow.get(key);
    if (group) { group.tracks.push(track); group.currentShow ||= track.currentShow; }
    else byShow.set(key, { key, label: track.showLabel, date: track.showDate, recordLabel: track.source === "native" ? "Native show record" : "Historical record", currentShow: track.currentShow, tracks: [track] });
  }
  const allGroups = [...byShow.values()];
  const labelCounts = new Map<string, number>(), labelPositions = new Map<string, number>();
  const labelKey = (group: MemberHistoryShow) => JSON.stringify([group.label, group.date, group.recordLabel]);
  for (const group of allGroups) labelCounts.set(labelKey(group), (labelCounts.get(labelKey(group)) ?? 0) + 1);
  for (const group of allGroups) {
    const key = labelKey(group), position = (labelPositions.get(key) ?? 0) + 1;
    labelPositions.set(key, position);
    if ((labelCounts.get(key) ?? 0) > 1) group.recordLabel += ` ${position}`;
  }
  const query = search.trim().toLocaleLowerCase();
  const groups = allGroups.filter(group => !showKey || group.key === showKey).map(group => ({ ...group, tracks: group.tracks.filter(track => !query || `${track.title}\n${track.artist}`.toLocaleLowerCase().includes(query)) })).filter(group => group.tracks.length);
  return { allGroups, groups, visibleSongs: groups.reduce((sum, group) => sum + group.tracks.length, 0) };
}
