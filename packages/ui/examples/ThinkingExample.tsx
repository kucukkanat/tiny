import { Thinking } from "@tiny/ui";
import { useEffect, useState } from "react";

/** Shimmers while the model reasons, then settles into "Thought for Ns". */
export function ThinkingExample() {
  const [seconds, setSeconds] = useState(0);
  const working = seconds < 4;

  useEffect(() => {
    if (!working) return;
    const timer = setTimeout(() => setSeconds((value) => value + 1), 1000);
    return () => clearTimeout(timer);
  }, [working]);

  return (
    <Thinking
      working={working}
      seconds={seconds}
      text={"Checking what makes the sky blue.\nRayleigh scattering, most likely."}
    />
  );
}
