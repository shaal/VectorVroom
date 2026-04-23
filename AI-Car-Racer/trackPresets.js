// Ten pre-authored tracks that can be loaded instead of drawn by hand.
// Five geometric primitives + five famous-circuit stylisations.
// Canvas is 3200x1800 (main.js:5-6).
//
// Spawn: the car's initial position is the midpoint of checkpoint[0], with
// heading pointing toward the midpoint of checkpoint[1] (main.js:16-46).
// For every preset, cp[0] is placed where the car has room to drive forward.
//
// Checkpoint count: each preset uses 4 ordered gates — top, left, bottom,
// right-mid — giving a denser fitness gradient than the previous 3 (a 4th
// reward along each lap helps partial survivors get ranked during early
// generations, before any car can complete a full lap). See
// sim-worker.js:295 for the fitness formula consuming checkPointsCount.
//
// Data format matches roadEditor.js:
//   points:               inner wall, array of {x, y} — saved under `trackInner`
//   points2:              outer wall, array of {x, y} — saved under `trackOuter`
//   checkPointListEditor: array of [{x,y}, {x,y}] line segments — one per
//                         checkpoint; the two points define a gate the car must
//                         cross in order. Saved under `checkPointList`.
//
// To load a preset: click the floating "Load preset track" dropdown (visible
// during phase 1), or call `loadTrackPreset(idx)` / `loadTrackPreset(name)`
// from the browser console.

