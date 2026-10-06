Baseline renderer and simulation metadata copied verbatim from commit
`51bbbab3c78cc5454124ae67682fad2fdfcd5dde` before the imported kart model.

This fixture is frozen deliberately. The visual harness renders it and the
current renderer with identical world, time, viewport and camera transforms.
Run `node --import tsx scripts/kart-visual-check.ts` to regenerate comparison
images. No gameplay server is started or modified by this harness.
