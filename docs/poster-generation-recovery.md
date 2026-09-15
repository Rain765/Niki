# Poster generation recovery

Anti-fraud image generation has separate provider and local-processing stages.
This recovery path does not change the image model, quality, poster prompt,
anatomy acceptance rules, or acquisition-poster design.

## Invariants

- Run the configured local landmark executable on a fixture before any paid
  request. Compilation or executable permission alone is not a health check.
- Retry a failed local execution against the same image using CPU processing.
  Execution/protocol failures are not evidence of an extra hand.
- Save provider bytes atomically under the project's private
  `.poster-checkpoints/` directory before layout checks or compositing. These
  files are not finished posters and are excluded from the file gallery.
- Persist admitted anti-fraud requests without credentials. After restart,
  pending jobs may resume cached image stages only. A missing checkpoint must
  never cause an automatic replacement provider request.
- The UI's **Resume processing** action and
  `od media generate --project <id> --resume-task <taskId> --json` use the same
  generation endpoint and the original project-bound request. Completed/running
  task IDs are idempotent. A genuinely new generation remains a separate action.
- Keep terminal task diagnostics for seven days, independently of the ten-minute
  in-memory waiter cache. Private image checkpoints currently persist with their
  owning project; monitor storage and remove them only through an explicit
  retention/cleanup decision, not as a side effect of a failed generation.
- Insufficient API credits are not a transient rate limit. Stop retrying and
  report the billing condition rather than describing it as a timeout.

## Runtime configuration acceptance

The default per-request timeout is 360,000 ms. An environment override still
takes precedence. Check **the live daemon's effective value**, not just the code
default or a build manifest. In the Feishu installation the override lives in
`~/Library/LaunchAgents/com.rain.niki-dev.plist`. Changing that file requires
reloading that launch agent; `launchctl kickstart` alone does not reload its
environment. Keep the existing network proxy and data-directory settings intact.

The image output retains the existing shared provider-call/retry budget. Local
continuation never expands that paid-call budget. No model/quality downgrade or
stub image is used to conceal a failure.

## Verification and delivery gate

1. Run repository guard/typecheck and the daemon/web suites. Targeted regressions
   include `poster-arm-integrity`, `poster-checkpoint`, `poster-recovery-jobs`,
   `poster-recovery-routes`, `media-overlay-logo-input`, and
   `image-request-recovery` under daemon tests, and the poster UI tests.
2. Check the real native helper on an actual poster in automatic and CPU modes.
3. Generate one complete poster through the application's normal UI/API using
   the configured provider. Inspect the complete result; mocked images prove
   recovery mechanics but not production image quality.
4. If billing quota or provider availability blocks this acceptance, preserve
   the logs and stop new provider calls. Do not claim a successful image or a
   verified deployment. Restore credits externally, then repeat acceptance.
5. Deploy through the existing immutable Feishu release workflow. Verify the
   external release SHA, loaded build assets, and the live daemon timeout.

Useful log stages are `poster-detector` preflight/detect (mode and duration),
`image` request/response/timeout, `poster-checkpoint` saved/resume, and task
done/failed. These distinguish provider unavailability from local processing.
