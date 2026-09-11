import test from "node:test";
import assert from "node:assert/strict";
import { renderSegment } from "../segments.ts";
import { mergeSegmentOptions, parsePowerlineConfig } from "../powerline-config.ts";
import type { SegmentContext, StatusLineSegmentOptions } from "../types.ts";

const PRESET_NAMES = ["default", "compact"];

const originalNerdFonts = process.env.POWERLINE_NERD_FONTS;
process.env.POWERLINE_NERD_FONTS = "0";

test.after(() => {
  if (originalNerdFonts === undefined) {
    delete process.env.POWERLINE_NERD_FONTS;
  } else {
    process.env.POWERLINE_NERD_FONTS = originalNerdFonts;
  }
});

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function plainTheme(): any {
  return {
    fg: (_color: string, text: string) => text,
    bg: (_color: string, text: string) => text,
    bold: (text: string) => text,
  };
}

function createSegmentContext(options: StatusLineSegmentOptions = {}, overrides: Partial<SegmentContext> = {}): SegmentContext {
  return {
    model: undefined,
    thinkingLevel: "off",
    sessionId: undefined,
    usageStats: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, subagentCost: 0 },
    contextTokens: 0,
    contextPercent: 0,
    contextWindow: 0,
    contextApproximate: false,
    tps: null,
    autoCompactEnabled: true,
    customCompactionEnabled: false,
    usingSubscription: false,
    queueSummary: { queueCount: 0, blockedCount: 0, compacting: false, leadingText: null, leadingIntent: null, leadingStatus: null },
    sessionStartTime: Date.now(),
    shellModeActive: false,
    shellRunning: false,
    shellName: null,
    shellCwd: null,
    git: { branch: null, staged: 0, unstaged: 0, untracked: 0 },
    extensionStatuses: new Map(),
    hiddenExtensionStatusKeys: new Set(),
    customItemsById: new Map(),
    options,
    theme: plainTheme(),
    colors: {},
    ...overrides,
  };
}

// ── custom usage segments ───────────────────────────────────────────────────

test("token_io combines input and output usage", () => {
  const both = createSegmentContext({}, {
    usageStats: { input: 12_300, output: 4_500, cacheRead: 0, cacheWrite: 0, cost: 0, subagentCost: 0 },
  });
  assert.equal(stripAnsi(renderSegment("token_io", both).content), "↑ 12k ↓ 4.5k");

  const inputOnly = createSegmentContext({}, {
    usageStats: { input: 900, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, subagentCost: 0 },
  });
  assert.equal(stripAnsi(renderSegment("token_io", inputOnly).content), "↑ 900");
  assert.deepEqual(renderSegment("token_io", createSegmentContext()), { content: "", visible: false });
});

test("tps renders weighted session generation speed", () => {
  assert.equal(stripAnsi(renderSegment("tps", createSegmentContext({}, { tps: 42.456 })).content), "TPS 42.5 tok/s");
  assert.deepEqual(renderSegment("tps", createSegmentContext()), { content: "", visible: false });
});

// ── context_pct format ──────────────────────────────────────────────────────

test("context_pct defaults to the full tokens/window rendering", () => {
  const ctx = createSegmentContext({}, {
    contextTokens: 12300,
    contextWindow: 200000,
    contextPercent: 6.15,
  });

  const rendered = renderSegment("context_pct", ctx);
  assert.equal(stripAnsi(rendered.content), "◫ 12k/200k (6.2%) AC");
});

test("context_pct percent format renders a bare rounded percentage", () => {
  const ctx = createSegmentContext({ context: { format: "percent" } }, {
    contextTokens: 12300,
    contextWindow: 200000,
    contextPercent: 6.15,
  });

  const rendered = renderSegment("context_pct", ctx);
  assert.equal(stripAnsi(rendered.content), "6%");
});

test("context_pct renders unknown usage after compaction", () => {
  const full = createSegmentContext({}, {
    contextTokens: null,
    contextWindow: 200000,
    contextPercent: null,
  });
  const percent = createSegmentContext({ context: { format: "percent" } }, {
    contextTokens: null,
    contextWindow: 200000,
    contextPercent: null,
  });

  assert.equal(stripAnsi(renderSegment("context_pct", full).content), "◫ ?/200k AC");
  assert.equal(stripAnsi(renderSegment("context_pct", percent).content), "?");
});

test("context_pct marks context estimates as approximate", () => {
  const full = createSegmentContext({}, {
    contextTokens: 18000,
    contextWindow: 272000,
    contextPercent: 6.6176,
    contextApproximate: true,
  });
  const percent = createSegmentContext({ context: { format: "percent" } }, {
    contextTokens: 18000,
    contextWindow: 272000,
    contextPercent: 6.6176,
    contextApproximate: true,
  });

  assert.equal(stripAnsi(renderSegment("context_pct", full).content), "◫ ~18k/272k (6.6%) AC");
  assert.equal(stripAnsi(renderSegment("context_pct", percent).content), "~7%");
});

