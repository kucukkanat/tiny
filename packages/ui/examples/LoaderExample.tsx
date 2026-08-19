import { Loader } from "@tiny/ui";
import { useEffect, useState } from "react";

/** The pixel-grid loader runs its own elapsed timer; it only needs a label. */
export function LoaderExample() {
  const [waiting, setWaiting] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setWaiting(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  return waiting ? <Loader label="Waiting for model" /> : <p>Done.</p>;
}
