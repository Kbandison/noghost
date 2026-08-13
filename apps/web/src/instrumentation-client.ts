import { initBotId } from "botid/client/core";

/**
 * BotID — spec §5's note on the waitlist, and the deploy checklist's "rate
 * limiting and BotID go in front of this before launch".
 *
 * The paths listed here are the ones a *client* posts to, which for a Server
 * Action is the page the form lives on rather than any endpoint of its own.
 * Getting that wrong is silent: the check still runs server-side, finds no
 * client signal, and the protection is decoration.
 *
 * Only the waitlist for now. It is the one write in the product reachable
 * without an account — everything else is behind phone-verified sign-in and an
 * admissions review, which is a far higher wall than a bot classifier.
 */
initBotId({
  protect: [{ path: "/waitlist", method: "POST" }],
});
