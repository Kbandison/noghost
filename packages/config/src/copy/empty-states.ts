/**
 * Empty states — spec §9.6, verbatim.
 *
 * The quiet-night state is the one that matters: it names the design decision
 * out loud rather than apologising for it.
 */
export const EMPTY_STATES = {
  inbox: "No notes yet. Tonight's drop is another three chances.",
  chats:
    /*
     * Unused since the Inbox and Chats tabs became one — the combined rail
     * shows `inbox` when there is nothing at all, and its own line for an empty
     * Conversations section. Kept rather than deleted because §9 signed it off
     * and a second city or a rebuilt Chats screen would want it back; noted
     * here so nobody spends time wondering where it renders.
     */
    "Chats live here — every one of them on a seven-day clock. Accept a connect to start one.",
  quietNight:
    "A quiet night. We won't pad your drop with weak matches — that's a promise, not a bug. Tomorrow at 8.",
  postSeason:
    "{{SEASON_NAME}} is a wrap. {{DATES_COUNT}} real dates happened. Season Two applications open {{S2_DATE}} — you're already on the list.",
} as const;

export type EmptyStateKey = keyof typeof EMPTY_STATES;
