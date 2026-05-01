"use client";

import * as React from "react";
import { ChevronDown, HelpCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Cs1Interpreter, type Cs1SimState } from "@/lib/interface-renderer/cs1-interpreter";
import type { GameVals } from "@/rs/config/gameval/GameVals";
import type { Sprite } from "@/rs/sprite/InterfaceCanvasSprite";
import { cn } from "@/lib/utils";

import { OSRS_WIKI_SKILL_ICON_FILES, osrsWikiSkillIconUrl } from "./cs1-skill-icons";
import { InventorySimulateSection } from "./inventory-simulate-section";
import type { InterfaceEntry } from "@/lib/interface-renderer/component-types";

const CS1_GENERAL_SPRITE_COMBAT = 881;
const CS1_GENERAL_SPRITE_RUN = 1070;
const CS1_GENERAL_SPRITE_WEIGHT = 649;

const SKILL_NAMES: readonly string[] = [
  "Attack",
  "Defence",
  "Strength",
  "Hitpoints",
  "Ranged",
  "Prayer",
  "Magic",
  "Cooking",
  "Woodcutting",
  "Fletching",
  "Fishing",
  "Firemaking",
  "Crafting",
  "Smithing",
  "Mining",
  "Herblore",
  "Agility",
  "Thieving",
  "Slayer",
  "Farming",
  "Runecraft",
  "Hunter",
  "Construction",
  "Sailing",
];

type Cs1SimulatePanelProps = {
  state: Cs1SimState;
  onChange: React.Dispatch<React.SetStateAction<Cs1SimState>>;
  interfaceData: InterfaceEntry | null;
  revision: number | "latest";
  gameVals?: GameVals | null;
  spritesById: ReadonlyMap<number, Sprite>;
};

