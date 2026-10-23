# Introduction experience: film, brand animation, sources and licences

## What plays when (`src/lib/intro.ts`, `src/components/IntroSplash.tsx`)
| Preference (`prefs.intro`, synced) | New visit | Interactive sign-in | Reload / back / route change |
|---|---|---|---|
| Automatic (no choice, `null`) | First-ever visit on this device: cinematic film + brand animation. Later visits: brand animation | Brand | Nothing |
| `none` (No intro) | Nothing | Nothing | Nothing |
| `brand` (Brand intro) | Brand | Brand | Nothing |
| `cinematic` (Cinematic intro) | Film + brand (once per browser session; a reload never repeats it) | Brand | Nothing |

- **Never plays:** with `prefers-reduced-motion`, or on `/share/card`.
- **Data saver or 2G:** the film is replaced by the brand animation.
- **Legacy settings:** an explicit "Never" becomes `none`; "Every page load" and "Only after sign-in" become `brand`. The old defaults count as automatic.
- **New visit:** an arrival from outside the site, or a return after 30 minutes of inactivity (`isFreshVisit`).
- **Previews:** Account → Introduction → *Preview Brand Intro* and *Preview Cinematic Intro*.
- **Skipping:** a "Skip intro" button is visible throughout, and Esc also skips.

## Brand animation (`BrandStage`, `av2-*` keyframes in `src/index.css`)
About **4.2 s** (`BRAND_INTRO_MS`):

| Time | What happens |
|---|---|
| 0.12–1.3 s | Letters appear |
| 1.3–2.6 s | The full name is readable, about 1.5 s |
| 2.6–3.2 s | The other letters dissolve |
| 2.6–3.2 s | A and V glide onto the monogram |
| 3.25 s | The letters hand over to the drawn monogram within about 40 ms (no double image) |
| 3.6 s | Tagline |
| 3.9–4.2 s | Fade into the page |

## Film
- **Delivery:**
  - Files: `public/media/intro/aurora-intro-{1920,1280,720x1280}-v1.{webm,mp4}` plus a poster `.jpg` per variant.
  - Muted, `playsInline`, served by Cloudflare static assets (not the Worker).
  - Requested only when the film is about to play, so visitors who skip it, choose another intro or get the brand intro never download it.
- **Fallbacks:**
  - If the film has not started within 3.5 s, fails to load or autoplay is refused, the brand animation plays instead.
  - At the end the film fades out over the same charcoal background and the brand animation begins.
- **Build:**
  - `scripts/intro/render-globe.py` renders the closing globe.
  - `scripts/intro/build-intro.py` assembles each edit: trims, frames for landscape or portrait, grades, and joins with transitions.
  - Encoding commands are in the PR that added the film.
  - Source windows were fetched on a GitHub runner by the work-branch workflow `intro-fetch.yml`, because cloud sessions cannot reach stock sites.

### Edit (landscape, 12.5 s at 30 fps; transitions 0.35 s)
| # | Shot | Source window | Transition in |
|---|---|---|---|
| 1 | Night aerial descent towards a blue-hour skyline | Mixkit 42343, 15.6–17.6 s | fade from black |
| 2 | London, Tower Bridge lit at dusk (slow push-in) | Mixkit 4457, 11.0–13.2 s | horizontal blur |
| 3 | New York, rain-wet street with taxi reflections | Mixkit 4331, 5.3–7.0 s | horizontal blur |
| 4 | New York, Midtown skyline at night (slow push-in) | Mixkit 4334, 6.0–8.1 s | crossfade |
| 5 | Tokyo, Rainbow Bridge at night (slow push-in) | Mixkit 4383, 4.0–6.0 s | horizontal blur |
| 6 | Tokyo, Tokyo Tower as night falls | Mixkit 4308, 10.3–11.9 s | horizontal blur |
| 7 | Rotating night-lights globe with gold connection arcs (rendered) | NASA Black Marble 2016 | crossfade, then fade to black |

- **Portrait edit (phones, 720×1280):** shots 1, 3 and 5 use vertical Mixkit clips: 49878 (night towers from above), 34562 (night avenue traffic) and 49876 (avenue from above). Tower Bridge, New York and Tokyo are re-framed crops; the globe is larger.
- **On screen:** no captions, city names or slogans. The grade is charcoal blacks, platinum mid-tones, warm gold highlights and low saturation.
- **No market data:** the film contains no market chart, and no data is presented as real.

### Sources and licences
| Source | Title | Licence | Restrictions |
|---|---|---|---|
| [Mixkit 42343](https://mixkit.co/free-stock-video/movement-in-a-city-at-night-in-an-aerial-shot-42343/) | Movement in a city at night in an aerial shot | Mixkit Stock Video **Free** License | Commercial use allowed, no attribution required; no resale or redistribution of the clip on its own |
| [Mixkit 4457](https://mixkit.co/free-stock-video/tower-bridge-in-london-during-sunset-4457/) | Tower Bridge in London during sunset | Mixkit Free License | as above |
| [Mixkit 4331](https://mixkit.co/free-stock-video/traffic-on-a-rainy-night-4331/) | Traffic on a rainy night | Mixkit Free License | as above |
| [Mixkit 4334](https://mixkit.co/free-stock-video/new-york-buildings-at-night-4334/) | New York buildings at night | Mixkit Free License | as above |
| [Mixkit 4383](https://mixkit.co/free-stock-video/city-of-tokyo-at-night-4383/) | City of Tokyo at night | Mixkit Free License | as above |
| [Mixkit 4308](https://mixkit.co/free-stock-video/aerial-view-of-a-city-during-the-night-4308/) | Aerial view of a city during the night | Mixkit Free License | as above |
| [Mixkit 49878](https://mixkit.co/free-stock-video/big-city-at-night-from-an-aerial-shot-49878/) | Big city at night from an aerial shot | Mixkit Free License | as above |
| [Mixkit 34562](https://mixkit.co/free-stock-video/two-avenues-with-many-cars-traveling-at-night-34562/) | Two avenues with many cars traveling at night | Mixkit Free License | as above |
| [Mixkit 49876](https://mixkit.co/free-stock-video/avenue-of-a-big-city-at-night-from-the-heights-49876/) | Avenue of a big city at night from the heights | Mixkit Free License | as above |
| [NASA Earth Observatory, Earth at Night 2016](https://earthobservatory.nasa.gov/images/144898/earth-at-night-2016) | Black Marble 2016 (3 km global map) | Public domain (NASA imagery) | NASA asks for credit and no implied endorsement; credited here and on the Status page |

**Licence checks:**
- Each clip's licence was read from its Mixkit page (`copyrightNotice` in the page's structured data) on 2026-10-23.
- 32 of the 50 candidates are under the **Mixkit Restricted License** (non-commercial) and were excluded. These include all Dubai and Singapore night clips and several Tokyo ones (YanMednis), the London aerials (21aerials) and two New York clips (nyc_media_group).
- Pexels and Pixabay refuse automated requests, so they were not used. **Budapest and Vienna** have no Free-licence clip on Mixkit. The Wikimedia Commons Parliament clips are CC BY-SA, and share-alike would apply to the whole film.

**Adding Budapest or Vienna later:**
- **Option 1:** a free Pexels API key (owner action) would let the runner fetch Pexels-licensed clips.
- **Option 2:** the owner can supply a licensed clip.

The reference video supplied by the owner was used only for rhythm and mood, never as footage.
