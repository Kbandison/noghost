/**
 * Prompt library — spec §9.7, verbatim. Members answer exactly three.
 *
 * The `topic` field is what a connect notification says you replied to
 * (§9.4.2 "Someone replied to your prompt about {{PROMPT_TOPIC}}"), so it
 * has to read naturally inside that sentence.
 */
export const PROMPT_LIBRARY = [
  /*
   * Was "The most Atlanta thing about me is…". A prompt naming the city was
   * unanswerable for anybody in the next one, and the id is load-bearing —
   * `profiles.prompts` stores `prompt_id`, so renaming the text keeps every
   * answer already written to it attached.
   */
  { id: "prompt_01", text: "The most me thing about my week is…", topic: "the most you thing about your week" },
  { id: "prompt_02", text: "A perfect first date ends with…", topic: "a perfect first date" },
  { id: "prompt_03", text: "I'll talk your ear off about…", topic: "what you'll talk anyone's ear off about" },
  { id: "prompt_04", text: "The green flag I bring is…", topic: "your green flag" },
  { id: "prompt_05", text: "My friends would warn you that…", topic: "what your friends would warn them about" },
  { id: "prompt_06", text: "Something I changed my mind about recently…", topic: "what you changed your mind about" },
  { id: "prompt_07", text: "You should pass on me if…", topic: "who should pass on you" },
  { id: "prompt_08", text: "The last thing that made me laugh out loud…", topic: "the last thing that made you laugh" },
  { id: "prompt_09", text: "I feel most myself when…", topic: "when you feel most yourself" },
  { id: "prompt_10", text: "Ask me about the time I…", topic: "the time you" },
  { id: "prompt_11", text: "My unpopular food opinion is…", topic: "your unpopular food opinion" },
  { id: "prompt_12", text: "In eight weeks, I'm hoping for…", topic: "what you're hoping for" },
] as const;

export type Prompt = (typeof PROMPT_LIBRARY)[number];
export type PromptId = Prompt["id"];

export function promptById(id: string): Prompt | undefined {
  return PROMPT_LIBRARY.find((p) => p.id === id);
}

/**
 * The topic slug for a connect notification. Falls back to a neutral phrase
 * for photo replies, which carry no prompt.
 */
export function promptTopic(id: string | null | undefined): string {
  if (!id) return "one of your photos";
  return promptById(id)?.topic ?? "your profile";
}
