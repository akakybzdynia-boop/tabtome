# ADR 0002: Paperwhite image policy

- Date: 2026-08-07
- Status: accepted

## Context

The target is a Kindle Paperwhite with a screen close to 1236×1648 or 1264×1680. A single 1280-pixel long-side limit would under-resolve portrait images against the vertical screen dimension, while a 1600-pixel landscape width wastes mail budget.

## Decision

Images fit inside a 1280×1680 bounding box. Four downloads run concurrently, each has a 15-second timeout, and all images for one article have a 90-second budget. Grayscale JPEG quality 0.80 is enabled by default and can be disabled in extension settings for color EPUB use. Transparency stays PNG and GIF is preserved.

## Consequences

Landscape images no longer exceed Paperwhite width, portrait images retain nearly the full vertical resolution, and grayscale typically reduces size. The exact saving depends on image content and JPEG chroma subsampling; it is not assumed to be a fixed threefold reduction.
