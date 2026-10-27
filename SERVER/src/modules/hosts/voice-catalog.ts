import { HostGender, HostVoiceEmotion } from "./host.model.js";

export interface HostVoiceOption {
  id: string;
  name: string;
  gender: HostGender;
  locale: string;
  age: string;
  description: string;
}

export interface HostVoiceEmotionOption {
  id: HostVoiceEmotion;
  label: string;
  description: string;
}

export const HOST_VOICE_CATALOG: HostVoiceOption[] = [
  {
    id: "X6NceqF285Gr04gb",
    name: "Alfie",
    gender: "male",
    locale: "en-GB",
    age: "Young Adult",
    description:
      "Punchy and forward, with crisp consonant attack and a pitch that lifts across a line, sitting high over a music bed.",
  },
  {
    id: "gfP44RlHwr2kEwk7",
    name: "Bryony",
    gender: "female",
    locale: "en-GB",
    age: "Middle-age",
    description:
      "Full, rich mid-range tones, softly relaxed and spoken close to the mic, moving briskly with light pitch play.",
  },
  {
    id: "nGzMHMPAWGaJFHOo",
    name: "Delia",
    gender: "female",
    locale: "en-US",
    age: "Middle-age",
    description:
      "Low, grounded and quick to the point, with a sincerity that keeps an apology honest.",
  },
  {
    id: "LMDIYE0Oa377Qh6Z",
    name: "Easton",
    gender: "male",
    locale: "en-US",
    age: "Young Adult",
    description:
      "Punchy and close in, with crisp consonant attack that cuts through a music bed and pitch that lifts across each line.",
  },
  {
    id: "zUCxzrOrugTSis03",
    name: "Edwin",
    gender: "male",
    locale: "en-GB",
    age: "Middle-age",
    description:
      "Efficient and firm, sincere in attention, with tidy articulation that holds up at phone bandwidth.",
  },
  {
    id: "y9bQqIDnyxwqK01t",
    name: "Elodie-Rose",
    gender: "female",
    locale: "en-GB",
    age: "Young",
    description:
      "A young British voice with sharp, enthusiastic energy and crisp articulation, sparky and to the point for customer support and care.",
  },
  {
    id: "vjFyp2BcCyTlUmYb",
    name: "Everly",
    gender: "female",
    locale: "en-US",
    age: "Middle-age",
    description:
      "Rounded, soft-edged tone with gentle lift at the end of phrases and an easy, relaxed delivery.",
  },
  {
    id: "GgfEkEJtxZR7gnpy",
    name: "Freya",
    gender: "female",
    locale: "en-GB",
    age: "Young",
    description:
      "A young British voice, glossy and confident with fast, girly chatter and bubbly sparkle, perfect for a friendly receptionist or assistant.",
  },
  {
    id: "bXwrkHhURL1VFJdG",
    name: "Hadley",
    gender: "female",
    locale: "en-US",
    age: "Middle-age",
    description:
      "Settled, even-toned and genuinely kind, with crisp consonants that hold up over a handset.",
  },
  {
    id: "4SZHfMpw-p46Ywgs",
    name: "Harper",
    gender: "female",
    locale: "en-US",
    age: "Adult",
    description:
      "Modern, confident and friendly voice with a standard American accent.",
  },
  {
    id: "YyKcxPG7iIgS3jsK",
    name: "Hugh",
    gender: "male",
    locale: "en-GB",
    age: "Middle-age",
    description:
      "Soft and close, airy in texture, with lively pitch movement and an attentive, sincere delivery.",
  },
  {
    id: "gDT1nz7Ie36ZhL-C",
    name: "Imogen",
    gender: "female",
    locale: "en-GB",
    age: "Adult",
    description:
      "A bubbly, friendly British English adult voice that puts callers instantly at ease. Great for onboarding assistants and warm concierge interactions.",
  },
  {
    id: "NIWIOv5vTi5eRMj8",
    name: "Juniper",
    gender: "female",
    locale: "en-US",
    age: "Young Adult",
    description:
      "Cheerful presence with real resonance under it, personable when the copy turns intimate and decisive on the final line.",
  },
  {
    id: "m9MxpY6IUGXtWp76",
    name: "Lottie",
    gender: "female",
    locale: "en-GB",
    age: "Young Adult",
    description:
      "Sparky and to the point, high forward energy with clean edges on the consonants and the range to drop low for one line then climb back.",
  },
  {
    id: "6PWnV0Nq4wu7RVBT",
    name: "Maeve",
    gender: "female",
    locale: "en-GB",
    age: "Adult",
    description:
      "A sparky, attentive British English adult voice that gets to the point with a smile. Ideal for fast, efficient customer support and helpful voice assistants.",
  },
  {
    id: "40QrMVgAxFiUnP9f",
    name: "Micah",
    gender: "male",
    locale: "en-US",
    age: "Young Adult",
    description:
      "Buoyant and high in energy, with a playful lift at the ends of phrases and clean attack that survives a loud mix.",
  },
  {
    id: "d9XCyhjo4JhkHF1d",
    name: "Miles",
    gender: "male",
    locale: "en-US",
    age: "Young Adult",
    description:
      "Resonant and decisive, with genuine dynamic range, dropping right down for one clause then driving back up.",
  },
  {
    id: "uem82D50GRv2Dwma",
    name: "Pippa",
    gender: "female",
    locale: "en-GB",
    age: "Adult",
    description:
      "A confident, upbeat British English adult voice with infectious energy. Perfect for proactive assistants and motivating customer success calls.",
  },
  {
    id: "qIxlZ7Ei8KvWlyQH",
    name: "Preston",
    gender: "male",
    locale: "en-US",
    age: "Middle-age",
    description:
      "Trim, focused delivery with clean edges on every consonant and a steady, low-set core that carries through phone bandwidth.",
  },
  {
    id: "_6Aslh2DxfmnRLmP",
    name: "Russell",
    gender: "male",
    locale: "en-US",
    age: "Adult",
    description:
      "A high-energy American adult voice that pushes and encourages with the intensity of someone who genuinely believes in you.",
  },
  {
    id: "JOW0vchyswkQUMDS",
    name: "Spencer",
    gender: "male",
    locale: "en-GB",
    age: "Middle-age",
    description:
      "Light and airy, sitting a touch higher, with crisp consonants and a slow, patient delivery.",
  },
  {
    id: "Zn7g6NxLqXlJb7Qi",
    name: "Teddy",
    gender: "male",
    locale: "en-GB",
    age: "Young Adult",
    description:
      "Sparky and close in, quick off the mark, with firm consonants and the range to drop right down for a clause then come back up.",
  },
  {
    id: "dME3IWyZBvmh1n1q",
    name: "Toby",
    gender: "male",
    locale: "en-GB",
    age: "Adult",
    description:
      "A sparky, attentive British English adult voice that gets to the point with a smile. Ideal for fast, efficient customer support and helpful voice assistants.",
  },
  {
    id: "0zLApsZfVLLNaEGl",
    name: "Trevor",
    gender: "male",
    locale: "en-US",
    age: "Middle-age",
    description:
      "Buoyant energy over a resonant mid-low core, phrases landing softly and consonants cutting through a handset.",
  },
  {
    id: "NbpkqMVS3CJeq2j8",
    name: "Zoey",
    gender: "female",
    locale: "en-US",
    age: "Adult",
    description:
      "Playful, upbeat and Gen Z energy voice with a standard American accent. Perfect for engaging conversations!",
  },
];