test("context_pct percent format keeps threshold colors and drops icons", () => {
  for (const [percent, expected] of [[69, "69%"], [85, "85%"], [95, "95%"]] as const) {
    const ctx = createSegmentContext({ context: { format: "percent" } }, {
      contextTokens: percent,
      contextWindow: 100,
      contextPercent: percent,
    });
    const rendered = renderSegment("context_pct", ctx);
    assert.equal(stripAnsi(rendered.content), expected);
    assert.ok(!rendered.content.includes("◫"), "no context icon in percent mode");
    assert.ok(!rendered.content.includes("AC"), "no auto-compact icon in percent mode");
  }
});

// ── cache_read format ───────────────────────────────────────────────────────

test("cache_read defaults to raw token count", () => {
  const ctx = createSegmentContext({}, {
    usageStats: { input: 1000, output: 0, cacheRead: 12300, cacheWrite: 0, cost: 0, subagentCost: 0 },
  });

  const rendered = renderSegment("cache_read", ctx);
  assert.equal(stripAnsi(rendered.content), "↻ cache 12k");
});

test("cache_read percent format renders the cache hit rate", () => {
  const ctx = createSegmentContext({ cache_read: { format: "percent" } }, {
    usageStats: { input: 2000, output: 0, cacheRead: 8000, cacheWrite: 0, cost: 0, subagentCost: 0 },
  });

  const rendered = renderSegment("cache_read", ctx);
  assert.equal(stripAnsi(rendered.content), "↻ cache 80%");
});

test("cache_read both format renders raw token count and cache hit rate", () => {
  const ctx = createSegmentContext({ cache_read: { format: "both" } }, {
    usageStats: { input: 2000, output: 0, cacheRead: 8000, cacheWrite: 0, cost: 0, subagentCost: 0 },
  });

  const rendered = renderSegment("cache_read", ctx);
  assert.equal(stripAnsi(rendered.content), "↻ cache 8.0k (80%)");
});

test("cache_read percent and both formats handle zero input without NaN", () => {
  const percentCtx = createSegmentContext({ cache_read: { format: "percent" } }, {
    usageStats: { input: 0, output: 0, cacheRead: 5, cacheWrite: 0, cost: 0, subagentCost: 0 },
  });
  assert.equal(stripAnsi(renderSegment("cache_read", percentCtx).content), "↻ cache 100%");

  const bothCtx = createSegmentContext({ cache_read: { format: "both" } }, {
    usageStats: { input: 0, output: 0, cacheRead: 5, cacheWrite: 0, cost: 0, subagentCost: 0 },
  });
  assert.equal(stripAnsi(renderSegment("cache_read", bothCtx).content), "↻ cache 5 (100%)");

  const hidden = createSegmentContext({ cache_read: { format: "both" } });
  assert.deepEqual(renderSegment("cache_read", hidden), { content: "", visible: false });
});

// ── queue segment ──────────────────────────────────────────────────────────

test("queue segment hides when empty", () => {
  const ctx = createSegmentContext();
  assert.deepEqual(renderSegment("queue", ctx), { content: "", visible: false });
});

test("queue segment summarizes queued and blocked items", () => {
  const ctx = createSegmentContext({}, {
    queueSummary: { queueCount: 2, blockedCount: 1, compacting: false, leadingText: "fix README", leadingIntent: "post-compact", leadingStatus: "blocked" },
  });

  assert.equal(stripAnsi(renderSegment("queue", ctx).content), "q 2 · blocked 1");
});

test("queue segment highlights compaction-held prompts", () => {
  const ctx = createSegmentContext({}, {
    queueSummary: { queueCount: 1, blockedCount: 0, compacting: true, leadingText: "run after compact", leadingIntent: "post-compact", leadingStatus: "queued" },
  });

  assert.equal(stripAnsi(renderSegment("queue", ctx).content), "compact q 1");
});

// ── config parsing / merging ────────────────────────────────────────────────

test("parsePowerlineConfig accepts context, cache_read, and compact path formats", () => {
  const config = parsePowerlineConfig({
    path: { mode: "compact", maxLength: 12 },
    context: { format: "percent" },
    cache_read: { format: "both" },
  }, PRESET_NAMES);

  assert.equal(config.segmentOptions.path?.mode, "compact");
  assert.equal(config.segmentOptions.path?.maxLength, 12);
  assert.equal(config.segmentOptions.context?.format, "percent");
  assert.equal(config.segmentOptions.cache_read?.format, "both");
});

test("parsePowerlineConfig ignores invalid format values", () => {
  const config = parsePowerlineConfig({
    context: { format: "bogus" },
    cache_read: { format: 42 },
  }, PRESET_NAMES);

  assert.equal(config.segmentOptions.context?.format, undefined);
  assert.equal(config.segmentOptions.cache_read?.format, undefined);
});

test("parsePowerlineConfig defaults to upstream rendering when options are absent", () => {
  const config = parsePowerlineConfig({}, PRESET_NAMES);
  assert.equal(config.segmentOptions.context, undefined);
  assert.equal(config.segmentOptions.cache_read, undefined);
});

test("mergeSegmentOptions merges context and cache_read per key", () => {
  const merged = mergeSegmentOptions(
    { context: { format: "percent" }, cache_read: { format: "percent" } },
    { context: { format: "full" }, cache_read: { format: "both" } },
  );

  assert.equal(merged.context?.format, "full");
  assert.equal(merged.cache_read?.format, "both");
});
