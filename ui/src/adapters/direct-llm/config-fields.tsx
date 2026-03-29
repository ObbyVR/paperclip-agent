import type { AdapterConfigFieldsProps } from "../types";
import {
  Field,
  ToggleField,
  DraftInput,
  DraftNumberInput,
  help,
} from "../../components/agent-config-primitives";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

const tierHint =
  "Override the automatic tier selection. Leave empty for smart auto-routing based on task complexity.";

const budgetHint =
  "Maximum cost in USD per heartbeat run. The adapter stops if the budget is exceeded.";

export function DirectLlmConfigFields({
  mode,
  isCreate,
  adapterType,
  values,
  set,
  config,
  eff,
  mark,
  models,
}: AdapterConfigFieldsProps) {
  return (
    <>
      {/* Model / Tier selector */}
      <Field label="Model / Routing tier" hint="Select a specific model or use auto-routing tiers">
        <select
          className={inputClass}
          value={
            isCreate
              ? values!.model ?? "auto"
              : eff("adapterConfig", "model", String(config.model ?? "auto"))
          }
          onChange={(e) =>
            isCreate
              ? set!({ model: e.target.value })
              : mark("adapterConfig", "model", e.target.value)
          }
        >
          <optgroup label="Auto routing">
            <option value="auto">Auto (smart routing)</option>
            <option value="auto:free">Auto: Free tier</option>
            <option value="auto:cheap">Auto: Cheap tier</option>
            <option value="auto:medium">Auto: Medium tier</option>
            <option value="auto:premium">Auto: Premium tier</option>
          </optgroup>
          <optgroup label="Specific models">
            {models
              .filter((m) => !m.id.startsWith("auto"))
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
          </optgroup>
        </select>
      </Field>

      {/* Temperature */}
      <Field label="Temperature" hint="0 = deterministic, 1 = creative (default: 0.7)">
        <DraftNumberInput
          value={
            isCreate
              ? 0.7
              : Number(eff("adapterConfig", "temperature", config.temperature ?? 0.7))
          }
          onCommit={(v) =>
            isCreate
              ? {} // default is fine
              : mark("adapterConfig", "temperature", v)
          }
          className={inputClass}
          min={0}
          max={1}
          step={0.1}
        />
      </Field>

      {/* Max tokens */}
      <Field label="Max output tokens" hint="Maximum tokens in the response (default: 4096)">
        <DraftNumberInput
          value={
            isCreate
              ? 4096
              : Number(eff("adapterConfig", "maxTokens", config.maxTokens ?? 4096))
          }
          onCommit={(v) =>
            isCreate
              ? set!({ maxTurnsPerRun: v })
              : mark("adapterConfig", "maxTokens", v)
          }
          className={inputClass}
          min={256}
          max={65536}
          step={256}
        />
      </Field>

      {/* Budget per run */}
      <Field label="Budget per run (USD)" hint={budgetHint}>
        <DraftNumberInput
          value={
            isCreate
              ? 0.5
              : Number(eff("adapterConfig", "budgetPerRunUsd", config.budgetPerRunUsd ?? 0.5))
          }
          onCommit={(v) =>
            isCreate
              ? {} // default
              : mark("adapterConfig", "budgetPerRunUsd", v)
          }
          className={inputClass}
          min={0.01}
          max={100}
          step={0.1}
        />
      </Field>

      {/* Fallback toggle */}
      <ToggleField
        label="Enable fallback cascade"
        hint="When a model fails or is rate-limited, automatically try the next model in the tier"
        checked={
          isCreate
            ? true
            : Boolean(eff("adapterConfig", "fallbackEnabled", config.fallbackEnabled ?? true))
        }
        onChange={(v) =>
          isCreate
            ? undefined // default true
            : mark("adapterConfig", "fallbackEnabled", v)
        }
      />

      {/* Prompt template */}
      <Field label="Prompt template" hint="Template for the heartbeat prompt. Supports: {{agent.id}}, {{agent.name}}, {{taskId}}, {{wakeReason}}, {{wakeCommentId}}, {{approvalStatus}}. Use {{#field}}...{{/field}} for conditional blocks.">
        <textarea
          className={`${inputClass} min-h-[100px] resize-y`}
          value={
            isCreate
              ? values!.promptTemplate ?? ""
              : eff(
                  "adapterConfig",
                  "promptTemplate",
                  String(config.promptTemplate ?? ""),
                )
          }
          onChange={(e) =>
            isCreate
              ? set!({ promptTemplate: e.target.value })
              : mark("adapterConfig", "promptTemplate", e.target.value)
          }
          placeholder={"You are {{agent.name}} (id: {{agent.id}}), an AI agent running inside Paperclip.\n{{#taskId}}Task: {{taskId}}{{/taskId}}\n{{#wakeReason}}Wake reason: {{wakeReason}}{{/wakeReason}}\n\nComplete your assigned task. Be concise and output only the result."}
        />
      </Field>

      {/* System prompt */}
      <Field label="System prompt" hint="Optional system prompt. Sent as the first message to the LLM.">
        <textarea
          className={`${inputClass} min-h-[80px] resize-y`}
          value={
            isCreate
              ? ""
              : eff("adapterConfig", "systemPrompt", String(config.systemPrompt ?? ""))
          }
          onChange={(e) =>
            isCreate
              ? {} // will use default
              : mark("adapterConfig", "systemPrompt", e.target.value)
          }
          placeholder="You are a helpful assistant specialized in..."
        />
      </Field>

      {/* Environment variables */}
      <Field label="Environment variables" hint="KEY=VALUE per line. At least one API key required. Direct keys (no OpenRouter markup) are preferred when set.">
        <textarea
          className={`${inputClass} min-h-[80px] resize-y`}
          value={
            isCreate
              ? values!.envVars ?? ""
              : eff("adapterConfig", "envVars", String(config.envVars ?? ""))
          }
          onChange={(e) =>
            isCreate
              ? set!({ envVars: e.target.value })
              : mark("adapterConfig", "envVars", e.target.value)
          }
          placeholder={"OPENROUTER_API_KEY=sk-or-...   # multi-provider fallback\nANTHROPIC_API_KEY=sk-ant-...  # direct, no markup\nOPENAI_API_KEY=sk-...         # direct, no markup"}
        />
      </Field>

      {/* Tier info panel */}
      <div className="rounded-md border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
        <div className="font-medium text-foreground/80">Cost tiers (per 1M tokens)</div>
        <div><span className="text-green-500">Free:</span> $0 — Groq Llama, Gemini Flash Free</div>
        <div><span className="text-blue-500">Cheap:</span> $0.05–0.50 — DeepSeek V3, GPT-4.1 Mini, Haiku</div>
        <div><span className="text-yellow-500">Medium:</span> $0.15–5.00 — Gemini Flash, Qwen3 Coder, Sonnet</div>
        <div><span className="text-red-500">Premium:</span> $5–75 — Sonnet, Opus, o3</div>
      </div>
    </>
  );
}
