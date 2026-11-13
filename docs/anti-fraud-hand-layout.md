# Anti-fraud hand-relative SMS placement

Only `posterCopyStyle=anti-fraud-message` uses this path. Acquisition posters and
their provider prompts are unchanged. Both the web generation flow and `od media`
call the same daemon finalizer.

1. Preflight the local hand detector before contacting a paid image provider.
2. Generate the full scene, typography, and phone, without an SMS panel.
3. Detect two complete hands on this base image (before an overlay can hide one).
   The inner-left hand holds the phone; the outer-right hand sweeps sideways/down.
4. Position the unchanged SMS artwork below the outer hand's padded bounding box,
   with a 2%-of-height gap and a rightward offset. Include the red badge in overlap
   and 2% canvas-edge clearance checks. Never clamp a failed layout above the hand.
5. Composite the SMS and exact supplied logo locally. Normalized landmarks survive
   output resizing; placement is recalculated for the final pixel dimensions.

The OpenAI image paths (including a configured compatible override) share at most
one retry with existing poster safe-zone checks. An uncertain or out-of-bounds hand
layout remains an error after that retry, not a successful blank/guessed output.
Other image providers receive the same final hand-placement validation but do not
automatically retry. Recognition cannot prove perfect anatomy or gesture intent;
complete-image visual acceptance is still required.

## Runtime prerequisite

The current macOS delivery host uses local Apple Vision. Xcode command-line tools
(`xcrun swiftc`) must be available. A small native helper is generated from the
TypeScript-owned bridge, compiled once per daemon process, and reused. Detection
has a 30-second timeout. Temporary input images are removed after each call; no
image is uploaded for hand recognition. The compiled helper is held in the OS
temporary directory for the process lifetime.

Other hosts must set `OD_POSTER_HAND_DETECTOR` to an absolute executable path before
generating anti-fraud SMS posters. It is executed directly, without a shell, with
one PNG pathname argument. Return only JSON on stdout (128 KiB maximum):

```json
{
  "hands": [{"points": [{"x": 0.64, "y": 0.65, "confidence": 0.95}]}],
  "phones": [{"left": 0.38, "top": 0.4, "right": 0.52, "bottom": 0.65}]
}
```

Coordinates use a top-left origin, normalized to 0–1. Return up to three hands
(to detect extra hands); acceptance requires exactly two with at least 15 points
at confidence ≥0.3 each. The abbreviated JSON above illustrates the schema only,
not an acceptable complete observation. Phone boxes protect detected screens;
the native bridge finds the smallest rectangle enclosing an OCR-detected `.com`
label. Unsupported hosts fail preflight instead of reverting to fixed coordinates.
