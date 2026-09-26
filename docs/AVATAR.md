# Create your avatar

The avatar is a portrait in a circle. It can be a **still** image, which takes a few minutes to make, or **animated** with an idle loop and a talking loop, which takes about an hour. You make source images and videos with any AI image or video tool, and one command turns them into the small files the site serves.

```
my-avatar/
├── portrait.png        required   closed mouth, head centered on a dark background
├── portrait-open.png   optional   same image with the mouth open
├── idle.mp4            animated   5 s listening loop
└── talking.mp4         animated   5 s talking loop
```

```bash
npm run avatar -- ./my-avatar
```

The script needs [ffmpeg](https://ffmpeg.org/download.html) (`brew install ffmpeg` or `apt install ffmpeg`). It center-crops everything to a square and writes `public/avatar/`, the favicon and the Apple touch icon.

## 1. Portrait

Generate a square portrait with an image model such as ChatGPT, Midjourney or Flux. Attach a photo of yourself as a reference to get a likeness. Keep your source folder outside the repo, or in `assets/` (which is gitignored).

> Square 1:1 character portrait of the person in the reference photo, reimagined as a **[style: soft matte clay figure / painted illustration / 3D animated character]**. Keep their hair, face shape and features recognizable: **[short description, e.g. short swept blond hair, clean shaven, black crewneck]**. Head and upper shoulders, centered and facing the camera, direct eye contact, relaxed closed-mouth smile. The head fills about 70% of the height with space above the hair. Soft studio light from the upper left. Solid, uniform near-black background (#0B0B0C) reaching every edge. No text, logos, props, border or frame.

What makes a portrait work well:

- **Dark, flat background.** The site's background is near-black, so the portrait blends into the circle.
- **Centered head with margin.** The circle crops the corners, and the favicon zooms in on the upper middle of the image.
- **Closed mouth.** This is the resting face. The talking pose comes next.

## 2. Open mouth

Edit the portrait with the same tool. Keep the mouth open only slightly, as in the middle of a word:

> Edit this image. Change only the mouth: open it slightly into a friendly mid-word smile, with a hint of upper teeth and a dark mouth interior. Keep everything else identical: head position, eyes, hair, clothes, lighting, framing and background.

A still avatar alternates between these two images while it talks. If you skip this step, the avatar stays still while it talks.

For a still avatar, stop here: run the command above and set `avatar.animated` to `false` in [`content/site.ts`](../content/site.ts).

## 3. Idle and talking loops

Use an image-to-video model that accepts a **first frame and a last frame**, for example Kling, Runway, Veo, Luma or Hailuo. Set the portrait as both the first and the last frame so each clip loops without a visible jump. Use a 1:1 aspect ratio, about 5 seconds and no audio.

**idle.mp4**

> Animate this exact character quietly listening to someone just behind the camera. Subtle breathing in the shoulders, a gentle curious head tilt of about two degrees, a soft eyebrow response and one or two natural blinks. Keep the closed-mouth smile throughout. Locked camera, no zoom, no cuts, no hands. Preserve the identity, textures, clothes and black background. End in exactly the starting pose. No audio.

**talking.mp4**

> Animate this exact character talking warmly to someone near the camera. The mouth makes several small, varied syllables, opening and closing with a relaxed smile. Gentle conversational nods of two or three degrees, subtle eyebrow movement and one or two natural blinks. Locked camera, no zoom, no cuts, no hands. Preserve the identity, textures, clothes and black background. Start and end in the supplied closed-mouth pose. No audio.

Generate a few takes and keep the calmest one. Small movements look more natural in a small circle.

## 4. Build and preview

```bash
npm run avatar -- ./my-avatar
npm run dev
```

Make sure `avatar.animated` in `content/site.ts` matches the files you built. Ask the agent a question to see it talk.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| The loop jumps at the seam | Set the same portrait as both the first and the last frame, or trim the clip to a moment where the pose matches the start. |
| The avatar changes when it starts talking | Both videos must start on the same portrait. Regenerate the talking clip from `portrait.png`. |
| A grey or light square shows around the head | Regenerate with a solid near-black background. |
| The head is cut off in the circle | Leave more margin around the head and keep it centered. |
| Visitors with reduced motion enabled | They see the still portrait. This is intended. |

