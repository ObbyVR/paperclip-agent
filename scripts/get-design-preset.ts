#!/usr/bin/env npx tsx
/**
 * Select a design preset based on business category.
 * Used by RedesignPreview agent to get style guidelines before generating HTML.
 *
 * Usage:
 *   npx tsx scripts/get-design-preset.ts ristorante_tradizionale
 *   npx tsx scripts/get-design-preset.ts --list
 *   npx tsx scripts/get-design-preset.ts --match "pizzeria napoletana"
 *
 * Output: JSON preset with palette, fonts, layout, mood, sections, do/dont guidelines
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const presetsPath = path.join(__dirname, "design-presets.json");

interface Preset {
  name: string;
  category: string;
  subcategory: string;
  palette: Record<string, string>;
  fonts: Record<string, string>;
  layout: string;
  mood: string;
  sections: string[];
  do: string[];
  dont: string[];
}

function loadPresets(): Record<string, Preset> {
  const raw = fs.readFileSync(presetsPath, "utf-8");
  return JSON.parse(raw).presets;
}

function matchPreset(query: string, presets: Record<string, Preset>): [string, Preset] | null {
  const q = query.toLowerCase();

  // Exact key match
  if (presets[q]) return [q, presets[q]];

  // Search in name, category, subcategory
  let bestMatch: [string, Preset, number] | null = null;

  for (const [key, preset] of Object.entries(presets)) {
    const searchable = `${key} ${preset.name} ${preset.category} ${preset.subcategory}`.toLowerCase();
    const words = q.split(/\s+/);
    const matchCount = words.filter(w => searchable.includes(w)).length;

    if (matchCount > 0 && (!bestMatch || matchCount > bestMatch[2])) {
      bestMatch = [key, preset, matchCount];
    }
  }

  return bestMatch ? [bestMatch[0], bestMatch[1]] : null;
}

function main() {
  const arg = process.argv[2];

  if (!arg) {
    console.error("Usage: npx tsx scripts/get-design-preset.ts <preset-key | --list | --match 'query'>");
    process.exit(1);
  }

  const presets = loadPresets();

  if (arg === "--list") {
    console.log("Available design presets:\n");
    for (const [key, preset] of Object.entries(presets)) {
      console.log(`  ${key.padEnd(28)} ${preset.name} (${preset.subcategory})`);
    }
    return;
  }

  const query = arg === "--match" ? (process.argv[3] ?? "") : arg;
  const result = matchPreset(query, presets);

  if (!result) {
    console.error(`No preset found for: "${query}"`);
    console.error("Use --list to see available presets, or --match 'query' for fuzzy search");
    process.exit(1);
  }

  const [key, preset] = result;
  console.log(JSON.stringify({ key, ...preset }, null, 2));
}

main();
