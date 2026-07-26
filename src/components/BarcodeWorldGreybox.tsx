"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  APPROACHES,
  ARMOR,
  BUILDS,
  CARDS,
  CORE_RULES,
  LOADOUTS,
  POSITIONS,
  PROFILES,
  RIGS,
  WEAPONS,
  attachCard,
  beginOutskirts,
  canResolvePlans,
  chooseSegmentDecision,
  commitApproach,
  compareToPaperExpectation,
  compatibleCardsForAction,
  createGreyboxState,
  detachCard,
  discardCard,
  getFocuses,
  getImmediateActionGroups,
  getLayeredIntents,
  inspectApproach,
  loadProfile,
  lockSeatPlan,
  queueAction,
  removeAction,
  resetGreybox,
  resolvePlans,
  resultSummary,
  seatCommandAvailable,
  selectApproachResult,
  selectFocus,
  selectSeat,
  setApproachConfirmation,
  setClaimMode,
  setConsent,
  settleCycle,
  unlockSeatPlan,
  updatePreparation,
  type GreyboxAction,
  type GreyboxRecord,
} from "@/lib/barcode-world/engine.mjs";
import styles from "./BarcodeWorldGreybox.module.css";

const PRIORITIES = ["Complete", "Recover", "Survey", "Speed", "Integrity"];
const STAGES = [
  ["preparation", "Prepare"],
  ["outskirts", "Outskirts"],
  ["loose-signal", "Plan / Resolve"],
  ["segment-settle", "Settle"],
  ["complete", "Evidence"],
];

function stageReached(current: string, target: string) {
  const order = STAGES.map(([id]) => id);
  const currentIndex =
    current === "segment-settle"
      ? order.indexOf("segment-settle")
      : current === "complete"
        ? order.indexOf("complete")
        : order.indexOf(current);
  return currentIndex >= order.indexOf(target);
}

function buildFor(id: string) {
  return BUILDS.find((build: { id: string }) => build.id === id) ?? BUILDS[0];
}

function formatCard(cardId: string) {
  return CARDS[cardId]?.name ?? cardId;
}

function StatusPill({
  tone = "neutral",
  children,
}: {
  tone?: "good" | "warn" | "bad" | "neutral" | "info";
  children: React.ReactNode;
}) {
  return <span className={`${styles.pill} ${styles[tone]}`}>{children}</span>;
}

