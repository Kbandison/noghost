"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { VoicePlayer } from "@/components/ui/voice-player";
import { VoiceRecorder, type Recording } from "@/components/ui/voice-recorder";
import { sendMessage, sendVoiceNote, type ChatActionState } from "../actions";

const initial: ChatActionState = {};

/**
 * The message composer — text, or a voice note (§7.2).
 *
 * Two modes, and only the text one is a `<form>`. Audio cannot be put into a
 * form without a file input to hold it, so the voice send builds its own
 * `FormData` and dispatches the action directly.
 *
 * A recording is *reviewed before it is sent*. Text gets re-read before the
 * button is pressed simply because it is sitting there; audio does not, and
 * sending a voice note you have not heard is how you find out you were
 * inaudible after the other person did. So a finished recording becomes a
 * player with Send and Discard beneath it, and nothing leaves until it is sent.
 *
 * Uncontrolled input on purpose: React 19 resets a form after its action
 * runs, which clears it on a successful send with no state to manage.
 */
export function Composer({ chatId, name }: { chatId: string; name: string }) {
  const [state, action, pending] = useActionState(sendMessage, initial);
  const [voiceState, voiceAction, voicePending] = useActionState(sendVoiceNote, initial);
  const [recording, setRecording] = useState<Recording | null>(null);

  // The object URL outlives the component unless it is revoked, and a thread
  // where somebody re-records a few times would leak every attempt.
  useEffect(() => {
    if (!recording) return;
    return () => URL.revokeObjectURL(recording.url);
  }, [recording]);

  /*
   * Gone once the send has actually landed, not when it was submitted.
   *
   * On a failure the recording is still here and can be sent again — a
   * re-record is a thing you cannot redo, so losing it to a network blip would
   * be the worst possible moment for this form to be tidy. Derived from the
   * token the action echoes back rather than cleared by an effect watching
   * `pending`, which would also have to distinguish this recording from the
   * next one.
   */
  const reviewing = recording && voiceState.sentToken !== recording.id;

  if (reviewing) {
    /*
     * Dispatched from a handler with FormData built here, rather than through
     * `<form action>`. A `Blob` cannot be put into a form without a file input,
     * and filling one in means a `DataTransfer` shim plus a bet on `onSubmit`
     * running before React collects the FormData. `FormData.append` takes a
     * `File` directly and needs neither.
     */
    const send = () => {
      const data = new FormData();
      data.set("chatId", chatId);
      data.set("durationMs", String(Math.round(recording.durationMs)));
      data.set("token", recording.id);
      // A `File`, not the bare `Blob`: a Blob arrives server-side as a string,
      // and the action's `instanceof File` check is what rejects it.
      data.set("audio", new File([recording.blob], "note", { type: recording.blob.type }));
      startTransition(() => voiceAction(data));
    };

    return (
      <div className="space-y-3">
        <p className="text-[14px] text-[var(--text-dim)]">Listen before you send it.</p>
        <VoicePlayer
          src={recording.url}
          durationMs={recording.durationMs}
          mine
          className="max-w-full"
        />

        {voiceState.error && (
          <p role="alert" className="text-[15px] leading-snug text-[var(--error)]">
            {voiceState.error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setRecording(null)}
            disabled={voicePending}
            className="text-[15px] text-[var(--text-secondary)] underline decoration-[1.5px] underline-offset-4 transition-colors hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            Discard
          </button>
          <Button type="button" onClick={send} disabled={voicePending}>
            {voicePending ? "Sending…" : "Send voice note"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <form action={action} className="space-y-2">
        <input type="hidden" name="chatId" value={chatId} />

        <label htmlFor={`body-${chatId}`} className="sr-only">
          Message {name}
        </label>
        {/*
          * A single-line box, not a textarea.
          *
          * Two rows plus a resize handle made the composer the tallest thing on
          * the screen before a word was typed, and in a pinned footer that is
          * height taken from the conversation permanently rather than while
          * somebody is writing. `maxLength` is unchanged — a long message is
          * still allowed, it just scrolls sideways in the box the way every
          * other messaging field does.
          */}
        <input
          id={`body-${chatId}`}
          name="body"
          type="text"
          maxLength={4000}
          required
          autoComplete="off"
          placeholder={`Message ${name}`}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-3.5 py-2.5 text-[15px] text-[var(--text-primary)] placeholder:text-[var(--n-400)] focus:border-[var(--accent)] focus:outline-none"
        />

        {state.error && (
          <p role="alert" className="text-[15px] leading-snug text-[var(--error)]">
            {state.error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <VoiceRecorder onRecorded={setRecording} disabled={pending} />
          <Button type="submit" disabled={pending}>
            {pending ? "Sending…" : "Send"}
          </Button>
        </div>
      </form>
    </div>
  );
}