export const HOST_VOICE_EMOTION_OPTIONS: HostVoiceEmotionOption[] = [
  {
    id: "calm",
    label: "Calm",
    description:
      "Measured, grounded and unhurried. Good for late-night and reflective shows.",
  },
  {
    id: "mysterious",
    label: "Mysterious",
    description:
      "Low, deliberate and intriguing. Leaves a little space around every word.",
  },
  {
    id: "happy",
    label: "Happy",
    description:
      "Bright, friendly and upbeat. Good for mornings and feel-good segments.",
  },
  {
    id: "sad",
    label: "Sad",
    description:
      "Soft, slow and thoughtful. Good for emotional stories and quiet moments.",
  },
  {
    id: "energetic",
    label: "Energetic",
    description:
      "Fast, lively and enthusiastic. Good for drive-time and high-energy shows.",
  },
  {
    id: "serious",
    label: "Serious",
    description:
      "Direct and composed. Good for news, science and important conversations.",
  },
  {
    id: "warm",
    label: "Warm",
    description:
      "Close, kind and welcoming. Good for interviews and companion-style radio.",
  },
];

export function findVoice(id: string): HostVoiceOption | undefined {
  return HOST_VOICE_CATALOG.find((voice) => voice.id === id);
}

export function previewTextFor(
  emotion: HostVoiceEmotion,
  hostName: string,
): string {
  const texts: Record<HostVoiceEmotion, string> = {
    calm: `Good evening. I'm ${hostName}. Take a breath, settle in, and let's begin.`,
    mysterious: `Good evening. I'm ${hostName}. There's something in the signal tonight... stay close.`,
    happy: `Good morning! I'm ${hostName}, and we've got a bright show ahead. Let's get started!`,
    sad: `Good evening... I'm ${hostName}. Some nights are quieter than others. Let's sit with that for a while.`,
    energetic: `Hey there! I'm ${hostName}, and the airwaves are wide awake. Let's go!`,
    serious: `Good evening. I'm ${hostName}. Here are the stories that matter tonight.`,
    warm: `Good evening, friend. I'm ${hostName}. Welcome back. It's good to have you here.`,
  };

  return texts[emotion];
}
