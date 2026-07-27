import type { MemberStatus } from "@noghost/types";

/**
 * "Found Someone" graduation — spec §6.5, minimal v1.
 *
 * One participant proposes, the other confirms. Both accounts go
 * `found_someone`, drops stop, and every OTHER active chat closes with the
 * "met someone" template rather than going quiet. Declining is allowed and
 * private — the chat simply continues, and the proposer is not told.
 */

export interface GraduationPlan {
  /** Both members move to this status. */
  memberStatus: MemberStatus;
  /** The chat the graduation happened in. */
  graduatedChatId: string;
  /** Every other open chat for either member, closed with closure_03. */
  chatsToClose: { chatId: string; forUser: string }[];
  /** Both get the three-question exit survey. */
  exitSurveyFor: string[];
}

export function planGraduation(input: {
  chatId: string;
  userA: string;
  userB: string;
  /** Other open chats for either member: {chatId, userId}. */
  otherOpenChats: readonly { chatId: string; userId: string }[];
}): GraduationPlan {
  return {
    memberStatus: "found_someone",
    graduatedChatId: input.chatId,
    chatsToClose: input.otherOpenChats
      .filter((c) => c.chatId !== input.chatId)
      .map((c) => ({ chatId: c.chatId, forUser: c.userId })),
    exitSurveyFor: [input.userA, input.userB],
  };
}

/**
 * A declined graduation is private and reversible — spec §6.5. Nothing is
 * recorded against the proposer and the chat carries on with its fuse intact.
 */
export function declineGraduation(): { chatContinues: true; notifyProposer: false } {
  return { chatContinues: true, notifyProposer: false };
}

/** The three exit-survey questions — spec §6.5. */
export const EXIT_SURVEY = [
  { id: "dates_count", question: "How many dates did you go on this season?", type: "number" },
  { id: "would_recommend", question: "Would you recommend NoGhost to a friend?", type: "boolean" },
  { id: "quote", question: "Anything we can quote?", type: "text", optional: true },
] as const;
