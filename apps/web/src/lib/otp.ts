/**
 * Turns a Supabase auth error into something worth reading.
 *
 * The raw messages are written for developers ("Unsupported phone provider"),
 * and a member who sees one learns nothing. The original always goes to the
 * server log — the operator needs the specific cause, the person needs to know
 * whether to retry.
 *
 * Shared by the application funnel and by member sign-in. Two copies of this
 * would drift, and the pair that matters most is the "that's on us" branch:
 * phone auth being switched off must never read as "your number is bad" on
 * either surface.
 */
export function otpMessage(raw: string): string {
  const m = raw.toLowerCase();

  if (m.includes("security purposes") || m.includes("rate limit") || m.includes("too many")) {
    return "That's a lot of codes in a short time. Wait a minute, then try again.";
  }
  if (m.includes("expired") || m.includes("invalid") || m.includes("token")) {
    return "That code didn't match. Check the code we sent, or ask for a new one.";
  }
  if (m.includes("provider") || m.includes("not enabled") || m.includes("disabled")) {
    // Configuration, not the member's fault. Say so rather than implying their
    // number is bad.
    return "We can't send codes right now — that's on us, not your number. Try again shortly.";
  }
  if (m.includes("phone")) {
    return "That number didn't work. Check the country code and try again.";
  }
  return "Something went wrong sending your code. Try again in a moment.";
}
