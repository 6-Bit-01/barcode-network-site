export type BalladStage = "Song" | "Recording" | "Publish";
export type BalladPublishTask = {
  id: string;
  title: string;
  detail: string;
  action?: string;
  stage: BalladStage;
  target: string;
};

/** Guidance for the existing saved-version / confirmed-recording publication contract. */
export function balladPublishTasks(input: {
  pending: boolean;
  dirtySections: string[];
  hasVersion: boolean;
  pendingUpload: boolean;
  hasWorkingTakes: boolean;
  hasConfirmedRecording: boolean;
}): BalladPublishTask[] {
  if (input.pending) return [{ id: "pending", title: "Wait for BNL to finish saving", detail: "The new version will open automatically when BNL confirms it. Your saved versions stay available.", stage: "Song", target: "ballad-song" }];
  const tasks: BalladPublishTask[] = [];
  // Save the other sections first: the canonical draft save requires them to be clean.
  const saves: BalladPublishTask[] = [
    { id: "options", title: "Save your creative directions", detail: "Keep your direction and feedback changes before continuing.", action: "Save directions", stage: "Song", target: "ballad-writing" },
    { id: "automation", title: "Save your automation setting", detail: "Confirm the after-show automation choice you changed.", action: "Save automation", stage: "Song", target: "ballad-automation" },
    { id: "linerNotes", title: "Save your track story", detail: "The people and story notes still have unsaved changes.", action: "Save track story", stage: "Song", target: "ballad-story" },
    { id: "artistLinks", title: "Save your artist links", detail: "Keep the artist tags and cards selected for this version before publishing.", action: "Save artist links", stage: "Song", target: "ballad-artist-links" },
    { id: "presentation", title: "Save your release details", detail: "Your credits, links or recording details have unsaved changes.", action: "Save release details", stage: "Publish", target: "ballad-release" },
    { id: "draft", title: "Save your song edits", detail: "Save the title, lyrics and Style as a version before continuing.", action: "Save song edits", stage: "Song", target: "ballad-song" },
  ];
  tasks.push(...saves.filter(task => input.dirtySections.includes(task.id)));
  if (!input.hasVersion && !input.dirtySections.includes("draft")) {
    tasks.push({ id: "song", title: "Create or save a song first", detail: "Generate a song with BNL, or write lyrics and save them in Song.", action: "Go to Song", stage: "Song", target: "ballad-writing" });
  }
  if (input.pendingUpload) {
    tasks.push({ id: "upload", title: "Confirm your uploaded recording", detail: "The file has uploaded. Attach it to its saved song version before choosing it for release.", action: "Confirm upload", stage: "Recording", target: "ballad-upload-confirmation" });
  }
  if (!input.hasConfirmedRecording) {
    tasks.push({ id: "recording", title: input.hasWorkingTakes ? "Choose the recording to release" : "Upload and choose a recording", detail: input.hasWorkingTakes ? "Open Recording, choose a saved take, then click Use this recording." : "Bring the MP3 or WAV into Recording, confirm the upload, then click Use this recording. A Suno link alone does not attach audio.", action: input.hasWorkingTakes ? "Choose recording" : "Go to Recording", stage: "Recording", target: "ballad-recording" });
  }
  return tasks;
}