function Preparation({
  game,
  apply,
}: {
  game: ReturnType<typeof createGreyboxState>;
  apply: (next: ReturnType<typeof createGreyboxState>) => void;
}) {
  return (
    <section className={styles.workspace}>
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Home preparation</p>
          <h2>Load only the deterministic test equipment.</h2>
        </div>
        <StatusPill tone="info">No persistence</StatusPill>
      </div>

      <div className={styles.prepToolbar}>
        <label>
          <span>Deterministic profile</span>
          <select
            value={game.profileId}
            onChange={(event) => apply(loadProfile(game, event.target.value))}
          >
            {PROFILES.map((profile: { id: string; name: string }) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.contractStrip}>
          <span>Seed LS-01</span>
          <span>16 → 32 Command</span>
          <span>4 paid slots</span>
          <span>1 ordinary Reposition</span>
          <span>12-card fixed deck</span>
        </div>
      </div>

      <div className={styles.seatGrid}>
        {game.seats.map((seat: GreyboxRecord) => {
          const build = buildFor(seat.buildId);
          const loadout = LOADOUTS[seat.loadoutId];
          return (
            <article className={styles.seatCard} key={seat.id}>
              <div className={styles.cardTopline}>
                <h3>{seat.label}</h3>
                <StatusPill>{game.profileMode}</StatusPill>
              </div>
              <label>
                <span>Ordered Major / Minor</span>
                <select
                  value={seat.buildId}
                  onChange={(event) =>
                    apply(
                      updatePreparation(game, seat.id, {
                        buildId: event.target.value,
                      }),
                    )
                  }
                >
                  {BUILDS.map((candidate: { id: string; name: string }) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className={styles.identityLine}>{build.identity}</p>
              <label>
                <span>Fixed sidegrade loadout</span>
                <select
                  value={seat.loadoutId}
                  onChange={(event) =>
                    apply(
                      updatePreparation(game, seat.id, {
                        loadoutId: event.target.value,
                      }),
                    )
                  }
                >
                  {Object.values(LOADOUTS).map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.id} · {candidate.name}
                    </option>
                  ))}
                </select>
              </label>
              <dl className={styles.loadoutList}>
                <div>
                  <dt>Active</dt>
                  <dd>{WEAPONS[loadout.activeWeapon].name}</dd>
                </div>
                <div>
                  <dt>Reserve</dt>
                  <dd>{WEAPONS[loadout.reserveWeapon].name}</dd>
                </div>
                <div>
                  <dt>Armor</dt>
                  <dd>
                    {ARMOR[loadout.armor].name} · Guard{" "}
                    {ARMOR[loadout.armor].guardCap}
                  </dd>
                </div>
                <div>
                  <dt>Rig</dt>
                  <dd>{RIGS[loadout.rig].name}</dd>
                </div>
              </dl>
              <div className={styles.priorityPair}>
                <label>
                  <span>Primary</span>
                  <select
                    value={seat.primaryPriority}
                    onChange={(event) =>
                      apply(
                        updatePreparation(game, seat.id, {
                          primaryPriority: event.target.value,
                        }),
                      )
                    }
                  >
                    {PRIORITIES.map((priority) => (
                      <option key={priority}>{priority}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Secondary</span>
                  <select
                    value={seat.secondaryPriority}
                    onChange={(event) =>
                      apply(
                        updatePreparation(game, seat.id, {
                          secondaryPriority: event.target.value,
                        }),
                      )
                    }
                  >
                    {PRIORITIES.map((priority) => (
                      <option key={priority}>{priority}</option>
                    ))}
                  </select>
                </label>
              </div>
              <details className={styles.deckDetails}>
                <summary>Fixed deck and opening order</summary>
                <ol>
                  {seat.deck.map((cardId: string, index: number) => (
                    <li key={`${cardId}-${index}`}>
                      <span>{index + 1}.</span> {formatCard(cardId)}
                      {index < CORE_RULES.openingHand && (
                        <em> opening</em>
                      )}
                    </li>
                  ))}
                </ol>
              </details>
            </article>
          );
        })}
      </div>

      {game.expectedPaperResult && (
        <aside className={styles.paperExpectation}>
          <strong>Paper expectation loaded for comparison only.</strong>
          <span>
            It does not auto-resolve a hidden plan. The source gives final
            totals but omits the full solo action scripts.
          </span>
        </aside>
      )}

      <button className={styles.primaryButton} onClick={() => apply(beginOutskirts(game))}>
        Enter the Outskirts
      </button>
    </section>
  );
}

function Outskirts({
  game,
  apply,
}: {
  game: ReturnType<typeof createGreyboxState>;
  apply: (next: ReturnType<typeof createGreyboxState>) => void;
}) {
  const [openApproach, setOpenApproach] = useState(
    game.approach.selectedId ?? "impact-scar",
  );
  const activeSeat = game.seats.find(
    (seat: GreyboxRecord) => seat.id === game.activeSeatId,
  );
  const activeMajor = buildFor(activeSeat.buildId).major;
  const selected = game.approach.selectedId
    ? APPROACHES[game.approach.selectedId]
    : null;

  const selectResult = (approachId: string, resultId: string) => {
    apply(
      selectApproachResult(
        game,
        approachId,
        resultId,
        game.approach.resolverSeatId,
      ),
    );
  };

  return (
    <section className={styles.workspace}>
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Freely explored physical block</p>
          <h2>Inspect all three boundaries. Commit to one.</h2>
        </div>
        <StatusPill tone="warn">Other approaches close on commit</StatusPill>
      </div>

      <div className={styles.approachMap} aria-label="Outskirts approach relationship map">
        <div className={styles.approachCenter}>OUTSKIRTS BLOCK</div>
        {Object.values(APPROACHES).map((approach, index: number) => {
          const inspected = game.approach.inspected.includes(approach.id);
          const selectedApproach = game.approach.selectedId === approach.id;
          return (
            <button
              key={approach.id}
              className={`${styles.approachNode} ${selectedApproach ? styles.selected : ""}`}
              data-index={index}
              onClick={() => {
                setOpenApproach(approach.id);
                apply(inspectApproach(game, approach.id, game.activeSeatId));
              }}
            >
              <span>{approach.name}</span>
              <small>{inspected ? "Inspected" : "Unknown"}</small>
            </button>
          );
        })}
      </div>

      <div className={styles.approachInspector}>
        <div className={styles.cardTopline}>
          <div>
            <p className={styles.eyebrow}>Selected world focus</p>
            <h3>{APPROACHES[openApproach].name}</h3>
          </div>
          <label className={styles.compactSelect}>
            <span>Reading seat</span>
            <select
              value={game.activeSeatId}
              onChange={(event) => apply(selectSeat(game, event.target.value))}
            >
              {game.seats.map((seat: GreyboxRecord) => (
                <option key={seat.id} value={seat.id}>
                  {seat.label} · {buildFor(seat.buildId).name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p>{APPROACHES[openApproach].broad}</p>
        <div className={styles.readout}>
          <strong>{buildFor(activeSeat.buildId).name} read</strong>
          <span>{APPROACHES[openApproach].major[activeMajor]}</span>
        </div>
        <div className={styles.resultButtons}>
          {APPROACHES[openApproach].results.map((resultId: string) => {
            const disabled =
              (openApproach === "impact-scar" &&
                resultId === "exact" &&
                activeMajor !== "battle") ||
              (openApproach === "mute-repeater" &&
                resultId === "preserved" &&
                activeMajor !== "hacking");
            const label =
              resultId === "exact"
                ? "Exact confrontation"
                : resultId === "ordinary"
                  ? "Ordinary defeat"
                  : resultId === "preserved"
                    ? "Preserve repeater"
                    : resultId === "destroyed"
                      ? "Destroy repeater"
                      : "Take folded entry";
            return (
              <button
                key={resultId}
                disabled={disabled}
                className={
                  game.approach.selectedId === openApproach &&
                  game.approach.resultId === resultId
                    ? styles.activeChoice
                    : styles.secondaryButton
                }
                onClick={() => selectResult(openApproach, resultId)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className={styles.commitPanel}>
          <div>
            <p className={styles.eyebrow}>Physical commitment</p>
            <h3>
              {selected.name} · {game.approach.resultId}
            </h3>
          </div>
          <label className={styles.compactSelect}>
            <span>Resolving seat</span>
            <select
              value={game.approach.resolverSeatId}
              onChange={(event) =>
                apply(
                  selectApproachResult(
                    game,
                    selected.id,
                    game.approach.resultId,
                    event.target.value,
                  ),
                )
              }
            >
              {game.seats.map((seat: GreyboxRecord) => (
                <option key={seat.id} value={seat.id}>
                  {seat.label} · {buildFor(seat.buildId).name}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>Every continuing seat confirms</legend>
            {game.seats.map((seat: GreyboxRecord) => (
              <label key={seat.id} className={styles.confirmCheck}>
                <input
                  type="checkbox"
                  checked={game.approach.confirmations[seat.id]}
                  onChange={(event) =>
                    apply(
                      setApproachConfirmation(
                        game,
                        seat.id,
                        event.target.checked,
                      ),
                    )
                  }
                />
                <span>{seat.label} confirms</span>
              </label>
            ))}
          </fieldset>
          <button
            className={styles.primaryButton}
            onClick={() => apply(commitApproach(game))}
          >
            Commit and enter Loose Signal
          </button>
        </div>
      )}
    </section>
  );
}

function ResourceBar({ game }: { game: ReturnType<typeof createGreyboxState> }) {
  return (
    <div className={styles.resourceGrid}>
      {game.seats.map((seat: GreyboxRecord) => {
        const active = seat.id === game.activeSeatId;
        return (
          <article className={`${styles.resourceCard} ${active ? styles.activeSeat : ""}`} key={seat.id}>
            <div className={styles.cardTopline}>
              <strong>{seat.label}</strong>
              <StatusPill tone={seat.compromised ? "bad" : seat.locked ? "good" : "neutral"}>
                {seat.compromised ? "Compromised" : seat.locked ? "Locked" : "Planning"}
              </StatusPill>
            </div>
            <span>{buildFor(seat.buildId).name}</span>
            <div className={styles.resourceNumbers}>
              <b>{seatCommandAvailable(seat)}</b>
              <small>Command free / {seat.command}</small>
              <b>{seat.guard + seat.temporaryGuard}</b>
              <small>Guard</small>
              <b>{seat.condition}</b>
              <small>Condition</small>
              <b>{seat.disruption}</b>
              <small>Disruption</small>
            </div>
            <span className={styles.positionLabel}>
              {POSITIONS[seat.position]?.name ?? seat.position}
            </span>
          </article>
        );
      })}
    </div>
  );
}

const MAP_LINES: Array<
  [number, number, number, number, "ordinary" | "opening" | "object"]
> = [
  [7, 36, 28, 36, "ordinary"],
  [30, 8, 28, 36, "ordinary"],
  [28, 36, 51, 36, "ordinary"],
  [28, 36, 35, 61, "ordinary"],
  [35, 61, 65, 61, "opening"],
  [65, 61, 80, 47, "object"],
  [65, 61, 85, 67, "object"],
  [65, 61, 70, 88, "ordinary"],
];

function TacticalMap({
  game,
  apply,
}: {
  game: ReturnType<typeof createGreyboxState>;
  apply: (next: ReturnType<typeof createGreyboxState>) => void;
}) {
  const focuses = getFocuses(game);
  const activeSeat = game.seats.find(
    (seat: GreyboxRecord) => seat.id === game.activeSeatId,
  );
  return (
    <div className={styles.mapPanel}>
      <div className={styles.cardTopline}>
        <div>
          <p className={styles.eyebrow}>Physical expedition view</p>
          <h3>Loose Signal Crossing</h3>
        </div>
        <StatusPill>Relationship greybox</StatusPill>
      </div>
      <p className={styles.mapNote}>
        Positions and connections are mechanical. This does not decide
        top-down 2D versus isometric 2.5D.
      </p>
      <div className={styles.mapCanvas}>
        <svg viewBox="0 0 100 100" aria-hidden="true">
          {MAP_LINES.map(([x1, y1, x2, y2, relationship], index) => (
            <line
              key={index}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              className={
                relationship === "opening"
                  ? styles.specialEdge
                  : relationship === "object"
                    ? styles.objectRelation
                    : styles.edge
              }
            />
          ))}
        </svg>
        {focuses.map((focus) => {
          const style = {
            "--map-x": `${focus.x}%`,
            "--map-y": `${focus.y}%`,
          } as CSSProperties;
          const selected = activeSeat.focusId === focus.id;
          const kind =
            focus.kind === "Enemy"
              ? styles.enemyNode
              : focus.kind === "Character"
                ? styles.characterNode
                : styles.worldNode;
          return (
            <button
              key={focus.id}
              style={style}
              className={`${styles.mapNode} ${kind} ${selected ? styles.mapSelected : ""}`}
              onClick={() =>
                apply(selectFocus(game, game.activeSeatId, focus.id))
              }
              aria-pressed={selected}
            >
              <strong>{focus.name}</strong>
              <small>{focus.status}</small>
              {typeof focus.condition === "number" && (
                <span>
                  G{focus.guard} · C{focus.condition}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className={styles.mapLegend}>
        <span><i className={styles.legendWorld} /> World focus</span>
        <span><i className={styles.legendCharacter} /> Character</span>
        <span><i className={styles.legendEnemy} /> Enemy</span>
        <span><i className={styles.legendSpecial} /> Special Opening</span>
      </div>
    </div>
  );
}

function IntentPanel({ game }: { game: ReturnType<typeof createGreyboxState> }) {
  const intents = getLayeredIntents(game);
  return (
    <aside className={styles.intentPanel}>
      <div className={styles.cardTopline}>
        <div>
          <p className={styles.eyebrow}>Layered enemy intent</p>
          <h3>Visible pressure</h3>
        </div>
        <StatusPill tone="warn">Tie order visible</StatusPill>
      </div>
      <p className={styles.tieOrder}>
        Tie Order: {game.encounter.tieOrder.join(" → ")}
      </p>
      {intents.length === 0 ? (
        <p className={styles.muted}>No active hostile intent.</p>
      ) : (
        intents.map((intent) => (
          <details key={intent.enemyId} className={styles.intentCard} open>
            <summary>
              <span>{intent.enemy}</span>
              <b>{intent.intent}</b>
            </summary>
            <dl>
              <div><dt>Layer</dt><dd>{intent.layer}</dd></div>
              <div><dt>Trigger</dt><dd>{intent.trigger}</dd></div>
              <div><dt>Target</dt><dd>{intent.target}</dd></div>
              <div><dt>Timing</dt><dd>{intent.timing}</dd></div>
              <div><dt>Consequence</dt><dd>{intent.consequence}</dd></div>
              <div><dt>Certainty</dt><dd>{intent.certainty}</dd></div>
            </dl>
          </details>
        ))
      )}
    </aside>
  );
}

function Projection({ action }: { action: GreyboxAction | null }) {
  if (!action) {
    return (
      <div className={styles.emptyProjection}>
        Select one action variant to review its projected consequence before
        adding it.
      </div>
    );
  }
  return (
    <div className={styles.projection}>
      <div className={styles.cardTopline}>
        <div>
          <p className={styles.eyebrow}>Pre-lock projection</p>
          <h4>{action.name}</h4>
        </div>
        <StatusPill tone={action.projection.certainty.startsWith("Confirmed") ? "good" : "warn"}>
          {action.tag}
        </StatusPill>
      </div>
      <dl>
        {Object.entries(action.projection).map(([key, value]) => (
          <div key={key}>
            <dt>{key.replace(/([A-Z])/g, " $1")}</dt>
            <dd>{String(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ActionBrowser({
  game,
  apply,
  selectedCandidate,
  setSelectedCandidate,
}: {
  game: ReturnType<typeof createGreyboxState>;
  apply: (next: ReturnType<typeof createGreyboxState>) => void;
  selectedCandidate: GreyboxAction | null;
  setSelectedCandidate: (action: GreyboxAction | null) => void;
}) {
  const activeSeat = game.seats.find(
    (seat: GreyboxRecord) => seat.id === game.activeSeatId,
  );
  const groups = getImmediateActionGroups(
    game,
    activeSeat.id,
    activeSeat.focusId,
  );
  const [openGroup, setOpenGroup] = useState(groups[0]?.name ?? "");
  const visibleGroup =
    groups.find((group) => group.name === openGroup) ?? groups[0];

  return (
    <div className={styles.actionBrowser}>
      <div className={styles.cardTopline}>
        <div>
          <p className={styles.eyebrow}>World focus</p>
          <h3>
            {getFocuses(game).find((focus) => focus.id === activeSeat.focusId)?.name ??
              activeSeat.focusId}
          </h3>
        </div>
        <StatusPill tone={groups.length <= 4 ? "good" : "bad"}>
          {groups.length} immediate choice{groups.length === 1 ? "" : "s"}
        </StatusPill>
      </div>
      <p className={styles.actionHint}>
        Root choices are true action families. Their variants replace this
        layer; no legal action is dropped to satisfy the four-choice target.
      </p>
      <div className={styles.actionFamilies}>
        {groups.map((group) => (
          <button
            key={group.name}
            className={visibleGroup?.name === group.name ? styles.activeChoice : styles.secondaryButton}
            onClick={() => {
              setOpenGroup(group.name);
              setSelectedCandidate(null);
            }}
          >
            {group.name}
            <small>{group.variants.length} variant{group.variants.length === 1 ? "" : "s"}</small>
          </button>
        ))}
      </div>
      <div className={styles.variantList}>
        {visibleGroup?.variants.map((action: GreyboxAction) => (
          <button
            key={`${action.id}-${action.targetId}-${action.destinationId ?? ""}`}
            className={
              selectedCandidate?.id === action.id &&
              selectedCandidate?.targetId === action.targetId
                ? styles.variantSelected
                : styles.variantButton
            }
            onClick={() => setSelectedCandidate(action)}
          >
            <span>{action.name}</span>
            <small>
              {action.cost} Command · {action.lane}/{action.tempo}
              {!action.paid && " · free slot"}
            </small>
          </button>
        ))}
      </div>
      <Projection action={selectedCandidate} />
      <button
        className={styles.primaryButton}
        disabled={!selectedCandidate || activeSeat.locked}
        onClick={() => {
          if (!selectedCandidate) return;
          apply(queueAction(game, activeSeat.id, selectedCandidate));
          setSelectedCandidate(null);
        }}
      >
        Add projected action
      </button>
    </div>
  );
}

function PlanPanel({
  game,
  apply,
}: {
  game: ReturnType<typeof createGreyboxState>;
  apply: (next: ReturnType<typeof createGreyboxState>) => void;
}) {
  const activeSeat = game.seats.find(
    (seat: GreyboxRecord) => seat.id === game.activeSeatId,
  );
  const paid = activeSeat.plan.filter(
    (action: GreyboxAction) => action.paid,
  ).length;
  const reposition = activeSeat.plan.some(
    (action: GreyboxAction) => action.baseId === "reposition",
  );

  return (
    <div className={styles.planPanel}>
      <div className={styles.seatTabs} role="tablist" aria-label="Local player seats">
        {game.seats.map((seat: GreyboxRecord) => (
          <button
            key={seat.id}
            role="tab"
            aria-selected={seat.id === game.activeSeatId}
            className={seat.id === game.activeSeatId ? styles.activeSeatTab : styles.seatTab}
            onClick={() => apply(selectSeat(game, seat.id))}
          >
            {seat.label}
            <small>{seat.locked ? "locked" : `${seat.plan.length} planned`}</small>
          </button>
        ))}
      </div>
      <div className={styles.planHeader}>
        <div>
          <p className={styles.eyebrow}>Personal plan ownership</p>
          <h3>{activeSeat.label}</h3>
        </div>
        <div className={styles.slotReadout}>
          <span>{paid} / 4 paid</span>
          <span>{reposition ? "1 / 1" : "0 / 1"} Reposition</span>
          <span>{seatCommandAvailable(activeSeat)} Command free</span>
        </div>
      </div>

      {activeSeat.hand.length > CORE_RULES.retainLimit && (
        <div className={styles.discardStrip}>
          <strong>Discard to seven before the next lock.</strong>
          {activeSeat.hand.map((cardId: string) => (
            <button
              key={cardId}
              onClick={() => apply(discardCard(game, activeSeat.id, cardId))}
            >
              {formatCard(cardId)}
            </button>
          ))}
        </div>
      )}

      <div className={styles.planList}>
        {activeSeat.plan.length === 0 && (
          <p className={styles.muted}>No paid actions or Reposition declared.</p>
        )}
        {activeSeat.plan.map((action: GreyboxAction, index: number) => {
          const compatible = compatibleCardsForAction(activeSeat, action);
          return (
            <article className={styles.planAction} key={action.instanceId}>
              <div className={styles.cardTopline}>
                <div>
                  <span className={styles.actionIndex}>
                    {action.paid ? `SLOT ${index + 1}` : "REPOSITION"}
                  </span>
                  <h4>{action.name}</h4>
                </div>
                <span className={styles.commandCost}>
                  {action.totalReservedCommand} CMD
                </span>
              </div>
              <p>
                {action.lane}/{action.tempo} · {action.tag} · target{" "}
                {action.projection.target}
              </p>
              {action.exclusiveClaim && (
                <label className={styles.inlineControl}>
                  <span>Claim</span>
                  <select
                    value={action.claimMode}
                    disabled={activeSeat.locked}
                    onChange={(event) =>
                      apply(
                        setClaimMode(
                          game,
                          activeSeat.id,
                          action.instanceId,
                          event.target.value,
                        ),
                      )
                    }
                  >
                    <option>Primary</option>
                    <option>If Available</option>
                    <option>Yielded</option>
                  </select>
                </label>
              )}
              {action.requiresConsentFromSeatId && (
                <div className={styles.consentLine}>
                  <span>
                    Consent:{" "}
                    {
                      game.seats.find(
                        (seat: GreyboxRecord) =>
                          seat.id === action.requiresConsentFromSeatId,
                      )?.label
                    }
                  </span>
                  <StatusPill tone={action.consentGranted ? "good" : "warn"}>
                    {action.consentGranted ? "Granted" : "Required"}
                  </StatusPill>
                </div>
              )}
              <details>
                <summary>Projection and invalidators</summary>
                <Projection action={action} />
              </details>
              <div className={styles.cardAttach}>
                {action.attachedCardId ? (
                  <>
                    <span>
                      {formatCard(action.attachedCardId)} ·{" "}
                      {CARDS[action.attachedCardId].kind}
                    </span>
                    <button
                      disabled={activeSeat.locked}
                      onClick={() =>
                        apply(
                          detachCard(
                            game,
                            activeSeat.id,
                            action.instanceId,
                          ),
                        )
                      }
                    >
                      Detach
                    </button>
                  </>
                ) : compatible.length ? (
                  <>
                    <span>Attach one compatible Prepared Card</span>
                    <select
                      defaultValue=""
                      disabled={activeSeat.locked}
                      onChange={(event) => {
                        if (!event.target.value) return;
                        apply(
                          attachCard(
                            game,
                            activeSeat.id,
                            action.instanceId,
                            event.target.value,
                          ),
                        );
                        event.target.value = "";
                      }}
                    >
                      <option value="">Choose card…</option>
                      {compatible.map((card) => (
                        <option key={card.id} value={card.id}>
                          {card.name} · +{card.cost}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <span>No compatible card in hand.</span>
                )}
              </div>
              <button
                className={styles.removeButton}
                disabled={activeSeat.locked}
                onClick={() =>
                  apply(
                    removeAction(game, activeSeat.id, action.instanceId),
                  )
                }
              >
                Remove
              </button>
            </article>
          );
        })}
      </div>

      {game.seats
        .flatMap((seat: GreyboxRecord) =>
          seat.plan.map((action: GreyboxAction) => ({ actor: seat, action })),
        )
        .filter(
          ({ action }: { action: GreyboxAction }) =>
            action.requiresConsentFromSeatId === activeSeat.id,
        )
        .map(
          ({
            actor,
            action,
          }: {
            actor: GreyboxRecord;
            action: GreyboxAction;
          }) => (
          <div className={styles.consentRequest} key={action.instanceId}>
            <span>
              {actor.label} requests consent for <b>{action.name}</b>.
            </span>
            <button
              disabled={activeSeat.locked}
              onClick={() =>
                apply(setConsent(game, activeSeat.id, action.instanceId, true))
              }
            >
              Grant
            </button>
            <button
              disabled={activeSeat.locked}
              onClick={() =>
                apply(setConsent(game, activeSeat.id, action.instanceId, false))
              }
            >
              Withhold
            </button>
          </div>
          ),
        )}

      {activeSeat.lockError && (
        <p className={styles.errorText}>{activeSeat.lockError}</p>
      )}
      <button
        className={activeSeat.locked ? styles.secondaryButton : styles.primaryButton}
        onClick={() =>
          apply(
            activeSeat.locked
              ? unlockSeatPlan(game, activeSeat.id)
              : lockSeatPlan(game, activeSeat.id),
          )
        }
      >
        {activeSeat.locked ? `Unlock ${activeSeat.label}` : `Lock ${activeSeat.label}`}
      </button>
    </div>
  );
}

function CausalLog({ game }: { game: ReturnType<typeof createGreyboxState> }) {
  const events = game.encounter?.causalLog ?? [];
  return (
    <details className={styles.causalLog} open={game.encounter?.resolutionComplete}>
      <summary>
        Causal resolution log <span>{events.length} events</span>
      </summary>
      <ol>
        {events.map((event: GreyboxRecord) => (
          <li key={`${event.index}-${event.cycle}`}>
            <span className={styles.packetLabel}>
              {event.packet}
            </span>
            <div>
              <strong>{event.actionId}</strong>
              <p>{event.detail}</p>
              <small>{event.outcome} · {event.tags.join(" · ")}</small>
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}

function Encounter({
  game,
  apply,
}: {
  game: ReturnType<typeof createGreyboxState>;
  apply: (next: ReturnType<typeof createGreyboxState>) => void;
}) {
  const [selectedCandidate, setSelectedCandidate] =
    useState<GreyboxAction | null>(null);
  const resolved = game.encounter.resolutionComplete;
  return (
    <section className={styles.workspace}>
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>LS-01 · cycle {game.encounter.cycle}</p>
          <h2>{resolved ? "Resolution complete. Settle the causal state." : "Inspect → focus → plan → project → lock."}</h2>
        </div>
        <StatusPill tone={resolved ? "good" : "info"}>
          {resolved ? "Awaiting Settle" : "Planning Phase"}
        </StatusPill>
      </div>
      <ResourceBar game={game} />
      <div className={styles.encounterGrid}>
        <TacticalMap game={game} apply={apply} />
        <IntentPanel game={game} />
      </div>
      {!resolved && (
        <div className={styles.planningGrid}>
          <ActionBrowser
            game={game}
            apply={apply}
            selectedCandidate={selectedCandidate}
            setSelectedCandidate={setSelectedCandidate}
          />
          <PlanPanel game={game} apply={apply} />
        </div>
      )}

      <CausalLog game={game} />

      <div className={styles.resolveBar}>
        {!resolved ? (
          <>
            <div>
              <strong>
                {
                  game.seats.filter((seat: GreyboxRecord) => seat.locked)
                    .length
                }{" "}
                /{" "}
                {game.seats.length} personal plans locked
              </strong>
              <span>
                No seat can edit another seat&apos;s plan. Equal-time exclusive
                conflicts block resolution.
              </span>
            </div>
            <button
              className={styles.dangerButton}
              disabled={!canResolvePlans(game)}
              onClick={() => apply(resolvePlans(game))}
            >
              Resolve Fast → Standard → Slow
            </button>
          </>
        ) : (
          <>
            <div>
              <strong>Resolution packets complete.</strong>
              <span>
                Refunds, Reseal, release validation, reinforcement, income,
                draw, and rescue clocks occur at Settle.
              </span>
            </div>
            <button
              className={styles.primaryButton}
              onClick={() => apply(settleCycle(game))}
            >
              Settle cycle {game.encounter.cycle}
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function ResultTable({ game }: { game: ReturnType<typeof createGreyboxState> }) {
  const summary = resultSummary(game);
  const comparison = compareToPaperExpectation(game);
  return (
    <div className={styles.resultGrid}>
      <article className={styles.resultCard}>
        <p className={styles.eyebrow}>World state</p>
        <h3>Loose Signal result</h3>
        <dl>
          <div><dt>Cycle</dt><dd>{summary.cycle}</dd></div>
          <div><dt>Survey</dt><dd>{summary.survey}</dd></div>
          <div><dt>Marker</dt><dd>{summary.markerIntegrity} Integrity</dd></div>
          <div><dt>Shutter</dt><dd>{summary.shutter} · {summary.shutterState}</dd></div>
          <div><dt>Threat clear</dt><dd>{summary.fullEnteredThreatClear ? "Yes" : "No"}</dd></div>
          <div><dt>Protection</dt><dd>{summary.protectedPackages}</dd></div>
        </dl>
      </article>
      {summary.seats.map((seat: GreyboxRecord) => (
        <article className={styles.resultCard} key={seat.id}>
          <p className={styles.eyebrow}>{seat.id}</p>
          <h3>{seat.build}</h3>
          <dl>
            <div><dt>Condition</dt><dd>{seat.condition}</dd></div>
            <div><dt>Guard</dt><dd>{seat.guard}</dd></div>
            <div><dt>Command</dt><dd>{seat.command}</dd></div>
            <div><dt>Disruption</dt><dd>{seat.disruption}</dd></div>
            <div><dt>Position</dt><dd>{seat.position}</dd></div>
            <div><dt>Major state</dt><dd>{seat.majorState}</dd></div>
            <div><dt>Packages</dt><dd>{seat.packages.join(", ") || "None"}</dd></div>
          </dl>
        </article>
      ))}
      {comparison.length > 0 && (
        <article className={styles.resultCard}>
          <p className={styles.eyebrow}>Paper versus playable</p>
          <h3>Mismatch ledger</h3>
          <table>
            <thead><tr><th>Field</th><th>Paper</th><th>Observed</th><th /></tr></thead>
            <tbody>
              {comparison.map((row) => (
                <tr key={row.field}>
                  <td>{row.field}</td>
                  <td>{String(row.expected)}</td>
                  <td>{String(row.observed)}</td>
                  <td>{row.match ? "MATCH" : "MISMATCH"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      )}
    </div>
  );
}

function SegmentSettle({
  game,
  apply,
}: {
  game: ReturnType<typeof createGreyboxState>;
  apply: (next: ReturnType<typeof createGreyboxState>) => void;
}) {
  return (
    <section className={styles.workspace}>
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Segment Settle</p>
          <h2>The Threshold is open. The bounded evidence target is complete.</h2>
        </div>
        <StatusPill tone="good">Outskirts → Loose Signal</StatusPill>
      </div>
      <ResultTable game={game} />
      <div className={styles.decisionGrid}>
        <button onClick={() => apply(chooseSegmentDecision(game, "continue"))}>
          <strong>Continue to Quiet Shift</strong>
          <span>Record the carried tactical state, then stop at this PR&apos;s boundary.</span>
        </button>
        <button onClick={() => apply(chooseSegmentDecision(game, "retreat"))}>
          <strong>Retreat and record</strong>
          <span>Record a private noncanonical retreat. No canonical reward or persistent economy write.</span>
        </button>
        <button onClick={() => apply(chooseSegmentDecision(game, "extract-record"))}>
          <strong>Record extraction evidence</strong>
          <span>Use the opened Threshold state as deterministic extraction evidence; no account persistence.</span>
        </button>
        <div className={styles.disabledDecision}>
          <strong>Protect Packages</strong>
          <span>Unavailable here. Protected claims belong to the later physical Safe Node; the greybox will not invent an earlier protection system.</span>
        </div>
      </div>
    </section>
  );
}

function Evidence({
  game,
  apply,
}: {
  game: ReturnType<typeof createGreyboxState>;
  apply: (next: ReturnType<typeof createGreyboxState>) => void;
}) {
  const downloadEvidence = () => {
    const payload = {
      sourceRevision: game.sourceRevision,
      profileId: game.profileId,
      expectedPaperResult: game.expectedPaperResult,
      sourceMismatches: game.sourceMismatches,
      result: resultSummary(game),
      evidence: game.evidence,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${game.profileId.toLowerCase()}-evidence.json`;
    anchor.click();
    URL.revokeObjectURL(href);
  };
  return (
    <section className={styles.workspace}>
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Private evidence boundary</p>
          <h2>{game.stageLabel}</h2>
        </div>
        <StatusPill tone="good">No canonical write</StatusPill>
      </div>
      <ResultTable game={game} />
      <div className={styles.evidenceActions}>
        <button className={styles.secondaryButton} onClick={downloadEvidence}>
          Download isolated evidence JSON
        </button>
        <button className={styles.primaryButton} onClick={() => apply(resetGreybox(game))}>
          Reset to known profile start
        </button>
      </div>
    </section>
  );
}

function SourceBoundary({ game }: { game: ReturnType<typeof createGreyboxState> }) {
  return (
    <details className={styles.sourceBoundary}>
      <summary>
        Source conflicts, assumptions, and intentionally excluded behavior
        <span>{game.sourceMismatches.length}</span>
      </summary>
      <div className={styles.mismatchGrid}>
        {game.sourceMismatches.map((item: GreyboxRecord) => (
          <article key={item.id}>
            <div className={styles.cardTopline}>
              <strong>{item.id}</strong>
              <StatusPill tone={item.status === "SOURCE CONFLICT" ? "bad" : "warn"}>
                {item.status}
              </StatusPill>
            </div>
            <p>{item.rule}</p>
            {item.conflictingExpectation && (
              <p><b>Conflict:</b> {item.conflictingExpectation}</p>
            )}
            <p><b>Greybox treatment:</b> {item.implementation}</p>
          </article>
        ))}
      </div>
      <p className={styles.boundaryCopy}>
        Intentionally absent: creatures, permanent progression, artist
        takeover, account persistence, online sync, canonical rewards, stores,
        crafting, trading, rarity, queue events, Discord, TikTok, Relay,
        Journal, BNL calls, dossiers, and Source Files.
      </p>
    </details>
  );
}

export function BarcodeWorldGreybox() {
  const [game, setGame] = useState(() => createGreyboxState());

  const apply = (next: ReturnType<typeof createGreyboxState>) => {
    setGame(next);
  };

  const progressStage = useMemo(
    () => (game.stage === "loose-signal" && game.encounter?.resolutionComplete ? "loose-signal" : game.stage),
    [game.stage, game.encounter?.resolutionComplete],
  );

  return (
    <div className={styles.shell}>
      <header className={styles.prototypeHeader}>
        <div>
          <p className={styles.eyebrow}>BARCODE World // evidence equipment</p>
          <h1>Outskirts → Loose Signal</h1>
          <p>
            Private, resettable, deterministic browser greybox. Working
            noncanonical names. No model call. No live data.
          </p>
        </div>
        <div className={styles.headerBadges}>
          <StatusPill tone="warn">Development only</StatusPill>
          <StatusPill>LS-01</StatusPill>
          <StatusPill>{game.profileId}</StatusPill>
        </div>
      </header>

      <nav className={styles.stageRail} aria-label="Greybox phase">
        {STAGES.map(([id, label], index) => (
          <div
            key={id}
            className={
              id === progressStage
                ? styles.currentStage
                : stageReached(progressStage, id)
                  ? styles.pastStage
                  : styles.futureStage
            }
          >
            <span>{index + 1}</span>
            <strong>{label}</strong>
          </div>
        ))}
      </nav>

      {game.warnings.length > 0 && (
        <div className={styles.warningStack} role="status">
          {game.warnings.slice(-3).map((warning: string, index: number) => (
            <p key={`${warning}-${index}`}>{warning}</p>
          ))}
        </div>
      )}

      {game.stage === "preparation" && <Preparation game={game} apply={apply} />}
      {game.stage === "outskirts" && <Outskirts game={game} apply={apply} />}
      {game.stage === "loose-signal" && <Encounter game={game} apply={apply} />}
      {game.stage === "segment-settle" && <SegmentSettle game={game} apply={apply} />}
      {game.stage === "complete" && <Evidence game={game} apply={apply} />}

      <SourceBoundary game={game} />

      <footer className={styles.prototypeFooter}>
        <span>{game.sourceRevision}</span>
        <button onClick={() => apply(resetGreybox(game))}>Reset profile</button>
      </footer>
    </div>
  );
}
