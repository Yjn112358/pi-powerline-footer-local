import test from "node:test";
import assert from "node:assert/strict";
import type { AutocompleteProvider } from "@earendil-works/pi-tui";
import { getEditorAutocompleteProvider, passAutocompleteProviderThroughPreviousEditor, renderEditorHeader } from "../editor-composition.ts";

function baseProvider(): AutocompleteProvider {
  return {
    async getSuggestions() {
      return {
        prefix: "@",
        items: [{ label: "base", value: "base" }],
      };
    },
    applyCompletion(lines, cursorLine, cursorCol) {
      return { lines, cursorLine, cursorCol };
    },
  };
}

test("previous editor autocomplete provider wrappers are preserved", async () => {
  const previousEditor = {
    autocompleteProvider: undefined as AutocompleteProvider | undefined,
    setAutocompleteProvider(provider: AutocompleteProvider) {
      this.autocompleteProvider = {
        async getSuggestions(lines, cursorLine, cursorCol, context) {
          const suggestions = await provider.getSuggestions(lines, cursorLine, cursorCol, context);
          return {
            ...suggestions,
            items: [...suggestions.items, { label: "previous-wrapper", value: "previous-wrapper" }],
          };
        },
        applyCompletion: provider.applyCompletion.bind(provider),
      };
    },
  };

  const composed = passAutocompleteProviderThroughPreviousEditor(baseProvider(), previousEditor);
  const suggestions = await composed.getSuggestions(["@"], 0, 1, { signal: new AbortController().signal });

  assert.equal(composed, previousEditor.autocompleteProvider);
  assert.deepEqual(suggestions.items.map((item) => item.label), ["base", "previous-wrapper"]);
});

test("editor header preserves the clock and fits the requested width", () => {
  const rendered = renderEditorHeader("C:/Users/admin/Work/PiAgent/pi-powerline-footer-local", 32, "📁", new Date(2026, 0, 1, 9, 5));
  const plain = rendered.replace(/\x1b\[[0-9;]*m/g, "");

  assert.equal(plain.length, 32);
  assert.match(plain, /^ 📁 /);
  assert.match(plain, /^ 📁 C:\/Users\/admin\/Wo… at 09:05 $/);
});

test("autocomplete provider detection rejects incomplete editor providers", () => {
  assert.equal(getEditorAutocompleteProvider({ autocompleteProvider: {} }), undefined);
  assert.equal(getEditorAutocompleteProvider({ autocompleteProvider: { getSuggestions() {} } }), undefined);
  assert.ok(getEditorAutocompleteProvider({ autocompleteProvider: baseProvider() }));
});
