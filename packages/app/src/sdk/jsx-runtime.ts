// Every JSX tag an extension writes compiles to a call from here. Not
// `jsx-dev-runtime`: a production React exports `jsxDEV` as undefined, so
// mapping it would turn a clear resolution error into a mystery at first render.
export { Fragment, jsx, jsxs } from 'react/jsx-runtime'
