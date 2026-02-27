import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@valet/ui/components/select";

// ─── Model options from GH integration contract (Section 4.1.1) ───
// Grouped by tier for easy selection. "auto" = let GH use its default.

export interface ModelOption {
  value: string;
  label: string;
  vision: boolean;
}

export const RECOMMENDED_MODELS: ModelOption[] = [
  { value: "qwen-72b", label: "Qwen 72B (default)", vision: true },
  { value: "qwen3-235b", label: "Qwen3 235B (balanced)", vision: true },
  { value: "qwen3-vl-235b-thinking", label: "Qwen3 VL 235B Thinking (quality)", vision: true },
  { value: "gpt-4.1", label: "GPT-4.1 (quality)", vision: true },
  { value: "claude-opus", label: "Claude Opus (premium)", vision: true },
  { value: "gpt-5.2", label: "GPT-5.2 (premium)", vision: true },
];

export const BUDGET_MODELS: ModelOption[] = [
  { value: "qwen-7b", label: "Qwen 7B (speed)", vision: true },
  { value: "qwen3-8b", label: "Qwen3 8B", vision: true },
  { value: "qwen3-32b", label: "Qwen3 32B", vision: true },
  { value: "deepseek-chat", label: "DeepSeek Chat (text-only)", vision: false },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash", vision: true },
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash", vision: true },
  { value: "gpt-4o-mini", label: "GPT-4o Mini", vision: true },
  { value: "claude-haiku", label: "Claude Haiku", vision: true },
];

export const OTHER_MODELS: ModelOption[] = [
  { value: "qwen3-vl-30b-thinking", label: "Qwen3 VL 30B Thinking", vision: true },
  { value: "qwen3-vl-30b", label: "Qwen3 VL 30B", vision: true },
  { value: "qwen3-235b-thinking", label: "Qwen3 235B Thinking (text-only)", vision: false },
  { value: "qwen3-coder-480b", label: "Qwen3 Coder 480B (text-only)", vision: false },
  { value: "qwen3-next-80b", label: "Qwen3 Next 80B (text-only)", vision: false },
  { value: "claude-sonnet", label: "Claude Sonnet", vision: true },
  { value: "gpt-4o", label: "GPT-4o", vision: true },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", vision: true },
  { value: "deepseek-reasoner", label: "DeepSeek Reasoner (text-only)", vision: false },
];

export function ModelSelectors({
  reasoningModel,
  onReasoningModelChange,
  visionModel,
  onVisionModelChange,
}: {
  reasoningModel: string;
  onReasoningModelChange: (v: string) => void;
  visionModel: string;
  onVisionModelChange: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-[var(--wk-text-primary)]">Reasoning Model</label>
        <Select value={reasoningModel} onValueChange={onReasoningModelChange}>
          <SelectTrigger>
            <SelectValue placeholder="Auto (default)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto (default)</SelectItem>
            <SelectGroup>
              <SelectLabel>Recommended</SelectLabel>
              {RECOMMENDED_MODELS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>Budget</SelectLabel>
              {BUDGET_MODELS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>Other</SelectLabel>
              {OTHER_MODELS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-[var(--wk-text-primary)]">Vision Model</label>
        <Select value={visionModel} onValueChange={onVisionModelChange}>
          <SelectTrigger>
            <SelectValue placeholder="Auto (default)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto (default)</SelectItem>
            <SelectGroup>
              <SelectLabel>Recommended</SelectLabel>
              {RECOMMENDED_MODELS.filter((m) => m.vision).map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>Budget (vision)</SelectLabel>
              {BUDGET_MODELS.filter((m) => m.vision).map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>Other (vision)</SelectLabel>
              {OTHER_MODELS.filter((m) => m.vision).map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
