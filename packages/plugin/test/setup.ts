import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (typeof document === "undefined") GlobalRegistrator.register();

// React only flushes `act` work when it knows it is under test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
