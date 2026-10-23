"""Builds the cinematic intro film from trimmed source clips and the rendered globe (docs/INTRO.md).

    python3 scripts/intro/build-intro.py <clips_dir> <globe_dir> <out_master.mp4> landscape|portrait

Every shot is normalised to 30 fps, framed for the target aspect (portrait crops landscape shots around a chosen
centre), graded to the brand palette (charcoal blacks, platinum mid-tones, warm gold highlights, low saturation) and
joined with short blur or dissolve transitions. No captions, no audio.
"""
import subprocess
import sys

clips, globe, out, mode = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
W, H = (1920, 1080) if mode == 'landscape' else (1080, 1920)
FPS = 30
T = 0.35  # transition length (s)

# (file, start, duration, horizontal centre for portrait crops (0..1), push-in amount, per-shot exposure/saturation)
if mode == 'landscape':
    SHOTS = [
        ('42343.mp4', 0.6, 2.0, 0.5, 0.00, (0.07, 0.72)),
        ('4457.mp4', 1.5, 2.2, 0.5, 0.025, (-0.02, 0.62)),
        ('4331.mp4', 0.8, 1.7, 0.5, 0.00, (-0.04, 0.50)),
        ('4334.mp4', 0.5, 2.1, 0.5, 0.05, (-0.07, 0.55)),
        ('4383.mp4', 0.5, 2.0, 0.5, 0.05, (0.00, 0.62)),
        ('4308.mp4', 1.5, 1.6, 0.5, 0.02, (-0.02, 0.60)),
    ]
    XF = ['hblur', 'hblur', 'fade', 'hblur', 'hblur', 'fade']
else:
    SHOTS = [
        ('49878.mp4', 0.5, 2.0, 0.5, 0.00, (0.00, 0.65)),
        ('4457.mp4', 1.5, 2.1, 0.47, 0.02, (-0.02, 0.62)),
        ('34562.mp4', 1.0, 1.7, 0.5, 0.00, (-0.03, 0.50)),
        ('4334.mp4', 0.5, 2.0, 0.86, 0.04, (-0.07, 0.55)),
        ('49876.mp4', 1.0, 1.9, 0.5, 0.00, (0.07, 0.62)),
        ('4383.mp4', 0.5, 1.8, 0.40, 0.04, (0.00, 0.62)),
    ]
    XF = ['hblur', 'hblur', 'fade', 'hblur', 'hblur', 'fade']
GLOBE_DUR = 3.0

LOOK = (
    "curves=all='0/0.025 0.12/0.08 0.5/0.46 0.85/0.84 1/0.95',"
    'colorbalance=rs=-0.02:gs=0:bs=0.03:rm=0.02:gm=0.01:bm=-0.02:rh=0.06:gh=0.03:bh=-0.06,'
    'vignette=angle=PI/5'
)

inputs, chains = [], []
for i, (f, start, dur, centre, push, (bright, sat)) in enumerate(SHOTS):
    inputs += ['-ss', str(start), '-t', str(dur + 0.05), '-i', f'{clips}/{f}']
    # Frame for the target aspect: scale to cover, crop around the chosen centre.
    frame = (
        f"fps={FPS},scale='if(gt(a,{W}/{H}),-2,{W * 2})':'if(gt(a,{W}/{H}),{H * 2},-2)',"
        f"crop={W * 2}:{H * 2}:'(iw-{W * 2})*{centre}':'(ih-{H * 2})/2'"
    )
    # Slow push-in (computed on the 2x frame to avoid jitter), then down to the output size.
    zoom = f",zoompan=z='1+{push}*on/({dur}*{FPS})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={W}x{H}:fps={FPS}" if push else f',scale={W}:{H}'
    grade = f',eq=brightness={bright}:saturation={sat}:contrast=1.05,{LOOK},setsar=1,format=yuv420p,trim=duration={dur},setpts=PTS-STARTPTS'
    chains.append(f'[{i}:v]{frame}{zoom}{grade}[v{i}]')

g = len(SHOTS)
inputs += ['-framerate', str(FPS), '-i', f'{globe}/g%04d.png']
chains.append(f'[{g}:v]format=yuv420p,setsar=1,trim=duration={GLOBE_DUR},setpts=PTS-STARTPTS,fade=t=out:st={GLOBE_DUR - 0.8}:d=0.8[v{g}]')

durs = [s[2] for s in SHOTS] + [GLOBE_DUR]
prev, offset = 'v0', 0.0
for k in range(1, g + 1):
    offset += durs[k - 1] - T
    label = f'x{k}'
    chains.append(f'[{prev}][v{k}]xfade=transition={XF[k - 1]}:duration={T}:offset={offset:.3f}[{label}]')
    prev = label
chains.append(f'[{prev}]fade=t=in:st=0:d=0.6[out]')

cmd = ['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', *inputs, '-filter_complex', ';'.join(chains), '-map', '[out]', '-an',
       '-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-pix_fmt', 'yuv420p', '-r', str(FPS), out]
subprocess.run(cmd, check=True)
total = sum(durs) - T * g
print(f'{out}: {W}x{H}, {total:.2f} s')
