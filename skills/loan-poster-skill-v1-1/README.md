# Loan Poster Skill v1.1

AI Agent Skill for generating Zamloan and BiuMoney Zambia mobile-loan
advertising posters.

v1.1 additions:
- skill.json
- generator.py
- config.json

The Skill automatically combines:
- scenes
- characters
- colors
- headlines
- benefits

and generates image-only poster batches in `1:1`, `16:9`, or portrait `3:4`.

Brand, quantity, and format are caller-selected. The shared visual contract asks
the image model to compose one background Z together with the complete poster
and intentionally omits generated standalone brand-name wordmarks and corner
logos. The exact Zamloan logo is still added after generation; the background Z
is never applied as a post-generation overlay over flattened campaign content.
