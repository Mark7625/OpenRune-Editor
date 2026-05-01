export const OSRS_WIKI_SKILL_ICON_FILES: readonly (string | null)[] = [
  "Attack_icon_(detail).png",
  "Defence_icon_(detail).png",
  "Strength_icon_(detail).png",
  "Hitpoints_icon_(detail).png",
  "Ranged_icon_(detail).png",
  "Prayer_icon_(detail).png",
  "Magic_icon_(detail).png",
  "Cooking_icon_(detail).png",
  "Woodcutting_icon_(detail).png",
  "Fletching_icon_(detail).png",
  "Fishing_icon_(detail).png",
  "Firemaking_icon_(detail).png",
  "Crafting_icon_(detail).png",
  "Smithing_icon_(detail).png",
  "Mining_icon_(detail).png",
  "Herblore_icon_(detail).png",
  "Agility_icon_(detail).png",
  "Thieving_icon_(detail).png",
  "Slayer_icon_(detail).png",
  "Farming_icon_(detail).png",
  "Runecraft_icon_(detail).png",
  "Hunter_icon_(detail).png",
  "Construction_icon_(detail).png",
  "Sailing.png",
];

const WIKI_BASE = "https://oldschool.runescape.wiki/images/";

export function osrsWikiSkillIconUrl(fileName: string): string {
  return `${WIKI_BASE}${encodeURIComponent(fileName)}`;
}
