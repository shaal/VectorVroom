// Five pre-authored tracks that can be loaded instead of drawn by hand.
// Canvas is 3200x1800 (main.js:5-6). Start position is (2880, 900) (main.js:10).
// Each preset's corridor (area between inner wall `points` and outer wall
// `points2`) must contain the start point, otherwise the car spawns outside
// the track and the sim is broken.
//
// Data format matches roadEditor.js:
//   points:               inner wall, array of {x, y} — saved under `trackInner`
//   points2:              outer wall, array of {x, y} — saved under `trackOuter`
//   checkPointListEditor: array of [{x,y}, {x,y}] line segments — one per
//                         checkpoint; the two points define a gate the car must
//                         cross. Saved under `checkPointList`.
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
    points2: [
      { x: 250,  y: 300  },
      { x: 2950, y: 300  },
      { x: 2950, y: 1500 },
      { x: 250,  y: 1500 }
    ],
    checkPointListEditor: [
      [{ x: 1600, y: 300  }, { x: 1600, y: 700  }],
      [{ x: 250,  y: 900  }, { x: 650,  y: 900  }],
      [{ x: 1600, y: 1500 }, { x: 1600, y: 1100 }]
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
    // Outer ellipse: cx=1600, cy=900, rx=1300, ry=600, samples every 30°.
    points2: [
      { x: 2900, y: 900  },
      { x: 2726, y: 1200 },
      { x: 2250, y: 1420 },
      { x: 1600, y: 1500 },
      { x: 950,  y: 1420 },
      { x: 474,  y: 1200 },
      { x: 300,  y: 900  },
      { x: 474,  y: 600  },
      { x: 950,  y: 380  },
      { x: 1600, y: 300  },
      { x: 2250, y: 380  },
      { x: 2726, y: 600  }
    ],
    checkPointListEditor: [
      [{ x: 1600, y: 300  }, { x: 1600, y: 600  }],
      [{ x: 300,  y: 900  }, { x: 650,  y: 900  }],
      [{ x: 1600, y: 1500 }, { x: 1600, y: 1200 }]
    ]
  },
  {
    name: 'Triangle',
    description: 'Apex points left; spacious "nose" on the right contains start.',
    // Apex-left so the start (2880, 900) sits comfortably in the wide right lobe.
    points: [
      { x: 500,  y: 900  }, // left apex (inner)
      { x: 2400, y: 500  }, // top-right
      { x: 2400, y: 1300 }  // bottom-right
    ],
    points2: [
      { x: 150,  y: 900  }, // left apex (outer)
      { x: 2950, y: 250  }, // top-right
      { x: 2950, y: 1550 }  // bottom-right
    ],
    checkPointListEditor: [
      [{ x: 150,  y: 900  }, { x: 500,  y: 900  }], // left apex
      [{ x: 1500, y: 550  }, { x: 1500, y: 720  }], // top edge
      [{ x: 1500, y: 1250 }, { x: 1500, y: 1080 }]  // bottom edge
    ]
  },
  {
    name: 'Hexagon',
    description: '6-sided regular-ish hexagon. Faster straights than oval.',
    // Inner hexagon: cx=1600, cy=900, rx=950, ry=390 (y shortened to fit canvas).
    points: [
      { x: 2550, y: 900  }, // 0°
      { x: 2075, y: 1290 }, // 60°
      { x: 1125, y: 1290 }, // 120°
      { x: 650,  y: 900  }, // 180°
      { x: 1125, y: 510  }, // 240°
      { x: 2075, y: 510  }  // 300°
    ],
    // Outer hexagon: rx=1300, ry=520.
    points2: [
      { x: 2900, y: 900  },
      { x: 2250, y: 1420 },
      { x: 950,  y: 1420 },
      { x: 300,  y: 900  },
      { x: 950,  y: 380  },
      { x: 2250, y: 380  }
    ],
    checkPointListEditor: [
      [{ x: 1600, y: 380  }, { x: 1600, y: 510  }], // top flat
      [{ x: 300,  y: 900  }, { x: 650,  y: 900  }], // left vertex
      [{ x: 1600, y: 1420 }, { x: 1600, y: 1290 }]  // bottom flat
    ]
  },
  {
    name: 'Pentagon',
    description: 'Irregular 5-vertex, apex-right. Narrower nose corridor.',
    // Apex-right pentagon. Right-nose corridor is narrower (~120 px) than
    // other presets — harder to stay on track without training.
    points: [
      { x: 2500, y: 900  }, // right apex (inner)
      { x: 2000, y: 550  }, // top-right
      { x: 700,  y: 700  }, // top-left
      { x: 700,  y: 1100 }, // bottom-left
      { x: 2000, y: 1250 }  // bottom-right
    ],
    points2: [
      { x: 2950, y: 900  }, // right apex (outer)
      { x: 2200, y: 250  },
      { x: 300,  y: 450  },
      { x: 300,  y: 1350 },
      { x: 2200, y: 1550 }
    ],
    checkPointListEditor: [
      [{ x: 1500, y: 320  }, { x: 1500, y: 610  }], // top
      [{ x: 300,  y: 900  }, { x: 700,  y: 900  }], // left
      [{ x: 1500, y: 1510 }, { x: 1500, y: 1180 }]  // bottom
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
