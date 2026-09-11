import { truncateToWidth, visibleWidth, type AutocompleteProvider } from "@earendil-works/pi-tui";

const NEON_GREEN = "\x1b[92m";
const ANSI_RESET = "\x1b[0m";

export function renderEditorHeader(cwd: string, width: number, folderIcon: string, now = new Date()): string {
  const clock = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const right = truncateToWidth(` at ${clock} `, width, "");
  const leftWidth = Math.max(0, width - visibleWidth(right));
  const folder = folderIcon ? `${folderIcon} ` : "";
  const left = leftWidth > 0 ? truncateToWidth(` ${folder}${cwd} `, leftWidth, "…") : "";
  const fill = "─".repeat(Math.max(0, width - visibleWidth(left) - visibleWidth(right)));
  return `${NEON_GREEN}${left}${fill}${right}${ANSI_RESET}`;
}

export function getEditorAutocompleteProvider(sourceEditor: unknown): AutocompleteProvider | undefined {
  const candidate = sourceEditor && typeof sourceEditor === "object" ? Reflect.get(sourceEditor, "autocompleteProvider") : null;
  if (!candidate || typeof candidate !== "object") {
    return undefined;
  }
  if (typeof Reflect.get(candidate, "getSuggestions") !== "function") {
    return undefined;
  }
  if (typeof Reflect.get(candidate, "applyCompletion") !== "function") {
    return undefined;
  }
  return candidate;
}

export function passAutocompleteProviderThroughPreviousEditor(
  provider: AutocompleteProvider,
  previousEditor: unknown,
): AutocompleteProvider {
  if (!previousEditor || typeof previousEditor !== "object") {
    return provider;
  }

  const setAutocompleteProvider = Reflect.get(previousEditor, "setAutocompleteProvider");
  if (typeof setAutocompleteProvider !== "function") {
    return getEditorAutocompleteProvider(previousEditor) ?? provider;
  }

  setAutocompleteProvider.call(previousEditor, provider);
  return getEditorAutocompleteProvider(previousEditor) ?? provider;
}
