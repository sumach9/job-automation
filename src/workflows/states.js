// ─── Workflow State Machine ───────────────────────────────────────────────────
// All valid states and allowed transitions for an application workflow.

export const States = {
  QUEUED:          "queued",
  ANALYZING:       "analyzing",
  SCRAPING:        "scraping",
  PARSING_RESUME:  "parsing_resume",
  FILLING_FORM:    "filling_form",
  UPLOADING_RESUME:"uploading_resume",
  VALIDATING:      "validating",
  SUBMITTED:       "submitted",
  RETRYING:        "retrying",
  MANUAL_REVIEW:   "manual_review",
  COMPLETED:       "completed",
  FAILED:          "failed",
};

// Which states are terminal (no further transitions)
export const TERMINAL_STATES = new Set([
  States.COMPLETED,
  States.FAILED,
  States.MANUAL_REVIEW,
]);

// Allowed forward transitions (from → [to...])
export const TRANSITIONS = {
  [States.QUEUED]:           [States.ANALYZING, States.FAILED],
  [States.ANALYZING]:        [States.SCRAPING, States.FAILED, States.MANUAL_REVIEW],
  [States.SCRAPING]:         [States.PARSING_RESUME, States.FILLING_FORM, States.FAILED, States.RETRYING],
  [States.PARSING_RESUME]:   [States.FILLING_FORM, States.FAILED],
  [States.FILLING_FORM]:     [States.UPLOADING_RESUME, States.VALIDATING, States.RETRYING, States.FAILED],
  [States.UPLOADING_RESUME]: [States.VALIDATING, States.RETRYING, States.FAILED],
  [States.VALIDATING]:       [States.SUBMITTED, States.RETRYING, States.FAILED, States.MANUAL_REVIEW],
  [States.SUBMITTED]:        [States.COMPLETED, States.FAILED],
  [States.RETRYING]:         [States.SCRAPING, States.FILLING_FORM, States.FAILED, States.MANUAL_REVIEW],
  [States.MANUAL_REVIEW]:    [],   // terminal — human decides next step
  [States.COMPLETED]:        [],
  [States.FAILED]:           [States.RETRYING],  // can re-queue if under retry budget
};

/**
 * Check whether a transition is allowed.
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
export function canTransition(from, to) {
  return !!(TRANSITIONS[from] && TRANSITIONS[from].includes(to));
}

/**
 * Throw if the transition is illegal.
 */
export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal state transition: ${from} → ${to}`);
  }
}

export function isTerminal(state) {
  return TERMINAL_STATES.has(state);
}
