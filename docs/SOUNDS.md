# Briefing sound design

Files in `public/media/sfx/`, generated once on 31 October 2026 with ElevenLabs Sound Effects (`eleven_text_to_sound_v2`)
on the owner's paid ElevenLabs plan, which includes commercial use of generated output. Prompts are in `worker/sfx.ts`
(no voices, music, weapons or alarms). Playback never calls the provider. The generation route only works on preview
hosts with the asset-build header; files were fetched by `.github/workflows/sfx-fetch.yml` on the `claude/sfx-work` branch.

| File | Use | Duration | Measured (ffmpeg) |
|---|---|---|---|
| ops-room.mp3 | continuous operations-room bed (loop) | 22.0 s | RMS -35.3 dB, peak -23.6 dB, no silent gaps |
| radio-hiss.mp3 | faint radio texture under the bed (loop) | 12.0 s | RMS -18.0 dB, peak -3.4 dB (mixed at about -28 dB) |
| ptt-open.mp3 | handover between stories | 0.8 s | peak -0.2 dB (played at about -9 dB) |
| ptt-close.mp3 | reserved | 0.7 s | peak -0.1 dB |
| console-ack.mp3 | camera reaches a story's location | 0.8 s | peak -11.3 dB |

Mix (`src/lib/ambience.ts`): room about -42 dB RMS, hiss about -46 dB, both ducked about 6.6 dB while anyone speaks;
the generated ventilation is the fallback when the files cannot load. The QsensX music reference stays a private
prototype only (no file here). Generation cost: five requests on 31 October 2026 (about 36 seconds of audio).