function spriteToPngDataUrl(sprite: Sprite | undefined | null): string | null {
  if (!sprite?.loaded || sprite.subWidth <= 0 || sprite.subHeight <= 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = sprite.subWidth;
  canvas.height = sprite.subHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const rgba = new Uint8ClampedArray(sprite.toRgba());
  ctx.putImageData(new ImageData(rgba, sprite.subWidth, sprite.subHeight), 0, 0);
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

function WikiSkillIcon({ fileName }: { fileName: string }) {
  const [failed, setFailed] = React.useState(false);
  const src = osrsWikiSkillIconUrl(fileName);

  if (failed) {
    return (
      <div
        className="flex size-5 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground"
        title="Icon failed to load"
      >
        <HelpCircle className="size-3" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      width={20}
      height={20}
      className="size-5 shrink-0 rounded-sm bg-muted object-contain"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

function GeneralIconButton({
  sprite,
  tooltip,
  ariaLabel,
  enabled,
}: {
  sprite: Sprite | undefined;
  tooltip: string;
  ariaLabel: string;
  enabled: boolean;
}) {
  const spriteSrc = React.useMemo(() => spriteToPngDataUrl(sprite) ?? "", [sprite]);

  const button = (
    <button
      type="button"
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border/80 bg-muted/30 p-0.5 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={ariaLabel}
      disabled={!enabled}
    >
      {spriteSrc ? (
        <img
          src={spriteSrc}
          alt=""
          width={24}
          height={24}
          className="pointer-events-none max-h-full max-w-full rounded object-contain"
        />
      ) : (
        <div className="size-6 rounded bg-muted/60" title="Sprite not in cache" />
      )}
    </button>
  );

  if (!enabled) return button;

  return (
    <Tooltip>
      <TooltipTrigger>{button}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px] text-left leading-snug">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function SkillTile({
  index,
  state,
  patchAt,
  inputsDisabled,
}: {
  index: number;
  state: Cs1SimState;
  patchAt: (index: number, field: "currentLevels" | "maximumLevels" | "currentExp", value: number) => void;
  inputsDisabled: boolean;
}) {
  const name = SKILL_NAMES[index] ?? `Skill ${index}`;
  const iconFile = OSRS_WIKI_SKILL_ICON_FILES[index] ?? null;
  const maxLv = state.maximumLevels[index] ?? 0;
  const curLv = state.currentLevels[index] ?? 0;
  const xp = state.currentExp[index] ?? 0;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-md border border-border/80 bg-muted/15 p-1.5",
        "shadow-sm",
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {iconFile ? (
          <WikiSkillIcon fileName={iconFile} />
        ) : (
          <div className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-muted text-[9px] text-muted-foreground">
            —
          </div>
        )}
        <span className="min-w-0 truncate font-medium leading-tight text-foreground" title={name}>
          {name}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1">
        <div className="min-w-0 space-y-0.5">
          <div className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Max</div>
          <Input
            type="number"
            aria-label={`${name} max level`}
            className="h-7 min-w-0 px-1 font-mono text-[10px] tabular-nums"
            placeholder="99"
            value={maxLv}
            disabled={inputsDisabled}
            onChange={(e) => patchAt(index, "maximumLevels", Number(e.target.value) || 0)}
          />
        </div>
        <div className="min-w-0 space-y-0.5">
          <div className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Cur</div>
          <Input
            type="number"
            aria-label={`${name} current level`}
            className="h-7 min-w-0 px-1 font-mono text-[10px] tabular-nums"
            placeholder="1"
            value={curLv}
            disabled={inputsDisabled}
            onChange={(e) => patchAt(index, "currentLevels", Number(e.target.value) || 0)}
          />
        </div>
        <div className="min-w-0 space-y-0.5">
          <div className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">XP</div>
          <Input
            type="number"
            aria-label={`${name} current XP`}
            className="h-7 min-w-0 px-1 font-mono text-[10px] tabular-nums"
            placeholder="0"
            value={xp}
            disabled={inputsDisabled}
            onChange={(e) => patchAt(index, "currentExp", Number(e.target.value) || 0)}
          />
        </div>
      </div>
    </div>
  );
}

export function Cs1SimulatePanel({
  state,
  onChange,
  interfaceData,
  revision,
  gameVals = null,
  spritesById,
}: Cs1SimulatePanelProps) {
  const patchAt = React.useCallback(
    (index: number, field: "currentLevels" | "maximumLevels" | "currentExp", value: number) => {
      onChange((prev) => {
        const next = { ...prev, [field]: [...prev[field]] };
        next[field][index] = value;
        return next;
      });
    },
    [onChange],
  );

  const handleMaxAll = React.useCallback(() => {
    onChange((prev) => {
      const maximumLevels = [...prev.maximumLevels];
      const currentLevels = [...prev.currentLevels];
      const currentExp = [...prev.currentExp];
      for (let i = 0; i < Cs1Interpreter.SKILL_COUNT; i++) {
        maximumLevels[i] = 99;
        currentLevels[i] = 99;
        currentExp[i] = Cs1Interpreter.XP_AT_99;
      }
      return { ...prev, maximumLevels, currentLevels, currentExp };
    });
  }, [onChange]);

  const handleResetAll = React.useCallback(() => {
    onChange(Cs1Interpreter.defaultState());
  }, [onChange]);

  const patchGeneral = React.useCallback(
    (field: "combatLevel" | "runEnergy" | "weight", value: number) => {
      onChange((prev) => ({ ...prev, [field]: value }));
    },
    [onChange],
  );

  const hasAnyCs1Scripts = React.useMemo(() => Cs1Interpreter.interfaceUsesCs1(interfaceData), [interfaceData]);
  const generalUsed = React.useMemo(
    () => Cs1Interpreter.interfaceScriptsUseOpcodes(interfaceData, Cs1Interpreter.SIM_GENERAL_OPCODES),
    [interfaceData],
  );
  const skillsUsed = React.useMemo(
    () => Cs1Interpreter.interfaceScriptsUseOpcodes(interfaceData, Cs1Interpreter.SIM_SKILL_OPCODES),
    [interfaceData],
  );
  const variablesUsed = React.useMemo(
    () => Cs1Interpreter.interfaceScriptsUseOpcodes(interfaceData, Cs1Interpreter.SIM_VARIABLE_OPCODES),
    [interfaceData],
  );
  const inventoryScriptsUsed = React.useMemo(
    () => Cs1Interpreter.interfaceScriptsUseOpcodes(interfaceData, Cs1Interpreter.SIM_INVENTORY_OPCODES),
    [interfaceData],
  );

  const [skillsOpen, setSkillsOpen] = React.useState(false);

  React.useEffect(() => {
    if (!skillsUsed) setSkillsOpen(false);
  }, [skillsUsed]);

  return (
    <div className="space-y-3 px-2 py-2 text-[11px]">
      <p className="px-1 text-muted-foreground leading-snug">
        Skill icons from the{" "}
        <a
          className="text-primary underline-offset-2 hover:underline"
          href="https://oldschool.runescape.wiki/"
          target="_blank"
          rel="noreferrer"
        >
          OSRS Wiki
        </a>
        .
      </p>
      {!hasAnyCs1Scripts ? (
        <p className="px-1 text-[10px] text-muted-foreground leading-snug">
          This interface has no client scripts on any component. Simulator inputs are shown for reference only.
        </p>
      ) : null}

      <Collapsible defaultOpen className="group/collapsible overflow-hidden rounded-lg border border-border bg-background">
        <CollapsibleTrigger
          className={cn(
            "flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-xs font-semibold",
            "hover:bg-muted/50",
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span>General</span>
            {!generalUsed ? (
              <Badge variant="secondary" className="h-4 shrink-0 px-1.5 py-0 text-[9px] font-normal">
                Not used
              </Badge>
            ) : null}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className={cn("space-y-3 border-t border-border px-2 pb-2 pt-2", !generalUsed && "opacity-70")}>
            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <GeneralIconButton
                  sprite={spritesById.get(CS1_GENERAL_SPRITE_COMBAT)}
                  ariaLabel="Combat level — more info"
                  enabled={generalUsed}
                  tooltip="Your combat level. The renderer uses this value anywhere the interface expects your combat level (requirements, text, visibility)."
                />
                <Input
                  id="cs1-combat"
                  type="number"
                  className="h-8 min-w-0 flex-1 font-mono text-xs"
                  placeholder={String(Cs1Interpreter.DEFAULT_COMBAT_LEVEL)}
                  value={state.combatLevel}
                  disabled={!generalUsed}
                  onChange={(e) => patchGeneral("combatLevel", Number(e.target.value) || 0)}
                  aria-label="Combat level"
                />
              </div>
              <div className="flex items-center gap-2">
                <GeneralIconButton
                  sprite={spritesById.get(CS1_GENERAL_SPRITE_RUN)}
                  ariaLabel="Run energy — more info"
                  enabled={generalUsed}
                  tooltip="Run energy from 0-100. Used when the interface reads how much run energy you have left."
                />
                <Input
                  id="cs1-energy"
                  type="number"
                  className="h-8 min-w-0 flex-1 font-mono text-xs"
                  placeholder={String(Cs1Interpreter.DEFAULT_RUN_ENERGY)}
                  value={state.runEnergy}
                  disabled={!generalUsed}
                  onChange={(e) => patchGeneral("runEnergy", Number(e.target.value) || 0)}
                  aria-label="Run energy"
                />
              </div>
              <div className="flex items-center gap-2">
                <GeneralIconButton
                  sprite={spritesById.get(CS1_GENERAL_SPRITE_WEIGHT)}
                  ariaLabel="Weight — more info"
                  enabled={generalUsed}
                  tooltip="Total carried weight (kg). Used when the interface checks or shows your weight."
                />
                <Input
                  id="cs1-weight"
                  type="number"
                  className="h-8 min-w-0 flex-1 font-mono text-xs"
                  placeholder={String(Cs1Interpreter.DEFAULT_WEIGHT)}
                  value={state.weight}
                  disabled={!generalUsed}
                  onChange={(e) => patchGeneral("weight", Number(e.target.value) || 0)}
                  aria-label="Weight"
                />
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible
        open={skillsUsed && skillsOpen}
        onOpenChange={(open) => {
          if (!skillsUsed) return;
          setSkillsOpen(open);
        }}
        className="group/collapsible overflow-hidden rounded-lg border border-border bg-background"
      >
        <CollapsibleTrigger
          className={cn(
            "flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-xs font-semibold",
            skillsUsed ? "hover:bg-muted/50" : "pointer-events-none cursor-default bg-muted/25 text-muted-foreground",
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span>Skills</span>
            {!skillsUsed ? (
              <Badge variant="secondary" className="h-4 shrink-0 px-1.5 py-0 text-[9px] font-normal">
                Not used
              </Badge>
            ) : null}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border px-1.5 pb-2 pt-1.5">
            <div className="mb-2 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 flex-1 text-[11px]"
                disabled={!skillsUsed}
                onClick={handleMaxAll}
              >
                Max all
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 flex-1 text-[11px]"
                disabled={!skillsUsed}
                onClick={handleResetAll}
              >
                Reset all
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: Cs1Interpreter.VISIBLE_SKILL_COUNT }, (_, index) => (
                <SkillTile
                  key={index}
                  index={index}
                  state={state}
                  patchAt={patchAt}
                  inputsDisabled={!skillsUsed}
                />
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <InventorySimulateSection
        interfaceData={interfaceData}
        revision={revision}
        state={state}
        onChange={onChange}
        inventoryScriptsUsed={inventoryScriptsUsed}
        gameVals={gameVals}
      />

      <div
        className={cn(
          "rounded-md border border-dashed border-border p-2 text-[11px] text-muted-foreground",
          !variablesUsed && "bg-muted/15",
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">Variables</span>
          {!variablesUsed ? (
            <Badge variant="secondary" className="h-4 px-1.5 py-0 text-[9px] font-normal">
              Not used
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 leading-snug">Editor coming soon.</p>
      </div>
    </div>
  );
}
