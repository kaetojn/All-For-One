// The body figure: pre-drawn pencil sketches, one set per sex, picked by body fat and build.
//
// Each figure is drawn from the front, side and back (public/figures/<sex>/<key>-<view>.webp, cut
// from the sheets by scripts/slice-figures.py). They do not redraw as numbers change: the nearest
// drawing is shown.
//
//   key  male bf   female bf   pose
//   A    ~35%      ~43%        seated on the floor, slumped
//   B    ~28%      ~36%        standing, slouched
//   C    ~22%      ~30%        standing, relaxed
//   D1   ~16%      ~24%        hands on hips (lean)
//   D2   ~16%      ~24%        hands on hips (muscular)
//   D3   ~16%      ~24%        lat spread (bodybuilder)
//   E1   ~10%      ~18%        one-arm flex (lean)
//   E2   ~10%      ~18%        double biceps (muscular)
//   E3   ~10%      ~18%        double biceps (bodybuilder)

export const VIEWS = ['front', 'side', 'back'];
const BUILD_NUMBER = { lean: 1, muscular: 2, bodybuilder: 3 };
const LABEL = {
  A: 'Seated, worn out', B: 'Slouching', C: 'Standing easy',
  D1: 'Hands on hips', D2: 'Hands on hips', D3: 'Lat spread',
  E1: 'One-arm flex', E2: 'Double biceps', E3: 'Double biceps',
};

// The drawing nearest a body-fat level. Cut-offs sit halfway between the drawings' levels.
export function pickFigure(sex, bf, build = 'muscular') {
  const s = sex === 'female' ? 8 : 0;
  const n = BUILD_NUMBER[build] || 2;
  if (bf == null) return 'C';
  if (bf >= 31.5 + s) return 'A';
  if (bf >= 25 + s) return 'B';
  if (bf >= 19 + s) return 'C';
  if (bf >= 13 + s) return `D${n}`;
  return `E${n}`;
}

export const figureLabel = (key) => LABEL[key] || '';

const src = (sex, key, view) => `/figures/${sex === 'female' ? 'female' : 'male'}/${key}-${view}.webp`;

// Markup for a swipeable front / side / back strip, opened at `view`.
export function figureStrip({ sex, key, view = 'front', alt }) {
  return `<div class="figure" data-figure>
      <div class="figure-track" data-view="${view}">${VIEWS.map((v) => `<div class="figure-slide" data-view="${v}"><img src="${src(sex, key, v)}" alt="${alt}, ${v} view" draggable="false" ${v === view ? '' : 'loading="lazy"'}></div>`).join('')}</div>
      <div class="seg figure-views" role="group" aria-label="Angle">${VIEWS.map((v) => `<button type="button" data-figure-view="${v}" aria-pressed="${v === view}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div>
    </div>`;
}

// Wire up a strip after it is on the page: the buttons scroll to an angle, swiping updates the buttons.
// `onView` hears the angle so the next render can open at the same one.
export function mountFigure(root, onView) {
  const el = root.querySelector('[data-figure]');
  if (!el) return;
  const track = el.querySelector('.figure-track');
  const buttons = [...el.querySelectorAll('[data-figure-view]')];
  const go = (v, smooth) => {
    const slide = track.querySelector(`.figure-slide[data-view="${v}"]`);
    track.scrollTo({ left: slide.offsetLeft - track.offsetLeft, behavior: smooth ? 'smooth' : 'instant' });
  };
  const mark = (v) => { buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.figureView === v))); onView?.(v); };
  go(track.dataset.view, false);
  buttons.forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); go(b.dataset.figureView, true); mark(b.dataset.figureView); }));
  let t;
  track.addEventListener('scroll', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const i = Math.round(track.scrollLeft / track.clientWidth);
      mark(VIEWS[Math.max(0, Math.min(VIEWS.length - 1, i))]);
    }, 80);
  }, { passive: true });
}
