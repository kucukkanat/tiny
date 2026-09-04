// The one React in the page. An extension imports 'react' and the import map
// sends it here, so its hooks run on the same dispatcher the app's do — two
// copies mean "Invalid hook call" and nothing else.
//
// Named one by one on purpose: React is CommonJS, so `export *` yields only
// `default`, and the dev server hides that while a build ships it. The test
// beside this file keeps the list honest.
export {
  Activity,
  Children,
  Component,
  Fragment,
  Profiler,
  PureComponent,
  StrictMode,
  Suspense,
  act,
  cache,
  cacheSignal,
  captureOwnerStack,
  cloneElement,
  createContext,
  createElement,
  createRef,
  forwardRef,
  isValidElement,
  lazy,
  memo,
  startTransition,
  use,
  useActionState,
  useCallback,
  useContext,
  useDebugValue,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  version,
} from 'react'
export { default } from 'react'
