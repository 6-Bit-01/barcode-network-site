import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const radioPage = {
  hero: {
    heading1: "BARCODE",
    heading2: "Radio",
    description: "Auxchord radio description",
    submitButton: { text: "Submit Music" },
  },
  steps: [
    { number: "01", description: "Auxchord submit step" },
    { number: "02", description: "Auxchord queue step" },
    { number: "03", description: "Broadcast step" },
  ],
  rules: ["Rule one", "Rule two", "Auxchord source rule"],
};

function loadSubmissionRouting() {
  const file = "src/lib/radio-submission-routing.ts";
  const code = ts.transpileModule(read(file), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const cjsModule = { exports: {} };

  vm.runInNewContext(
    code,
    {
      require: (id) => {
        if (id === "@/content") {
          return {
            externalLinks: { auxchord: "https://auxchord.example/show" },
            radioPage,
          };
        }
        if (id === "@/lib/queue-production") {
          return {
            isQueueProductionEnabled: (env) =>
              env.BARCODE_QUEUE_PRODUCTION_ENABLED === "true",
          };
        }
        throw new Error(`unmocked import ${id} in ${file}`);
      },
      exports: cjsModule.exports,
      module: cjsModule,
      process,
    },
    { filename: file },
  );

  return cjsModule.exports;
}

test("Auxchord mode preserves the current Radio page presentation", () => {
  const { getRadioSubmissionRouting } = loadSubmissionRouting();
  const routing = getRadioSubmissionRouting({});

  assert.equal(routing.mode, "auxchord");
  assert.equal(routing.href, "https://auxchord.example/show");
  assert.equal(routing.external, true);
  assert.equal(routing.heroSubmitLabel, "Submit Music");
  assert.equal(routing.submitStepDescription, "Auxchord submit step");
  assert.equal(routing.queueStepDescription, "Auxchord queue step");
  assert.equal(routing.radioPageGuide, null);
});

test("native mode exposes a clear queue handoff without changing queue authority", () => {
  const { getRadioSubmissionRouting } = loadSubmissionRouting();
  const routing = getRadioSubmissionRouting({
    BARCODE_QUEUE_PRODUCTION_ENABLED: "true",
  });

  assert.equal(routing.mode, "native_queue");
  assert.equal(routing.href, "/queue");
  assert.equal(routing.external, false);
  assert.equal(routing.heroSubmitLabel, "Open Radio Queue");
  assert.match(routing.submitStepDescription, /current session/);
  assert.match(routing.queueStepDescription, /Now Playing and Next In Line/);
  assert.equal(
    routing.radioPageGuide?.heading,
    "Submit and follow the broadcast from one place.",
  );
  assert.deepEqual(
    Array.from(routing.radioPageGuide?.items ?? []),
    [
      "Free submissions enter through BARCODE.",
      "Accepted tracks and live queue status stay visible on the queue page.",
      "Priority Signal is optional and activates only after payment clears.",
      "Watch on TikTok Live. Join the conversation in Discord.",
    ],
  );
  assert.doesNotMatch(JSON.stringify(routing), /Auxchord/);
});

test("Radio page consumes the gated native presentation and hands off to /queue", () => {
  const page = read("src/app/radio/page.tsx");

  assert.match(page, /submission\.heroSubmitLabel/);
  assert.match(page, /step\.number === "02"/);
  assert.match(page, /submission\.queueStepDescription/);
  assert.match(
    page,
    /submission\.mode === "native_queue" && submission\.radioPageGuide/,
  );
  assert.match(page, /submission\.radioPageGuide\.items\.map/);
  assert.doesNotMatch(page, /PublicQueueGateway/);
});
