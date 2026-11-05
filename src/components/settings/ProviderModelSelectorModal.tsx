import { useState, useEffect, useMemo } from "react";
import {
  Search,
  Check,
  Sparkles,
  Loader2,
  RefreshCw,
  Server,
  KeyRound,
  AlertCircle,
  ExternalLink,
  Zap,
  ArrowUpDown,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchModels, CURATED_MODELS, type ORModel } from "@/lib/openrouter";
import { fetchOmniRouterModels } from "@/lib/omnirouter";
import { toast } from "sonner";

interface ProviderModelSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: "openrouter" | "omnirouter";
  selectedModelId: string;
  onSelectModel: (modelId: string, modelName: string) => void;
  endpoint?: string;
  apiKey?: string;
}

export type SortOption = "default" | "price-asc" | "price-desc" | "context";

export interface ModelPricingInfo {
  promptPerM: number;
  completionPerM: number;
  formattedPrompt: string;
  formattedCompletion: string;
  isFree: boolean;
  tier: "free" | "budget" | "standard" | "premium" | "unknown";
}

/** Determines provider or organization category from model ID */
export function getModelProviderCategory(modelId: string): string {
  const lower = modelId.toLowerCase();
  const parts = lower.split("/");
  const prefix = parts.length > 1 ? parts[0] : "";

  const canonical: Record<string, string> = {
    google: "Google",
    openai: "OpenAI",
    anthropic: "Anthropic",
    "meta-llama": "Meta",
    meta: "Meta",
    deepseek: "DeepSeek",
    mistralai: "Mistral",
    mistral: "Mistral",
    qwen: "Qwen",
    liquid: "Liquid AI",
    microsoft: "Microsoft",
    cohere: "Cohere",
    "x-ai": "xAI",
    cloud: "Cloud",
    entropy: "Entropy",
    jedi: "Jedi",
    ollama: "Ollama",
    amazon: "Amazon",
    perplexity: "Perplexity",
  };

  if (prefix && canonical[prefix]) {
    return canonical[prefix];
  }

  if (prefix) {
    return prefix
      .split(/[-_]/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  // Fallback checks on model ID
  if (lower.includes("gemini")) return "Google";
  if (lower.includes("gpt") || lower.includes("o1") || lower.includes("o3")) return "OpenAI";
  if (lower.includes("claude")) return "Anthropic";
  if (lower.includes("llama")) return "Meta";
  if (lower.includes("deepseek")) return "DeepSeek";
  if (lower.includes("mistral") || lower.includes("mixtral")) return "Mistral";
  if (lower.includes("qwen")) return "Qwen";
  if (lower.includes("entropy")) return "Entropy";
  if (lower.includes("jedi")) return "Jedi";
  if (lower.includes("cloud")) return "Cloud";

  return "Other Models";
}

/** Check if a model is completely free to use */
export function isModelFree(model: ORModel): boolean {
  const idLower = model.id.toLowerCase();
  if (idLower.endsWith(":free") || idLower.includes(":free")) {
    return true;
  }
  const promptPrice = parseFloat(model.pricing?.prompt ?? "-1");
  const compPrice = parseFloat(model.pricing?.completion ?? "-1");
  return promptPrice === 0 && compPrice === 0;
}

/** Compute and format token pricing per 1M tokens */
export function getModelPricing(model: ORModel): ModelPricingInfo {
  const freeById =
    model.id.toLowerCase().endsWith(":free") ||
    model.id.toLowerCase().includes(":free");
  const rawPrompt = model.pricing?.prompt;
  const rawComp = model.pricing?.completion;

  const promptVal = rawPrompt !== undefined && rawPrompt !== null ? parseFloat(rawPrompt) : NaN;
  const compVal = rawComp !== undefined && rawComp !== null ? parseFloat(rawComp) : NaN;

  if (freeById || (promptVal === 0 && compVal === 0)) {
    return {
      promptPerM: 0,
      completionPerM: 0,
      formattedPrompt: "$0",
      formattedCompletion: "$0",
      isFree: true,
      tier: "free",
    };
  }

  const promptPerM = !isNaN(promptVal) ? promptVal * 1_000_000 : -1;
  const compPerM = !isNaN(compVal) ? compVal * 1_000_000 : -1;

  const formatPrice = (val: number): string => {
    if (val < 0) return "N/A";
    if (val === 0) return "$0";
    if (val >= 100) return `$${val.toFixed(0)}`;
    if (val >= 10) return `$${val.toFixed(2)}`;
    if (val >= 1) return `$${Number(val.toFixed(2))}`;
    if (val >= 0.01) return `$${Number(val.toFixed(3))}`;
    return `$${Number(val.toFixed(4))}`;
  };

  const formattedPrompt = formatPrice(promptPerM);
  const formattedCompletion = formatPrice(compPerM);

  let tier: "free" | "budget" | "standard" | "premium" | "unknown" = "unknown";
  if (promptPerM >= 0) {
    if (promptPerM === 0 && compPerM === 0) tier = "free";
    else if (promptPerM <= 0.6) tier = "budget";
    else if (promptPerM <= 3.0) tier = "standard";
    else tier = "premium";
  }

  return {
    promptPerM,
    completionPerM: compPerM,
    formattedPrompt,
    formattedCompletion,
    isFree: false,
    tier,
  };
}

/** Format context length for human readability */
function formatContextLength(ctx?: number): string {
  if (!ctx || ctx <= 0) return "8k";
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(ctx % 1_000_000 === 0 ? 0 : 1)}M`;
  if (ctx >= 1000) return `${Math.round(ctx / 1000)}k`;
  return `${ctx}`;
}

export function ProviderModelSelectorModal({
  open,
  onOpenChange,
  provider,
  selectedModelId,
  onSelectModel,
  endpoint,
  apiKey,
}: ProviderModelSelectorModalProps) {
  const [models, setModels] = useState<ORModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterFreeOnly, setFilterFreeOnly] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [sortBy, setSortBy] = useState<SortOption>("default");

  const loadModels = async () => {
    setLoading(true);
    setError("");
    try {
      if (provider === "omnirouter") {
        const fetched = await fetchOmniRouterModels(endpoint || undefined, apiKey);
        if (fetched.length === 0) {
          setError("No models returned by OmniRouter endpoint. Verify the endpoint URL is active.");
        }
        setModels(fetched);
      } else {
        const fetched = await fetchModels(apiKey);
        setModels(fetched.length > 0 ? fetched : CURATED_MODELS);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch models";
      setError(msg);
      if (provider === "openrouter") {
        setModels(CURATED_MODELS);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setSearch("");
      setFilterFreeOnly(false);
      setSelectedCategory("All");
      setSortBy("default");
      void loadModels();
    }
  }, [open, provider, endpoint, apiKey]);

  // Extract all categories available in the current model list
  const categories = useMemo(() => {
    const set = new Set<string>();
    models.forEach((m) => {
      set.add(getModelProviderCategory(m.id));
    });
    const arr = Array.from(set);
    // Sort prioritized categories first
    const priority = [
      "Google",
      "Cloud",
      "Entropy",
      "Jedi",
      "OpenAI",
      "Anthropic",
      "Meta",
      "DeepSeek",
      "Mistral",
      "Qwen",
    ];
    arr.sort((a, b) => {
      const idxA = priority.indexOf(a);
      const idxB = priority.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });
    return arr;
  }, [models]);

  // Filter models based on search, free flag, and category
  const filteredModels = useMemo(() => {
    const q = search.trim().toLowerCase();
    return models.filter((m) => {
      if (filterFreeOnly && !isModelFree(m)) return false;
      const cat = getModelProviderCategory(m.id);
      if (selectedCategory !== "All" && cat !== selectedCategory) return false;
      if (q) {
        const matchId = m.id.toLowerCase().includes(q);
        const matchName = (m.name || "").toLowerCase().includes(q);
        const matchDesc = (m.description || "").toLowerCase().includes(q);
        const matchCat = cat.toLowerCase().includes(q);
        return matchId || matchName || matchDesc || matchCat;
      }
      return true;
    });
  }, [models, search, filterFreeOnly, selectedCategory]);

  // Group filtered models by provider category and apply sorting
  const groupedModels = useMemo(() => {
    const map = new Map<string, ORModel[]>();
    filteredModels.forEach((m) => {
      const cat = getModelProviderCategory(m.id);
      if (!map.has(cat)) {
        map.set(cat, []);
      }
      map.get(cat)!.push(m);
    });

    // If sorting by price or context, sort models within each group
    if (sortBy !== "default") {
      for (const [, list] of map.entries()) {
        list.sort((a, b) => {
          if (sortBy === "price-asc") {
            const priceA = getModelPricing(a);
            const priceB = getModelPricing(b);
            const costA =
              priceA.promptPerM >= 0 ? priceA.promptPerM + priceA.completionPerM : 999999;
            const costB =
              priceB.promptPerM >= 0 ? priceB.promptPerM + priceB.completionPerM : 999999;
            return costA - costB;
          }
          if (sortBy === "price-desc") {
            const priceA = getModelPricing(a);
            const priceB = getModelPricing(b);
            const costA =
              priceA.promptPerM >= 0 ? priceA.promptPerM + priceA.completionPerM : -1;
            const costB =
              priceB.promptPerM >= 0 ? priceB.promptPerM + priceB.completionPerM : -1;
            return costB - costA;
          }
          if (sortBy === "context") {
            return (b.context_length || 0) - (a.context_length || 0);
          }
          return 0;
        });
      }
    }

    return map;
  }, [filteredModels, sortBy]);

  const handleSelect = (model: ORModel) => {
    onSelectModel(model.id, model.name || model.id);
    toast.success(`Selected model: ${model.name || model.id}`);
    onOpenChange(false);
  };

  const providerTitle = provider === "omnirouter" ? "OmniRouter" : "OpenRouter";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[85vh] flex flex-col p-0 overflow-hidden border-border bg-popover/95 backdrop-blur-2xl shadow-2xl rounded-2xl"
        aria-describedby="model-selector-description"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 md:p-5 border-b border-border/60 bg-surface/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-2xs">
              {provider === "omnirouter" ? (
                <Server className="h-5 w-5" />
              ) : (
                <KeyRound className="h-5 w-5" />
              )}
            </div>
            <div>
              <DialogTitle className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                <span>Select {providerTitle} Model</span>
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {models.length} Available
                </span>
              </DialogTitle>
              <DialogDescription
                id="model-selector-description"
                className="text-xs text-muted-foreground mt-0.5"
              >
                {provider === "omnirouter"
                  ? `Models fetched live from ${endpoint || "configured endpoint"}. Pricing displayed per 1M tokens.`
                  : "Choose an active model for direct OpenRouter translation. Input & output token prices per 1M tokens."}
              </DialogDescription>
            </div>
          </div>

          <button
            type="button"
            onClick={loadModels}
            disabled={loading}
            title="Refresh models"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 hover:bg-surface-3 px-3 py-1.5 text-xs font-semibold text-foreground transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-primary ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        {/* Controls Bar: Search, Sort & Category Chips */}
        <div className="p-4 pt-3 pb-3 border-b border-border/60 bg-surface/40 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search models by name, provider, or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-border bg-background/80 pl-9 pr-3 py-2 text-xs font-medium text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
              />
            </div>

            {/* Sort & Filter Controls */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Sort Selector */}
              <div className="relative flex items-center">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="rounded-xl border border-border bg-background/80 px-2.5 py-2 text-xs font-semibold text-foreground outline-none focus:border-primary transition-colors cursor-pointer"
                  title="Sort models by price or context"
                >
                  <option value="default">Sort: Default</option>
                  <option value="price-asc">Price: Low to High ($ → $$$)</option>
                  <option value="price-desc">Price: High to Low ($$$ → $)</option>
                  <option value="context">Context: Max Tokens</option>
                </select>
              </div>

              {/* Free filter toggle */}
              <button
                type="button"
                onClick={() => setFilterFreeOnly((v) => !v)}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                  filterFreeOnly
                    ? "border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shadow-xs"
                    : "border-border bg-background/80 text-foreground hover:border-border-strong hover:bg-surface-2"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
                <span>Free Models Only</span>
              </button>
            </div>
          </div>

          {/* Category Chips Bar */}
          {categories.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
              <button
                type="button"
                onClick={() => setSelectedCategory("All")}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all cursor-pointer shrink-0 ${
                  selectedCategory === "All"
                    ? "bg-primary text-primary-foreground font-semibold shadow-2xs"
                    : "bg-surface-2 text-muted-foreground hover:text-foreground hover:bg-surface-3"
                }`}
              >
                All Providers ({models.length})
              </button>

              {categories.map((cat) => {
                const count = models.filter((m) => getModelProviderCategory(m.id) === cat).length;
                const isSelected = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                      isSelected
                        ? "bg-primary text-primary-foreground font-semibold shadow-2xs"
                        : "bg-surface-2 text-muted-foreground hover:text-foreground hover:bg-surface-3"
                    }`}
                  >
                    <span>{cat}</span>
                    <span
                      className={`text-[10px] px-1 rounded-sm ${
                        isSelected
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : "bg-surface-3 text-muted-foreground"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Models Scrollable Container */}
        <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="text-xs font-medium">
                Fetching and categorizing models from {providerTitle}...
              </p>
            </div>
          ) : error && models.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div className="max-w-md">
                <h4 className="text-sm font-semibold text-foreground">Could not load models</h4>
                <p className="text-xs text-muted-foreground mt-1">{error}</p>
              </div>
              <button
                type="button"
                onClick={loadModels}
                className="mt-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
              >
                Try Again
              </button>
            </div>
          ) : groupedModels.size === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <Search className="h-7 w-7 text-muted-foreground/50 mb-2" />
              <p className="text-xs font-medium">No matching models found.</p>
              <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                Try searching with a different term or clearing your filters.
              </p>
            </div>
          ) : (
            Array.from(groupedModels.entries()).map(([category, catModels]) => (
              <div key={category} className="space-y-3">
                {/* Category Header */}
                <div className="flex items-center gap-2 pb-1 border-b border-border/50 sticky top-0 bg-popover/90 backdrop-blur-md z-10 pt-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                    {category}
                  </span>
                  <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    {catModels.length} {catModels.length === 1 ? "model" : "models"}
                  </span>
                </div>

                {/* Model Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {catModels.map((model) => {
                    const isSelected = selectedModelId === model.id;
                    const pricing = getModelPricing(model);

                    return (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => handleSelect(model)}
                        className={`group relative flex flex-col items-start gap-2 p-3.5 rounded-xl border text-left transition-all duration-150 cursor-pointer ${
                          isSelected
                            ? "border-primary bg-primary/10 ring-1 ring-primary/40 shadow-xs"
                            : "border-border/70 bg-surface/60 hover:border-border-strong hover:bg-surface-2/80 hover:shadow-xs"
                        }`}
                      >
                        {/* Top Line: Name & Badges */}
                        <div className="flex items-start justify-between gap-2 w-full">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">
                                {model.name || model.id}
                              </span>
                              {pricing.isFree ? (
                                <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                                  FREE
                                </span>
                              ) : pricing.tier === "budget" ? (
                                <span className="rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                                  Budget
                                </span>
                              ) : pricing.tier === "premium" ? (
                                <span className="rounded-full bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 text-[9px] font-bold text-amber-600 dark:text-amber-400 shrink-0">
                                  Premium
                                </span>
                              ) : null}
                            </div>
                            <span className="text-[10px] font-mono text-muted-foreground truncate block mt-0.5">
                              {model.id}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {isSelected && (
                              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-2xs">
                                <Check className="h-3 w-3" />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Pricing Badges: Input & Output per Million Tokens */}
                        <div className="flex items-center gap-2 w-full flex-wrap pt-0.5">
                          {/* Input Token Price */}
                          <div className="inline-flex items-center gap-1.5 rounded-md bg-surface-2/90 border border-border/60 px-2 py-1 text-[11px]">
                            <span className="text-[10px] text-muted-foreground font-medium">
                              Input:
                            </span>
                            <span
                              className={`font-mono text-xs font-semibold ${
                                pricing.isFree
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : pricing.tier === "budget"
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : pricing.tier === "premium"
                                      ? "text-amber-600 dark:text-amber-400"
                                      : "text-foreground"
                              }`}
                            >
                              {pricing.formattedPrompt}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              / 1M
                            </span>
                          </div>

                          {/* Output Token Price */}
                          <div className="inline-flex items-center gap-1.5 rounded-md bg-surface-2/90 border border-border/60 px-2 py-1 text-[11px]">
                            <span className="text-[10px] text-muted-foreground font-medium">
                              Output:
                            </span>
                            <span
                              className={`font-mono text-xs font-semibold ${
                                pricing.isFree
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : pricing.tier === "budget"
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : pricing.tier === "premium"
                                      ? "text-amber-600 dark:text-amber-400"
                                      : "text-foreground"
                              }`}
                            >
                              {pricing.formattedCompletion}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              / 1M
                            </span>
                          </div>
                        </div>

                        {/* Description / Context Footer */}
                        <div className="flex items-center justify-between w-full pt-1.5 border-t border-border/30 text-[10px] text-muted-foreground">
                          <span className="line-clamp-1 flex-1 pr-2">
                            {model.description ||
                              `Context: ${formatContextLength(model.context_length)} tokens`}
                          </span>
                          <span className="rounded-md bg-surface-3 px-1.5 py-0.5 font-mono shrink-0">
                            {formatContextLength(model.context_length)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
