// rate-limit.js — waits out a provider's rate limit instead of ending the visitor's turn.
// Added by agentic-web. See README.md in this folder.
//
// Free keys hit per-minute token limits quickly: Groq's free tier allows 8,000 tokens a
// minute, and one turn with a delegating agent can use more. Providers answer HTTP 429
// and say when to try again, in a Retry-After header or in the message ("Please try
// again in 8.2575s"). LlmClient.chat waits that long, up to MAX_WAIT_MS, and sends the same
// request again, up to MAX_RETRIES times. Otherwise the visitor gets a plain sentence.

export class RateLimit {
  /** Retries after the first rate-limited answer. */
  static MAX_RETRIES = 2;

  /** The longest wait worth holding a visitor's turn for. */
  static MAX_WAIT_MS = 30000;

  /** The wait for a 429 that does not say how long. */
  static DEFAULT_WAIT_MS = 3000;

  /**
   * How long the provider asks to wait before trying again.
   *
   * :param status: The HTTP status.
   * :param headers: The response headers.
   * :param bodyText: The response body.
   * :return: Milliseconds to wait, or null when the answer is not a rate limit to retry.
   */
  static waitMs(status, headers, bodyText) {
    if (status !== 429 && status !== 503) {
      return null;
    }
    const after = headers?.get?.("retry-after");
    if (after) {
      const seconds = Number(after);
      if (Number.isFinite(seconds)) {
        return Math.max(0, Math.ceil(seconds * 1000));
      }
      const at = Date.parse(after);
      if (!Number.isNaN(at)) {
        return Math.max(0, at - Date.now());
      }
    }
    const match = /(?:try again|retry)\s+(?:in|after)\s+(?:(\d+)\s*m(?!s))?\s*([\d.]+)?\s*(ms|s|sec|secs|seconds?)?/i.exec(String(bodyText || ""));
    if (match && (match[1] || match[2])) {
      const minutes = Number(match[1] || 0);
      const value = Number(match[2] || 0);
      const ms = match[3] && match[3].toLowerCase() === "ms" ? value : value * 1000;
      return Math.ceil(minutes * 60000 + ms);
    }
    return status === 429 ? RateLimit.DEFAULT_WAIT_MS : null;
  }

  /**
   * Wait, ending at once if the visitor stops the turn.
   */
  static sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      const stop = () => {
        clearTimeout(timer);
        reject(signal.reason instanceof Error ? signal.reason : new DOMException("The turn was stopped.", "AbortError"));
      };
      if (signal?.aborted) {
        stop();
        return;
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener?.("abort", stop);
        resolve();
      }, ms);
      signal?.addEventListener?.("abort", stop, { once: true });
    });
  }

  /**
   * The error a visitor sees when the limit is not lifted in time. It never repeats the
   * provider's text, which can hold account details.
   *
   * :param host: The provider's host.
   * :param waitMs: The wait the provider asked for, or null.
   */
  static error(host, waitMs) {
    let when = "in a minute";
    if (waitMs && waitMs >= 90000) {
      when = `in about ${Math.round(waitMs / 60000)} minutes`;
    } else if (waitMs) {
      when = `in about ${Math.ceil(waitMs / 1000)} seconds`;
    }
    const error = new Error(`Your AI provider (${host}) has hit its rate limit for this key. Send your message again ${when}, or use a key with a higher limit in ⚙ AI model settings.`);
    error.name = "ProviderRateLimit";
    error.code = "LLM_RATE_LIMIT";
    return error;
  }
}
