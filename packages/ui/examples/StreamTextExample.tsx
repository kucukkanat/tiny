import { StreamText } from "@tiny/ui";
import { useEffect, useState } from "react";

const REPLY = `### Why the sky is blue

Air scatters **short** wavelengths hardest, so blue reaches you from every
direction:

- Rayleigh scattering goes as \`1 / λ⁴\`
- Violet scatters more still, but the eye is less sensitive to it

| Wavelength | Colour | Scattering |
| ---------- | ------ | ---------- |
| 450 nm     | blue   | high       |
| 650 nm     | red    | low        |
`;

/** Reveals a markdown reply word by word, then drops the caret once it is done. */
export function StreamTextExample() {
  const [wordCount, setWordCount] = useState(0);
  const words = REPLY.split(" ");
  const done = wordCount >= words.length;

  // One interval reveals the whole reply; `done` flipping tears it down.
  useEffect(() => {
    if (done) return;
    const timer = setInterval(() => setWordCount((count) => count + 1), 120);
    return () => clearInterval(timer);
  }, [done]);

  return <StreamText text={words.slice(0, wordCount).join(" ")} done={done} />;
}
