import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BlueprintStepDef } from "@paperclipai/shared";

export interface StepExecutionResult {
  output: unknown;
  costCents: number;
  durationMs: number;
}

/**
 * Esegue uno step invocando il tool corretto in base al provider.
 * Fase 2: solo kling-fal è implementato come esecuzione reale.
 * Gli altri provider completano con costo stimato (come Fase 1).
 */
export async function executeStep(
  step: BlueprintStepDef,
  params: Record<string, unknown>,
  _runContext: { companyId: string; runId: string },
): Promise<StepExecutionResult> {
  switch (step.provider) {
    case "kling-fal":
      return executeKlingFal(step, params);
    // Fase 2: solo kling-fal è reale. Gli altri restano simulati.
    default:
      return {
        output: { simulated: true, provider: step.provider },
        costCents: step.costEstimateCents ?? 0,
        durationMs: 0,
      };
  }
}

async function executeKlingFal(
  step: BlueprintStepDef,
  params: Record<string, unknown>,
): Promise<StepExecutionResult> {
  const prompt = (params.videoPrompt as string) ?? getDefaultPrompt(step.id, params);
  const duration = "5";
  const aspectRatio = "16:9";
  const model = "o3-standard";

  const startMs = Date.now();

  // Repo root è 4 livelli sopra server/src/services/
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  const scriptDir = path.resolve(
    thisDir,
    "../../../../Ai Workflow multiagent/src/tools",
  );

  const inlineScript = `
import sys, json, asyncio, os
sys.path.insert(0, ${JSON.stringify(scriptDir)})
from video_generator import generate_kling_video
result = asyncio.run(generate_kling_video(
    prompt=${JSON.stringify(prompt)},
    duration=${JSON.stringify(duration)},
    aspect_ratio=${JSON.stringify(aspectRatio)},
    model=${JSON.stringify(model)},
))
print(json.dumps({"video_url": result.url}))
`;

  const pyResult = await new Promise<{ video_url: string }>((resolve, reject) => {
    const py = spawn("python3", ["-c", inlineScript], {
      env: { ...process.env },
      timeout: 300_000, // 5 minuti max
    });

    let stdout = "";
    let stderr = "";
    py.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    py.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    py.on("close", (code: number | null) => {
      if (code !== 0) {
        reject(new Error(`Kling generation failed (exit ${code}): ${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim()) as { video_url: string });
      } catch {
        reject(new Error(`Invalid JSON from kling: ${stdout}`));
      }
    });
  });

  const durationMs = Date.now() - startMs;
  // O3 Standard: $0.168/s, 5s = $0.84 = 84 cents
  const costCents = 84;

  return {
    output: { videoUrl: pyResult.video_url, model, prompt },
    costCents,
    durationMs,
  };
}

function getDefaultPrompt(
  stepId: string,
  params: Record<string, unknown>,
): string {
  const industry = (params.industry as string) || "luxury interior design";
  const style = (params.style as string) || "luxury";

  const prompts: Record<string, string> = {
    "gen-video-hero": `Generate me a high-quality 3D render style video of panning through a 3D ${industry} scene, make the background white, make the asset super high quality, this should read like something you'd see on a website or a landing page, ${style} style`,
    "gen-video-scroll": `Generate me a high quality exploding view animation of a ${industry} to showcase the design components. No text, white background, it should explode in all directions including vertically and horizontally and none of it should go outside of the bounds of the video itself, ${style} style`,
  };

  return prompts[stepId] ?? `Generate a high quality ${industry} video for a landing page`;
}
