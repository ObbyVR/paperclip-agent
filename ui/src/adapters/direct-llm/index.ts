import type { UIAdapterModule } from "../types";
import { parseDirectLlmStdoutLine } from "@paperclipai/adapter-direct-llm/ui";
import { DirectLlmConfigFields } from "./config-fields";
import { buildDirectLlmConfig } from "@paperclipai/adapter-direct-llm/ui";

export const directLlmUIAdapter: UIAdapterModule = {
  type: "direct_llm",
  label: "Direct LLM (API routing)",
  parseStdoutLine: parseDirectLlmStdoutLine,
  ConfigFields: DirectLlmConfigFields,
  buildAdapterConfig: buildDirectLlmConfig,
};