window.TRACK_PRESETS = [
  {
    name: 'Rectangle',
    description: '4-corner rectangular loop. Widest corridor, easiest to learn.',
    points: [
      { x: 650,  y: 700  },
      { x: 2450, y: 700  },
      { x: 2450, y: 1100 },
      { x: 650,  y: 1100 }
    ],
    // Outer right pushed to x=3100 so the start (2880,900) has ~220px
    // buffer instead of the old ~70px squeeze against x=2950.
    points2: [
      { x: 250,  y: 300  },
      { x: 3100, y: 300  },
      { x: 3100, y: 1500 },
      { x: 250,  y: 1500 }
    ],
    checkPointListEditor: [
      [{ x: 1600, y: 300  }, { x: 1600, y: 700  }],  // 1: top-mid (spawn)
      [{ x: 250,  y: 900  }, { x: 650,  y: 900  }],  // 2: left-mid
      [{ x: 1600, y: 1500 }, { x: 1600, y: 1100 }],  // 3: bottom-mid
      [{ x: 3100, y: 900  }, { x: 2450, y: 900  }]   // 4: right-mid
    ]
  },
  {
    name: 'Oval',
    description: '12-point ellipse approximation. Smooth curves, no sharp corners.',
    // Inner ellipse: cx=1600, cy=900, rx=950, ry=300, samples every 30°.
    points: [
      { x: 2550, y: 900  }, // 0°
      { x: 2423, y: 1050 }, // 30°
      { x: 2075, y: 1160 }, // 60°
      { x: 1600, y: 1200 }, // 90°
      { x: 1125, y: 1160 }, // 120°
      { x: 777,  y: 1050 }, // 150°
      { x: 650,  y: 900  }, // 180°
      { x: 777,  y: 750  }, // 210°
      { x: 1125, y: 640  }, // 240°
      { x: 1600, y: 600  }, // 270°
      { x: 2075, y: 640  }, // 300°
      { x: 2423, y: 750  }  // 330°
    ],
    // Outer ellipse: cx=1600, cy=900, rx=1500 (was 1300 — start was 20px
    // from the wall), ry=600, samples every 30°.
    points2: [
      { x: 3100, y: 900  },
      { x: 2899, y: 1200 },
      { x: 2350, y: 1420 },
      { x: 1600, y: 1500 },
      { x: 850,  y: 1420 },
      { x: 301,  y: 1200 },
      { x: 100,  y: 900  },
      { x: 301,  y: 600  },
      { x: 850,  y: 380  },
      { x: 1600, y: 300  },
      { x: 2350, y: 380  },
      { x: 2899, y: 600  }
    ],
    checkPointListEditor: [
      [{ x: 1600, y: 300  }, { x: 1600, y: 600  }],  // 1: top (spawn)
      [{ x: 100,  y: 900  }, { x: 650,  y: 900  }],  // 2: left
      [{ x: 1600, y: 1500 }, { x: 1600, y: 1200 }],  // 3: bottom
      [{ x: 3100, y: 900  }, { x: 2550, y: 900  }]   // 4: right
    ]
  },
  {
    name: 'Triangle',
    description: 'Apex points left; spawn sits in the spacious right lobe.',
    // Apex-left so the spawn (cp[0] on the right edge) sits comfortably in
    // the wide right lobe. The previous cp-order put cp[0] at the left apex,
    // pinning the spawn into the narrow corner — this rotation matches the
    // original design intent.
    points: [
      { x: 500,  y: 900  }, // left apex (inner)
      { x: 2400, y: 500  }, // top-right
      { x: 2400, y: 1300 }  // bottom-right
    ],
    points2: [
      { x: 150,  y: 900  }, // left apex (outer)
      { x: 3100, y: 250  }, // top-right
      { x: 3100, y: 1550 }  // bottom-right
    ],
    checkPointListEditor: [
      [{ x: 3100, y: 900  }, { x: 2400, y: 900  }], // 1: right-mid (spawn)
      [{ x: 1500, y: 550  }, { x: 1500, y: 720  }], // 2: top edge
      [{ x: 150,  y: 900  }, { x: 500,  y: 900  }], // 3: left apex
      [{ x: 1500, y: 1250 }, { x: 1500, y: 1080 }]  // 4: bottom edge
    ]
  },
  {
    name: 'Hexagon',
    description: '6-sided flat-top hexagon. Faster straights than oval.',
    // Inner hexagon: cx=1600, cy=900, rx=950, ry=390 (flat-top, y shortened).
    points: [
      { x: 2550, y: 900  }, // 0°
      { x: 2075, y: 1290 }, // 60°
      { x: 1125, y: 1290 }, // 120°
      { x: 650,  y: 900  }, // 180°
      { x: 1125, y: 510  }, // 240°
      { x: 2075, y: 510  }  // 300°
    ],
    // Outer hexagon: rx=1500 (was 1300 — start was 20px from wall), ry=520.
    points2: [
      { x: 3100, y: 900  },
      { x: 2350, y: 1420 },
      { x: 850,  y: 1420 },
      { x: 100,  y: 900  },
      { x: 850,  y: 380  },
      { x: 2350, y: 380  }
    ],
    checkPointListEditor: [
      [{ x: 1600, y: 380  }, { x: 1600, y: 510  }], // 1: top flat (spawn)
      [{ x: 100,  y: 900  }, { x: 650,  y: 900  }], // 2: left vertex
      [{ x: 1600, y: 1420 }, { x: 1600, y: 1290 }], // 3: bottom flat
      [{ x: 3100, y: 900  }, { x: 2550, y: 900  }]  // 4: right vertex
    ]
  },
  {
    name: 'Pentagon',
    description: 'Irregular 5-vertex, apex-right. Narrower nose corridor.',
    // Apex-right pentagon. Right-nose corridor is narrower than other
    // presets — harder to stay on track without training.
    points: [
      { x: 2500, y: 900  }, // right apex (inner)
      { x: 2000, y: 550  }, // top-right
      { x: 700,  y: 700  }, // top-left
      { x: 700,  y: 1100 }, // bottom-left
      { x: 2000, y: 1250 }  // bottom-right
    ],
    // Outer apex pushed from x=2950 to x=3100 so the start isn't
    // jammed into the apex tip.
    points2: [
      { x: 3100, y: 900  }, // right apex (outer)
      { x: 2200, y: 250  },
      { x: 300,  y: 450  },
      { x: 300,  y: 1350 },
      { x: 2200, y: 1550 }
    ],
    checkPointListEditor: [
      [{ x: 1500, y: 320  }, { x: 1500, y: 610  }], // 1: top (spawn)
      [{ x: 300,  y: 900  }, { x: 700,  y: 900  }], // 2: left
      [{ x: 1500, y: 1510 }, { x: 1500, y: 1180 }], // 3: bottom
      [{ x: 3100, y: 900  }, { x: 2500, y: 900  }]  // 4: right apex
    ]
  },

  // ─── Famous-circuit presets ──────────────────────────────────────────
  // Stylised, not to scale. Each has real chicanes and/or a hairpin so the
  // car must counter-steer through local sections — the net lap is still
  // one direction (annular constraint; see docstring at top) but the
  // driving-line weaves left-right-left-right between features.
  //
  // Authoring rule: the outer right edge stays near x=3100 across y∈[700,1100]
  // on every track, so the spawn rectangle at (2880,900)±(15,25) never lands
  // outside the corridor even when chicanes dent the outer wall elsewhere.

  {
    name: 'Monza',
    description: 'Italian-GP: Rettifilo + Roggia chicanes, Lesmo, Ascari S, Parabolica.',
    // Features (counterclockwise from pit straight):
    //   top  — Rettifilo chicane (R-L), Biassono, Roggia chicane (L-R), Lesmo 1-2
    //   left — short link
    //   bot  — Ascari S (L-R-L), sweeping Parabolica
    points: [
      { x: 2500, y: 750  }, // pit straight top
      { x: 2250, y: 650  }, // Rettifilo in (down-L)
      { x: 2050, y: 800  }, // Rettifilo apex (flick R)
      { x: 1850, y: 700  }, // Biassono
      { x: 1550, y: 800  }, // Roggia in
      { x: 1350, y: 700  }, // Roggia out
      { x: 1050, y: 750  }, // Lesmo 1
      { x: 750,  y: 800  }, // Lesmo 2
      { x: 500,  y: 900  }, // left-mid link
      { x: 700,  y: 1050 }, // Ascari entry
      { x: 950,  y: 1150 }, // Ascari apex L
      { x: 1250, y: 1050 }, // Ascari flick R
      { x: 1550, y: 1150 }, // Ascari exit
      { x: 1900, y: 1100 }, // Parabolica in
      { x: 2200, y: 1150 }, // Parabolica apex
      { x: 2500, y: 1100 }  // pit straight bottom
    ],
    points2: [
      { x: 3100, y: 700  },
      { x: 2900, y: 400  },
      { x: 2250, y: 350  }, // Rettifilo outer
      { x: 2050, y: 500  }, // Rettifilo outer chicane mate
      { x: 1850, y: 400  },
      { x: 1550, y: 500  }, // Roggia outer
      { x: 1350, y: 400  },
      { x: 1050, y: 450  }, // Lesmo outer
      { x: 750,  y: 500  },
      { x: 300,  y: 700  },
      { x: 200,  y: 900  },
      { x: 300,  y: 1100 },
      { x: 700,  y: 1400 }, // Ascari outer
      { x: 950,  y: 1500 },
      { x: 1250, y: 1400 },
      { x: 1550, y: 1500 },
      { x: 1900, y: 1450 }, // Parabolica outer
      { x: 2200, y: 1500 },
      { x: 2900, y: 1400 },
      { x: 3100, y: 1100 }
    ],
    checkPointListEditor: [
      [{ x: 1500, y: 350  }, { x: 1500, y: 800  }],  // 1: top after Roggia (spawn)
      [{ x: 200,  y: 900  }, { x: 500,  y: 900  }],  // 2: left link
      [{ x: 1500, y: 1500 }, { x: 1500, y: 1150 }],  // 3: bottom after Ascari
      [{ x: 3100, y: 900  }, { x: 2500, y: 900  }]   // 4: right-mid (pre-spawn)
    ]
  },

  {
    name: 'Silverstone',
    description: 'British-GP: Maggotts-Becketts-Chapel fast S, Club hairpin, Stowe.',
    // Features (counterclockwise from pit straight):
    //   top  — Copse kink R, then Maggotts-Becketts-Chapel 3-apex S (L-R-L-R)
    //   left — Club hairpin (sharp inner V)
    //   bot  — Abbey S, Stowe apex, Vale
    points: [
      { x: 2500, y: 750  },
      { x: 2300, y: 850  }, // Copse kink
      { x: 2050, y: 700  }, // Maggotts
      { x: 1850, y: 800  }, // Becketts 1
      { x: 1650, y: 700  }, // Becketts 2
      { x: 1450, y: 800  }, // Chapel
      { x: 1200, y: 700  }, // Hangar straight
      { x: 900,  y: 750  },
      { x: 600,  y: 800  }, // Vale approach
      { x: 400,  y: 900  }, // Club hairpin TIP (sharp left apex)
      { x: 600,  y: 1000 },
      { x: 900,  y: 1100 }, // Abbey entry
      { x: 1200, y: 1200 }, // Abbey
      { x: 1500, y: 1100 },
      { x: 1800, y: 1200 }, // Stowe
      { x: 2100, y: 1100 },
      { x: 2400, y: 1150 }
    ],
    points2: [
      { x: 3100, y: 700  },
      { x: 2900, y: 400  },
      { x: 2300, y: 500  }, // Copse outer
      { x: 2050, y: 350  }, // Maggotts outer
      { x: 1850, y: 450  }, // Becketts outer 1
      { x: 1650, y: 350  }, // Becketts outer 2
      { x: 1450, y: 450  }, // Chapel outer
      { x: 1200, y: 350  },
      { x: 900,  y: 400  },
      { x: 500,  y: 500  },
      { x: 100,  y: 900  }, // Club outer apex (soft curve)
      { x: 500,  y: 1350 },
      { x: 900,  y: 1500 },
      { x: 1200, y: 1550 }, // Abbey outer
      { x: 1500, y: 1450 },
      { x: 1800, y: 1550 }, // Stowe outer
      { x: 2100, y: 1450 },
      { x: 2400, y: 1500 },
      { x: 2900, y: 1400 },
      { x: 3100, y: 1100 }
    ],
    checkPointListEditor: [
      [{ x: 1500, y: 350  }, { x: 1500, y: 800  }],  // 1: mid Becketts (spawn)
      [{ x: 100,  y: 900  }, { x: 400,  y: 900  }],  // 2: Club hairpin apex
      [{ x: 1500, y: 1500 }, { x: 1500, y: 1150 }],  // 3: bot after Stowe
      [{ x: 3100, y: 900  }, { x: 2500, y: 900  }]   // 4: right-mid (pre-spawn)
    ]
  },

  {
    name: 'Monaco',
    description: 'Principality-GP: Grand Hotel hairpin + Piscine S + Mirabeau zigzag.',
    // Tight streets: narrow corridor plus:
    //   left  — Grand Hotel Hairpin (sharp inner V at (400,900))
    //   top   — Piscine swimming-pool chicane (3-apex L-R-L)
    //   bot   — Mirabeau zigzag + Sainte-Devote exit
    points: [
      { x: 2500, y: 700  },
      { x: 2100, y: 750  }, // Anthony Noghes
      { x: 1700, y: 650  }, // Piscine 1 (L)
      { x: 1300, y: 750  }, // Piscine 2 (R)
      { x: 900,  y: 650  }, // Piscine 3 (L)  — 3-apex top chicane
      { x: 600,  y: 750  }, // Portier
      { x: 500,  y: 850  },
      { x: 400,  y: 900  }, // Grand Hotel HAIRPIN TIP (sharp V)
      { x: 500,  y: 950  },
      { x: 600,  y: 1050 },
      { x: 900,  y: 1100 }, // Casino
      { x: 1300, y: 1050 }, // Mirabeau zig (up)
      { x: 1700, y: 1150 }, // Mirabeau zag (down)
      { x: 2100, y: 1050 },
      { x: 2500, y: 1100 }
    ],
    points2: [
      { x: 3100, y: 700  },
      { x: 3000, y: 450  },
      { x: 2500, y: 300  },
      { x: 2100, y: 400  },
      { x: 1700, y: 300  }, // Piscine outer 1 mirror
      { x: 1300, y: 400  }, // Piscine outer 2 mirror
      { x: 900,  y: 300  }, // Piscine outer 3 mirror
      { x: 500,  y: 400  },
      { x: 200,  y: 700  },
      { x: 100,  y: 900  }, // Grand Hotel outer apex
      { x: 200,  y: 1100 },
      { x: 500,  y: 1350 },
      { x: 900,  y: 1450 }, // Casino outer
      { x: 1300, y: 1400 }, // Mirabeau outer (up)
      { x: 1700, y: 1500 }, // Mirabeau outer (down) — mirrors inner zig
      { x: 2100, y: 1400 },
      { x: 2500, y: 1500 },
      { x: 3000, y: 1350 },
      { x: 3100, y: 1100 }
    ],
    checkPointListEditor: [
      [{ x: 1100, y: 300  }, { x: 1100, y: 700  }],  // 1: after Piscine (spawn)
      [{ x: 100,  y: 900  }, { x: 400,  y: 900  }],  // 2: Grand Hotel
      [{ x: 1500, y: 1500 }, { x: 1500, y: 1100 }],  // 3: after Mirabeau
      [{ x: 3100, y: 900  }, { x: 2500, y: 900  }]   // 4: right-mid (pre-spawn)
    ]
  },

  {
    name: 'Spa',
    description: 'Belgian-GP: La Source hairpin + Eau Rouge S + Pouhon + Bus Stop chicane.',
    // Features (counterclockwise from pit straight):
    //   top  — Bus Stop chicane (R-L-R), Les Combes chicane, Eau Rouge-Raidillon flick
    //   left — La Source hairpin (sharp inner V)
    //   bot  — Pouhon (fast-left sweep), Stavelot kink
    points: [
      { x: 2500, y: 800  },
      { x: 2250, y: 700  }, // Bus Stop in
      { x: 2050, y: 850  }, // Bus Stop apex
      { x: 1850, y: 700  }, // Bus Stop out
      { x: 1550, y: 800  }, // Les Combes in
      { x: 1350, y: 700  }, // Les Combes out
      { x: 1050, y: 800  }, // Eau Rouge/Raidillon flick
      { x: 750,  y: 750  },
      { x: 500,  y: 850  },
      { x: 400,  y: 900  }, // La Source HAIRPIN TIP
      { x: 500,  y: 950  },
      { x: 750,  y: 1050 },
      { x: 1050, y: 1150 }, // Pouhon entry
      { x: 1350, y: 1200 }, // Pouhon apex 1
      { x: 1650, y: 1150 }, // Pouhon apex 2
      { x: 1950, y: 1200 }, // Stavelot kink
      { x: 2250, y: 1100 },
      { x: 2500, y: 1150 }
    ],
    points2: [
      { x: 3100, y: 700  },
      { x: 2900, y: 400  },
      { x: 2250, y: 400  }, // Bus Stop outer mirror
      { x: 2050, y: 550  },
      { x: 1850, y: 400  },
      { x: 1550, y: 500  }, // Les Combes outer
      { x: 1350, y: 400  },
      { x: 1050, y: 500  }, // Eau Rouge outer
      { x: 500,  y: 500  },
      { x: 100,  y: 900  }, // La Source outer apex
      { x: 500,  y: 1300 },
      { x: 1050, y: 1500 }, // Pouhon outer
      { x: 1350, y: 1550 },
      { x: 1650, y: 1500 },
      { x: 1950, y: 1550 },
      { x: 2250, y: 1450 },
      { x: 2500, y: 1500 },
      { x: 2900, y: 1400 },
      { x: 3100, y: 1100 }
    ],
    checkPointListEditor: [
      [{ x: 1200, y: 350  }, { x: 1200, y: 800  }],  // 1: after Les Combes (spawn)
      [{ x: 100,  y: 900  }, { x: 400,  y: 900  }],  // 2: La Source
      [{ x: 1500, y: 1500 }, { x: 1500, y: 1150 }],  // 3: mid Pouhon
      [{ x: 3100, y: 900  }, { x: 2500, y: 900  }]   // 4: right-mid (pre-spawn)
    ]
  },

  {
    name: 'Suzuka',
    description: 'Japanese-GP: Esses + Degner + Hairpin + Spoon + 130R + Casio chicane.',
    // NOTE: real Suzuka is a figure-8 (crossover bridge); this sim can't
    // represent that with annular walls, so features are laid out as a
    // non-crossing loop that keeps Suzuka's counter-steer character.
    //
    // Features (counterclockwise from pit straight):
    //   top  — Turn 1 (right) + Esses (4-apex R-L-R-L) + Dunlop
    //   left — Degner kink → Hairpin (sharp inner V)
    //   bot  — back-straight → Spoon curve (double-apex) → 130R → Casio chicane
    points: [
      { x: 2500, y: 700  },
      { x: 2250, y: 800  }, // Turn 1 (flick R)
      { x: 1950, y: 700  }, // Esses 1 (L)
      { x: 1750, y: 800  }, // Esses 2 (R)
      { x: 1550, y: 700  }, // Esses 3 (L)
      { x: 1350, y: 800  }, // Esses 4 (R)
      { x: 1100, y: 750  }, // Dunlop
      { x: 850,  y: 800  }, // Degner kink
      { x: 650,  y: 900  },
      { x: 400,  y: 900  }, // HAIRPIN TIP (sharp left apex, mid-left)
      { x: 650,  y: 1000 },
      { x: 900,  y: 1100 }, // back straight
      { x: 1200, y: 1200 }, // Spoon entry
      { x: 1400, y: 1250 }, // Spoon apex 1
      { x: 1650, y: 1200 }, // Spoon apex 2
      { x: 1900, y: 1100 }, // Spoon exit
      { x: 2150, y: 1200 }, // 130R (fast L bulge)
      { x: 2400, y: 1050 }, // Casio chicane in
      { x: 2500, y: 1150 }  // Casio chicane out
    ],
    points2: [
      { x: 3100, y: 700  },
      { x: 2900, y: 400  },
      { x: 2250, y: 500  }, // Turn 1 outer
      { x: 1950, y: 400  }, // Esses outer 1
      { x: 1750, y: 500  }, // Esses outer 2
      { x: 1550, y: 400  }, // Esses outer 3
      { x: 1350, y: 500  }, // Esses outer 4
      { x: 1100, y: 400  },
      { x: 850,  y: 500  }, // Degner outer
      { x: 400,  y: 600  },
      { x: 100,  y: 900  }, // Hairpin outer apex
      { x: 400,  y: 1200 },
      { x: 900,  y: 1450 },
      { x: 1200, y: 1550 }, // Spoon outer
      { x: 1400, y: 1600 },
      { x: 1650, y: 1550 },
      { x: 1900, y: 1450 },
      { x: 2150, y: 1550 }, // 130R outer
      { x: 2400, y: 1400 }, // Casio outer
      { x: 2900, y: 1400 },
      { x: 3100, y: 1100 }
    ],
    checkPointListEditor: [
      [{ x: 1450, y: 400  }, { x: 1450, y: 800  }],  // 1: mid Esses (spawn)
      [{ x: 100,  y: 900  }, { x: 400,  y: 900  }],  // 2: Hairpin
      [{ x: 1500, y: 1600 }, { x: 1500, y: 1200 }],  // 3: mid Spoon
      [{ x: 3100, y: 900  }, { x: 2500, y: 900  }]   // 4: right-mid (pre-spawn)
    ]
  }
];

// Deep-clone a preset so callers that mutate `road.roadEditor.points`
// don't accidentally pollute the static TRACK_PRESETS data.
function clonePreset(p) {
  return {
    name: p.name,
    points:  p.points.map(pt => ({ x: pt.x, y: pt.y })),
    points2: p.points2.map(pt => ({ x: pt.x, y: pt.y })),
    checkPointListEditor: p.checkPointListEditor.map(seg => [
      { x: seg[0].x, y: seg[0].y },
      { x: seg[1].x, y: seg[1].y }
    ])
  };
}

window.loadTrackPreset = function(nameOrIdx) {
  const list = window.TRACK_PRESETS;
  let preset;
  if (typeof nameOrIdx === 'number') {
    preset = list[nameOrIdx];
  } else if (typeof nameOrIdx === 'string') {
    preset = list.find(p => p.name.toLowerCase() === nameOrIdx.toLowerCase());
  }
  if (!preset) {
    console.error('[trackPresets] unknown preset:', nameOrIdx,
                  '— try one of:', list.map(p => p.name).join(', '));
    return false;
  }
  const copy = clonePreset(preset);

  // Persist first (so even if the in-memory path is broken, a reload
  // recovers the preset via roadEditor.js:6-19 localStorage branch).
  localStorage.setItem('trackInner',    JSON.stringify(copy.points));
  localStorage.setItem('trackOuter',    JSON.stringify(copy.points2));
  localStorage.setItem('checkPointList', JSON.stringify(copy.checkPointListEditor));

  // Switching tracks invalidates any brain trained on a previous track:
  // the sensor readings belong to a different corridor geometry. Clear
  // localStorage.bestBrain + progress so the new track starts fresh.
  // (The ruvector archive is intentionally NOT cleared — cross-track
  // seed recall via trackVec similarity is exactly what the bridge is for.)
  localStorage.removeItem('bestBrain');
  localStorage.removeItem('progress');
  localStorage.removeItem('rvAnnotations');
  try { if (typeof resetTrainCount === 'function') resetTrainCount(); } catch (_) {}

  // Swap the in-memory editor state if the game has booted.
  if (typeof road !== 'undefined' && road.roadEditor) {
    road.roadEditor.points               = copy.points;
    road.roadEditor.points2              = copy.points2;
    road.roadEditor.checkPointListEditor = copy.checkPointListEditor;
    // Recompute the spawn arrow from the new cp[0] so edit mode shows where
    // training will actually place the car — otherwise the START triangle
    // lags behind the track geometry until the next phase-4 begin().
    try {
      if (typeof computeStartInfoInPlace === 'function') {
        computeStartInfoInPlace(copy.checkPointListEditor);
      }
    } catch (_) {}
    try { road.roadEditor.redraw(); } catch (_) { /* redraw only works in phase 1/2 */ }
  }

  console.log(`[trackPresets] loaded "${preset.name}" (${preset.points.length} inner / ${preset.points2.length} outer / ${preset.checkPointListEditor.length} checkpoints)`);
  return true;
};

// Floating dropdown UI, phase-1 only so it never competes with the training
// canvas. Guarded with try/catch so a DOM-read failure never breaks the page.
(function mountPicker() {
  try {
    const select = document.getElementById('track-preset-select');
    if (!select) return; // element not present — nothing to wire up.
    window.TRACK_PRESETS.forEach((p, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = `${i + 1}. ${p.name}`;
      opt.title = p.description || '';
      select.appendChild(opt);
    });
    const btn = document.getElementById('track-preset-load');
    if (btn) {
      btn.addEventListener('click', () => {
        const v = select.value;
        if (v === '') return;
        window.loadTrackPreset(parseInt(v, 10));
      });
    }
    const picker = document.getElementById('track-preset-picker');
    if (picker) {
      const update = () => {
        const inEditor = typeof phase !== 'undefined' && (phase === 1 || phase === 2);
        picker.style.display = inEditor ? 'block' : 'none';
      };
      setInterval(update, 400);
      update();
    }
  } catch (e) {
    console.warn('[trackPresets] UI mount failed:', e);
  }
})();
